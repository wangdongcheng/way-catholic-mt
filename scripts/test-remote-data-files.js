import assert from "node:assert/strict";

import {
  listRemoteDataSets,
  readRemoteDataSet,
  shouldUseRemoteDataFiles,
  writeRemoteDataSet,
} from "../src/editor/remote-data-files.js";

const documents = new Map([
  [
    "/data/route-index.json",
    [{ id: "route-001", name: "Route 1" }],
  ],
  [
    "/data/observation-checks.json",
    { id: "observation-checks", name: "Observations" },
  ],
  [
    "/data/critical-violations.json",
    { id: "critical-violations", name: "Critical Violations" },
  ],
  [
    "/data/routes/route-001.json",
    { id: "route-001", name: "Route 1", events: [] },
  ],
]);

let writeRequest = null;

globalThis.fetch = async (path, options = {}) => {
  if (options.method === "PUT") {
    writeRequest = { path, options };
    return Response.json({ etag: "new-etag" });
  }

  return new Response(JSON.stringify(documents.get(path)), {
    headers: {
      "Content-Type": "application/json",
      ETag: "loaded-etag",
    },
  });
};

assert.equal(
  shouldUseRemoteDataFiles(new URL("http://localhost:5173")),
  false
);
assert.equal(
  shouldUseRemoteDataFiles(new URL("https://preview.example.com")),
  true
);

const dataSets = await listRemoteDataSets();
assert.deepEqual(
  dataSets.map(({ id, kind, valid }) => ({ id, kind, valid })),
  [
    { id: "route-001", kind: "route", valid: true },
    { id: "observation-checks", kind: "global", valid: true },
    { id: "critical-violations", kind: "global", valid: true },
  ]
);

const loaded = await readRemoteDataSet("route-001");
assert.equal(loaded.etag, "loaded-etag");

const saved = await writeRemoteDataSet(
  { id: "route-001", name: "Route 1", events: [] },
  { etag: loaded.etag }
);
assert.equal(saved.etag, "new-etag");
assert.equal(writeRequest.path, "/api/admin/data/routes/route-001.json");
assert.equal(writeRequest.options.headers["If-Match"], "loaded-etag");

await writeRemoteDataSet(
  { id: "route-002", name: "Route 2", events: [] },
  { create: true }
);
assert.equal(writeRequest.options.headers["If-None-Match"], "*");

globalThis.fetch = async () => Response.json(
  { error: "The document has changed since it was loaded." },
  { status: 412 }
);
await assert.rejects(
  writeRemoteDataSet(
    { id: "route-001", name: "Route 1", events: [] },
    { etag: "stale-etag" }
  ),
  /changed after it was loaded/
);

console.log("Remote editor data checks passed");
