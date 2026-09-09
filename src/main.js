import "./style.css";

import { EVENTS, getInitialState } from "./config.js";
import { createEventEngine } from "./event-engine.js";
import {
  createStreetView,
  restartStreetView,
} from "./streetview.js";
import {
  bindUiActions,
  hideRouteMessage,
  scheduleLocationUpdate,
  showInfoTemporarily,
  showRouteMessage,
  updatePanoramaInfo,
} from "./ui.js";

function handleRouteEvent(event) {
  if (event.type === "message") {
    showRouteMessage(event.message);
  }
}

async function initApp() {
  const initialState = getInitialState();
  const {
    panorama,
    geocoder,
    streetViewService,
  } = await createStreetView(initialState);

  const eventEngine = createEventEngine({
    events: EVENTS,
    streetViewService,
    panorama,
    onEvent: handleRouteEvent,
  });

  panorama.addListener("position_changed", () => {
    updatePanoramaInfo(panorama);
    scheduleLocationUpdate(panorama, geocoder);
    showInfoTemporarily();
    eventEngine.checkEvents();
  });

  panorama.addListener("pano_changed", () => {
    updatePanoramaInfo(panorama);
    showInfoTemporarily();
    eventEngine.checkEvents();
  });

  panorama.addListener("pov_changed", () => {
    updatePanoramaInfo(panorama);
    showInfoTemporarily();
    eventEngine.checkEvents();
  });

  bindUiActions({
    onRestart: () => {
      eventEngine.reset();
      hideRouteMessage();
      restartStreetView(panorama, initialState);
      showInfoTemporarily();
    },
    onMessageOk: hideRouteMessage,
  });

  updatePanoramaInfo(panorama);
  scheduleLocationUpdate(panorama, geocoder);
  showInfoTemporarily();
  await eventEngine.initialize();
}

initApp();
