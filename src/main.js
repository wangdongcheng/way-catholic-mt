import "./style.css";

import {
  AVAILABLE_ROUTES,
  getInitialState,
  getRequestedMode,
  getRequestedRouteId,
  loadCriticalViolations,
  loadObservationChecks,
  loadObservationTypes,
  loadRouteConfig,
  EXAM_START_NOTICE
} from "./config.js";

import { createEventEngine } from "./event-engine.js";
import { createObservationEngine } from "./observation-engine.js";
import { createCriticalViolationEngine } from "./critical-violation-engine.js";
import {
  createStreetView,
  restartStreetView,
  setStreetViewLocked,
} from "./streetview.js";
import {
  bindUiActions,
  clearExaminerFeedback,
  clearRouteMessages,
  EVENT_MESSAGE_AUTO_CLOSE_MS,
  getExaminerSelection,
  hideCurrentInfo,
  hideExamFailure,
  hideExaminerCommand,
  hideExamStart,
  hideModeSelection,
  hideObservationToolbar,
  scheduleLocationUpdate,
  setLocationUpdatesEnabled,
  showExaminerCommand,
  showExaminerFeedback,
  showExamFailure,
  showExamStart,
  showInfoTemporarily,
  showModeSelection,
  showObservationToolbar,
  showRouteMessage,
  setObservationToolbarVisible,
  updateCurrentEventInfo,
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
const currentEventDebug = {
  examinerCommands: [],
  observations: [],
  criticalViolations: [],
};

function updateEventDebug(kind, events) {
  currentEventDebug[kind] = events;
  updateCurrentEventInfo(currentEventDebug);
}

function syncExaminerEventDebug() {
  const events = [];

  if (activeCommand) {
    events.push({ id: activeCommand.event.id, status: "active" });
  }

  events.push(...commandQueue.map(({ event }) => ({
    id: event.id,
    status: "queued",
  })));
  updateEventDebug("examinerCommands", events);
}

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
    syncExaminerEventDebug();
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
    syncExaminerEventDebug();
    return;
  }

  syncExaminerEventDebug();
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
    showExaminerFeedback(message, correct ? "correct" : "incorrect");
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

  showExaminerFeedback(
    event.outOfRangeRouteMessage || {
      message: `No answer was recorded. ${penalty} point deducted.`,
    },
    "out-of-range"
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
  const [route, observationDocument, observationTypes, criticalDocument] =
    await Promise.all([
      loadRouteConfig(requestedRouteId),
      loadObservationChecks(),
      loadObservationTypes(),
      loadCriticalViolations(),
    ]);
  const initialState = getInitialState(
    mode === "practice" ? observationDocument : route
  );
  const streetView = await createStreetView(initialState);

  panorama = streetView.panorama;
  document.body.dataset.mode = mode || "selection";
  updateRouteName(mode === "practice" ? "Practice" : route.name);
  updatePenaltyScore(0);
  setLocationUpdatesEnabled(false);
  setStreetViewLocked(panorama, true);

  const { navigation } = route;
  const eventEngine = createEventEngine({
    events: mode === "exam" ? route.events || [] : [],
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
  const observationEngine = createObservationEngine({
    document: observationDocument,
    mode,
    streetViewService: streetView.streetViewService,
    panorama,
    onPracticeMessage: (message) => {
      const modal = message?.modal === true;

      showRouteMessage(message, {
        modal,
        autoCloseMs: modal ? 0 : EVENT_MESSAGE_AUTO_CLOSE_MS,
      });
    },
    onAcknowledged: (event) => {
      recordResult({
        eventId: event.id,
        status: "observation-acknowledged",
        correct: true,
        penalty: 0,
        answeredAt: Date.now(),
      });
      showExaminerFeedback(
        "Observation recorded correctly.",
        "correct"
      );
    },
    onMissed: (event, { distance, penalty }) => {
      recordResult({
        eventId: event.id,
        status: "observation-missed",
        correct: false,
        penalty,
        distanceFromTarget: Number(distance.toFixed(1)),
        answeredAt: null,
      });
      showExaminerFeedback(
        "A required observation was missed.",
        "missed"
      );
    },
    onIncorrect: ({ observationType, activeEventIds, penalty }) => {
      recordResult({
        eventId: activeEventIds[0] || null,
        status: "observation-incorrect",
        observationType,
        activeEventIds,
        correct: false,
        penalty,
        answeredAt: Date.now(),
      });
      showExaminerFeedback(
        "That observation did not match.",
        "not-that-one"
      );
    },
    onVisibilityChange: ({ hasVisible }) => {
      setObservationToolbarVisible(hasVisible);
    },
    onDebugStateChange: (events) => {
      updateEventDebug("observations", events);
    },
  });
  const criticalViolationEngine = createCriticalViolationEngine({
    document: criticalDocument,
    mode,
    panorama,
    onViolation: handleCriticalViolation,
    onDebugStateChange: (events) => {
      updateEventDebug("criticalViolations", events);
    },
  });
  let eventEngineInitialized = false;
  let observationEngineInitialized = false;

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

    if (mode === "exam") {
      showObservationToolbar(observationTypes.types, {
        onSelect: (observationType) =>
          observationEngine.acknowledge(observationType),
      });
      setObservationToolbarVisible(false);
    } else {
      hideObservationToolbar();
    }

    if (!eventEngineInitialized) {
      eventEngineInitialized = true;
      await eventEngine.initialize();
    } else {
      eventEngine.refreshAndCheck();
    }

    if (!observationEngineInitialized) {
      observationEngineInitialized = true;
      await observationEngine.initialize();
    } else {
      observationEngine.checkNearbyEvents();
    }

    criticalViolationEngine.check();
  };

  const startExam = async () => {
    await startDrive();
  };

  const prepareExam = () => {
    driveStarted = false;
    setLocationUpdatesEnabled(false);
    setStreetViewLocked(panorama, true);
    hideCurrentInfo();
    hideObservationToolbar();
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

  const showModeChooser = () => {
    showModeSelection(AVAILABLE_ROUTES, {
      selectedRouteId: requestedRouteId,
      onPractice: () => navigateToMode("practice"),
      onExam: selectExamRoute,
    });
  };

  const resetToModeChooser = () => {
    driveStarted = false;
    setLocationUpdatesEnabled(false);
    activeCommand = null;
    commandQueue = [];
    syncExaminerEventDebug();
    results = [];
    totalPenalty = 0;
    eventEngine.reset();
    observationEngine.reset();
    criticalViolationEngine.reset();
    hideExaminerCommand();
    hideExamStart();
    hideExamFailure();
    hideObservationToolbar();
    clearExaminerFeedback();
    clearRouteMessages();
    hideCurrentInfo();
    updatePenaltyScore(0);
    setStreetViewLocked(panorama, true);
    restartStreetView(panorama, initialState);
    document.body.dataset.mode = "selection";
    showModeChooser();
  };

  function handleCriticalViolation(event, details) {
    results.push({
      eventId: event.id,
      status: mode === "exam" ? "failed" : "practice-warning",
      reason: event.examFailure?.reasonCode || event.rule,
      penalty: 0,
      ...details,
    });

    if (mode === "practice") {
      driveStarted = false;
      setLocationUpdatesEnabled(false);
      clearRouteMessages();
      hideCurrentInfo();
      setStreetViewLocked(panorama, true);
      showExamFailure({
        ...(event.practiceWarning || {}),
        message: event.practiceWarning?.message ||
          "A serious driving error was detected.",
      }, {
        onContinue: () => {
          hideExamFailure();
          driveStarted = true;
          setLocationUpdatesEnabled(true);
          setStreetViewLocked(panorama, false);
          updatePanoramaInfo(panorama);
          scheduleLocationUpdate(panorama, streetView.geocoder);
          showInfoTemporarily();
        },
        onRestart: resetToModeChooser,
      });
      return;
    }

    driveStarted = false;
    setLocationUpdatesEnabled(false);
    activeCommand = null;
    commandQueue = [];
    hideExaminerCommand();
    hideObservationToolbar();
    clearExaminerFeedback();
    clearRouteMessages();
    hideCurrentInfo();
    setStreetViewLocked(panorama, true);
    document.body.dataset.mode = "failed";
    showExamFailure(event.examFailure, {
      onRestart: resetToModeChooser,
    });
  }

  panorama.addListener("position_changed", () => {
    if (!driveStarted) {
      return;
    }

    updatePanoramaInfo(panorama);
    scheduleLocationUpdate(panorama, streetView.geocoder);
    showInfoTemporarily();
    eventEngine.refreshAndCheck();
    observationEngine.checkNearbyEvents();
    criticalViolationEngine.check();
    checkActiveCommandRange();
  });

  panorama.addListener("pano_changed", () => {
    if (!driveStarted) {
      return;
    }

    updatePanoramaInfo(panorama);
    showInfoTemporarily();
    eventEngine.checkNearbyEvents();
    observationEngine.checkNearbyEvents();
    criticalViolationEngine.check();
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
    onRestart: resetToModeChooser,
  });

  if (mode === "exam") {
    prepareExam();
  } else if (mode === "practice") {
    await startDrive();
  } else {
    showModeChooser();
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
