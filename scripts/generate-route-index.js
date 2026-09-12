import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const routesDirectory = resolve("public/data/routes");
const outputPath = resolve("public/data/route-index.json");

function compareRoutes(left, right) {
  return left.name.localeCompare(right.name, "en", {
    sensitivity: "base",
    numeric: true,
  }) || left.id.localeCompare(right.id, "en", { numeric: true });
}

const filenames = (await readdir(routesDirectory))
  .filter((filename) => filename.toLowerCase().endsWith(".json"));
const routes = [];

for (const filename of filenames) {
  const route = JSON.parse(
    await readFile(resolve(routesDirectory, filename), "utf8")
  );
  const fileId = filename.slice(0, -".json".length);

  if (route.id !== fileId) {
    throw new Error(`${filename}: route id must match the filename.`);
  }

  if (typeof route.name !== "string" || !route.name.trim()) {
    throw new Error(`${filename}: route name is required.`);
  }

  routes.push({ id: route.id, name: route.name });
}

if (routes.length === 0) {
  throw new Error("At least one route JSON file is required.");
}

routes.sort(compareRoutes);
await writeFile(outputPath, `${JSON.stringify(routes, null, 2)}\n`, "utf8");

console.log(`Generated ${routes.length} routes in public/data/route-index.json`);
