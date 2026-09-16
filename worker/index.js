import { createRemoteJWKSet, jwtVerify } from "jose";
import { prepareRouteForExport } from "../src/editor/route-exporter.js";
import { validateRoute } from "../src/editor/route-validator.js";

const DATA_PATH_PREFIX = "/data/";
const ADMIN_DATA_PATH_PREFIX = "/api/admin/data/";
const MAX_JSON_BYTES = 1024 * 1024;
const ROUTE_KEY_PATTERN = /^routes\/([a-z0-9-]+)\.json$/i;
const GEOCODING_KEY_PATTERN = /^geocoding-cache\/[a-z0-9-]+\.json$/i;
const PUBLIC_GLOBAL_KEYS = new Set([
  "route-index.json",
  "observation-checks.json",
  "observation-types.json",
  "critical-violations.json",
]);
const WRITABLE_GLOBAL_DOCUMENTS = new Map([
  [
    "observation-checks.json",
    { id: "observation-checks", type: "observation-checks" },
  ],
  [
    "critical-violations.json",
    { id: "critical-violations", type: "critical-violations" },
  ],
]);
const accessKeySets = new Map();

function createJsonError(message, status, details) {
  return Response.json(
    details ? { error: message, details } : { error: message },
    { status }
  );
}

function isPublicDataKey(objectKey) {
  return PUBLIC_GLOBAL_KEYS.has(objectKey) ||
    ROUTE_KEY_PATTERN.test(objectKey) ||
    GEOCODING_KEY_PATTERN.test(objectKey);
}

function getWritableDocument(objectKey) {
  const globalDocument = WRITABLE_GLOBAL_DOCUMENTS.get(objectKey);
  if (globalDocument) return globalDocument;

  const routeMatch = ROUTE_KEY_PATTERN.exec(objectKey);
  return routeMatch
    ? { id: routeMatch[1], type: "route" }
    : null;
}

function getAccessKeySet(teamDomain) {
  let keySet = accessKeySets.get(teamDomain);

  if (!keySet) {
    keySet = createRemoteJWKSet(
      new URL("/cdn-cgi/access/certs", teamDomain)
    );
    accessKeySets.set(teamDomain, keySet);
  }

  return keySet;
}

async function authenticateAdmin(request, env) {
  const teamDomainValue = env.ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.ACCESS_AUD?.trim();

  if (!teamDomainValue || !audience) {
    return {
      error: createJsonError("Admin API is not configured.", 503),
    };
  }

  let teamDomain;

  try {
    teamDomain = new URL(teamDomainValue);
  } catch {
    return {
      error: createJsonError("Admin API is not configured.", 503),
    };
  }

  if (teamDomain.protocol !== "https:") {
    return {
      error: createJsonError("Admin API is not configured.", 503),
    };
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) {
    return {
      error: createJsonError("Cloudflare Access authentication is required.", 401),
    };
  }

  try {
    const { payload } = await jwtVerify(
      token,
      getAccessKeySet(teamDomain.origin),
      {
        issuer: teamDomain.origin,
        audience,
      }
    );

    return { identity: payload.email || payload.sub || "unknown" };
  } catch {
    return {
      error: createJsonError("Cloudflare Access authentication failed.", 403),
    };
  }
}

async function readJsonRequest(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return {
      error: createJsonError("Content-Type must be application/json.", 415),
    };
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    return { error: createJsonError("JSON document is too large.", 413) };
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    return { error: createJsonError("JSON document is too large.", 413) };
  }

  try {
    const document = JSON.parse(text);
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      return { error: createJsonError("The document must be a JSON object.", 400) };
    }
    return { document };
  } catch {
    return { error: createJsonError("The request body is not valid JSON.", 400) };
  }
}

function validateWritableDocument(document, expectedDocument) {
  if (document.id !== expectedDocument.id) {
    return [`Document ID must be ${expectedDocument.id}.`];
  }

  if (
    expectedDocument.type !== "route" &&
    document.type !== expectedDocument.type
  ) {
    return [`Document type must be ${expectedDocument.type}.`];
  }

  if (
    expectedDocument.type === "route" &&
    document.type !== undefined &&
    document.type !== "route"
  ) {
    return ["Document type must be route when provided."];
  }

  return validateRoute(document)
    .filter((item) => item.level === "error")
    .map((item) => ({ message: item.message, eventId: item.eventId }));
}

async function checkWritePrecondition(request, existingObject) {
  const ifMatch = request.headers.get("if-match");
  if (ifMatch && (!existingObject || ifMatch !== existingObject.httpEtag)) {
    return createJsonError("The document has changed since it was loaded.", 412);
  }

  if (
    request.headers.get("if-none-match") === "*" &&
    existingObject
  ) {
    return createJsonError("The document already exists.", 412);
  }

  return null;
}

async function backUpObject(bucket, objectKey, object, timestamp) {
  if (!object) return;

  await bucket.put(
    `backups/${timestamp}/${objectKey}`,
    object.body,
    {
      httpMetadata: object.httpMetadata,
      customMetadata: {
        ...object.customMetadata,
        originalKey: objectKey,
        backedUpAt: timestamp,
      },
    }
  );
}

function compareRoutes(left, right) {
  return left.name.localeCompare(right.name, "en", {
    sensitivity: "base",
    numeric: true,
  }) || left.id.localeCompare(right.id, "en", { numeric: true });
}

async function prepareUpdatedRouteIndex(bucket, route) {
  const indexObject = await bucket.get("route-index.json");
  let routes = [];

  if (indexObject) {
    try {
      routes = JSON.parse(await indexObject.text());
    } catch {
      throw new Error("The stored route index is not valid JSON.");
    }

    if (!Array.isArray(routes)) {
      throw new Error("The stored route index is invalid.");
    }
  }

  const updatedRoutes = routes
    .filter((item) => item?.id !== route.id)
    .concat({ id: route.id, name: route.name })
    .sort(compareRoutes);

  return { hasExistingIndex: Boolean(indexObject), updatedRoutes };
}

async function putJsonObject(bucket, objectKey, document) {
  return bucket.put(
    objectKey,
    `${JSON.stringify(document, null, 2)}\n`,
    {
      httpMetadata: {
        contentType: "application/json; charset=utf-8",
        cacheControl: "no-store",
      },
    }
  );
}

async function handleAdminWrite(request, env, objectKey) {
  if (request.method !== "PUT") {
    return new Response(
      JSON.stringify({ error: "Method not allowed." }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Allow: "PUT",
        },
      }
    );
  }

  const expectedDocument = getWritableDocument(objectKey);
  if (!expectedDocument) {
    return createJsonError("This data path cannot be written.", 404);
  }

  const authentication = await authenticateAdmin(request, env);
  if (authentication.error) return authentication.error;

  const parsedRequest = await readJsonRequest(request);
  if (parsedRequest.error) return parsedRequest.error;

  const document = prepareRouteForExport(parsedRequest.document);
  const validationErrors = validateWritableDocument(document, expectedDocument);
  if (validationErrors.length > 0) {
    return createJsonError("Document validation failed.", 422, validationErrors);
  }

  const existingObject = await env.MDTS_DATA.get(objectKey);
  const preconditionError = await checkWritePrecondition(request, existingObject);
  if (preconditionError) return preconditionError;

  let routeIndexUpdate = null;
  if (expectedDocument.type === "route") {
    try {
      routeIndexUpdate = await prepareUpdatedRouteIndex(env.MDTS_DATA, document);
    } catch (error) {
      return createJsonError(error.message, 500);
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await backUpObject(env.MDTS_DATA, objectKey, existingObject, timestamp);
  const storedObject = await putJsonObject(env.MDTS_DATA, objectKey, document);

  if (routeIndexUpdate) {
    if (routeIndexUpdate.hasExistingIndex) {
      const indexBackupObject = await env.MDTS_DATA.get("route-index.json");
      await backUpObject(
        env.MDTS_DATA,
        "route-index.json",
        indexBackupObject,
        timestamp
      );
    }
    await putJsonObject(
      env.MDTS_DATA,
      "route-index.json",
      routeIndexUpdate.updatedRoutes
    );
  }

  return Response.json({
    ok: true,
    key: objectKey,
    etag: storedObject.httpEtag,
    updatedBy: authentication.identity,
    routeIndexUpdated: Boolean(routeIndexUpdate),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith(ADMIN_DATA_PATH_PREFIX)) {
      const objectKey = url.pathname.slice(ADMIN_DATA_PATH_PREFIX.length);
      return handleAdminWrite(request, env, objectKey);
    }

    if (url.pathname.startsWith(DATA_PATH_PREFIX)) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return createJsonError("Method not allowed.", 405);
      }

      const objectKey = url.pathname.slice(DATA_PATH_PREFIX.length);

      if (
        !objectKey ||
        objectKey.includes("..") ||
        !isPublicDataKey(objectKey)
      ) {
        return createJsonError("Invalid data path.", 400);
      }

      const object = await env.MDTS_DATA.get(objectKey);

      if (!object) {
        return createJsonError("Data file not found.", 404);
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Content-Type", "application/json; charset=utf-8");
      headers.set("ETag", object.httpEtag);
      headers.set("X-MDTS-ETag", object.httpEtag);

      // Disable edge caching during the initial migration.
      headers.set("Cache-Control", "no-store");

      return new Response(
        request.method === "HEAD" ? null : object.body,
        { headers }
      );
    }

    return env.ASSETS.fetch(request);
  },
};
