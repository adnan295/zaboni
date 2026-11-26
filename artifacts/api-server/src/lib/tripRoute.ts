// The red line on the tracking map follows the streets. Roads come from our own
// OSRM service (docker-compose `osrm`, built from the OpenStreetMap extract of
// Syria), so there is no paid map API. When it is missing, slow or cannot find a
// way, the app gets the plain points back and draws straight lines instead.

export type LatLon = [number, number];

export interface TripRoute {
  /** Points along the road, [lat, lon]. */
  coords: LatLon[];
  source: "roads" | "straight";
}

const CACHE_MAX = 500;
const CACHE_MS = 10 * 60_000;
const TIMEOUT_MS = 2500;
const cache = new Map<string, { at: number; route: TripRoute }>();

/** "lat,lon;lat,lon" → points; null when malformed, too many, or outside the world. */
export function parsePoints(raw: unknown): LatLon[] | null {
  if (typeof raw !== "string" || raw.length > 200) return null;
  const parts = raw.split(";");
  if (parts.length < 2 || parts.length > 4) return null;
  const pts: LatLon[] = [];
  for (const p of parts) {
    const [a, b] = p.split(",").map(Number);
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a!) > 90 || Math.abs(b!) > 180) return null;
    pts.push([a!, b!]);
  }
  return pts;
}

// ~11 m: a courier's GPS jitter does not cost a new lookup.
const key = (pts: LatLon[]) => pts.map(([a, b]) => `${a.toFixed(4)},${b.toFixed(4)}`).join(";");

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export async function tripRoute(
  pts: LatLon[],
  opts: { baseUrl?: string | undefined; fetchImpl?: Fetch; now?: number } = {},
): Promise<TripRoute> {
  const straight: TripRoute = { coords: pts, source: "straight" };
  const base = (opts.baseUrl ?? process.env["OSRM_URL"] ?? "").replace(/\/+$/, "");
  if (!base) return straight;
  const now = opts.now ?? Date.now();
  const k = key(pts);
  const hit = cache.get(k);
  if (hit && now - hit.at < CACHE_MS) return hit.route;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const path = pts.map(([lat, lon]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(";");
    const res = await (opts.fetchImpl ?? (fetch as unknown as Fetch))(
      `${base}/route/v1/driving/${path}?overview=full&geometries=geojson`, { signal: ctrl.signal },
    );
    if (!res.ok) return straight;
    const data = (await res.json()) as { code?: string; routes?: { geometry?: { coordinates?: [number, number][] } }[] };
    const line = data.code === "Ok" ? data.routes?.[0]?.geometry?.coordinates : undefined;
    if (!line || line.length < 2) return straight;
    // Start and end exactly on our pins, not on the nearest road point.
    const coords: LatLon[] = [pts[0]!, ...line.map(([lon, lat]) => [lat, lon] as LatLon), pts[pts.length - 1]!];
    const route: TripRoute = { coords, source: "roads" };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(k, { at: now, route });
    return route;
  } catch {
    return straight;
  } finally {
    clearTimeout(timer);
  }
}
