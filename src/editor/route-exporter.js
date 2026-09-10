export function downloadRouteJson(route) {
  const contents = `${JSON.stringify(route, null, 2)}\n`;
  const blob = new Blob([contents], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${route.id || "route"}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function readRouteJson(file) {
  const contents = await file.text();
  return JSON.parse(contents);
}
