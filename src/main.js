import "./style.css";

import {
  AVAILABLE_ROUTES,
  getInitialState,
  getRequestedMode,
  getRequestedRouteId,
  loadPracticeMessages,
  loadRouteConfig,
  EXAM_START_NOTICE
} from "./config.js";

import { createEventEngine } from "./event-engine.js";
import {
  createStreetView,
  restartStreetView,
  setStreetViewLocked,
} from "./streetview.js";
import {
  bindUiActions,
  clearRouteMessages,
  getExaminerSelection,
  hideCurrentInfo,
  hideExaminerCommand,
  hideExamStart,
  hideModeSelection,
  scheduleLocationUpdate,
  setLocationUpdatesEnabled,
  showExaminerCommand,
  showExamStart,
  showInfoTemporarily,
  showModeSelection,
  showRouteMessage,
  updatePanoramaInfo,
  updatePenaltyScore,
  updateRouteName,
} from "./ui.js";
import { calculateDistanceMeters } from "./utils.js";

let activeCommand = null;
let commandQueue = [];
let results = [];
let totalPenalty = 0;
let panorama = null;
let driveStarted = false;

function getEventPenalty(event, selectedIds, isCorrect) {
  if (isCorrect) {
    return 0;
  }

  if (event.answerMode === "single") {
    const selectedOption = event.options.find(
      (option) => option.id === selectedIds[0]
    );
    return Number.isFinite(selectedOption?.penalty)
      ? selectedOption.penalty
      : Number(event.penalty) || 0;
  }

  return Number(event.penalty) || 0;
}

function isAnswerCorrect(event, selectedIds) {
  if (event.answerMode === "sequence") {
    const expected = event.correctSequence || [];
    return selectedIds.length === expected.length &&
      selectedIds.every((id, index) => id === expected[index]);
  }

  if (event.answerMode === "multiple") {
    const expected = event.options
      .filter((option) => option.correct)
      .map((option) => option.id)
      .sort();
    const actual = [...selectedIds].sort();

    return actual.length === expected.length &&
      actual.every((id, index) => id === expected[index]);
  }

  return Boolean(
    event.options.find(
      (option) => option.id === selectedIds[0]
    )?.correct
  );
}

function getAnswerMessage(event, selectedIds, isCorrect) {
  if (event.answerMode === "single") {
    const selectedOption = event.options.find(
      (option) => option.id === selectedIds[0]
    );

    if (selectedOption?.routeMessage) {
      return selectedOption.routeMessage;
    }
  }

  return isCorrect
    ? event.correctRouteMessage || event.correctMessage
    : event.incorrectRouteMessage || event.incorrectMessage;
}

function recordResult(result) {
  results.push(result);
  totalPenalty += result.penalty;
  updatePenaltyScore(totalPenalty);
}

function showNextCommand() {
  if (activeCommand || !panorama) {
    return;
  }

  const currentPosition = panorama.getPosition();

  while (commandQueue.length > 0) {
    const next = commandQueue.shift();
    const answerRadius = Number.isFinite(next.event.answerRadius)
      ? next.event.answerRadius
      : next.event.radius;

    if (
      currentPosition &&
      calculateDistanceMeters(currentPosition, next.targetPosition) >
        answerRadius
    ) {
      continue;
    }

    activeCommand = next;
    showExaminerCommand(next.event, {
      onSubmit: completeActiveCommand,
    });
    return;
  }
}

function completeActiveCommand(selectedIds) {
  if (!activeCommand) {
    return;
  }

  const { event } = activeCommand;
  const correct = isAnswerCorrect(event, selectedIds);
  const penalty = getEventPenalty(event, selectedIds, correct);
  const message = getAnswerMessage(
    event,
    selectedIds,
    correct
  );

  recordResult({
    eventId: event.id,
    status: "answered",
    answerMode: event.answerMode,
    selectedOptionIds: [...selectedIds],
    correct,
    penalty,
    answeredAt: Date.now(),
  });

  activeCommand = null;
  hideExaminerCommand();

  if (message) {
    showRouteMessage(message);
  }

  showNextCommand();
}

function expireActiveCommand(distance) {
  if (!activeCommand) {
    return;
  }

  const { event } = activeCommand;
  const penalty = Number(event.penaltyOnOutOfRange) || 0;
  const selectedOptionIds = getExaminerSelection();

  recordResult({
    eventId: event.id,
    status: "out-of-range",
    answerMode: event.answerMode,
    selectedOptionIds,
    correct: false,
    penalty,
    distanceFromTarget: Number(distance.toFixed(1)),
    answeredAt: null,
  });

  activeCommand = null;
  hideExaminerCommand();

  showRouteMessage(
    event.outOfRangeRouteMessage || {
      message: `No answer was recorded. ${penalty} point deducted.`,
      autoCloseMs: 0,
      priority: "high",
    }
  );

  showNextCommand();
}

function checkActiveCommandRange() {
  if (!activeCommand || !panorama) {
    return;
  }

  const position = panorama.getPosition();

  if (!position) {
    return;
  }

  const { event, targetPosition } = activeCommand;
  const answerRadius = Number.isFinite(event.answerRadius)
    ? event.answerRadius
    : event.radius;
  const distance = calculateDistanceMeters(
    position,
    targetPosition
  );

  if (distance > answerRadius) {
    expireActiveCommand(distance);
  }
}

function handleRouteEvent(event, targetPosition) {
  if (event.type === "route-message" || event.type === "message") {
    showRouteMessage(event);
    return;
  }

  if (event.type === "examiner-command") {
    commandQueue.push({ event, targetPosition });
    showNextCommand();
  }
}

async function initApp() {
  const mode = getRequestedMode();
  const requestedRouteId = getRequestedRouteId();
  const route = mode === "practice"
    ? await loadPracticeMessages()
    : await loadRouteConfig(requestedRouteId);
  const initialState = getInitialState(route);
  const streetView = await createStreetView(initialState);

  panorama = streetView.panorama;
  document.body.dataset.mode = mode || "selection";
  updateRouteName(mode === "practice" ? "Practice" : route.name);
  updatePenaltyScore(0);
  setLocationUpdatesEnabled(false);
  setStreetViewLocked(panorama, true);

  const { navigation } = route;
  const eventEngine = createEventEngine({
    events: route.events || [],
    streetViewService: streetView.streetViewService,
    panorama,
    onEvent: mode === "practice"
      ? (event) => showRouteMessage(event)
      : handleRouteEvent,
    onMissedEvent: (event, { penalty, skippedByEventId }) => {
      if (mode !== "exam") {
        return;
      }

      recordResult({
        eventId: event.id,
        status: "missed",
        penalty,
        skippedByEventId,
        answeredAt: null,
      });

      const message = event.missedRouteMessage ||
        navigation.missedRouteMessage || {
          message: penalty > 0
            ? `Route point missed. ${penalty} point deducted.`
            : "Route point missed.",
          autoCloseMs: 0,
          priority: "high",
        };

      showRouteMessage(message);
    },
  });
  let eventEngineInitialized = false;

  const startDrive = async () => {
    if (driveStarted) {
      return;
    }

    driveStarted = true;
    setLocationUpdatesEnabled(true);
    setStreetViewLocked(panorama, false);
    hideModeSelection();
    hideExamStart();
    updatePanoramaInfo(panorama);
    scheduleLocationUpdate(panorama, streetView.geocoder);
    showInfoTemporarily();

    if (!eventEngineInitialized) {
      eventEngineInitialized = true;
      await eventEngine.initialize();
    } else {
      eventEngine.refreshAndCheck();
    }
  };

  const startExam = async () => {
    await startDrive();
  };

  const prepareExam = () => {
    driveStarted = false;
    setLocationUpdatesEnabled(false);
    setStreetViewLocked(panorama, true);
    hideCurrentInfo();
    showExamStart(EXAM_START_NOTICE, {
      onStart: startExam,
      routeName: route.name,
    });
  };

  const navigateToMode = (nextMode, routeId = null) => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", nextMode);

    if (nextMode === "exam" && routeId) {
      url.searchParams.set("route", routeId);
    } else {
      url.searchParams.delete("route");
    }

    window.location.assign(url);
  };

  const selectExamRoute = (selection) => {
    const routeId = selection === "random"
      ? AVAILABLE_ROUTES[
          Math.floor(Math.random() * AVAILABLE_ROUTES.length)
        ].id
      : selection;
    navigateToMode("exam", routeId);
  };

  panorama.addListener("position_changed", () => {
    if (!driveStarted) {
      return;
    }

    updatePanoramaInfo(panorama);
    scheduleLocationUpdate(panorama, streetView.geocoder);
    showInfoTemporarily();
    eventEngine.refreshAndCheck();
    checkActiveCommandRange();
  });

  panorama.addListener("pano_changed", () => {
    if (!driveStarted) {
      return;
    }

    updatePanoramaInfo(panorama);
    showInfoTemporarily();
    eventEngine.checkNearbyEvents();
  });

  panorama.addListener("pov_changed", () => {
    if (!driveStarted) {
      return;
    }

    updatePanoramaInfo(panorama);
    showInfoTemporarily();
    eventEngine.checkNearbyEvents();
  });

  bindUiActions({
    onRestart: () => {
      driveStarted = false;
      setLocationUpdatesEnabled(false);
      activeCommand = null;
      commandQueue = [];
      results = [];
      totalPenalty = 0;
      eventEngine.reset();
      hideExaminerCommand();
      clearRouteMessages();
      updatePenaltyScore(0);
      restartStreetView(panorama, initialState);

      if (mode === "exam") {
        prepareExam();
      } else if (mode === "practice") {
        startDrive();
      }
    },
  });

  if (mode === "exam") {
    prepareExam();
  } else if (mode === "practice") {
    await startDrive();
  } else {
    showModeSelection(AVAILABLE_ROUTES, {
      selectedRouteId: requestedRouteId,
      onPractice: () => navigateToMode("practice"),
      onExam: selectExamRoute,
    });
  }
}

initApp().catch((error) => {
  console.error("Failed to initialize the route:", error);
  showRouteMessage({
    message: "The selected route could not be loaded.",
    autoCloseMs: 0,
    priority: "high",
  });
});
