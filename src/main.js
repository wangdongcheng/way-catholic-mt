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

let infoHideTimer = null;

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

function restartRoute(panorama) {
  panorama.setPosition(START_STATE.position);
  panorama.setPov({
    heading: START_STATE.heading,
    pitch: START_STATE.pitch,
  });
  panorama.setZoom(START_STATE.zoom);
}

async function initStreetView() {
  const { StreetViewPanorama } =
    await importLibrary("streetView");

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

  panorama.addListener("position_changed", () => {
    updatePanoramaInfo(panorama);
    showInfoTemporarily();
  });

  panorama.addListener("pano_changed", () => {
    updatePanoramaInfo(panorama);
    showInfoTemporarily();
  });

  panorama.addListener("pov_changed", () => {
    updatePanoramaInfo(panorama);
    showInfoTemporarily();
  });

  const restartButton =
    document.getElementById("restart-button");

  restartButton?.addEventListener("click", () => {
    restartRoute(panorama);
    showInfoTemporarily();
  });

  updatePanoramaInfo(panorama);
  showInfoTemporarily();
}

initStreetView();
