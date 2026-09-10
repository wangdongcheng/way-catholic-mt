import {
  calculateDistanceMeters,
  isHeadingInRange,
} from "./utils.js";
import { createSpatialIndex } from "./spatial-index.js";

export function createEventEngine({
  events,
  streetViewService,
  panorama,
  onEvent,
}) {
  const triggeredEvents = new Set();
  const targetPositions = new Map();
  const spatialIndex = createSpatialIndex({
    cellSizeMeters: 100,
  });

  let nearbyEntries = [];
  let maxEventRadius = 0;

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

  function matchesEvent(event, targetPosition) {
    const position = panorama.getPosition();
    const heading = panorama.getPov()?.heading;

    if (!position || !targetPosition) {
      return false;
    }

    const radius = Number.isFinite(event.radius)
      ? event.radius
      : 0;

    if (
      calculateDistanceMeters(position, targetPosition) > radius
    ) {
      return false;
    }

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

  function checkNearbyEvents() {
    for (const { event, position } of nearbyEntries) {
      if (
        triggeredEvents.has(event.id) ||
        !matchesEvent(event, position)
      ) {
        continue;
      }

      triggeredEvents.add(event.id);
      onEvent(event, position);
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
  }

  return {
    initialize,
    refreshAndCheck,
    checkNearbyEvents,
    reset,
  };
}
