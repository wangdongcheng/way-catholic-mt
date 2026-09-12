export const CHECKPOINT_STATUS = Object.freeze({
  PENDING: "pending",
  REACHED: "reached",
  MISSED: "missed",
  SKIPPED: "skipped",
});

export const CONTENT_STATUS = Object.freeze({
  PENDING: "pending",
  TRIGGERED: "triggered",
  SUPPRESSED: "suppressed",
});

function createInitialState() {
  return {
    checkpointStatus: CHECKPOINT_STATUS.PENDING,
    contentStatus: CONTENT_STATUS.PENDING,
  };
}

export function createRouteProgressTracker({
  events,
  onMissedEvent = () => {},
}) {
  const eventIndexes = new Map(
    events.map((event, index) => [event.id, index])
  );
  const eventStates = new Map();

  function reset() {
    eventStates.clear();

    for (const event of events) {
      eventStates.set(event.id, createInitialState());
    }
  }

  function getMutableState(eventId) {
    return eventStates.get(eventId);
  }

  function getEventState(eventId) {
    const state = getMutableState(eventId);
    return state ? { ...state } : null;
  }

  function compareEventOrder(leftEventId, rightEventId) {
    return (
      eventIndexes.get(leftEventId) -
      eventIndexes.get(rightEventId)
    );
  }

  function settleEarlierEvents(eventIndex, skippedByEventId) {
    for (let index = 0; index < eventIndex; index += 1) {
      const event = events[index];
      const state = getMutableState(event.id);

      if (!state) {
        continue;
      }

      if (state.checkpointStatus === CHECKPOINT_STATUS.PENDING) {
        state.checkpointStatus = event.required
          ? CHECKPOINT_STATUS.MISSED
          : CHECKPOINT_STATUS.SKIPPED;
        state.contentStatus = CONTENT_STATUS.SUPPRESSED;

        if (event.required) {
          onMissedEvent(event, {
            penalty: event.penaltyOnMiss,
            skippedByEventId,
          });
        }
        continue;
      }

      if (
        state.checkpointStatus === CHECKPOINT_STATUS.REACHED &&
        state.contentStatus === CONTENT_STATUS.PENDING
      ) {
        state.contentStatus = CONTENT_STATUS.SUPPRESSED;
      }
    }
  }

  function markReached(eventId) {
    const eventIndex = eventIndexes.get(eventId);
    const state = getMutableState(eventId);

    if (eventIndex === undefined || !state) {
      return null;
    }

    settleEarlierEvents(eventIndex, eventId);

    if (state.checkpointStatus === CHECKPOINT_STATUS.PENDING) {
      state.checkpointStatus = CHECKPOINT_STATUS.REACHED;
    }

    return getEventState(eventId);
  }

  function canProcess(eventId) {
    const state = getMutableState(eventId);

    return Boolean(
      state &&
      (
        state.checkpointStatus === CHECKPOINT_STATUS.PENDING ||
        state.contentStatus === CONTENT_STATUS.PENDING
      )
    );
  }

  function canTriggerContent(eventId) {
    return getMutableState(eventId)?.contentStatus ===
      CONTENT_STATUS.PENDING;
  }

  function markContentTriggered(eventId) {
    const state = getMutableState(eventId);

    if (state?.contentStatus === CONTENT_STATUS.PENDING) {
      state.contentStatus = CONTENT_STATUS.TRIGGERED;
    }
  }

  reset();

  return {
    canProcess,
    canTriggerContent,
    compareEventOrder,
    getEventState,
    markContentTriggered,
    markReached,
    reset,
  };
}
