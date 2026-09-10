const MANIFEST_URL = "/data/geocoding-cache/index.json";
const LOCAL_STORAGE_KEY = "way-location-cache-v1";
const MAX_LOCAL_ENTRIES = 5000;
const COORDINATE_PRECISION = 5;

const entryIndex = new Map();
const loadedShards = new Set();
let localEntries = [];
let localCacheLoaded = false;
let manifestPromise = null;

function coordinateKey(lat, lng) {
  return `coord:${Number(lat).toFixed(COORDINATE_PRECISION)},${Number(lng).toFixed(COORDINATE_PRECISION)}`;
}

function getLookupKeys({ panoId, lat, lng }) {
  const keys = [];
  if (panoId) keys.push(`pano:${panoId}`);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    keys.push(coordinateKey(lat, lng));
  }
  return keys;
}

function isValidEntry(entry) {
  return entry &&
    typeof entry.label === "string" &&
    entry.label.length > 0 &&
    (entry.panoId ||
      (Number.isFinite(entry.lat) && Number.isFinite(entry.lng)));
}

function registerEntry(entry) {
  if (!isValidEntry(entry)) return;
  for (const key of getLookupKeys(entry)) entryIndex.set(key, entry);
}

function loadLocalCache() {
  if (localCacheLoaded) return;
  localCacheLoaded = true;

  try {
    const stored = globalThis.localStorage?.getItem(LOCAL_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    localEntries = Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
    for (const entry of localEntries) registerEntry(entry);
  } catch (error) {
    console.warn("Failed to read the local geocoding cache:", error);
    localEntries = [];
  }
}

async function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Cache manifest returned ${response.status}`);
        }
        return response.json().then((manifest) => ({
          manifest,
          baseUrl: response.url,
        }));
      })
      .catch((error) => {
        console.warn("Failed to load the geocoding cache manifest:", error);
        return { manifest: { shards: [] }, baseUrl: MANIFEST_URL };
      });
  }
  return manifestPromise;
}

function containsPosition(bounds, lat, lng) {
  if (!bounds) return true;
  return lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east;
}

async function loadShard(shard, baseUrl) {
  if (!shard?.file || loadedShards.has(shard.file)) return;
  loadedShards.add(shard.file);

  try {
    const response = await fetch(new URL(shard.file, baseUrl));
    if (!response.ok) {
      throw new Error(`Cache shard returned ${response.status}`);
    }
    const data = await response.json();
    for (const entry of data.entries || []) registerEntry(entry);
  } catch (error) {
    loadedShards.delete(shard.file);
    console.warn(`Failed to load geocoding cache shard ${shard.file}:`, error);
  }
}

async function loadRelevantShards(lat, lng) {
  const { manifest, baseUrl } = await loadManifest();
  const shards = Array.isArray(manifest.shards) ? manifest.shards : [];
  await Promise.all(
    shards
      .filter((shard) => containsPosition(shard.bounds, lat, lng))
      .map((shard) => loadShard(shard, baseUrl))
  );
}

export async function findLocationInCache(lookup) {
  loadLocalCache();

  for (const key of getLookupKeys(lookup)) {
    const cached = entryIndex.get(key);
    if (cached) return cached;
  }

  await loadRelevantShards(lookup.lat, lookup.lng);

  for (const key of getLookupKeys(lookup)) {
    const cached = entryIndex.get(key);
    if (cached) return cached;
  }
  return null;
}

export function saveLocationToCache(entry) {
  loadLocalCache();

  const normalized = {
    panoId: entry.panoId || "",
    lat: Number(entry.lat),
    lng: Number(entry.lng),
    label: entry.label,
    cachedAt: new Date().toISOString(),
  };
  if (!isValidEntry(normalized)) return;

  const lookupKeys = new Set(getLookupKeys(normalized));
  localEntries = localEntries.filter((existing) =>
    !getLookupKeys(existing).some((key) => lookupKeys.has(key))
  );
  localEntries.push(normalized);
  if (localEntries.length > MAX_LOCAL_ENTRIES) {
    localEntries = localEntries.slice(-MAX_LOCAL_ENTRIES);
  }
  registerEntry(normalized);

  try {
    globalThis.localStorage?.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify(localEntries)
    );
  } catch (error) {
    console.warn("Failed to write the local geocoding cache:", error);
  }
}
