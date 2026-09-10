import {
  calculateDistanceMeters,
  isHeadingInRange,
} from "./utils.js";
import { createSpatialIndex } from "./spatial-index.js";

export function createEventEngine({
  events,
  navigation = {},
  streetViewService,
  panorama,
  onEvent,
  onMissedEvent = () => {},
}) {
  const triggeredEvents = new Set();
  const reachedCheckpoints = new Set();
  const settledEvents = new Set();
  const targetPositions = new Map();
  const eventIndexes = new Map(
    events.map((event, index) => [event.id, index])
  );
  const spatialIndex = createSpatialIndex({
    cellSizeMeters: 100,
  });

  let nearbyEntries = [];
  let maxEventRadius = 0;

  function isRequired(event) {
    return typeof event.required === "boolean"
      ? event.required
      : navigation.eventsAreCheckpoints === true;
  }

  function getMissPenalty(event) {
    if (Number.isFinite(event.penaltyOnMiss)) {
      return event.penaltyOnMiss;
    }

    return Number.isFinite(navigation.defaultPenaltyOnMiss)
      ? navigation.defaultPenaltyOnMiss
      : 0;
  }

  function cacheTargetPosition(event, position) {
    targetPositions.set(event.id, position);
    spatialIndex.add(event, position);
    maxEventRadius = Math.max(
      maxEventRadius,
      Number.isFinite(event.radius) ? event.radius : 0
    );
  }

  async function resolveTargetPosition(event) {
    const hasCoordinates =
      Number.isFinite(event.lat) &&
      Number.isFinite(event.lng);

    if (hasCoordinates) {
      cacheTargetPosition(event, {
        lat: event.lat,
        lng: event.lng,
      });
      return;
    }

    if (!event.pano) {
      console.warn(
        `Event ${event.id} has no valid lat/lng or pano and will be skipped.`
      );
      return;
    }

    try {
      const response = await streetViewService.getPanorama({
        pano: event.pano,
      });
      const latLng = response.data?.location?.latLng;

      if (latLng) {
        cacheTargetPosition(event, {
          lat: latLng.lat(),
          lng: latLng.lng(),
        });
      }
    } catch (error) {
      console.error(
        `Failed to load target panorama for event ${event.id}:`,
        error
      );
    }
  }

  function updateNearbyEvents() {
    const position = panorama.getPosition();

    if (!position) {
      nearbyEntries = [];
      return;
    }

    nearbyEntries = spatialIndex.getNearby(
      position.lat(),
      position.lng(),
      maxEventRadius
    );
  }

  function matchesCheckpoint(event, targetPosition) {
    const position = panorama.getPosition();

    if (!position || !targetPosition) {
      return false;
    }

    const radius = Number.isFinite(event.radius)
      ? event.radius
      : 0;

    return calculateDistanceMeters(
      position,
      targetPosition
    ) <= radius;
  }

  function matchesEvent(event, targetPosition) {
    if (!matchesCheckpoint(event, targetPosition)) {
      return false;
    }

    const heading = panorama.getPov()?.heading;
    const hasHeadingRange =
      Number.isFinite(event.headingMin) &&
      Number.isFinite(event.headingMax);

    if (!hasHeadingRange) {
      return true;
    }

    return heading !== undefined && isHeadingInRange(
      heading,
      event.headingMin,
      event.headingMax
    );
  }

  function settleEarlierEvents(eventIndex, skippedByEventId) {
    for (let index = 0; index < eventIndex; index += 1) {
      const event = events[index];

      if (settledEvents.has(event.id)) {
        continue;
      }

      if (reachedCheckpoints.has(event.id)) {
        triggeredEvents.add(event.id);
        settledEvents.add(event.id);
        continue;
      }

      triggeredEvents.add(event.id);
      settledEvents.add(event.id);

      if (isRequired(event)) {
        onMissedEvent(event, {
          penalty: getMissPenalty(event),
          skippedByEventId,
        });
      }
    }
  }

  function checkNearbyEvents() {
    const matches = nearbyEntries
      .filter(({ event, position }) =>
        !settledEvents.has(event.id) &&
        matchesCheckpoint(event, position)
      )
      .sort((left, right) =>
        eventIndexes.get(left.event.id) -
        eventIndexes.get(right.event.id)
      );

    for (const { event, position } of matches) {
      const eventIndex = eventIndexes.get(event.id);

      settleEarlierEvents(eventIndex, event.id);
      reachedCheckpoints.add(event.id);

      if (
        !triggeredEvents.has(event.id) &&
        matchesEvent(event, position)
      ) {
        triggeredEvents.add(event.id);
        onEvent(event, position);
      }
    }
  }

  function refreshAndCheck() {
    updateNearbyEvents();
    checkNearbyEvents();
  }

  async function initialize() {
    await Promise.all(events.map(resolveTargetPosition));
    refreshAndCheck();
  }

  function reset() {
    triggeredEvents.clear();
    reachedCheckpoints.clear();
    settledEvents.clear();
  }

  return {
    initialize,
    refreshAndCheck,
    checkNearbyEvents,
    reset,
  };
}
