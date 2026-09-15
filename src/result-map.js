import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { findLocationInCache, saveLocationToCache } from "./location-cache.js";

setOptions({ key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY });

let map = null;
let MapClass = null;
let Circle = null;
let Geocoder = null;
let AdvancedMarkerElement = null;
let overlays = [];
let infoWindow = null;

function getLocationLabel(result) {
  const component = (type) => result.address_components?.find((item) =>
    item.types.includes(type)
  )?.long_name;
  const road = component("route");
  const area = component("locality") || component("postal_town") ||
    component("administrative_area_level_2") ||
    component("administrative_area_level_1");
  return [road, area].filter(Boolean).join(", ") || result.formatted_address;
}

function clear() {
  for (const overlay of overlays) {
    overlay.map = null;
    overlay.setMap?.(null);
  }
  overlays = [];
}

function markerContent(status, label = null) {
  const element = document.createElement("div");
  element.className = `result-map-marker ${status}${label ? " route-point" : ""}`;
  element.textContent = label || (status === "correct" ? "✓" : status === "critical" ? "!" : "×");
  return element;
}

async function showDetails(event, marker) {
  let cached = await findLocationInCache({ panoId: "", lat: event.lat, lng: event.lng });
  if (!cached && Geocoder) {
    try {
      const response = await new Geocoder().geocode({
        location: { lat: event.lat, lng: event.lng },
      });
      const label = response.results?.[0] && getLocationLabel(response.results[0]);
      if (label) {
        cached = { label };
        saveLocationToCache({ panoId: "", lat: event.lat, lng: event.lng, label });
      }
    } catch (error) {
      console.warn("Failed to reverse geocode result map event:", error);
    }
  }
  const status = event.status === "correct" ? "Correct" : "Incorrect";
  const severity = event.criticalViolation
    ? "Critical violation"
    : event.grievousFault ? "Grievous fault" : "";
  const content = document.createElement("div");
  content.className = "result-map-info";
  const title = document.createElement("strong");
  title.textContent = event.label;
  content.append(title, document.createElement("br"));
  content.append(`${status}${severity ? ` · ${severity}` : ""}`);
  if (cached?.label) {
    content.append(document.createElement("br"), cached.label);
  }
  infoWindow.setContent(content);
  infoWindow.open({ map, anchor: marker });
}

export async function renderResultMap(events, { start = null, finish = null } = {}) {
  const container = document.getElementById("exam-result-map");
  const section = document.getElementById("exam-result-map-section");
  if (!container || !section) return;
  const points = [start, finish, ...events].filter(Boolean);
  section.hidden = points.length === 0;
  if (points.length === 0) return;

  if (!map) {
    ({ Map: MapClass, Circle } = await importLibrary("maps"));
    ({ Geocoder } = await importLibrary("geocoding"));
    ({ AdvancedMarkerElement } = await importLibrary("marker"));
    map = new MapClass(container, {
      center: { lat: points[0].lat, lng: points[0].lng },
      zoom: 16,
      mapId: "DEMO_MAP_ID",
      streetViewControl: true,
      mapTypeControl: true,
      fullscreenControl: false,
      clickableIcons: false,
    });
    infoWindow = new google.maps.InfoWindow({ headerDisabled: true });
  }

  clear();
  const bounds = new google.maps.LatLngBounds();
  for (const [label, position, status] of [
    ["S", start, "start"],
    ["E", finish, "finish"],
  ]) {
    if (!position) continue;
    const marker = new AdvancedMarkerElement({
      map,
      position,
      title: label === "S" ? "Route start" : "Route finish",
      content: markerContent(status, label),
      zIndex: 5,
    });
    overlays.push(marker);
    bounds.extend(position);
  }
  for (const event of events) {
    const position = { lat: event.lat, lng: event.lng };
    const marker = new AdvancedMarkerElement({
      map,
      position,
      title: event.label,
      content: markerContent(event.status),
      zIndex: event.status === "critical" ? 20 : 10,
    });
    marker.addListener("click", () => { void showDetails(event, marker); });
    marker.content.addEventListener("mouseenter", () => { void showDetails(event, marker); });
    overlays.push(marker);
    overlays.push(new Circle({
      map,
      center: position,
      radius: event.radius,
      clickable: true,
      strokeColor: event.status === "correct" ? "#16a34a" : "#dc2626",
      strokeOpacity: 0.85,
      strokeWeight: 2,
      fillColor: event.status === "correct" ? "#16a34a" : "#dc2626",
      fillOpacity: 0.12,
    }));
    bounds.extend(position);
  }
  if (points.length === 1) {
    map.setCenter(bounds.getCenter());
    map.setZoom(16);
  } else {
    map.fitBounds(bounds, 48);
  }
}
