import { normalizeRouteConfig } from "../route-normalizer.js";

const clone = (value) => structuredClone(value);

export function createRouteStore() {
  let state = {
    route: null,
    selectedEventId: null,
    dirty: false,
  };
  const listeners = new Set();

  function emit() {
    for (const listener of listeners) {
      listener(state);
    }
  }

  function setRoute(route, { dirty = false } = {}) {
    const nextRoute = normalizeRouteConfig(clone(route));
    state = {
      route: nextRoute,
      selectedEventId: nextRoute.events?.[0]?.id || null,
      dirty,
    };
    emit();
  }

  function selectEvent(eventId) {
    state = {
      ...state,
      selectedEventId: eventId,
    };
    emit();
  }

  function updateRoute(patch) {
    state = {
      ...state,
      route: {
        ...state.route,
        ...patch,
      },
      dirty: true,
    };
    emit();
  }

  function addEvent(event) {
    state = {
      ...state,
      route: {
        ...state.route,
        events: [...(state.route.events || []), clone(event)],
      },
      selectedEventId: event.id,
      dirty: true,
    };
    emit();
  }

  function updateEvent(eventId, patch) {
    state = {
      ...state,
      route: {
        ...state.route,
        events: state.route.events.map((event) =>
          event.id === eventId
            ? { ...event, ...clone(patch) }
            : event
        ),
      },
      dirty: true,
    };
    emit();
  }

  function mutateEvent(eventId, mutator) {
    const route = clone(state.route);
    const event = route.events.find((item) => item.id === eventId);

    if (!event) {
      return;
    }

    mutator(event);
    state = {
      ...state,
      route,
      dirty: true,
    };
    emit();
  }

  function removeEvent(eventId) {
    const events = state.route.events.filter(
      (event) => event.id !== eventId
    );

    state = {
      ...state,
      route: {
        ...state.route,
        events,
      },
      selectedEventId: events[0]?.id || null,
      dirty: true,
    };
    emit();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    getState: () => state,
    setRoute,
    selectEvent,
    updateRoute,
    addEvent,
    updateEvent,
    mutateEvent,
    removeEvent,
    subscribe,
  };
}
