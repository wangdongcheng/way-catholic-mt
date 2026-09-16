import { prepareRouteForExport } from "./route-exporter.js";

const ROUTE_ID_PATTERN = /^[a-z0-9-]+$/i;
const GLOBAL_DATA_SETS = [
  {
    id: "observation-checks",
    filename: "observation-checks.json",
    fallbackName: "Observation Checks",
  },
  {
    id: "critical-violations",
    filename: "critical-violations.json",
    fallbackName: "Critical Violations",
  },
];

function compareDataSets(left, right) {
  return left.name.localeCompare(right.name, "en", {
    sensitivity: "base",
    numeric: true,
  }) || left.id.localeCompare(right.id, "en", { numeric: true });
}

function remoteErrorMessage(response, payload) {
  if (response.status === 401 || response.status === 403) {
    return "Administrator authentication is required. Reload the editor and sign in again.";
  }
  if (response.status === 412) {
    return "This data set changed after it was loaded. Reload it before saving again.";
  }
  if (response.status === 422) {
    return payload?.details?.map((item) => item.message || item).join(" ") ||
      "The server rejected the data set.";
  }
  return payload?.error || `The data request failed with status ${response.status}.`;
}

async function readResponseJson(response) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      "The administrator session is unavailable. Reload the editor and sign in again."
    );
  }

  return response.json();
}

async function fetchJson(path) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await readResponseJson(response);

  if (!response.ok) {
    throw new Error(remoteErrorMessage(response, payload));
  }

  return { payload, etag: response.headers.get("etag") };
}

function getGlobalDataSet(dataSetId) {
  return GLOBAL_DATA_SETS.find((item) => item.id === dataSetId) || null;
}

function getRemotePath(dataSetId) {
  const globalDataSet = getGlobalDataSet(dataSetId);
  if (globalDataSet) return `/data/${globalDataSet.filename}`;

  if (!ROUTE_ID_PATTERN.test(dataSetId)) {
    throw new Error("The route ID contains unsupported characters.");
  }

  return `/data/routes/${dataSetId}.json`;
}

function getAdminPath(document) {
  const globalDataSet = getGlobalDataSet(document.type);
  if (globalDataSet) return `/api/admin/data/${globalDataSet.filename}`;

  if (!ROUTE_ID_PATTERN.test(document.id || "")) {
    throw new Error("The route ID contains unsupported characters.");
  }

  return `/api/admin/data/routes/${document.id}.json`;
}

export function shouldUseRemoteDataFiles(location = window.location) {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  return location.protocol === "https:" && !localHosts.has(location.hostname);
}

export async function listRemoteDataSets() {
  const [routeIndexResult, ...globalResults] = await Promise.all([
    fetchJson("/data/route-index.json"),
    ...GLOBAL_DATA_SETS.map((dataSet) =>
      fetchJson(`/data/${dataSet.filename}`)
    ),
  ]);
  const routes = routeIndexResult.payload;

  if (
    !Array.isArray(routes) ||
    routes.some((route) =>
      !ROUTE_ID_PATTERN.test(route?.id || "") ||
      typeof route.name !== "string" ||
      !route.name.trim()
    )
  ) {
    throw new Error("The R2 route index is invalid.");
  }

  const routeDataSets = routes
    .map(({ id, name }) => ({ id, name, kind: "route", valid: true }))
    .sort(compareDataSets);
  const globalDataSets = GLOBAL_DATA_SETS.map((dataSet, index) => {
    const document = globalResults[index].payload;
    const valid = document && typeof document === "object" &&
      document.id === dataSet.id;

    return {
      id: dataSet.id,
      name: valid && document.name
        ? document.name
        : dataSet.fallbackName,
      kind: "global",
      valid,
    };
  });

  return [...routeDataSets, ...globalDataSets];
}

export async function readRemoteDataSet(dataSetId) {
  const { payload, etag } = await fetchJson(getRemotePath(dataSetId));
  return { document: payload, etag };
}

export async function writeRemoteDataSet(document, {
  etag = null,
  create = false,
} = {}) {
  const path = getAdminPath(document);
  const headers = {
    "Content-Type": "application/json",
  };

  if (etag) {
    headers["If-Match"] = etag;
  } else if (create) {
    headers["If-None-Match"] = "*";
  }

  const response = await fetch(path, {
    method: "PUT",
    credentials: "same-origin",
    headers,
    body: JSON.stringify(prepareRouteForExport(document)),
  });
  const payload = await readResponseJson(response);

  if (!response.ok) {
    throw new Error(remoteErrorMessage(response, payload));
  }

  return {
    path: path.replace("/api/admin/data/", "R2/"),
    etag: payload.etag || null,
  };
}
