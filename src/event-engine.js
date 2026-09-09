import {
  calculateDistanceMeters,
  isHeadingInRange,
} from "./utils.js";

export function createEventEngine({
  events,
  streetViewService,
  panorama,
  onEvent,
}) {
  const triggeredEvents = new Set();
  const targetPositions = new Map();

  async function resolveTargetPosition(event) {
    if (!event.targetPano) {
      return;
    }

    try {
      const response = await streetViewService.getPanorama({
        pano: event.targetPano,
      });

      const latLng = response.data?.location?.latLng;

      if (!latLng) {
        return;
      }

      targetPositions.set(event.id, {
        lat: latLng.lat(),
        lng: latLng.lng(),
      });
    } catch (error) {
      console.error(`Failed to load target panorama for event ${event.id}:`, error);
    }
  }

  function matchesEvent(event) {
    const targetPosition = targetPositions.get(event.id);
    const position = panorama.getPosition();
    const heading = panorama.getPov()?.heading;

    if (!targetPosition || !position || heading === undefined) {
      return false;
    }

    const distance = calculateDistanceMeters(
      position,
      targetPosition
    );

    return (
      distance <= event.radius &&
      isHeadingInRange(
        heading,
        event.headingMin,
        event.headingMax
      )
    );
  }

  function checkEvents() {
    for (const event of events) {
      if (triggeredEvents.has(event.id)) {
        continue;
      }

      if (!matchesEvent(event)) {
        continue;
      }

      triggeredEvents.add(event.id);
      onEvent(event);
    }
  }

  async function initialize() {
    await Promise.all(events.map(resolveTargetPosition));
    checkEvents();
  }

  function reset() {
    triggeredEvents.clear();
  }

  return {
    initialize,
    checkEvents,
    reset,
  };
}
