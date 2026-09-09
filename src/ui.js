let infoHideTimer = null;
let locationLookupTimer = null;

export function showInfoTemporarily() {
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

export function updatePanoramaInfo(panorama) {
  const position = panorama.getPosition();
  const pano = panorama.getPano();
  const pov = panorama.getPov();

  const posElement = document.getElementById("current-pos");
  const panoElement = document.getElementById("current-pano");
  const headingElement = document.getElementById("camera-heading");

  if (position && posElement) {
    posElement.textContent =
      `${position.lat().toFixed(6)}, ${position.lng().toFixed(6)}`;
  }

  if (panoElement) {
    panoElement.textContent = pano || "-";
  }

  if (headingElement) {
    headingElement.textContent = pov.heading.toFixed(0);
  }
}

function getAddressComponent(result, type) {
  return result.address_components?.find((component) =>
    component.types.includes(type)
  )?.long_name;
}

async function updateLocationInfo(panorama, geocoder) {
  const position = panorama.getPosition();
  const locationElement = document.getElementById("current-location");

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

    const road = getAddressComponent(result, "route");
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

export function scheduleLocationUpdate(panorama, geocoder) {
  clearTimeout(locationLookupTimer);

  locationLookupTimer = setTimeout(() => {
    updateLocationInfo(panorama, geocoder);
  }, 300);
}

export function showRouteMessage(message) {
  const messageElement = document.getElementById("route-message");
  const textElement = document.getElementById("route-message-text");

  if (!messageElement || !textElement) {
    return;
  }

  textElement.textContent = message;
  messageElement.classList.remove("hidden");
}

export function hideRouteMessage() {
  document.getElementById("route-message")
    ?.classList.add("hidden");
}

export function bindUiActions({ onRestart, onMessageOk }) {
  document.getElementById("restart-button")
    ?.addEventListener("click", onRestart);

  document.getElementById("route-message-ok")
    ?.addEventListener("click", onMessageOk);
}
