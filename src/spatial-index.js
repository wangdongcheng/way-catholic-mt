const EARTH_RADIUS_METERS = 6378137;

function projectToMeters(lat, lng) {
  const latRadians = lat * Math.PI / 180;
  const lngRadians = lng * Math.PI / 180;
  const clampedLatitude = Math.max(
    -85.05112878,
    Math.min(85.05112878, lat)
  ) * Math.PI / 180;

  return {
    x: EARTH_RADIUS_METERS * lngRadians,
    y: EARTH_RADIUS_METERS * Math.log(
      Math.tan(Math.PI / 4 + clampedLatitude / 2)
    ),
  };
}

export function createSpatialIndex({
  cellSizeMeters = 100,
} = {}) {
  const cells = new Map();

  function getCellCoordinates(lat, lng) {
    const { x, y } = projectToMeters(lat, lng);

    return {
      x: Math.floor(x / cellSizeMeters),
      y: Math.floor(y / cellSizeMeters),
    };
  }

  function getCellKey(x, y) {
    return `${x}:${y}`;
  }

  function add(event, position) {
    const { x, y } = getCellCoordinates(
      position.lat,
      position.lng
    );
    const key = getCellKey(x, y);
    const entries = cells.get(key) || [];

    entries.push({ event, position });
    cells.set(key, entries);
  }

  function getNearby(lat, lng, radiusMeters) {
    const center = getCellCoordinates(lat, lng);
    const cellRadius = Math.max(
      1,
      Math.ceil(radiusMeters / cellSizeMeters)
    );
    const candidates = [];

    for (
      let x = center.x - cellRadius;
      x <= center.x + cellRadius;
      x += 1
    ) {
      for (
        let y = center.y - cellRadius;
        y <= center.y + cellRadius;
        y += 1
      ) {
        const entries = cells.get(getCellKey(x, y));

        if (entries) {
          candidates.push(...entries);
        }
      }
    }

    return candidates;
  }

  return {
    add,
    getNearby,
  };
}
