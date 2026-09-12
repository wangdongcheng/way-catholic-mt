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
