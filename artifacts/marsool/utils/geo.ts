const EARTH_RADIUS_KM = 6371;

export interface Coords {
  latitude: number;
  longitude: number;
}

export function haversineDistance(a: Coords, b: Coords): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function estimateEtaMinutes(distanceKm: number, speedKmh = 30): number {
  return Math.max(1, Math.round((distanceKm / speedKmh) * 60));
}

export function interpolateCoords(from: Coords, to: Coords, t: number): Coords {
  const clamped = Math.min(1, Math.max(0, t));
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * clamped,
    longitude: from.longitude + (to.longitude - from.longitude) * clamped,
  };
}

export const HOMS_CENTER: Coords = { latitude: 34.7324, longitude: 36.7137 };

export interface CoverageArea {
  id: string;
  name: string;
  points: [number, number][];
}

// Ray-casting point-in-polygon. `polygon` is a ring of [lat, lon] pairs.
export function pointInPolygon(point: Coords, polygon: [number, number][]): boolean {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  const x = point.longitude;
  const y = point.latitude;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0];
    const xi = polygon[i][1];
    const yj = polygon[j][0];
    const xj = polygon[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Whether a point is covered. When no area is configured, coverage is treated
// as unlimited (inside = true) so the picker never blocks by accident.
export function isWithinCoverage(
  point: Coords,
  areas: CoverageArea[],
): { hasCoverage: boolean; inside: boolean } {
  const polygons = areas
    .map((a) => a.points)
    .filter((p) => Array.isArray(p) && p.length >= 3);
  if (polygons.length === 0) return { hasCoverage: false, inside: true };
  return { hasCoverage: true, inside: polygons.some((p) => pointInPolygon(point, p)) };
}

export function simulateCourierStart(user: Coords, offsetKm = 2): Coords {
  const deltaLat = offsetKm / 111;
  const deltaLng = offsetKm / (111 * Math.cos(toRad(user.latitude)));
  return {
    latitude: user.latitude + deltaLat,
    longitude: user.longitude - deltaLng,
  };
}
