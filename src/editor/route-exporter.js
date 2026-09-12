function removeAutoClose(message) {
  if (message && typeof message === "object") {
    delete message.autoCloseMs;
  }
}

export function prepareRouteForExport(route) {
  const exportedRoute = structuredClone(route);

  for (const event of exportedRoute.events || []) {
    if (event.type === "observation-check") {
      removeAutoClose(event.practiceMessage);
      continue;
    }

    if (event.type !== "examiner-command") {
      continue;
    }

    removeAutoClose(event.correctRouteMessage);
    removeAutoClose(event.incorrectRouteMessage);
    removeAutoClose(event.outOfRangeRouteMessage);

    for (const option of event.options || []) {
      removeAutoClose(option.routeMessage);
    }
  }

  return exportedRoute;
}

export function downloadRouteJson(route) {
  const contents = `${JSON.stringify(prepareRouteForExport(route), null, 2)}\n`;
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
