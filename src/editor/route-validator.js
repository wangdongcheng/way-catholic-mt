function issue(level, message, eventId = null) {
  return { level, message, eventId };
}

function isCoordinate(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function validateDocumentHeader(document, expectedType) {
  const issues = [];

  if (document.type !== expectedType) {
    issues.push(issue("error", `Document type must be ${expectedType}.`));
  }
  if (!document.id || typeof document.id !== "string") {
    issues.push(issue("error", "Document ID is required."));
  }
  if (!document.name || typeof document.name !== "string") {
    issues.push(issue("error", "Document name is required."));
  }
  if (!Array.isArray(document.events)) {
    issues.push(issue("error", "The document must contain an events array."));
  }

  return issues;
}

function validateUniqueIds(events, issues) {
  const seen = new Set();

  for (const event of events || []) {
    if (!event.id) {
      issues.push(issue("error", "Every event requires an ID."));
    } else if (seen.has(event.id)) {
      issues.push(issue("error", `Duplicate event ID: ${event.id}`, event.id));
    } else {
      seen.add(event.id);
    }
  }
}

function validateObservationDocument(document) {
  const issues = validateDocumentHeader(document, "observation-checks");
  const events = Array.isArray(document.events) ? document.events : [];
  validateUniqueIds(events, issues);

  for (const event of events) {
    const eventId = event.id || null;
    if (event.type !== "observation-check") {
      issues.push(issue("error", "Only observation-check events are allowed.", eventId));
    }
    if (
      !isCoordinate(event.lat, -90, 90) ||
      !isCoordinate(event.lng, -180, 180)
    ) {
      issues.push(issue("error", "Observation coordinates are invalid.", eventId));
    }
    if (!Number.isFinite(event.radius) || event.radius <= 0) {
      issues.push(issue("error", "Trigger radius must be greater than zero.", eventId));
    }
    if (!event.observationType?.trim()) {
      issues.push(issue("error", "Observation type is required.", eventId));
    }
    if (!event.practiceMessage?.message?.trim()) {
      issues.push(issue("error", "Practice message is required.", eventId));
    }
    if (event.examEnabled !== false) {
      if (!Number.isFinite(event.answerRadius) || event.answerRadius < event.radius) {
        issues.push(issue(
          "error",
          "Answer radius must be at least the trigger radius.",
          eventId
        ));
      }
      for (const field of ["penaltyOnMiss", "penaltyOnIncorrect"]) {
        if (!Number.isFinite(event[field]) || event[field] < 0) {
          issues.push(issue("error", `${field} cannot be negative.`, eventId));
        }
      }
    }
  }

  return issues;
}

function distanceBetween(left, right) {
  const earthRadius = 6371000;
  const toRadians = (value) => value * Math.PI / 180;
  const lat1 = toRadians(left.lat);
  const lat2 = toRadians(right.lat);
  const deltaLat = toRadians(right.lat - left.lat);
  const deltaLng = toRadians(right.lng - left.lng);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validateCriticalDocument(document) {
  const issues = validateDocumentHeader(document, "critical-violations");
  const events = Array.isArray(document.events) ? document.events : [];
  validateUniqueIds(events, issues);

  for (const event of events) {
    const eventId = event.id || null;
    const trigger = event.triggerCheckpoint;
    const forbidden = event.forbiddenDestination;
    const triggerLocation = trigger?.location;
    const forbiddenLocation = forbidden?.location;

    if (event.type !== "critical-violation") {
      issues.push(issue("error", "Only critical-violation events are allowed.", eventId));
    }
    if (!event.rule?.trim()) {
      issues.push(issue("error", "Violation rule is required.", eventId));
    }
    if (
      !isCoordinate(triggerLocation?.lat, -90, 90) ||
      !isCoordinate(triggerLocation?.lng, -180, 180)
    ) {
      issues.push(issue("error", "Trigger checkpoint coordinates are invalid.", eventId));
    }
    if (
      !isCoordinate(forbiddenLocation?.lat, -90, 90) ||
      !isCoordinate(forbiddenLocation?.lng, -180, 180)
    ) {
      issues.push(issue("error", "Forbidden destination coordinates are invalid.", eventId));
    }
    if (!Number.isFinite(trigger?.radius) || trigger.radius <= 0) {
      issues.push(issue("error", "Trigger checkpoint radius must be positive.", eventId));
    }
    if (!Number.isFinite(forbidden?.radius) || forbidden.radius <= 0) {
      issues.push(issue("error", "Forbidden destination radius must be positive.", eventId));
    }
    if (!Number.isFinite(event.windowMs) || event.windowMs <= 0) {
      issues.push(issue("error", "Detection window must be positive.", eventId));
    }
    if (!event.practiceWarning?.message?.trim()) {
      issues.push(issue("error", "Practice warning message is required.", eventId));
    }
    if (!event.examFailure?.message?.trim()) {
      issues.push(issue("error", "Exam failure message is required.", eventId));
    }
    if (!event.examFailure?.reasonCode?.trim()) {
      issues.push(issue("error", "Exam failure reason code is required.", eventId));
    }
    if (
      triggerLocation &&
      forbiddenLocation &&
      Number.isFinite(trigger?.radius) &&
      Number.isFinite(forbidden?.radius) &&
      distanceBetween(triggerLocation, forbiddenLocation) <=
        trigger.radius + forbidden.radius
    ) {
      issues.push(issue(
        "error",
        "Trigger and forbidden ranges must not overlap.",
        eventId
      ));
    }
  }

  return issues;
}

export function validateRoute(route) {
  const issues = [];

  if (!route || typeof route !== "object") {
    return [issue("error", "The route must be a JSON object.")];
  }

  if (route.type === "observation-checks") {
    return validateObservationDocument(route);
  }

  if (route.type === "critical-violations") {
    return validateCriticalDocument(route);
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
      issues.push(issue(
        "error",
        "Standalone route messages are no longer supported.",
        eventId
      ));
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
