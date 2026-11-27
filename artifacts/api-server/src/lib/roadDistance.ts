// Delivery distance along the streets, from our own OSRM service (docker-compose
// `osrm`, OpenStreetMap roads of Syria). The fee follows the real ride instead of a
// straight line times a fixed factor. Never throws: when OSRM is missing, slow or
// finds no way, the answer is null and the caller falls back to the old estimate.

export type Pt = { lat: number; lon: number };

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
type Opts = { baseUrl?: string | undefined; fetchImpl?: Fetch; now?: number };

const CACHE_MAX = 5000;
const CACHE_MS = 30 * 60_000;
const TIMEOUT_MS = 2500;
const BATCH = 90;
const cache = new Map<string, { at: number; km: number | null }>();

// ~11 m: the same address always gets the same fee, on the page and at checkout.
const k = (p: Pt) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
const pairKey = (a: Pt, b: Pt) => `${k(a)}>${k(b)}`;

function straightKm(a: Pt, b: Pt): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * A road answer we trust. Shorter than the straight line is impossible; far longer
 * usually means a pin snapped onto the wrong road (another side of a highway).
 */
export function plausibleRoadKm(roadKm: number, straight: number): boolean {
  if (!Number.isFinite(roadKm) || roadKm < 0) return false;
  if (roadKm + 0.05 < straight * 0.95) return false;
  return roadKm <= straight * 4 + 1.5;
}

function remember(key: string, km: number | null, now: number) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: now, km });
}

/**
 * Road km from many origins (restaurants) to ONE destination (the customer), the
 * direction the courier rides; null where unknown. One OSRM call per 90 origins.
 * Always this direction, so a list, a restaurant page and the checkout agree.
 */
export async function roadKmManyTo(origins: Pt[], dest: Pt, opts: Opts = {}): Promise<(number | null)[]> {
  const base = (opts.baseUrl ?? process.env.OSRM_URL ?? "").replace(/\/+$/, "");
  const now = opts.now ?? Date.now();
  const out: (number | null)[] = origins.map(() => null);
  if (!base || origins.length === 0) return out;
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as Fetch);

  const todo: number[] = [];
  origins.forEach((o, i) => {
    const hit = cache.get(pairKey(o, dest));
    if (hit && now - hit.at < CACHE_MS) out[i] = hit.km;
    else todo.push(i);
  });

  for (let s = 0; s < todo.length; s += BATCH) {
    const idx = todo.slice(s, s + BATCH);
    const coords = [dest, ...idx.map((i) => origins[i]!)].map((p) => `${p.lon},${p.lat}`).join(";");
    const sources = idx.map((_, j) => j + 1).join(";");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${base}/table/v1/driving/${coords}?sources=${sources}&destinations=0&annotations=distance`, { signal: ctrl.signal });
      if (!res.ok) continue;
      const body = (await res.json()) as { code?: string; distances?: (number | null)[][] };
      if (body.code !== "Ok" || !body.distances) continue;
      idx.forEach((i, j) => {
        const meters = body.distances![j]?.[0];
        const km = typeof meters === "number" ? meters / 1000 : null;
        const ok = km != null && plausibleRoadKm(km, straightKm(origins[i]!, dest)) ? Math.round(km * 1000) / 1000 : null;
        out[i] = ok;
        remember(pairKey(origins[i]!, dest), ok, now);
      });
    } catch {
      // Slow or down: leave these null, the caller uses the straight-line estimate.
    } finally {
      clearTimeout(timer);
    }
  }
  return out;
}

/** Road km between two points, or null when it cannot be measured. */
export async function roadKm(from: Pt, to: Pt, opts: Opts = {}): Promise<number | null> {
  return (await roadKmManyTo([from], to, opts))[0] ?? null;
}

/** Test hook. */
export function clearRoadCache(): void {
  cache.clear();
}
