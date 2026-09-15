export const EXAM_SCORE_RULES = Object.freeze({
  maximumScore: 100,
  passScore: 75,
});

const FAILURE_STATUSES = new Set([
  "failed",
  "missed",
  "out-of-range",
  "observation-incorrect",
  "observation-missed",
]);

function isFailure(result) {
  return result.correct === false || FAILURE_STATUSES.has(result.status);
}

function uniqueEventCount(results, predicate) {
  return new Set(
    results.filter(predicate).map((result) => result.eventId).filter(Boolean)
  ).size;
}

function createIssues(results) {
  return results.filter(isFailure).map((result) => ({
    eventId: result.eventId || null,
    eventType: result.eventType || "unknown",
    label: result.label || result.eventId || "Driving event",
    status: result.status,
    penalty: Number(result.penalty) || 0,
    grievousFault: result.grievousFault === true,
    criticalViolation: result.criticalViolation === true,
  }));
}

function getMapStatus(result) {
  if (result.criticalViolation || (result.grievousFault && result.correct === false)) {
    return "critical";
  }
  return result.correct === true ? "correct" : "incorrect";
}

function createMapEvents(results, route) {
  const routeEvents = new Map((route?.events || []).map((event) => [event.id, event]));
  const latestByEvent = new Map();

  for (const result of results) {
    if (result.eventId) latestByEvent.set(result.eventId, result);
  }

  return [...latestByEvent.values()].map((result) => {
    const routeEvent = routeEvents.get(result.eventId);
    const position = result.mapPosition || (routeEvent && {
      lat: routeEvent.lat,
      lng: routeEvent.lng,
    });
    const radius = result.mapRadius ?? routeEvent?.radius;

    if (!Number.isFinite(position?.lat) || !Number.isFinite(position?.lng)) return null;
    return {
      id: result.eventId,
      label: result.label || result.eventId,
      type: result.eventType,
      status: getMapStatus(result),
      radius: Number(radius) || 0,
      lat: position.lat,
      lng: position.lng,
      grievousFault: result.grievousFault === true,
      criticalViolation: result.criticalViolation === true,
    };
  }).filter(Boolean);
}

export function createExamResult({
  route,
  results,
  totalPenalty,
  routeProgress = [],
  startedAt,
  completedAt = Date.now(),
  scoreRules = EXAM_SCORE_RULES,
}) {
  const safeResults = Array.isArray(results) ? results : [];
  const maximumScore = Number(scoreRules.maximumScore) || 100;
  const passScore = Number(scoreRules.passScore) || 75;
  const penalty = Math.max(0, Number(totalPenalty) || 0);
  const score = Math.max(0, maximumScore - penalty);
  const failedResults = safeResults.filter(isFailure);
  const criticalFailure = failedResults.some((result) =>
    result.criticalViolation === true
  );
  const grievousFailure = failedResults.some((result) =>
    result.grievousFault === true
  );
  const passed = !criticalFailure && !grievousFailure && score >= passScore;
  const routeEvents = Array.isArray(route?.events) ? route.events : [];
  const commandResults = safeResults.filter((result) =>
    result.eventType === "examiner-command"
  );
  const observationResults = safeResults.filter((result) =>
    result.eventType === "observation-check"
  );
  const requiredRouteEvents = routeEvents.filter((event) =>
    event.required === true
  );
  const progressByEventId = new Map(routeProgress.map((item) => [
    item.eventId,
    item.checkpointStatus,
  ]));
  const hasRouteProgress = progressByEventId.size > 0;
  const missedRoutePoints = hasRouteProgress
    ? requiredRouteEvents.filter((event) =>
        progressByEventId.get(event.id) === "missed"
      ).length
    : uniqueEventCount(safeResults, (result) => result.status === "missed");
  const reachedRoutePoints = hasRouteProgress
    ? requiredRouteEvents.filter((event) =>
        progressByEventId.get(event.id) === "reached"
      ).length
    : Math.max(0, requiredRouteEvents.length - missedRoutePoints);

  return {
    status: passed ? "passed" : "failed",
    score,
    maximumScore,
    passScore,
    totalPenalty: penalty,
    routeId: route?.id || "",
    routeName: route?.name || route?.id || "Unknown route",
    startedAt: Number(startedAt) || completedAt,
    completedAt,
    durationMs: Math.max(0, completedAt - (Number(startedAt) || completedAt)),
    criticalFailure,
    grievousFailure,
    summary: {
      commands: {
        total: routeEvents.filter((event) =>
          event.type === "examiner-command"
        ).length,
        correct: uniqueEventCount(commandResults, (result) =>
          result.correct === true
        ),
        failed: uniqueEventCount(commandResults, isFailure),
      },
      observations: {
        total: uniqueEventCount(observationResults, () => true),
        correct: uniqueEventCount(observationResults, (result) =>
          result.status === "observation-acknowledged"
        ),
        failed: uniqueEventCount(observationResults, isFailure),
      },
      routePoints: {
        total: requiredRouteEvents.length,
        reached: reachedRoutePoints,
        missed: missedRoutePoints,
      },
      criticalViolations: failedResults.filter((result) =>
        result.criticalViolation === true
      ).length,
    },
    issues: createIssues(safeResults),
    mapEvents: createMapEvents(safeResults, route),
  };
}
