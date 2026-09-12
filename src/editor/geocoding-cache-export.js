const MANIFEST_URL = "/data/geocoding-cache/index.json";
const LOCAL_STORAGE_KEY = "way-location-cache-v1";
const COORDINATE_PRECISION = 5;

function getEntryKeys(entry) {
  const keys = [];

  if (entry?.panoId) {
    keys.push(`pano:${entry.panoId}`);
  }

  if (Number.isFinite(entry?.lat) && Number.isFinite(entry?.lng)) {
    keys.push(
      `coord:${entry.lat.toFixed(COORDINATE_PRECISION)},${entry.lng.toFixed(COORDINATE_PRECISION)}`
    );
  }

  return keys;
}

function isValidEntry(entry) {
  return entry &&
    typeof entry.label === "string" &&
    entry.label.length > 0 &&
    getEntryKeys(entry).length > 0;
}

function containsPosition(bounds, entry) {
  if (!bounds) {
    return true;
  }

  return Number.isFinite(entry.lat) &&
    Number.isFinite(entry.lng) &&
    entry.lat >= bounds.south &&
    entry.lat <= bounds.north &&
    entry.lng >= bounds.west &&
    entry.lng <= bounds.east;
}

function readLocalEntries() {
  try {
    const stored = globalThis.localStorage?.getItem(LOCAL_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];

    return Array.isArray(parsed)
      ? parsed.filter(isValidEntry)
      : [];
  } catch (error) {
    console.warn("Failed to read the local geocoding cache:", error);
    return [];
  }
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return {
    data: await response.json(),
    responseUrl: response.url,
  };
}

function mergeEntries(existingEntries, incomingEntries) {
  const merged = [...existingEntries];
  const knownKeys = new Set(existingEntries.flatMap(getEntryKeys));
  let duplicateCount = 0;

  for (const entry of incomingEntries) {
    const keys = getEntryKeys(entry);

    if (keys.some((key) => knownKeys.has(key))) {
      duplicateCount += 1;
      continue;
    }

    merged.push(entry);
    keys.forEach((key) => knownKeys.add(key));
  }

  return {
    entries: merged,
    addedCount: merged.length - existingEntries.length,
    duplicateCount,
  };
}

function downloadJson(filename, data) {
  const blob = new Blob(
    [`${JSON.stringify(data, null, 2)}\n`],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function createDialog() {
  const dialog = document.createElement("dialog");

  dialog.id = "geocoding-cache-export-dialog";
  dialog.innerHTML = `
    <div class="cache-export-header">
      <div>
        <span class="eyebrow">Geocoding cache</span>
        <h2>Export local cache</h2>
      </div>
      <button type="button" class="cache-export-close" aria-label="Close">×</button>
    </div>
    <div class="cache-export-content">
      <p class="cache-export-intro">
        Existing JSON entries are preserved. New local entries are appended,
        and duplicate panorama IDs or coordinates are skipped.
      </p>
      <div class="cache-export-summary" aria-live="polite"></div>
      <div class="cache-export-downloads"></div>
      <p class="cache-export-warning">
        Replace the matching repository files with the downloads before
        clearing this browser cache.
      </p>
    </div>
    <div class="cache-export-actions">
      <button type="button" class="button cache-export-clear" disabled>
        Clear exported local entries
      </button>
      <button type="button" class="button primary cache-export-done">
        Done
      </button>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.querySelector(".cache-export-close")
    .addEventListener("click", () => dialog.close());
  dialog.querySelector(".cache-export-done")
    .addEventListener("click", () => dialog.close());

  return dialog;
}

function renderError(dialog, error) {
  dialog.querySelector(".cache-export-summary").textContent =
    "The cache files could not be prepared.";
  dialog.querySelector(".cache-export-downloads").textContent =
    error.message;
}

async function prepareExport(dialog) {
  const localEntries = readLocalEntries();
  const { data: manifest, responseUrl } = await fetchJson(MANIFEST_URL);
  const shards = Array.isArray(manifest.shards) ? manifest.shards : [];
  const assignments = new Map(shards.map((shard) => [shard.file, []]));
  const unmatchedEntries = [];

  for (const entry of localEntries) {
    const shard = shards.find((candidate) =>
      containsPosition(candidate.bounds, entry)
    );

    if (shard) {
      assignments.get(shard.file).push(entry);
    } else {
      unmatchedEntries.push(entry);
    }
  }

  const prepared = await Promise.all(
    shards.map(async (shard) => {
      const shardUrl = new URL(shard.file, responseUrl);
      const { data } = await fetchJson(shardUrl);
      const existingEntries = Array.isArray(data.entries)
        ? data.entries.filter(isValidEntry)
        : [];
      const assignedEntries = assignments.get(shard.file);
      const merged = mergeEntries(existingEntries, assignedEntries);

      return {
        file: shard.file,
        assignedEntries,
        output: {
          ...data,
          entries: merged.entries,
        },
        ...merged,
      };
    })
  );

  const assignedEntries = prepared.flatMap((item) => item.assignedEntries);
  const pendingFiles = prepared.filter((item) => item.assignedEntries.length > 0);
  const downloadedFiles = new Set();
  const downloads = dialog.querySelector(".cache-export-downloads");
  const clearButton = dialog.querySelector(".cache-export-clear");
  const summary = dialog.querySelector(".cache-export-summary");
  const addedCount = prepared.reduce((sum, item) => sum + item.addedCount, 0);
  const duplicateCount = prepared.reduce(
    (sum, item) => sum + item.duplicateCount,
    0
  );

  summary.innerHTML = `
    <dl>
      <div><dt>Local entries</dt><dd>${localEntries.length}</dd></div>
      <div><dt>New entries</dt><dd>${addedCount}</dd></div>
      <div><dt>Duplicates skipped</dt><dd>${duplicateCount}</dd></div>
      <div><dt>Outside all shards</dt><dd>${unmatchedEntries.length}</dd></div>
    </dl>
  `;

  if (pendingFiles.length === 0) {
    downloads.textContent = localEntries.length === 0
      ? "There are no local cache entries to export."
      : "No local entries belong to a configured cache shard.";
    return;
  }

  for (const item of pendingFiles) {
    const row = document.createElement("div");
    const details = document.createElement("span");
    const button = document.createElement("button");

    row.className = "cache-export-file";
    details.textContent =
      `${item.file}: ${item.addedCount} added, ${item.duplicateCount} duplicate`;
    button.type = "button";
    button.className = "button primary";
    button.textContent = `Download ${item.file}`;
    button.addEventListener("click", () => {
      downloadJson(item.file, item.output);
      downloadedFiles.add(item.file);
      button.textContent = `Downloaded ${item.file}`;
      button.classList.remove("primary");
      clearButton.disabled = pendingFiles.some(
        (pending) => !downloadedFiles.has(pending.file)
      );
    });

    row.append(details, button);
    downloads.appendChild(row);
  }

  clearButton.addEventListener("click", () => {
    const confirmed = window.confirm(
      "Clear the exported entries from this browser? Confirm that the downloaded JSON files are safe first."
    );

    if (!confirmed) {
      return;
    }

    const exportedEntries = new Set(assignedEntries);
    const retainedEntries = localEntries.filter(
      (entry) => !exportedEntries.has(entry)
    );

    if (retainedEntries.length > 0) {
      globalThis.localStorage?.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify(retainedEntries)
      );
    } else {
      globalThis.localStorage?.removeItem(LOCAL_STORAGE_KEY);
    }

    clearButton.disabled = true;
    clearButton.textContent = "Exported entries cleared";
    summary.insertAdjacentHTML(
      "beforeend",
      `<p class="cache-export-success">
        Cleared ${assignedEntries.length} exported entries.
        Retained ${retainedEntries.length} unmatched entries.
      </p>`
    );
  });
}

export async function initializeGeocodingCacheExport() {
  const exportCacheEnabled = new URLSearchParams(window.location.search).get("exportcache") === "1";

  if (!exportCacheEnabled) {
    return false;
  }

  const dialog = createDialog();
  dialog.showModal();

  try {
    await prepareExport(dialog);
  } catch (error) {
    console.error("Failed to prepare the geocoding cache export:", error);
    renderError(dialog, error);
  }

  return true;
}
