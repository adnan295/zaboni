// GET /tiles/:z/:x/:y.png — street-map tiles for the app's small still maps
// (the address preview at checkout, the location in the order chat).
//
// OpenStreetMap's tile servers refuse apps that fetch tiles directly without
// identifying themselves ("Access blocked … tile usage policy"). So the phones
// ask us, and we fetch each tile once with a proper User-Agent and keep it:
// in memory here, and in the phone's own image cache through Cache-Control.
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const UPSTREAM = process.env["TILE_UPSTREAM"] ?? "https://tile.openstreetmap.org";
const USER_AGENT = "ZaboniDelivery/1.0 (+https://zaboni.site)";
const MAX_TILES = 3000; // ~45 MB at ~15 KB a tile
const TTL_MS = 7 * 24 * 3600_000;

const cache = new Map<string, { at: number; body: Buffer }>();
const inflight = new Map<string, Promise<Buffer | null>>();

/** Valid tile address, and only the zooms the app uses. */
export function tileKey(z: number, x: number, y: number): string | null {
  if (![z, x, y].every(Number.isInteger) || z < 3 || z > 19) return null;
  const n = 2 ** z;
  if (x < 0 || y < 0 || x >= n || y >= n) return null;
  return `${z}/${x}/${y}`;
}

async function fetchTile(key: string): Promise<Buffer | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${UPSTREAM}/${key}.png`, { headers: { "User-Agent": USER_AGENT }, signal: ctrl.signal });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) {
      logger.warn({ key, status: res.status }, "[tiles] upstream refused");
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    logger.warn({ key, err: (err as Error).message }, "[tiles] upstream failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

router.get("/tiles/:z/:x/:y.png", async (req, res) => {
  const key = tileKey(Number(req.params.z), Number(req.params.x), Number(req.params.y));
  if (!key) {
    res.status(400).end();
    return;
  }
  const hit = cache.get(key);
  let body = hit && Date.now() - hit.at < TTL_MS ? hit.body : null;
  if (!body) {
    let p = inflight.get(key);
    if (!p) {
      p = fetchTile(key).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    body = await p;
    if (body) {
      if (cache.size >= MAX_TILES) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), body });
    }
  }
  if (!body) {
    res.status(502).end();
    return;
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  res.end(body);
});

export default router;
