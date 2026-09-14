import assert from "node:assert/strict";
import test from "node:test";

import { createExamResult } from "../src/exam-result.js";

const route = {
  id: "route-test",
  name: "Test route",
  events: [
    { id: "command-1", type: "examiner-command", required: true },
    { id: "route-finish", type: "route-finish", required: true },
  ],
};

test("passes when the score reaches the threshold without a grievous fault", () => {
  const result = createExamResult({
    route,
    results: [{
      eventId: "command-1",
      eventType: "examiner-command",
      status: "answered",
      correct: false,
      penalty: 5,
      grievousFault: false,
    }],
    totalPenalty: 5,
    startedAt: 1000,
    completedAt: 2000,
  });

  assert.equal(result.status, "passed");
  assert.equal(result.score, 95);
  assert.equal(result.grievousFailure, false);
});

test("fails a completed exam when a grievous event failed", () => {
  const result = createExamResult({
    route,
    results: [{
      eventId: "command-1",
      eventType: "examiner-command",
      status: "answered",
      correct: false,
      penalty: 1,
      grievousFault: true,
    }],
    totalPenalty: 1,
    startedAt: 1000,
    completedAt: 2000,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.score, 99);
  assert.equal(result.grievousFailure, true);
});

test("fails when ordinary penalties reduce the score below the pass score", () => {
  const result = createExamResult({
    route,
    results: [{
      eventId: "command-1",
      eventType: "examiner-command",
      status: "answered",
      correct: false,
      penalty: 30,
      grievousFault: false,
    }],
    totalPenalty: 30,
    startedAt: 1000,
    completedAt: 2000,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.score, 70);
  assert.equal(result.grievousFailure, false);
});

test("treats every critical violation as an automatic failure", () => {
  const result = createExamResult({
    route,
    results: [{
      eventId: "critical-1",
      eventType: "critical-violation",
      status: "failed",
      correct: false,
      penalty: 0,
      criticalViolation: true,
      grievousFault: true,
    }],
    totalPenalty: 0,
    routeProgress: [
      { eventId: "command-1", checkpointStatus: "pending" },
      { eventId: "route-finish", checkpointStatus: "pending" },
    ],
    startedAt: 1000,
    completedAt: 2000,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.score, 100);
  assert.equal(result.criticalFailure, true);
  assert.equal(result.summary.routePoints.reached, 0);
});
