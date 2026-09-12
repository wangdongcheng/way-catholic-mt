import "./editor-style.css";

import { createEditorMap } from "./editor-map.js";
import { createEventForm } from "./event-form.js";
import {
  connectDataDirectory,
  listLocalDataSets,
  readLocalDataSet,
  supportsLocalDataFiles,
  writeLocalDataSet,
} from "./local-data-files.js";
import { createRouteStore } from "./route-store.js";
import { groupIssuesByEvent, validateRoute } from "./route-validator.js";
import { initializeGeocodingCacheExport } from "./geocoding-cache-export.js";
import { DEFAULT_ROUTE_NAVIGATION } from "../route-normalizer.js";

await initializeGeocodingCacheExport();

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const store = createRouteStore();
const elements = {
  routeSelector: document.getElementById("route-selector"),
  routeName: document.getElementById("route-name"),
  newRouteButton: document.getElementById("new-route-button"),
  newRouteDialog: document.getElementById("new-route-dialog"),
  newRouteForm: document.getElementById("new-route-form"),
  newRouteId: document.getElementById("new-route-id"),
  newRouteName: document.getElementById("new-route-name"),
  newRouteClose: document.getElementById("new-route-close"),
  newRouteCancel: document.getElementById("new-route-cancel"),
  addButton: document.getElementById("add-event-button"),
  addMenu: document.getElementById("add-event-menu"),
  connectFolderButton: document.getElementById("connect-folder-button"),
  saveButton: document.getElementById("save-button"),
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
let pendingCriticalTrigger = null;
let activeDataSet = null;
let dataDirectory = null;

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

function nextRouteId() {
  const routeNumbers = [...elements.routeSelector.options]
    .map((option) => /^route-(\d+)$/.exec(option.value)?.[1])
    .filter(Boolean)
    .map(Number);
  const nextNumber = Math.max(0, ...routeNumbers) + 1;
  return `route-${String(nextNumber).padStart(3, "0")}`;
}

function confirmDiscardChanges() {
  return !store.getState().dirty || window.confirm(
    "Discard the unsaved changes to the current data set?"
  );
}

function setWorkspaceEnabled(enabled) {
  elements.routeSelector.disabled = !enabled;
  elements.routeName.disabled = !enabled;
  elements.newRouteButton.disabled = !enabled;
  elements.addButton.disabled = !enabled;
  elements.saveButton.disabled = !enabled;
}

function populateDataSetSelector(dataSets) {
  elements.routeSelector.replaceChildren();

  for (const dataSet of dataSets) {
    const option = document.createElement("option");
    option.value = dataSet.id;
    option.textContent = dataSet.name;
    option.disabled = !dataSet.valid;
    elements.routeSelector.append(option);
  }
}

function setDraftOption(route) {
  elements.routeSelector.querySelector("[data-draft-route]")?.remove();

  const option = document.createElement("option");
  option.value = `draft:${route.id}`;
  option.dataset.draftRoute = "true";
  option.textContent = `Draft: ${route.name}`;
  elements.routeSelector.append(option);
  elements.routeSelector.value = option.value;
  activeDataSet = option.value;
}

function createNewRoute(routeId, routeName) {
  const currentStart = store.getState().route?.startState;
  const route = {
    id: routeId,
    name: routeName,
    startState: {
      lat: currentStart?.lat ?? 35.8880832,
      lng: currentStart?.lng ?? 14.5029997,
      heading: currentStart?.heading ?? 0,
      pitch: currentStart?.pitch ?? 0,
      zoom: currentStart?.zoom ?? 1,
    },
    events: [],
    navigation: { ...DEFAULT_ROUTE_NAVIGATION },
  };

  store.setRoute(route, { dirty: true });
  setWorkspaceEnabled(true);
  editorMap.focusRoute(route);
  setDraftOption(route);
  elements.status.textContent = "New route ready for editing";

  const url = new URL(window.location.href);
  url.searchParams.delete("route");
  window.history.replaceState({}, "", url);
  showToast("New route created. Add events, then save the JSON file.");
}

function getDocumentKind(document) {
  if (document?.type === "observation-checks") return "observation";
  if (document?.type === "critical-violations") return "critical";
  return "exam";
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
  const documentKind = getDocumentKind(route);

  if (type === "critical-destination") {
    if (!pendingCriticalTrigger) return;
    const defaults = route.defaults || {};
    store.addEvent({
      id: uniqueEventId(route, "critical-violation"),
      type: "critical-violation",
      rule: "wrong-way-entry",
      enabled: true,
      oncePerSession: true,
      triggerCheckpoint: {
        location: pendingCriticalTrigger,
        radius: defaults.triggerRadius ?? 15,
        pano: null,
      },
      forbiddenDestination: {
        location: {
          lat: Number(position.lat.toFixed(7)),
          lng: Number(position.lng.toFixed(7)),
        },
        radius: defaults.violationRadius ?? 15,
        pano: null,
      },
      windowMs: defaults.windowMs ?? 60000,
      practiceWarning: {
        title: "Serious driving error",
        message: "A critical driving violation was detected.",
        buttonLabel: "I understand",
        autoCloseMs: 0,
      },
      examFailure: {
        title: "Test failed",
        message: "A critical driving violation was detected.",
        reasonCode: "CRITICAL_VIOLATION",
      },
    });
    pendingCriticalTrigger = null;
    showToast("Critical violation added");
    return;
  }

  if (type === "critical-violation" && documentKind === "critical") {
    pendingCriticalTrigger = {
      lat: Number(position.lat.toFixed(7)),
      lng: Number(position.lng.toFixed(7)),
    };
    editorMap.setPlacementMode("critical-destination");
    elements.placementNotice.textContent =
      "Step 2 of 2 · Click the forbidden destination · Esc to cancel";
    elements.placementNotice.hidden = false;
    return;
  }

  if (type === "observation-check" && documentKind === "observation") {
    const defaults = route.defaults || {};
    store.addEvent({
      id: uniqueEventId(route, "observation"),
      type: "observation-check",
      enabled: true,
      examEnabled: defaults.examEnabled !== false,
      observationType: "road-awareness",
      lat: Number(position.lat.toFixed(7)),
      lng: Number(position.lng.toFixed(7)),
      radius: defaults.radius ?? 25,
      answerRadius: defaults.answerRadius ?? 45,
      pano: null,
      penaltyOnMiss: defaults.penaltyOnMiss ?? 3,
      penaltyOnIncorrect: defaults.penaltyOnIncorrect ?? 1,
      practiceMessage: {
        message: "New practice observation message",
        priority: "normal",
      },
    });
    showToast("Observation check added");
    return;
  }

  if (documentKind !== "exam" || !["single", "multiple", "sequence"].includes(type)) {
    showToast("This event type belongs in a different data set");
    return;
  }

  const {
    eventsAreCheckpoints: required,
    defaultPenaltyOnMiss: penaltyOnMiss,
  } = route.navigation;

  const options = commandOptions(type);
  const event = {
    id: uniqueEventId(route, "examiner-command"),
    type: "examiner-command",
    lat: Number(position.lat.toFixed(7)),
    lng: Number(position.lng.toFixed(7)),
    radius: 25,
    required,
    penaltyOnMiss,
    answerRadius: 60,
    command: "New examiner command",
    answerMode: type,
    optionLayout: "single-column",
    options,
    penaltyOnOutOfRange: 1,
    outOfRangeRouteMessage: {
      message: "You left the answering area without answering. 1 point deducted.",
      priority: "high",
    },
  };

  if (type === "sequence") {
    event.correctSequence = options.map((option) => option.id);
    event.penalty = 2;
    event.correctRouteMessage = {
      message: "Correct sequence.",
      priority: "high",
    };
    event.incorrectRouteMessage = {
      message: "The steps were not selected in the correct order.",
      priority: "high",
    };
  } else if (type === "multiple") {
    event.penalty = 1;
    event.correctRouteMessage = {
      message: "Correct selection.",
      priority: "high",
    };
    event.incorrectRouteMessage = {
      message: "The selected answers were not correct.",
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
  const documentType = getDocumentKind(store.getState().route);

  elements.addMenu.querySelectorAll("[data-document]")
    .forEach((button) => {
      button.hidden = button.dataset.document !== documentType;
    });
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
      <div class="validation-empty">This route is ready to save.</div>
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
    const route = await readLocalDataSet(dataDirectory, routeId);

    store.setRoute(route);
    editorMap.focusRoute(route);
    elements.routeSelector.querySelector("[data-draft-route]")?.remove();
    elements.routeSelector.value = routeId;
    activeDataSet = routeId;
    elements.status.textContent = `${route.events.length} events loaded`;

    const url = new URL(window.location.href);
    url.searchParams.set("route", routeId);
    window.history.replaceState({}, "", url);
    setWorkspaceEnabled(true);
    return true;
  } catch (error) {
    console.error("Failed to load route:", error);
    if (activeDataSet) elements.routeSelector.value = activeDataSet;
    elements.status.textContent = `Could not load ${routeId}`;
    showToast("Route could not be loaded");
    return false;
  }
}

async function connectFolder() {
  if (!confirmDiscardChanges()) return;

  elements.connectFolderButton.disabled = true;
  elements.status.textContent = "Connecting public/data…";

  try {
    const directory = await connectDataDirectory({
      forcePicker: dataDirectory !== null,
    });
    const dataSets = await listLocalDataSets(directory);

    dataDirectory = directory;
    activeDataSet = null;
    populateDataSetSelector(dataSets);
    setWorkspaceEnabled(false);
    elements.routeSelector.disabled = !dataSets.some((item) => item.valid);
    elements.newRouteButton.disabled = false;
    elements.connectFolderButton.textContent = "Change data folder";

    const requestedRoute = new URLSearchParams(window.location.search)
      .get("route");
    const initialRoute = dataSets.some(
      (item) => item.id === requestedRoute && item.valid
    )
      ? requestedRoute
      : dataSets.find((item) => item.valid)?.id;

    if (initialRoute) {
      elements.routeSelector.value = initialRoute;
      await loadRoute(initialRoute);
    } else {
      elements.status.textContent = "No valid JSON data sets found";
    }
  } catch (error) {
    if (error.name === "AbortError") {
      elements.status.textContent = dataDirectory
        ? "Data folder unchanged"
        : "Connect public/data to begin";
      return;
    }

    console.error("Failed to connect data folder:", error);
    elements.status.textContent = "Could not connect data folder";
    showToast(error.message || "The data folder could not be connected");
  } finally {
    elements.connectFolderButton.disabled = false;
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
  onPositionChange: (eventId, position, point = "event") => {
    const nextPosition = {
      lat: Number(position.lat.toFixed(7)),
      lng: Number(position.lng.toFixed(7)),
    };

    if (point === "event") {
      store.updateEvent(eventId, nextPosition);
    } else {
      store.mutateEvent(eventId, (event) => {
        event[point].location = nextPosition;
      });
    }
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
  const draftOption = elements.routeSelector.querySelector("[data-draft-route]");
  if (draftOption && elements.routeSelector.value === draftOption.value) {
    draftOption.textContent = `Draft: ${state.route?.name || state.route?.id || "New route"}`;
  }
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
    elements.placementNotice.textContent = type === "critical-violation"
      ? "Step 1 of 2 · Click the trigger checkpoint · Esc to cancel"
      : "Click the map to place the event · Esc to cancel";
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
    pendingCriticalTrigger = null;
    elements.placementNotice.hidden = true;
  }
});

elements.routeSelector.addEventListener("change", async () => {
  const routeId = elements.routeSelector.value;
  if (!confirmDiscardChanges()) {
    elements.routeSelector.value = activeDataSet;
    return;
  }

  await loadRoute(routeId);
});

elements.newRouteButton.addEventListener("click", () => {
  const routeId = nextRouteId();
  elements.newRouteId.value = routeId;
  elements.newRouteName.value = `Route ${Number(routeId.split("-")[1])}`;
  elements.newRouteDialog.showModal();
  elements.newRouteId.select();
});

elements.newRouteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const routeId = elements.newRouteId.value.trim();
  const routeName = elements.newRouteName.value.trim();

  elements.newRouteId.setCustomValidity("");
  if (!routeId || !routeName || !elements.newRouteForm.reportValidity()) return;
  if ([...elements.routeSelector.options]
    .some((option) => option.value === routeId)) {
    elements.newRouteId.setCustomValidity("This route ID already exists.");
    elements.newRouteId.reportValidity();
    return;
  }
  if (!confirmDiscardChanges()) return;

  elements.newRouteDialog.close();
  createNewRoute(routeId, routeName);
});

elements.newRouteClose.addEventListener("click", () => {
  elements.newRouteDialog.close();
});

elements.newRouteCancel.addEventListener("click", () => {
  elements.newRouteDialog.close();
});

elements.routeName.addEventListener("change", () => {
  store.updateRoute({ name: elements.routeName.value });
});

elements.connectFolderButton.addEventListener("click", connectFolder);

elements.saveButton.addEventListener("click", async () => {
  const errors = latestIssues.filter((item) => item.level === "error");
  if (errors.length > 0) {
    elements.validationDialog.showModal();
    showToast("Fix validation errors before saving");
    return;
  }

  elements.saveButton.disabled = true;

  try {
    const route = store.getState().route;
    const path = await writeLocalDataSet(dataDirectory, route);
    const draftOption = elements.routeSelector.querySelector("[data-draft-route]");

    if (draftOption && elements.routeSelector.value === draftOption.value) {
      draftOption.value = route.id;
      delete draftOption.dataset.draftRoute;
      activeDataSet = route.id;
      elements.routeSelector.value = route.id;
    }

    const activeOption = elements.routeSelector.selectedOptions[0];
    if (activeOption) activeOption.textContent = route.name || route.id;

    store.markSaved();
    elements.status.textContent = `Saved to ${path}`;
    showToast(`Saved to ${path}`);

    const url = new URL(window.location.href);
    url.searchParams.set("route", route.id);
    window.history.replaceState({}, "", url);
  } catch (error) {
    console.error("Failed to save data set:", error);
    elements.status.textContent = "Could not save data set";
    showToast("The JSON file could not be saved");
  } finally {
    elements.saveButton.disabled = false;
  }
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

setWorkspaceEnabled(false);
elements.status.textContent = supportsLocalDataFiles()
  ? "Connect public/data to begin"
  : "This editor requires desktop Chrome or Edge";
elements.connectFolderButton.disabled = !supportsLocalDataFiles();
