import {
  setOptions,
  importLibrary,
} from "@googlemaps/js-api-loader";

setOptions({
  key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
});

export async function createStreetView(initialState) {
  const {
    StreetViewPanorama,
    StreetViewService,
  } = await importLibrary("streetView");

  const { Geocoder } =
    await importLibrary("geocoding");

  const panorama = new StreetViewPanorama(
    document.getElementById("street-view"),
    {
      position: initialState.position,
      pov: {
        heading: initialState.heading,
        pitch: initialState.pitch,
      },
      zoom: initialState.zoom,
    }
  );

  return {
    panorama,
    geocoder: new Geocoder(),
    streetViewService: new StreetViewService(),
  };
}

export function restartStreetView(panorama, initialState) {
  panorama.setPosition(initialState.position);
  panorama.setPov({
    heading: initialState.heading,
    pitch: initialState.pitch,
  });
  panorama.setZoom(initialState.zoom);
}
