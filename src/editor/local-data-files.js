import { prepareRouteForExport } from "./route-exporter.js";

const DATABASE_NAME = "mdts-route-editor";
const DATABASE_VERSION = 1;
const STORE_NAME = "file-system-handles";
const DATA_DIRECTORY_KEY = "data-directory";

const GLOBAL_DATA_SETS = [
  {
    id: "observation-checks",
    filename: "observation-checks.json",
    fallbackName: "Observation Checks",
  },
  {
    id: "critical-violations",
    filename: "critical-violations.json",
    fallbackName: "Critical Violations",
  },
];

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function readStoredDirectoryHandle() {
  const database = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(DATA_DIRECTORY_KEY);
      request.addEventListener("success", () => resolve(request.result || null));
      request.addEventListener("error", () => reject(request.error));
    });
  } finally {
    database.close();
  }
}

async function storeDirectoryHandle(directoryHandle) {
  const database = await openDatabase();

  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(
        directoryHandle,
        DATA_DIRECTORY_KEY
      );
      transaction.addEventListener("complete", resolve);
      transaction.addEventListener("error", () => reject(transaction.error));
      transaction.addEventListener("abort", () => reject(transaction.error));
    });
  } finally {
    database.close();
  }
}

async function validateDataDirectory(directoryHandle) {
  await directoryHandle.getDirectoryHandle("routes");

  for (const dataSet of GLOBAL_DATA_SETS) {
    await directoryHandle.getFileHandle(dataSet.filename);
  }
}

async function requestStoredDirectory() {
  const directoryHandle = await readStoredDirectoryHandle();
  if (!directoryHandle) return null;

  const options = { mode: "readwrite" };
  let permission = await directoryHandle.queryPermission(options);

  if (permission === "prompt") {
    permission = await directoryHandle.requestPermission(options);
  }

  if (permission !== "granted") return null;

  try {
    await validateDataDirectory(directoryHandle);
    return directoryHandle;
  } catch {
    return null;
  }
}

async function selectDataDirectory() {
  const directoryHandle = await window.showDirectoryPicker({
    id: "mdts-data-directory",
    mode: "readwrite",
  });

  try {
    await validateDataDirectory(directoryHandle);
  } catch {
    throw new Error(
      "Select the public/data folder containing routes and the global JSON files."
    );
  }

  await storeDirectoryHandle(directoryHandle);
  return directoryHandle;
}

async function readJson(fileHandle) {
  const file = await fileHandle.getFile();
  return JSON.parse(await file.text());
}

function routeIdFromFilename(filename) {
  return filename.slice(0, -".json".length);
}

function compareDataSets(left, right) {
  return left.name.localeCompare(right.name, "en", {
    sensitivity: "base",
    numeric: true,
  }) || left.id.localeCompare(right.id, "en", { numeric: true });
}

async function writeJsonFile(directoryHandle, filename, value) {
  const fileHandle = await directoryHandle.getFileHandle(filename, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  const contents = `${JSON.stringify(value, null, 2)}\n`;

  await writable.write(contents);
  await writable.close();
}

export function supportsLocalDataFiles() {
  return typeof window.showDirectoryPicker === "function" &&
    typeof indexedDB !== "undefined";
}

export async function connectDataDirectory({ forcePicker = false } = {}) {
  if (!supportsLocalDataFiles()) {
    throw new Error("This editor requires desktop Chrome or Edge.");
  }

  if (!forcePicker) {
    const storedDirectory = await requestStoredDirectory();
    if (storedDirectory) return storedDirectory;
  }

  return selectDataDirectory();
}

export async function listLocalDataSets(directoryHandle) {
  const routesDirectory = await directoryHandle.getDirectoryHandle("routes");
  const routeDataSets = [];

  for await (const [filename, handle] of routesDirectory.entries()) {
    if (handle.kind !== "file" || !filename.toLowerCase().endsWith(".json")) {
      continue;
    }

    const id = routeIdFromFilename(filename);
    let name = id;
    let valid = true;

    try {
      const route = await readJson(handle);
      name = route.name || route.id || id;
    } catch {
      name = `${id} (invalid JSON)`;
      valid = false;
    }

    routeDataSets.push({ id, name, kind: "route", valid });
  }

  routeDataSets.sort(compareDataSets);

  const globalDataSets = await Promise.all(GLOBAL_DATA_SETS.map(async (dataSet) => {
    const handle = await directoryHandle.getFileHandle(dataSet.filename);
    let name = dataSet.fallbackName;
    let valid = true;

    try {
      const document = await readJson(handle);
      name = document.name || dataSet.fallbackName;
    } catch {
      name = `${dataSet.fallbackName} (invalid JSON)`;
      valid = false;
    }

    return { id: dataSet.id, name, kind: "global", valid };
  }));

  return [...routeDataSets, ...globalDataSets];
}

export async function readLocalDataSet(directoryHandle, dataSetId) {
  const globalDataSet = GLOBAL_DATA_SETS.find((item) => item.id === dataSetId);
  let fileHandle;

  if (globalDataSet) {
    fileHandle = await directoryHandle.getFileHandle(globalDataSet.filename);
  } else {
    const routesDirectory = await directoryHandle.getDirectoryHandle("routes");
    fileHandle = await routesDirectory.getFileHandle(`${dataSetId}.json`);
  }

  return readJson(fileHandle);
}

export async function writeLocalDataSet(directoryHandle, document) {
  const globalDataSet = GLOBAL_DATA_SETS.find((item) => item.id === document.type);
  let directory = directoryHandle;
  let filename;

  if (globalDataSet) {
    filename = globalDataSet.filename;
  } else {
    directory = await directoryHandle.getDirectoryHandle("routes");
    filename = `${document.id}.json`;
  }

  await writeJsonFile(directory, filename, prepareRouteForExport(document));

  return globalDataSet ? filename : `routes/${filename}`;
}

export async function writeLocalRouteIndex(directoryHandle) {
  const dataSets = await listLocalDataSets(directoryHandle);
  const routes = dataSets
    .filter((dataSet) => dataSet.kind === "route" && dataSet.valid)
    .map(({ id, name }) => ({ id, name }))
    .sort(compareDataSets);

  await writeJsonFile(directoryHandle, "route-index.json", routes);
  return dataSets;
}
