import "./style.css";

import {
  setOptions,
  importLibrary,
} from "@googlemaps/js-api-loader";

setOptions({
  key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
});

async function initStreetView() {
  // Load only the Street View library
  const { StreetViewPanorama } = await importLibrary("streetView");

  const position = {
    lat: 35.8790,
    lng: 14.4953,
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
    },
  );
}

initStreetView();