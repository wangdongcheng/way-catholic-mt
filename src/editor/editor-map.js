import {
  importLibrary,
  setOptions,
} from "@googlemaps/js-api-loader";

setOptions({
  key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
});

const COLORS = {
  message: "#2563eb",
  command: "#f97316",
  answer: "#eab308",
  criticalTrigger: "#f97316",
  criticalDestination: "#dc2626",
  invalid: "#dc2626",
  heading: "#7c3aed",
};

function offsetPoint(center, distanceMeters, bearingDegrees) {
  const earthRadius = 6371000;
  const bearing = bearingDegrees * Math.PI / 180;
  const lat1 = center.lat * Math.PI / 180;
  const lng1 = center.lng * Math.PI / 180;
  const angularDistance = distanceMeters / earthRadius;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    lat: lat2 * 180 / Math.PI,
    lng: lng2 * 180 / Math.PI,
  };
}

function buildHeadingPath(event) {
  if (
    !Number.isFinite(event.headingMin) ||
    !Number.isFinite(event.headingMax)
  ) {
    return null;
  }

  const center = { lat: event.lat, lng: event.lng };
  const span = (
    event.headingMax - event.headingMin + 360
  ) % 360;
  const steps = Math.max(2, Math.ceil(span / 5));
  const points = [center];

  for (let index = 0; index <= steps; index += 1) {
    const bearing = event.headingMin + span * index / steps;
    points.push(offsetPoint(center, event.radius, bearing));
  }

  points.push(center);
  return points;
}

function toLiteral(position) {
  if (!position) {
    return null;
  }

  return {
    lat: typeof position.lat === "function"
      ? position.lat()
      : position.lat,
    lng: typeof position.lng === "function"
      ? position.lng()
      : position.lng,
  };
}

export async function createEditorMap({
  container,
  onContextMenu,
  onPlacement,
  onSelect,
  onPositionChange,
}) {
  const {
    Map: GoogleMap,
    Circle,
    Polygon,
    Polyline,
  } = await importLibrary("maps");
  const { AdvancedMarkerElement } = await importLibrary("marker");

  const map = new GoogleMap(container, {
    center: { lat: 35.8880832, lng: 14.5029997 },
    zoom: 16,
    mapId: "DEMO_MAP_ID",
    streetViewControl: true,
    mapTypeControl: true,
    fullscreenControl: false,
    clickableIcons: false,
  });

  let overlays = [];
  let placementMode = null;

  function clearOverlays() {
    for (const overlay of overlays) {
      overlay.map = null;
      overlay.setMap?.(null);
    }
    overlays = [];
  }

  function setPlacementMode(type) {
    placementMode = type;
    map.setOptions({ draggableCursor: type ? "crosshair" : null });
  }

  map.addListener("contextmenu", (event) => {
    const position = toLiteral(event.latLng);

    if (!position) {
      return;
    }

    onContextMenu({
      position,
      clientX: event.domEvent?.clientX,
      clientY: event.domEvent?.clientY,
    });
  });

  map.addListener("click", (event) => {
    if (!placementMode) {
      return;
    }

    const position = toLiteral(event.latLng);
    const type = placementMode;
    setPlacementMode(null);

    if (position) {
      onPlacement(type, position);
    }
  });

  function sync(route, selectedEventId, issuesByEvent) {
    clearOverlays();

    for (const event of route?.events || []) {
      const invalid = issuesByEvent.has(event.id);
      const selected = event.id === selectedEventId;

      if (event.type === "critical-violation") {
        const trigger = event.triggerCheckpoint?.location;
        const forbidden = event.forbiddenDestination?.location;

        if (
          !Number.isFinite(trigger?.lat) ||
          !Number.isFinite(trigger?.lng) ||
          !Number.isFinite(forbidden?.lat) ||
          !Number.isFinite(forbidden?.lng)
        ) {
          continue;
        }

        const addCriticalPoint = (position, point, title, color, radius) => {
          const marker = new AdvancedMarkerElement({
            map,
            position,
            title: `${event.id} · ${title}`,
            gmpDraggable: true,
            zIndex: selected ? 20 : 10,
          });
          marker.addListener("click", () => onSelect(event.id));
          marker.addListener("dragend", () => {
            const nextPosition = toLiteral(marker.position);
            if (nextPosition) onPositionChange(event.id, nextPosition, point);
          });
          overlays.push(marker);

          const circle = new Circle({
            map,
            center: position,
            radius: Number(radius) || 0,
            clickable: false,
            strokeColor: invalid ? COLORS.invalid : color,
            strokeOpacity: selected ? 1 : 0.7,
            strokeWeight: selected ? 3 : 2,
            fillColor: color,
            fillOpacity: selected ? 0.18 : 0.08,
          });
          overlays.push(circle);
        };

        addCriticalPoint(
          trigger,
          "triggerCheckpoint",
          "Trigger checkpoint",
          COLORS.criticalTrigger,
          event.triggerCheckpoint.radius
        );
        addCriticalPoint(
          forbidden,
          "forbiddenDestination",
          "Forbidden destination",
          COLORS.criticalDestination,
          event.forbiddenDestination.radius
        );

        const connection = new Polyline({
          map,
          path: [trigger, forbidden],
          clickable: false,
          strokeColor: COLORS.criticalDestination,
          strokeOpacity: selected ? 0.95 : 0.5,
          strokeWeight: selected ? 4 : 2,
        });
        overlays.push(connection);
        continue;
      }

      if (!Number.isFinite(event.lat) || !Number.isFinite(event.lng)) {
        continue;
      }

      const center = { lat: event.lat, lng: event.lng };
      const baseColor = event.type === "examiner-command"
        ? COLORS.command
        : COLORS.message;
      const color = invalid ? COLORS.invalid : baseColor;

      const marker = new AdvancedMarkerElement({
        map,
        position: center,
        title: `${event.id} · ${event.type}`,
        gmpDraggable: true,
        zIndex: selected ? 20 : 10,
      });
      marker.addListener("click", () => onSelect(event.id));
      marker.addListener("dragend", () => {
        const nextPosition = toLiteral(marker.position);
        if (nextPosition) {
          onPositionChange(event.id, nextPosition);
        }
      });
      overlays.push(marker);

      const triggerCircle = new Circle({
        map,
        center,
        radius: Number(event.radius) || 0,
        clickable: false,
        strokeColor: color,
        strokeOpacity: selected ? 1 : 0.65,
        strokeWeight: selected ? 3 : 2,
        fillColor: color,
        fillOpacity: selected ? 0.16 : 0.08,
      });
      overlays.push(triggerCircle);

      if (
        (event.type === "examiner-command" ||
          (event.type === "observation-check" && event.examEnabled !== false)) &&
        Number.isFinite(event.answerRadius)
      ) {
        const answerCircle = new Circle({
          map,
          center,
          radius: event.answerRadius,
          clickable: false,
          strokeColor: invalid ? COLORS.invalid : COLORS.answer,
          strokeOpacity: selected ? 0.9 : 0.45,
          strokeWeight: selected ? 3 : 1,
          fillColor: COLORS.answer,
          fillOpacity: selected ? 0.07 : 0.025,
        });
        overlays.push(answerCircle);
      }

      if (selected) {
        const headingPath = buildHeadingPath(event);

        if (headingPath) {
          const heading = new Polygon({
            map,
            paths: headingPath,
            clickable: false,
            strokeColor: COLORS.heading,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: COLORS.heading,
            fillOpacity: 0.22,
          });
          overlays.push(heading);
        }
      }
    }
  }

  function focusRoute(route) {
    const start = route?.startState;

    if (Number.isFinite(start?.lat) && Number.isFinite(start?.lng)) {
      map.setCenter({ lat: start.lat, lng: start.lng });
      map.setZoom(16);
      return;
    }

    const first = route?.events?.[0];
    const position = first?.type === "critical-violation"
      ? first.triggerCheckpoint?.location
      : first && { lat: first.lat, lng: first.lng };

    if (Number.isFinite(position?.lat) && Number.isFinite(position?.lng)) {
      map.setCenter(position);
      map.setZoom(16);
    }
  }

  return {
    sync,
    focusRoute,
    setPlacementMode,
    cancelPlacement: () => setPlacementMode(null),
  };
}
