import "./cached-map.css";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

setOptions({ key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY });

const MANIFEST_URL = "/data/geocoding-cache/index.json";

function validEntry(entry) {
  return Number.isFinite(entry?.lat) && Number.isFinite(entry?.lng);
}

function markerContent() {
  const element = document.createElement("div");
  element.className = "cached-location-marker";
  return element;
}

function infoContent(entry) {
  const content = document.createElement("div");
  content.className = "cached-map-info";
  const title = document.createElement("strong");
  title.textContent = entry.label || "Cached location";
  const coordinates = document.createElement("span");
  coordinates.textContent = `${entry.lat.toFixed(6)}, ${entry.lng.toFixed(6)}`;
  content.append(title, coordinates);
  return content;
}

async function loadEntries() {
  const response = await fetch(MANIFEST_URL);
  if (!response.ok) throw new Error(`Cache manifest returned ${response.status}`);
  const manifest = await response.json();
  const shards = Array.isArray(manifest.shards) ? manifest.shards : [];
  const data = await Promise.all(shards.map(async (shard) => {
    const shardResponse = await fetch(new URL(shard.file, response.url));
    if (!shardResponse.ok) throw new Error(`Cache shard returned ${shardResponse.status}`);
    return shardResponse.json();
  }));
  return data.flatMap((shard) => shard.entries || []).filter(validEntry);
}

async function initialize() {
  const container = document.getElementById("cached-map");
  const summary = document.getElementById("cached-map-summary");
  const entries = await loadEntries();
  const { Map, InfoWindow } = await importLibrary("maps");
  const { AdvancedMarkerElement } = await importLibrary("marker");
  const map = new Map(container, {
    center: { lat: 35.9, lng: 14.5 },
    zoom: 11,
    mapId: "DEMO_MAP_ID",
    streetViewControl: true,
    mapTypeControl: true,
    fullscreenControl: true,
    clickableIcons: false,
  });
  const infoWindow = new InfoWindow({ headerDisabled: true });
  const bounds = new google.maps.LatLngBounds();

  for (const entry of entries) {
    const position = { lat: entry.lat, lng: entry.lng };
    const marker = new AdvancedMarkerElement({
      map,
      position,
      title: entry.label || "Cached location",
      content: markerContent(),
    });
    marker.addListener("click", () => {
      infoWindow.setContent(infoContent(entry));
      infoWindow.open({ map, anchor: marker });
    });
    bounds.extend(position);
  }

  if (entries.length === 1) {
    map.setCenter(bounds.getCenter());
    map.setZoom(16);
  } else if (entries.length > 1) {
    map.fitBounds(bounds, 48);
  }
  summary.textContent = `${entries.length} cached location${entries.length === 1 ? "" : "s"}`;
}

initialize().catch((error) => {
  console.error("Failed to load cached locations:", error);
  document.getElementById("cached-map-summary").textContent = "Failed to load cached locations.";
});
