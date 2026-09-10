import "./style.css";

import {
  getInitialState,
  loadRouteConfig,
} from "./config.js";
import { EXAM_START_NOTICE } from "./exam-config.js";
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
  scheduleLocationUpdate,
  setLocationUpdatesEnabled,
  showExaminerCommand,
  showExamStart,
  showInfoTemporarily,
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
let examStarted = false;

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
  const route = await loadRouteConfig();
  const initialState = getInitialState(route);
  const streetView = await createStreetView(initialState);

  panorama = streetView.panorama;
  updateRouteName(route.name);
  updatePenaltyScore(0);
  setLocationUpdatesEnabled(false);
  setStreetViewLocked(panorama, true);

  const eventEngine = createEventEngine({
    events: route.events || [],
    streetViewService: streetView.streetViewService,
    panorama,
    onEvent: handleRouteEvent,
  });
  let eventEngineInitialized = false;

  const startExam = async () => {
    if (examStarted) {
      return;
    }

    examStarted = true;
    setLocationUpdatesEnabled(true);
    setStreetViewLocked(panorama, false);
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

  const prepareExam = () => {
    examStarted = false;
    setLocationUpdatesEnabled(false);
    setStreetViewLocked(panorama, true);
    hideCurrentInfo();
    showExamStart(EXAM_START_NOTICE, {
      onStart: startExam,
    });
  };

  panorama.addListener("position_changed", () => {
    if (!examStarted) {
      return;
    }

    updatePanoramaInfo(panorama);
    scheduleLocationUpdate(panorama, streetView.geocoder);
    showInfoTemporarily();
    eventEngine.refreshAndCheck();
    checkActiveCommandRange();
  });

  panorama.addListener("pano_changed", () => {
    if (!examStarted) {
      return;
    }

    updatePanoramaInfo(panorama);
    showInfoTemporarily();
    eventEngine.checkNearbyEvents();
  });

  panorama.addListener("pov_changed", () => {
    if (!examStarted) {
      return;
    }

    updatePanoramaInfo(panorama);
    showInfoTemporarily();
    eventEngine.checkNearbyEvents();
  });

  bindUiActions({
    onRestart: () => {
      examStarted = false;
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
      prepareExam();
    },
  });

  prepareExam();
}

initApp().catch((error) => {
  console.error("Failed to initialize the route:", error);
  showRouteMessage({
    message: "The selected route could not be loaded.",
    autoCloseMs: 0,
    priority: "high",
  });
});
