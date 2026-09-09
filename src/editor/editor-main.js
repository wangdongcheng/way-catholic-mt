import "./editor-style.css";

import { createEditorMap } from "./editor-map.js";
import { createEventForm } from "./event-form.js";
import { downloadRouteJson, readRouteJson } from "./route-exporter.js";
import { createRouteStore } from "./route-store.js";
import { groupIssuesByEvent, validateRoute } from "./route-validator.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const store = createRouteStore();
const elements = {
  routeSelector: document.getElementById("route-selector"),
  routeName: document.getElementById("route-name"),
  addButton: document.getElementById("add-event-button"),
  addMenu: document.getElementById("add-event-menu"),
  importButton: document.getElementById("import-button"),
  importFile: document.getElementById("import-file"),
  exportButton: document.getElementById("export-button"),
  placementNotice: document.getElementById("placement-notice"),
  eventForm: document.getElementById("event-form"),
  eventTitle: document.getElementById("selected-event-title"),
  dirty: document.getElementById("dirty-indicator"),
  status: document.getElementById("editor-status"),
  validationSummary: document.getElementById("validation-summary"),
  validationToggle: document.getElementById("validation-toggle"),
  validationDialog: document.getElementById("validation-dialog"),
  validationResults: document.getElementById("validation-results"),
  validationClose: document.getElementById("validation-close"),
  toast: document.getElementById("toast"),
};

let editorMap = null;
let menuPosition = null;
let latestIssues = [];
let toastTimer = null;

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 3200);
}

function uniqueEventId(route, prefix) {
  let number = 1;
  let id = `${prefix}-${String(number).padStart(3, "0")}`;

  while (route.events.some((event) => event.id === id)) {
    number += 1;
    id = `${prefix}-${String(number).padStart(3, "0")}`;
  }

  return id;
}

function commandOptions(mode) {
  if (mode === "sequence") {
    return [
      { id: "step-1", label: "Step 1", penalty: 0 },
      { id: "step-2", label: "Step 2", penalty: 0 },
      { id: "step-3", label: "Step 3", penalty: 0 },
      { id: "step-4", label: "Step 4", penalty: 0 },
      { id: "step-5", label: "Step 5", penalty: 0 },
    ];
  }

  return [
    { id: "option-1", label: "Option 1", correct: true, penalty: 0 },
    { id: "option-2", label: "Option 2", correct: false, penalty: 1 },
    { id: "option-3", label: "Option 3", correct: false, penalty: 1 },
  ];
}

function createEvent(type, position) {
  const route = store.getState().route;

  if (type === "route-message") {
    store.addEvent({
      id: uniqueEventId(route, "route-message"),
      type: "route-message",
      lat: Number(position.lat.toFixed(7)),
      lng: Number(position.lng.toFixed(7)),
      radius: 30,
      message: "New route message",
      autoCloseMs: 8000,
      priority: "normal",
    });
    showToast("Route message added");
    return;
  }

  const options = commandOptions(type);
  const event = {
    id: uniqueEventId(route, "examiner-command"),
    type: "examiner-command",
    lat: Number(position.lat.toFixed(7)),
    lng: Number(position.lng.toFixed(7)),
    radius: 25,
    answerRadius: 60,
    command: "New examiner command",
    answerMode: type,
    optionLayout: "single-column",
    options,
    penaltyOnOutOfRange: 1,
    outOfRangeRouteMessage: {
      message: "You left the answering area without answering. 1 point deducted.",
      autoCloseMs: 0,
      priority: "high",
    },
  };

  if (type === "sequence") {
    event.correctSequence = options.map((option) => option.id);
    event.penalty = 2;
    event.correctRouteMessage = {
      message: "Correct sequence.",
      autoCloseMs: 5000,
      priority: "high",
    };
    event.incorrectRouteMessage = {
      message: "The steps were not selected in the correct order.",
      autoCloseMs: 0,
      priority: "high",
    };
  } else if (type === "multiple") {
    event.penalty = 1;
    event.correctRouteMessage = {
      message: "Correct selection.",
      autoCloseMs: 5000,
      priority: "high",
    };
    event.incorrectRouteMessage = {
      message: "The selected answers were not correct.",
      autoCloseMs: 0,
      priority: "high",
    };
  }

  store.addEvent(event);
  showToast("Examiner command added");
}

function hideAddMenu() {
  elements.addMenu.hidden = true;
  menuPosition = null;
}

function showAddMenu({ clientX, clientY, position = null }) {
  menuPosition = position;
  elements.addMenu.hidden = false;
  elements.addMenu.style.left = `${Math.min(clientX, window.innerWidth - 250)}px`;
  elements.addMenu.style.top = `${Math.min(clientY, window.innerHeight - 210)}px`;
}

function renderValidation(issues) {
  const errors = issues.filter((item) => item.level === "error");
  elements.validationSummary.textContent = errors.length === 0
    ? "No errors"
    : `${errors.length} error${errors.length === 1 ? "" : "s"}`;
  elements.validationToggle.classList.toggle("has-errors", errors.length > 0);

  if (issues.length === 0) {
    elements.validationResults.innerHTML = `
      <div class="validation-empty">This route is ready to export.</div>
    `;
    return;
  }

  elements.validationResults.innerHTML = issues.map((item) => `
    <button class="validation-item ${item.level}" type="button"
      data-event-id="${escapeHtml(item.eventId || "")}">
      <strong>${escapeHtml(item.eventId || "Route")}</strong>
      <span>${escapeHtml(item.message)}</span>
    </button>
  `).join("");
}

async function loadRoute(routeId) {
  elements.status.textContent = `Loading ${routeId}…`;

  try {
    const response = await fetch(`/data/routes/${routeId}.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const route = await response.json();

    store.setRoute(route);
    editorMap.focusRoute(route);
    elements.routeSelector.value = routeId;
    elements.status.textContent = `${route.events.length} events loaded`;

    const url = new URL(window.location.href);
    url.searchParams.set("route", routeId);
    window.history.replaceState({}, "", url);
  } catch (error) {
    console.error("Failed to load route:", error);
    elements.status.textContent = `Could not load ${routeId}`;
    showToast("Route could not be loaded");
  }
}

const eventForm = createEventForm({
  container: elements.eventForm,
  title: elements.eventTitle,
  store,
});

editorMap = await createEditorMap({
  container: document.getElementById("editor-map"),
  onContextMenu: ({ position, clientX, clientY }) => {
    showAddMenu({
      position,
      clientX: clientX ?? window.innerWidth / 2,
      clientY: clientY ?? window.innerHeight / 2,
    });
  },
  onPlacement: (type, position) => {
    elements.placementNotice.hidden = true;
    createEvent(type, position);
  },
  onSelect: (eventId) => store.selectEvent(eventId),
  onPositionChange: (eventId, position) => {
    store.updateEvent(eventId, {
      lat: Number(position.lat.toFixed(7)),
      lng: Number(position.lng.toFixed(7)),
    });
  },
});

store.subscribe((state) => {
  latestIssues = validateRoute(state.route);
  const issuesByEvent = groupIssuesByEvent(latestIssues);

  editorMap.sync(
    state.route,
    state.selectedEventId,
    issuesByEvent
  );
  eventForm.render(state);
  renderValidation(latestIssues);

  elements.routeName.value = state.route?.name || "";
  elements.dirty.textContent = state.dirty
    ? "Unsaved changes"
    : "Loaded source";
  elements.dirty.classList.toggle("unsaved", state.dirty);
});

elements.addButton.addEventListener("click", (event) => {
  event.stopPropagation();
  const rect = elements.addButton.getBoundingClientRect();
  showAddMenu({
    clientX: rect.left,
    clientY: rect.bottom + 8,
  });
});

elements.addMenu.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-create-type]");
  if (!button) return;

  const type = button.dataset.createType;
  const position = menuPosition;
  hideAddMenu();

  if (position) {
    createEvent(type, position);
  } else {
    editorMap.setPlacementMode(type);
    elements.placementNotice.hidden = false;
  }
});

document.addEventListener("click", (event) => {
  if (!elements.addMenu.contains(event.target) && event.target !== elements.addButton) {
    hideAddMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideAddMenu();
    editorMap.cancelPlacement();
    elements.placementNotice.hidden = true;
  }
});

elements.routeSelector.addEventListener("change", () => {
  loadRoute(elements.routeSelector.value);
});

elements.routeName.addEventListener("change", () => {
  store.updateRoute({ name: elements.routeName.value });
});

elements.importButton.addEventListener("click", () => {
  elements.importFile.click();
});

elements.importFile.addEventListener("change", async () => {
  const [file] = elements.importFile.files;
  if (!file) return;

  try {
    const route = await readRouteJson(file);
    store.setRoute(route, { dirty: true });
    editorMap.focusRoute(route);
    elements.status.textContent = `${route.events?.length || 0} imported events`;
    showToast("Route imported. Review validation before export.");
  } catch (error) {
    console.error("Failed to import route:", error);
    showToast("The selected file is not valid JSON");
  } finally {
    elements.importFile.value = "";
  }
});

elements.exportButton.addEventListener("click", () => {
  const errors = latestIssues.filter((item) => item.level === "error");
  if (errors.length > 0) {
    elements.validationDialog.showModal();
    showToast("Fix validation errors before exporting");
    return;
  }

  downloadRouteJson(store.getState().route);
  showToast("Route JSON exported");
});

elements.validationToggle.addEventListener("click", () => {
  elements.validationDialog.showModal();
});

elements.validationClose.addEventListener("click", () => {
  elements.validationDialog.close();
});

elements.validationResults.addEventListener("click", (event) => {
  const item = event.target.closest("[data-event-id]");
  if (!item?.dataset.eventId) return;
  store.selectEvent(item.dataset.eventId);
  elements.validationDialog.close();
});

const initialRoute = new URLSearchParams(window.location.search)
  .get("route") || "route-001";
await loadRoute(
  ["route-001", "route-002"].includes(initialRoute)
    ? initialRoute
    : "route-001"
);
