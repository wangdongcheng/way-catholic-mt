import assert from "node:assert/strict";
import test from "node:test";

import { createEventEngine } from "../src/event-engine.js";
import { createObservationEngine } from "../src/observation-engine.js";

function createPanorama({ lat = 35.89, lng = 14.5, heading = 180 } = {}) {
  return {
    getPano: () => "test-pano",
    getPosition: () => ({
      lat: () => lat,
      lng: () => lng,
    }),
    getPov: () => ({ heading }),
  };
}

test("route-finish triggers at its location regardless of heading", async () => {
  const triggered = [];
  const panorama = createPanorama({ heading: 180 });
  const engine = createEventEngine({
    events: [{
      id: "finish",
      type: "route-finish",
      lat: 35.89,
      lng: 14.5,
      radius: 20,
      headingMin: 0,
      headingMax: 10,
    }],
    streetViewService: {},
    panorama,
    onEvent: (event) => triggered.push(event.id),
  });

  await engine.initialize();

  assert.deepEqual(triggered, ["finish"]);
  assert.equal(engine.getProgress()[0].checkpointStatus, "reached");
});

test("finalizing an exam records an active observation as missed", async () => {
  const missed = [];
  const panorama = createPanorama();
  const engine = createObservationEngine({
    document: {
      defaults: {},
      events: [{
        id: "observation-1",
        type: "observation-check",
        enabled: true,
        examEnabled: true,
        observationType: "road-awareness",
        lat: 35.89,
        lng: 14.5,
        radius: 20,
        answerRadius: 40,
        penaltyOnMiss: 3,
      }],
    },
    mode: "exam",
    streetViewService: {},
    panorama,
    onMissed: (event, details) => missed.push({ event, details }),
  });

  await engine.initialize();
  engine.finalize();

  assert.equal(missed.length, 1);
  assert.equal(missed[0].event.id, "observation-1");
  assert.equal(missed[0].details.penalty, 3);
});
