let infoHideTimer = null;
let locationLookupTimer = null;
let routeMessageTimer = null;
let routeMessageActive = false;
let routeMessageQueue = [];
let examinerState = null;

export function showInfoTemporarily() {
  const info = document.getElementById("current-info");

  if (!info) {
    return;
  }

  info.classList.remove("hidden");
  clearTimeout(infoHideTimer);

  infoHideTimer = setTimeout(() => {
    info.classList.add("hidden");
  }, 10000);
}

export function updatePanoramaInfo(panorama) {
  const position = panorama.getPosition();
  const pano = panorama.getPano();
  const pov = panorama.getPov();

  const posElement = document.getElementById("current-pos");
  const panoElement = document.getElementById("current-pano");
  const headingElement = document.getElementById("camera-heading");

  if (position && posElement) {
    posElement.textContent =
      `${position.lat().toFixed(6)}, ${position.lng().toFixed(6)}`;
  }

  if (panoElement) {
    panoElement.textContent = pano || "-";
  }

  if (headingElement) {
    headingElement.textContent = pov.heading.toFixed(0);
  }
}

export function updateRouteName(name) {
  const element = document.getElementById("current-route");

  if (element) {
    element.textContent = name || "-";
  }
}

export function updatePenaltyScore(penalty) {
  const element = document.getElementById("penalty-score");

  if (element) {
    element.textContent = String(penalty);
  }
}

function getAddressComponent(result, type) {
  return result.address_components?.find((component) =>
    component.types.includes(type)
  )?.long_name;
}

async function updateLocationInfo(panorama, geocoder) {
  const position = panorama.getPosition();
  const locationElement = document.getElementById("current-location");

  if (!position || !locationElement) {
    return;
  }

  try {
    const response = await geocoder.geocode({
      location: {
        lat: position.lat(),
        lng: position.lng(),
      },
    });
    const result = response.results?.[0];

    if (!result) {
      locationElement.textContent = "-";
      return;
    }

    const road = getAddressComponent(result, "route");
    const city =
      getAddressComponent(result, "locality") ||
      getAddressComponent(result, "postal_town") ||
      getAddressComponent(result, "administrative_area_level_2") ||
      getAddressComponent(result, "administrative_area_level_1");

    locationElement.textContent =
      [road, city].filter(Boolean).join(", ") ||
      result.formatted_address ||
      "-";
  } catch (error) {
    console.error("Failed to reverse geocode Street View position:", error);
    locationElement.textContent = "-";
  }
}

export function scheduleLocationUpdate(panorama, geocoder) {
  clearTimeout(locationLookupTimer);
  locationLookupTimer = setTimeout(() => {
    updateLocationInfo(panorama, geocoder);
  }, 300);
}

function normalizeRouteMessage(input) {
  if (typeof input === "string") {
    return {
      message: input,
      autoCloseMs: 0,
      priority: "normal",
    };
  }

  return {
    message: input?.message || "",
    autoCloseMs: Number.isFinite(input?.autoCloseMs)
      ? input.autoCloseMs
      : 0,
    priority: input?.priority || "normal",
  };
}

function displayNextRouteMessage() {
  if (routeMessageActive || routeMessageQueue.length === 0) {
    return;
  }

  const dialog = document.getElementById("route-message");
  const textElement = document.getElementById("route-message-text");

  if (!(dialog instanceof HTMLDialogElement) || !textElement) {
    return;
  }

  const next = routeMessageQueue.shift();
  routeMessageActive = true;
  textElement.textContent = next.message;
  dialog.showModal();
  document.getElementById("route-message-ok")?.focus();

  clearTimeout(routeMessageTimer);
  if (next.autoCloseMs > 0) {
    routeMessageTimer = setTimeout(closeCurrentRouteMessage, next.autoCloseMs);
  }
}

export function showRouteMessage(message) {
  const normalized = normalizeRouteMessage(message);

  if (!normalized.message) {
    return;
  }

  if (normalized.priority === "high") {
    const firstNormal = routeMessageQueue.findIndex(
      (item) => item.priority !== "high"
    );

    if (firstNormal === -1) {
      routeMessageQueue.push(normalized);
    } else {
      routeMessageQueue.splice(firstNormal, 0, normalized);
    }
  } else {
    routeMessageQueue.push(normalized);
  }

  displayNextRouteMessage();
}

export function closeCurrentRouteMessage() {
  const dialog = document.getElementById("route-message");

  clearTimeout(routeMessageTimer);
  routeMessageActive = false;

  if (dialog instanceof HTMLDialogElement && dialog.open) {
    dialog.close();
  }

  displayNextRouteMessage();
}

export function clearRouteMessages() {
  routeMessageQueue = [];
  closeCurrentRouteMessage();
}

function updateExaminerControls() {
  if (!examinerState) {
    return;
  }

  const { event, selectedIds } = examinerState;
  const isSingle = event.answerMode === "single";
  const isSequence = event.answerMode === "sequence";
  const requiredCount = isSequence
    ? event.correctSequence?.length || event.options.length
    : 1;

  document.querySelectorAll(".examiner-option")
    .forEach((button) => {
      const index = selectedIds.indexOf(button.dataset.optionId);
      button.classList.toggle("selected", index >= 0);
      button.disabled = isSequence && index >= 0;

      const order = button.querySelector(".option-order");
      if (order) {
        order.textContent = index >= 0
          ? isSequence ? String(index + 1) : "✓"
          : "";
      }
    });

  const actions = document.getElementById("examiner-actions");
  const undo = document.getElementById("examiner-undo");
  const confirm = document.getElementById("examiner-confirm");

  actions?.classList.toggle("hidden", isSingle);
  undo?.classList.toggle("hidden", !isSequence);

  if (confirm) {
    confirm.disabled = isSequence
      ? selectedIds.length !== requiredCount
      : selectedIds.length === 0;
  }
}

function selectExaminerOption(optionId) {
  if (!examinerState) {
    return;
  }

  const { event, selectedIds, onSubmit } = examinerState;

  if (event.answerMode === "single") {
    onSubmit([optionId]);
    return;
  }

  const index = selectedIds.indexOf(optionId);

  if (event.answerMode === "sequence") {
    if (index === -1) {
      selectedIds.push(optionId);
    }
  } else if (index === -1) {
    selectedIds.push(optionId);
  } else {
    selectedIds.splice(index, 1);
  }

  updateExaminerControls();
}

export function showExaminerCommand(event, { onSubmit }) {
  const card = document.getElementById("examiner-command");
  const text = document.getElementById("examiner-command-text");
  const options = document.getElementById("examiner-options");

  if (!card || !text || !options) {
    return;
  }

  examinerState = {
    event,
    selectedIds: [],
    onSubmit,
  };

  text.textContent = event.command;
  options.replaceChildren();
  options.dataset.layout = event.optionLayout || "single-column";
  options.dataset.mode = event.answerMode || "single";

  for (const option of event.options || []) {
    const button = document.createElement("button");
    const order = document.createElement("span");
    const label = document.createElement("span");

    button.type = "button";
    button.className = "examiner-option";
    button.dataset.optionId = option.id;
    order.className = "option-order";
    label.textContent = option.label;
    button.append(order, label);
    button.addEventListener("click", () => {
      selectExaminerOption(option.id);
    });
    options.appendChild(button);
  }

  card.hidden = false;
  updateExaminerControls();
  options.querySelector("button")?.focus();
}

export function hideExaminerCommand() {
  const card = document.getElementById("examiner-command");

  if (card) {
    card.hidden = true;
  }

  examinerState = null;
}

export function getExaminerSelection() {
  return examinerState
    ? [...examinerState.selectedIds]
    : [];
}

export function bindUiActions({ onRestart }) {
  document.getElementById("restart-button")
    ?.addEventListener("click", onRestart);

  document.getElementById("route-message-ok")
    ?.addEventListener("click", closeCurrentRouteMessage);

  document.getElementById("route-message")
    ?.addEventListener("cancel", (event) => {
      event.preventDefault();
    });

  document.getElementById("examiner-undo")
    ?.addEventListener("click", () => {
      examinerState?.selectedIds.pop();
      updateExaminerControls();
    });

  document.getElementById("examiner-reset")
    ?.addEventListener("click", () => {
      if (examinerState) {
        examinerState.selectedIds = [];
        updateExaminerControls();
      }
    });

  document.getElementById("examiner-confirm")
    ?.addEventListener("click", () => {
      if (examinerState) {
        examinerState.onSubmit([...examinerState.selectedIds]);
      }
    });
}
