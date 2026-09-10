export function normalizeHeading(heading) {
  return ((heading % 360) + 360) % 360;
}

export function isHeadingInRange(heading, min, max) {
  const normalizedHeading = normalizeHeading(heading);
  const normalizedMin = normalizeHeading(min);
  const normalizedMax = normalizeHeading(max);

  if (normalizedMin <= normalizedMax) {
    return normalizedHeading >= normalizedMin &&
      normalizedHeading <= normalizedMax;
  }

  return normalizedHeading >= normalizedMin ||
    normalizedHeading <= normalizedMax;
}

export function calculateDistanceMeters(from, to) {
  const earthRadius = 6371000;
  const toRadians = (degrees) => degrees * Math.PI / 180;

  const lat1 = toRadians(from.lat());
  const lat2 = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat());
  const deltaLng = toRadians(to.lng - from.lng());

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLng / 2) ** 2;

  return earthRadius * 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );
}
