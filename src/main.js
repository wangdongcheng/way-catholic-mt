import "./style.css";

import {
  setOptions,
  importLibrary,
} from "@googlemaps/js-api-loader";

setOptions({
  key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
});

const START_STATE = {
  position: {
    lat: 35.8880832,
    lng: 14.5029997,
  },
  heading: 24,
  pitch: 0,
  zoom: 1,
};

const MSPCA_EVENT = {
  pano: "D0PUR3k2NOAC-WeWHmp43w",
  radius: 30,
  headingMin: 340,
  headingMax: 40,
  message: "MSPCA is ahead",
};

let infoHideTimer = null;
let locationLookupTimer = null;
let mspcaEventTriggered = false;
let mspcaTargetPosition = null;

function showInfoTemporarily() {
  const info = document.getElementById("current-info");

  if (!info) {
    return;
  }

  info.classList.remove("hidden");
  clearTimeout(infoHideTimer);

  infoHideTimer = setTimeout(() => {
    info.classList.add("hidden");
  }, 10000);
}

function updatePanoramaInfo(panorama) {
  const position = panorama.getPosition();
  const pano = panorama.getPano();
  const pov = panorama.getPov();

  const posElement =
    document.getElementById("current-pos");

  const panoElement =
    document.getElementById("current-pano");

  const headingElement =
    document.getElementById("camera-heading");

  if (position && posElement) {
    posElement.textContent =
      `${position.lat().toFixed(6)}, ${position.lng().toFixed(6)}`;
  }

  if (panoElement) {
    panoElement.textContent = pano || "-";
  }

  if (headingElement) {
    headingElement.textContent =
      pov.heading.toFixed(0);
  }
}

function getAddressComponent(result, type) {
  return result.address_components?.find((component) =>
    component.types.includes(type)
  )?.long_name;
}

async function updateLocationInfo(panorama, geocoder) {
  const position = panorama.getPosition();
  const locationElement =
    document.getElementById("current-location");

  if (!position || !locationElement) {
    return;
  }

  try {
    const response = await geocoder.geocode({
      location: {
        lat: position.lat(),
        lng: position.lng(),
      },
    });

    const result = response.results?.[0];

    if (!result) {
      locationElement.textContent = "-";
      return;
    }

    const road =
      getAddressComponent(result, "route");

    const city =
      getAddressComponent(result, "locality") ||
      getAddressComponent(result, "postal_town") ||
      getAddressComponent(result, "administrative_area_level_2") ||
      getAddressComponent(result, "administrative_area_level_1");

    locationElement.textContent =
      [road, city].filter(Boolean).join(", ") ||
      result.formatted_address ||
      "-";
  } catch (error) {
    console.error("Failed to reverse geocode Street View position:", error);
    locationElement.textContent = "-";
  }
}

function scheduleLocationUpdate(panorama, geocoder) {
  clearTimeout(locationLookupTimer);

  locationLookupTimer = setTimeout(() => {
    updateLocationInfo(panorama, geocoder);
  }, 300);
}

function normalizeHeading(heading) {
  return ((heading % 360) + 360) % 360;
}

function isHeadingInRange(heading, min, max) {
  const normalizedHeading = normalizeHeading(heading);
  const normalizedMin = normalizeHeading(min);
  const normalizedMax = normalizeHeading(max);

  if (normalizedMin <= normalizedMax) {
    return normalizedHeading >= normalizedMin &&
      normalizedHeading <= normalizedMax;
  }

  return normalizedHeading >= normalizedMin ||
    normalizedHeading <= normalizedMax;
}

function calculateDistanceMeters(from, to) {
  const earthRadius = 6371000;
  const toRadians = (degrees) => degrees * Math.PI / 180;

  const lat1 = toRadians(from.lat());
  const lat2 = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat());
  const deltaLng = toRadians(to.lng - from.lng());

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLng / 2) ** 2;

  return earthRadius * 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );
}

function showRouteMessage(message) {
  const messageElement =
    document.getElementById("route-message");
  const textElement =
    document.getElementById("route-message-text");

  if (!messageElement || !textElement) {
    return;
  }

  textElement.textContent = message;
  messageElement.classList.remove("hidden");
}

function hideRouteMessage() {
  document.getElementById("route-message")
    ?.classList.add("hidden");
}

function checkMspcaEvent(panorama) {
  if (mspcaEventTriggered || !mspcaTargetPosition) {
    return;
  }

  const position = panorama.getPosition();
  const heading = panorama.getPov()?.heading;

  if (!position || heading === undefined) {
    return;
  }

  const distance = calculateDistanceMeters(
    position,
    mspcaTargetPosition
  );

  if (
    distance <= MSPCA_EVENT.radius &&
    isHeadingInRange(
      heading,
      MSPCA_EVENT.headingMin,
      MSPCA_EVENT.headingMax
    )
  ) {
    mspcaEventTriggered = true;
    showRouteMessage(MSPCA_EVENT.message);
  }
}

async function loadMspcaTargetPosition(
  streetViewService,
  panorama
) {
  try {
    const response = await streetViewService.getPanorama({
      pano: MSPCA_EVENT.pano,
    });

    const latLng = response.data?.location?.latLng;

    if (!latLng) {
      return;
    }

    mspcaTargetPosition = {
      lat: latLng.lat(),
      lng: latLng.lng(),
    };

    checkMspcaEvent(panorama);
  } catch (error) {
    console.error("Failed to load MSPCA target panorama:", error);
  }
}

function restartRoute(panorama) {
  mspcaEventTriggered = false;
  hideRouteMessage();

  panorama.setPosition(START_STATE.position);
  panorama.setPov({
    heading: START_STATE.heading,
    pitch: START_STATE.pitch,
  });
  panorama.setZoom(START_STATE.zoom);
}

async function initStreetView() {
  const {
    StreetViewPanorama,
    StreetViewService,
  } = await importLibrary("streetView");

  const { Geocoder } =
    await importLibrary("geocoding");

  const geocoder = new Geocoder();
  const streetViewService = new StreetViewService();

  const panorama = new StreetViewPanorama(
    document.getElementById("street-view"),
    {
      position: START_STATE.position,
      pov: {
        heading: START_STATE.heading,
        pitch: START_STATE.pitch,
      },
      zoom: START_STATE.zoom,
    }
  );

  loadMspcaTargetPosition(
    streetViewService,
    panorama
  );

  panorama.addListener("position_changed", () => {
    updatePanoramaInfo(panorama);
    scheduleLocationUpdate(panorama, geocoder);
    showInfoTemporarily();
    checkMspcaEvent(panorama);
  });

  panorama.addListener("pano_changed", () => {
    updatePanoramaInfo(panorama);
    showInfoTemporarily();
    checkMspcaEvent(panorama);
  });

  panorama.addListener("pov_changed", () => {
    updatePanoramaInfo(panorama);
    showInfoTemporarily();
    checkMspcaEvent(panorama);
  });

  const restartButton =
    document.getElementById("restart-button");

  restartButton?.addEventListener("click", () => {
    restartRoute(panorama);
    showInfoTemporarily();
  });

  const messageOkButton =
    document.getElementById("route-message-ok");

  messageOkButton?.addEventListener("click", () => {
    hideRouteMessage();
  });

  updatePanoramaInfo(panorama);
  scheduleLocationUpdate(panorama, geocoder);
  showInfoTemporarily();
}

initStreetView();
