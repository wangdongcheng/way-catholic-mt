function issue(level, message, eventId = null) {
  return { level, message, eventId };
}

function isCoordinate(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function validateRoute(route) {
  const issues = [];

  if (!route || typeof route !== "object") {
    return [issue("error", "The route must be a JSON object.")];
  }

  if (!route.id || typeof route.id !== "string") {
    issues.push(issue("error", "Route ID is required."));
  }

  if (!route.name || typeof route.name !== "string") {
    issues.push(issue("error", "Route name is required."));
  }

  if (
    !isCoordinate(route.startState?.lat, -90, 90) ||
    !isCoordinate(route.startState?.lng, -180, 180)
  ) {
    issues.push(issue("error", "The route start position is invalid."));
  }

  if (
    route.navigation !== undefined &&
    (
      !route.navigation ||
      typeof route.navigation !== "object" ||
      Array.isArray(route.navigation)
    )
  ) {
    issues.push(issue("error", "Route navigation settings must be an object."));
  } else if (route.navigation) {
    if (
      route.navigation.eventsAreCheckpoints !== undefined &&
      typeof route.navigation.eventsAreCheckpoints !== "boolean"
    ) {
      issues.push(issue(
        "error",
        "Events are checkpoints must be true or false."
      ));
    }

    if (
      route.navigation.defaultPenaltyOnMiss !== undefined &&
      (
        !Number.isFinite(route.navigation.defaultPenaltyOnMiss) ||
        route.navigation.defaultPenaltyOnMiss < 0
      )
    ) {
      issues.push(issue(
        "error",
        "Default missed-event penalty cannot be negative."
      ));
    }
  }

  if (!Array.isArray(route.events)) {
    issues.push(issue("error", "The route must contain an events array."));
    return issues;
  }

  const seenIds = new Set();

  for (const event of route.events) {
    const eventId = event.id || null;

    if (!eventId) {
      issues.push(issue("error", "Every event requires an ID."));
    } else if (seenIds.has(eventId)) {
      issues.push(issue("error", `Duplicate event ID: ${eventId}`, eventId));
    } else {
      seenIds.add(eventId);
    }

    const hasCoordinates =
      isCoordinate(event.lat, -90, 90) &&
      isCoordinate(event.lng, -180, 180);

    if (!hasCoordinates && !event.pano) {
      issues.push(issue(
        "error",
        "Provide valid lat/lng coordinates or a Pano ID.",
        eventId
      ));
    }

    if (!Number.isFinite(event.radius) || event.radius <= 0) {
      issues.push(issue("error", "Trigger radius must be greater than zero.", eventId));
    }

    if (
      event.required !== undefined &&
      typeof event.required !== "boolean"
    ) {
      issues.push(issue(
        "error",
        "Required must be true or false.",
        eventId
      ));
    }

    if (
      event.penaltyOnMiss !== undefined &&
      (
        !Number.isFinite(event.penaltyOnMiss) ||
        event.penaltyOnMiss < 0
      )
    ) {
      issues.push(issue(
        "error",
        "Missed-event penalty cannot be negative.",
        eventId
      ));
    }

    const hasOneHeading =
      Number.isFinite(event.headingMin) !==
      Number.isFinite(event.headingMax);

    if (hasOneHeading) {
      issues.push(issue(
        "error",
        "Heading minimum and maximum must be provided together.",
        eventId
      ));
    }

    if (event.type === "route-message") {
      if (!event.message?.trim()) {
        issues.push(issue("error", "Route message text is required.", eventId));
      }
      continue;
    }

    if (event.type !== "examiner-command") {
      issues.push(issue("error", `Unsupported event type: ${event.type}`, eventId));
      continue;
    }

    if (!event.command?.trim()) {
      issues.push(issue("error", "Examiner command text is required.", eventId));
    }

    if (
      !Number.isFinite(event.answerRadius) ||
      event.answerRadius < event.radius
    ) {
      issues.push(issue(
        "error",
        "Answer radius must be at least the trigger radius.",
        eventId
      ));
    }

    if (!Array.isArray(event.options) || event.options.length < 2) {
      issues.push(issue("error", "Examiner commands require at least two options.", eventId));
      continue;
    }

    const optionIds = event.options.map((option) => option.id);
    if (new Set(optionIds).size !== optionIds.length || optionIds.some((id) => !id)) {
      issues.push(issue("error", "Option IDs must be present and unique.", eventId));
    }

    if (event.options.some((option) => !option.label?.trim())) {
      issues.push(issue("error", "Every option requires a label.", eventId));
    }

    if (event.answerMode === "single") {
      const correctCount = event.options.filter((option) => option.correct).length;
      if (correctCount !== 1) {
        issues.push(issue("error", "Single-choice commands need exactly one correct option.", eventId));
      }
    } else if (event.answerMode === "multiple") {
      if (!event.options.some((option) => option.correct)) {
        issues.push(issue("error", "Multiple-choice commands need a correct option.", eventId));
      }
    } else if (event.answerMode === "sequence") {
      const sequence = event.correctSequence || [];
      const sequenceIsValid =
        sequence.length === optionIds.length &&
        new Set(sequence).size === sequence.length &&
        sequence.every((id) => optionIds.includes(id));

      if (!sequenceIsValid) {
        issues.push(issue(
          "error",
          "The correct sequence must include every option exactly once.",
          eventId
        ));
      }
    } else {
      issues.push(issue("error", "Select a supported answer mode.", eventId));
    }

    if ((Number(event.penaltyOnOutOfRange) || 0) < 0) {
      issues.push(issue("error", "Penalties cannot be negative.", eventId));
    }
  }

  return issues;
}

export function groupIssuesByEvent(issues) {
  const grouped = new Map();

  for (const item of issues) {
    if (!item.eventId) {
      continue;
    }
    const current = grouped.get(item.eventId) || [];
    current.push(item);
    grouped.set(item.eventId, current);
  }

  return grouped;
}
