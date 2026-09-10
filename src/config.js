export const APP_CONFIG = {
  defaultRoute: "route-001",
  routeBasePath: "/data/routes",
};

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

export async function loadRouteConfig() {
  const routeId = getRequestedRouteId();
  const response = await fetch(
    `${APP_CONFIG.routeBasePath}/${routeId}.json`
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load route ${routeId}: ${response.status}`
    );
  }

  return response.json();
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
