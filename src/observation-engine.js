import { createSpatialIndex } from "./spatial-index.js";
import {
  calculateDistanceMeters,
  isHeadingInRange,
} from "./utils.js";

export const OBSERVATION_STATUS = Object.freeze({
  PENDING: "pending",
  ACTIVE: "active",
  ACKNOWLEDGED: "acknowledged",
  COMPLETED: "completed",
  MISSED: "missed",
  SHOWN: "shown",
});

function applyDefaults(document) {
  const defaults = document?.defaults || {};

  return (document?.events || []).map((event) => ({
    ...defaults,
    ...event,
    practiceMessage: {
      ...(defaults.practiceMessage || {}),
      ...(event.practiceMessage || {}),
    },
  }));
}

export function createObservationEngine({
  document,
  mode,
  streetViewService,
  panorama,
  onPracticeMessage = () => {},
  onAcknowledged = () => {},
  onMissed = () => {},
  onIncorrect = () => {},
  onVisibilityChange = () => {},
  onDebugStateChange = () => {},
}) {
  const defaults = document?.defaults || {};
  const events = applyDefaults(document).filter((event) =>
    event.enabled !== false &&
    (mode !== "exam" || event.examEnabled !== false)
  );
  const spatialIndex = createSpatialIndex({ cellSizeMeters: 100 });
  const positions = new Map();
  const states = new Map();
  let maxRadius = 0;
  let lastVisibleCount = null;
  let remainingAttempts = 0;

  function notifyDebugStateChange(position = panorama.getPosition()) {
    const debugEvents = events.flatMap((event) => {
      const status = states.get(event.id);
      const isTracked = status === OBSERVATION_STATUS.ACTIVE ||
        status === OBSERVATION_STATUS.ACKNOWLEDGED;
      const answerRadius = Number(event.answerRadius) ||
        Number(event.radius) || 0;
      const isVisiblePracticeEvent = mode === "practice" &&
        status === OBSERVATION_STATUS.SHOWN &&
        position &&
        distanceTo(event, position) <= answerRadius;

      return isTracked || isVisiblePracticeEvent
        ? [{ id: event.id, status }]
        : [];
    });

    onDebugStateChange(debugEvents);
  }

  function notifyVisibilityChange() {
    const activeEventIds = events
      .filter((event) =>
        states.get(event.id) === OBSERVATION_STATUS.ACTIVE
      )
      .map((event) => event.id);
    const visibleEventIds = remainingAttempts > 0 ? activeEventIds : [];

    if (visibleEventIds.length === lastVisibleCount) {
      return;
    }

    lastVisibleCount = visibleEventIds.length;
    onVisibilityChange({
      hasVisible: visibleEventIds.length > 0,
      visibleEventIds,
    });
  }

  function reset() {
    states.clear();
    remainingAttempts = 0;

    for (const event of events) {
      states.set(event.id, OBSERVATION_STATUS.PENDING);
    }

    notifyVisibilityChange();
    notifyDebugStateChange();
  }

  function cachePosition(event, position) {
    positions.set(event.id, position);
    spatialIndex.add(event, position);
    maxRadius = Math.max(
      maxRadius,
      Number(event.answerRadius) || Number(event.radius) || 0
    );
  }

  async function resolvePosition(event) {
    if (Number.isFinite(event.lat) && Number.isFinite(event.lng)) {
      cachePosition(event, { lat: event.lat, lng: event.lng });
      return;
    }

    if (!event.pano) {
      console.warn(`Observation ${event.id} has no usable location.`);
      return;
    }

    try {
      const response = await streetViewService.getPanorama({ pano: event.pano });
      const latLng = response.data?.location?.latLng;

      if (latLng) {
        cachePosition(event, { lat: latLng.lat(), lng: latLng.lng() });
      }
    } catch (error) {
      console.error(`Failed to resolve observation ${event.id}:`, error);
    }
  }

  function matchesPano(event) {
    return !event.pano || panorama.getPano() === event.pano;
  }

  function matchesHeading(event) {
    const hasRange = Number.isFinite(event.headingMin) &&
      Number.isFinite(event.headingMax);

    return !hasRange || isHeadingInRange(
      panorama.getPov()?.heading ?? 0,
      event.headingMin,
      event.headingMax
    );
  }

  function distanceTo(event, position) {
    const target = positions.get(event.id);
    return target ? calculateDistanceMeters(position, target) : Infinity;
  }

  function checkTrackedEvents(position) {
    if (mode !== "exam") {
      return;
    }

    for (const event of events) {
      const status = states.get(event.id);

      if (
        status !== OBSERVATION_STATUS.ACTIVE &&
        status !== OBSERVATION_STATUS.ACKNOWLEDGED
      ) {
        continue;
      }

      const answerRadius = Number(event.answerRadius) ||
        Number(event.radius) || 0;
      const distance = distanceTo(event, position);

      if (distance > answerRadius) {
        if (status === OBSERVATION_STATUS.ACTIVE) {
          states.set(event.id, OBSERVATION_STATUS.MISSED);
          onMissed(event, {
            distance,
            penalty: Number(event.penaltyOnMiss) || 0,
          });
        } else {
          states.set(event.id, OBSERVATION_STATUS.COMPLETED);
        }
      }
    }

    const activeCount = events.filter((event) =>
      states.get(event.id) === OBSERVATION_STATUS.ACTIVE
    ).length;
    remainingAttempts = Math.min(remainingAttempts, activeCount);
  }

  function checkNearbyEvents() {
    const position = panorama.getPosition();

    if (!position) {
      return;
    }

    checkTrackedEvents(position);

    const nearby = spatialIndex.getNearby(
      position.lat(),
      position.lng(),
      maxRadius
    );

    for (const { event } of nearby) {
      if (states.get(event.id) !== OBSERVATION_STATUS.PENDING) {
        continue;
      }

      const radius = Number(event.radius) || 0;
      if (
        distanceTo(event, position) > radius ||
        !matchesPano(event) ||
        !matchesHeading(event)
      ) {
        continue;
      }

      if (mode === "practice") {
        states.set(event.id, OBSERVATION_STATUS.SHOWN);
        onPracticeMessage(event.practiceMessage, event);
      } else {
        states.set(event.id, OBSERVATION_STATUS.ACTIVE);
        remainingAttempts += 1;
      }
    }

    notifyVisibilityChange();
    notifyDebugStateChange(position);
  }

  function acknowledge(observationType) {
    if (mode !== "exam") {
      return [];
    }

    const active = events.filter((event) =>
      states.get(event.id) === OBSERVATION_STATUS.ACTIVE
    );

    if (active.length === 0 || remainingAttempts === 0) {
      return [];
    }

    remainingAttempts -= 1;
    const matched = active.find((event) =>
      event.observationType === observationType
    );

    if (!matched) {
      const penalty = Math.max(...active.map((event) =>
        Number(event.penaltyOnIncorrect) ||
        Number(defaults.penaltyOnIncorrect) || 0
      ));

      onIncorrect({
        observationType,
        activeEventIds: active.map((event) => event.id),
        penalty,
      });
      notifyVisibilityChange();
      notifyDebugStateChange();
      return [];
    }

    states.set(matched.id, OBSERVATION_STATUS.ACKNOWLEDGED);
    onAcknowledged(matched);

    notifyVisibilityChange();
    notifyDebugStateChange();

    return [matched.id];
  }

  async function initialize() {
    await Promise.all(events.map(resolvePosition));
    checkNearbyEvents();
  }

  reset();

  return {
    acknowledge,
    checkNearbyEvents,
    initialize,
    reset,
  };
}
