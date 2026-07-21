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

export interface CoverageAreaPolygon {
  id: string;
  points: [number, number][];
}

/**
 * All active coverage areas with their polygons. Each area is a region/city.
 * Returns [] when none are configured (or on DB error) — callers treat an empty
 * list as "no geographic scoping", so nothing gets hidden by accident.
 */
export async function getActiveCoverageAreas(): Promise<CoverageAreaPolygon[]> {
  try {
    const areas = await db
      .select({ id: coverageAreasTable.id, points: coverageAreasTable.points })
      .from(coverageAreasTable)
      .where(eq(coverageAreasTable.isActive, true));
    return areas.filter(
      (a): a is CoverageAreaPolygon => Array.isArray(a.points) && a.points.length >= 3,
    );
  } catch {
    return [];
  }
}

/** IDs of the areas whose polygon contains the given point. */
export function areaIdsContaining(lat: number, lon: number, areas: CoverageAreaPolygon[]): Set<string> {
  const ids = new Set<string>();
  for (const a of areas) {
    if (pointInPolygon(lat, lon, a.points)) ids.add(a.id);
  }
  return ids;
}

/** Whether the point falls inside at least one of the allowed areas. */
export function pointInAllowedArea(
  lat: number,
  lon: number,
  areas: CoverageAreaPolygon[],
  allowedIds: Set<string>,
): boolean {
  for (const a of areas) {
    if (allowedIds.has(a.id) && pointInPolygon(lat, lon, a.points)) return true;
  }
  return false;
}
