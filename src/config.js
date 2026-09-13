import { normalizeRouteConfig } from "./route-normalizer.js";

export const APP_CONFIG = {
  defaultRoute: "route-001",
  routeBasePath: "/data/routes",
  routeIndexPath: "/data/route-index.json",
  observationChecksPath: "/data/observation-checks.json",
  observationTypesPath: "/data/observation-types.json",
  criticalViolationsPath: "/data/critical-violations.json",
};

export const EXAM_START_NOTICE = Object.freeze({
  title: "Before the test",
  items: [
    "Follow the examiner's instructions carefully.",
    "Observe all road signs and speed limits.",
    "Confirm relevant road observations using the on-screen buttons.",
    "Answer examiner commands before leaving the valid area.",
    "Leaving the valid area without answering will result in a penalty.",
  ],
  buttonLabel: "Start Exam",
});

function getUrlCoordinates() {
  const searchParams = new URLSearchParams(window.location.search);
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");

  if (latParam === null || lngParam === null) {
    return null;
  }

  const lat = Number(latParam);
  const lng = Number(lngParam);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return { lat, lng };
}

export function getRequestedRouteId() {
  const routeId = new URLSearchParams(window.location.search)
    .get("route");

  return /^[a-z0-9-]+$/i.test(routeId || "")
    ? routeId
    : APP_CONFIG.defaultRoute;
}

export function getRequestedMode() {
  const mode = new URLSearchParams(window.location.search).get("mode");
  return mode === "practice" || mode === "exam" ? mode : null;
}

export async function loadRouteConfig(routeId = getRequestedRouteId()) {
  const response = await fetch(
    `${APP_CONFIG.routeBasePath}/${routeId}.json`
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load route ${routeId}: ${response.status}`
    );
  }

  return normalizeRouteConfig(await response.json());
}

async function loadJson(path, label) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load ${label}: ${response.status}`);
  }

  return response.json();
}

export function loadObservationChecks() {
  return loadJson(APP_CONFIG.observationChecksPath, "observation checks");
}

export function loadObservationTypes() {
  return loadJson(APP_CONFIG.observationTypesPath, "observation types");
}

export function loadCriticalViolations() {
  return loadJson(APP_CONFIG.criticalViolationsPath, "critical violations");
}

export async function loadAvailableRoutes() {
  const routes = await loadJson(APP_CONFIG.routeIndexPath, "route index");

  if (
    !Array.isArray(routes) ||
    routes.length === 0 ||
    routes.some((route) =>
      typeof route?.id !== "string" ||
      !route.id ||
      typeof route.name !== "string" ||
      !route.name.trim()
    )
  ) {
    throw new Error("The route index is invalid.");
  }

  return [...routes].sort((left, right) =>
    left.name.localeCompare(right.name, "en", {
      sensitivity: "base",
      numeric: true,
    }) || left.id.localeCompare(right.id, "en", { numeric: true })
  );
}

export function getInitialState(route) {
  const start = route.startState;
  const urlPosition = getUrlCoordinates();

  return {
    position: urlPosition || {
      lat: start.lat,
      lng: start.lng,
    },
    heading: start.heading ?? 0,
    pitch: start.pitch ?? 0,
    zoom: start.zoom ?? 1,
  };
}
