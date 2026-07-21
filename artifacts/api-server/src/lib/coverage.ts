import { db, coverageAreasTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Ray-casting point-in-polygon test. `polygon` is a ring of [lat, lon] pairs.
 * Returns true when (lat, lon) lies inside the polygon.
 */
export function pointInPolygon(lat: number, lon: number, polygon: [number, number][]): boolean {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  const x = lon;
  const y = lat;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0];
    const xi = polygon[i][1];
    const yj = polygon[j][0];
    const xj = polygon[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export type CoverageCheck = {
  /** Whether any active coverage area is configured at all. */
  hasCoverage: boolean;
  /** Whether the point falls inside the coverage (always true when none configured). */
  inside: boolean;
};

/**
 * Check a location against the admin-drawn coverage areas. When no active area
 * is configured, coverage is treated as unlimited (inside = true) so enabling
 * this feature can never block every order by accident.
 */
export async function checkCoverage(lat: number, lon: number): Promise<CoverageCheck> {
  let areas: { points: [number, number][] }[];
  try {
    areas = await db
      .select({ points: coverageAreasTable.points })
      .from(coverageAreasTable)
      .where(eq(coverageAreasTable.isActive, true));
  } catch {
    // Table missing or DB error — never block ordering because of coverage.
    return { hasCoverage: false, inside: true };
  }

  const polygons = areas
    .map((a) => a.points)
    .filter((p): p is [number, number][] => Array.isArray(p) && p.length >= 3);

  if (polygons.length === 0) {
    return { hasCoverage: false, inside: true };
  }

  const inside = polygons.some((poly) => pointInPolygon(lat, lon, poly));
  return { hasCoverage: true, inside };
}
