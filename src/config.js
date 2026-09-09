export const START_STATE = {
  position: {
    lat: 35.8880832,
    lng: 14.5029997,
  },
  heading: 24,
  pitch: 0,
  zoom: 1,
};

export const EVENTS = [
  {
    id: "mspca-ahead",
    pano: "D0PUR3k2NOAC-WeWHmp43w",
    radius: 50,
    headingMin: 340,
    headingMax: 40,
    type: "message",
    message: "MSPCA is ahead",
  },
];

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

export function getInitialState() {
  const urlPosition = getUrlCoordinates();

  return {
    ...START_STATE,
    position: urlPosition || START_STATE.position,
  };
}
