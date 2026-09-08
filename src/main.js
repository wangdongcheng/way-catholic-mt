import "./style.css";

import {
  setOptions,
  importLibrary,
} from "@googlemaps/js-api-loader";

setOptions({
  key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
});


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


async function initStreetView() {
  const { StreetViewPanorama } =
    await importLibrary("streetView");

  const position = {
    lat: 35.8880832,
    lng: 14.5029997,
  };

  const panorama = new StreetViewPanorama(
    document.getElementById("street-view"),
    {
      position: position,

      pov: {
        heading: 90,
        pitch: 0,
      },

      zoom: 1,
    }
  );

  panorama.addListener("position_changed", () => {
    updatePanoramaInfo(panorama);
  });

  panorama.addListener("pano_changed", () => {
    updatePanoramaInfo(panorama);
  });

  panorama.addListener("pov_changed", () => {
    updatePanoramaInfo(panorama);
  });

  updatePanoramaInfo(panorama);
}


initStreetView();