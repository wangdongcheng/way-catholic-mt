export const DEFAULT_ROUTE_NAVIGATION = Object.freeze({
  eventsAreCheckpoints: false,
  defaultPenaltyOnMiss: 0,
});

function isRecord(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function resolveRouteNavigation(route) {
  const configured = isRecord(route?.navigation)
    ? route.navigation
    : {};

  return {
    ...DEFAULT_ROUTE_NAVIGATION,
    ...configured,
  };
}

export function normalizeRouteConfig(route) {
  if (!isRecord(route)) {
    return route;
  }

  const navigation = resolveRouteNavigation(route);
  const events = Array.isArray(route.events)
    ? route.events.map((event) => ({
        ...event,
        required: event.required !== undefined
          ? event.required
          : navigation.eventsAreCheckpoints,
        penaltyOnMiss: event.penaltyOnMiss !== undefined
          ? event.penaltyOnMiss
          : navigation.defaultPenaltyOnMiss,
      }))
    : route.events;

  return {
    ...route,
    navigation,
    events,
  };
}
