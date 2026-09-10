import { createSpatialIndex } from "./spatial-index.js";
import {
  calculateDistanceMeters,
  isHeadingInRange,
} from "./utils.js";

export const OBSERVATION_STATUS = Object.freeze({
  PENDING: "pending",
  ACTIVE: "active",
  ACKNOWLEDGED: "acknowledged",
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

  function reset() {
    states.clear();

    for (const event of events) {
      states.set(event.id, OBSERVATION_STATUS.PENDING);
    }
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

  function checkActiveEvents(position) {
    if (mode !== "exam") {
      return;
    }

    for (const event of events) {
      if (states.get(event.id) !== OBSERVATION_STATUS.ACTIVE) {
        continue;
      }

      const answerRadius = Number(event.answerRadius) ||
        Number(event.radius) || 0;
      const distance = distanceTo(event, position);

      if (distance > answerRadius) {
        states.set(event.id, OBSERVATION_STATUS.MISSED);
        onMissed(event, {
          distance,
          penalty: Number(event.penaltyOnMiss) || 0,
        });
      }
    }
  }

  function checkNearbyEvents() {
    const position = panorama.getPosition();

    if (!position) {
      return;
    }

    checkActiveEvents(position);

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
      }
    }
  }

  function acknowledge(observationType) {
    if (mode !== "exam") {
      return [];
    }

    const matched = events.filter((event) =>
      states.get(event.id) === OBSERVATION_STATUS.ACTIVE &&
      event.observationType === observationType
    );

    if (matched.length === 0) {
      const active = events.filter((event) =>
        states.get(event.id) === OBSERVATION_STATUS.ACTIVE
      );
      const penalty = active.length > 0
        ? Math.max(...active.map((event) =>
            Number(event.penaltyOnIncorrect) || 0
          ))
        : Number(defaults.penaltyOnIncorrect) || 0;

      onIncorrect({
        observationType,
        activeEventIds: active.map((event) => event.id),
        penalty,
      });
      return [];
    }

    for (const event of matched) {
      states.set(event.id, OBSERVATION_STATUS.ACKNOWLEDGED);
      onAcknowledged(event);
    }

    return matched.map((event) => event.id);
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
