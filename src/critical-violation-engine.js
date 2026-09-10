import { calculateDistanceMeters } from "./utils.js";

const STATUS = Object.freeze({
  IDLE: "idle",
  ARMED: "armed",
  EXPIRED: "expired",
  TRIGGERED: "triggered",
});

function applyDefaults(document) {
  const defaults = document?.defaults || {};

  return (document?.events || [])
    .filter((event) => event.enabled !== false)
    .map((event) => ({ ...defaults, ...event }));
}

function getPoint(config, defaultRadius) {
  return {
    lat: config?.location?.lat,
    lng: config?.location?.lng,
    pano: config?.pano || null,
    radius: Number(config?.radius) || defaultRadius,
  };
}

export function createCriticalViolationEngine({
  document,
  mode,
  panorama,
  onViolation,
}) {
  const events = applyDefaults(document);
  const states = new Map();

  function reset() {
    states.clear();

    for (const event of events) {
      states.set(event.id, {
        status: STATUS.IDLE,
        triggeredAt: null,
        expiresAt: null,
      });
    }
  }

  function matchesPoint(point, position) {
    if (
      !Number.isFinite(point.lat) ||
      !Number.isFinite(point.lng) ||
      (point.pano && panorama.getPano() !== point.pano)
    ) {
      return false;
    }

    return calculateDistanceMeters(position, point) <= point.radius;
  }

  function check() {
    const position = panorama.getPosition();

    if (!position) {
      return;
    }

    const now = Date.now();

    for (const event of events) {
      const state = states.get(event.id);
      if (!state) {
        continue;
      }

      const trigger = getPoint(
        event.triggerCheckpoint,
        Number(event.triggerRadius) || 15
      );
      const forbidden = getPoint(
        event.forbiddenDestination,
        Number(event.violationRadius) || 15
      );
      const insideTrigger = matchesPoint(trigger, position);
      const insideForbidden = matchesPoint(forbidden, position);

      if (state.status === STATUS.TRIGGERED) {
        if (
          mode === "practice" &&
          event.oncePerSession === false &&
          !insideTrigger &&
          !insideForbidden
        ) {
          state.status = STATUS.IDLE;
          state.triggeredAt = null;
          state.expiresAt = null;
        }
        continue;
      }

      if (state.status === STATUS.EXPIRED) {
        if (!insideTrigger) {
          state.status = STATUS.IDLE;
        }
        continue;
      }

      if (state.status === STATUS.IDLE && insideTrigger) {
        state.status = STATUS.ARMED;
        state.triggeredAt = now;
        state.expiresAt = now + (Number(event.windowMs) || 60000);
        continue;
      }

      if (state.status !== STATUS.ARMED) {
        continue;
      }

      if (now > state.expiresAt) {
        state.status = STATUS.EXPIRED;
        continue;
      }

      if (insideForbidden) {
        state.status = STATUS.TRIGGERED;
        onViolation(event, {
          mode,
          triggeredAt: state.triggeredAt,
          occurredAt: now,
          position: {
            lat: position.lat(),
            lng: position.lng(),
          },
        });
      }
    }
  }

  reset();

  return { check, reset };
}
