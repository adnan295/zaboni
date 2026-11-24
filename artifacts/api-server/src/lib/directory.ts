// "دليل حمص": every restaurant and café in Homs the field team mapped, partner or
// not. Customers browse a place's menu (no prices — the bill is paid as printed,
// and the courier hands over the original receipt) and order it as a free order.
// Because the pickup point is known, the delivery fee is charged by the real
// distance from the place to the customer instead of from the city centre.

import { pool } from "@workspace/db";

export interface MenuSection {
  title: string;
  items: string[];
}

export interface DirectoryPlace {
  id: string;
  nameAr: string;
  phone: string;
  lat: number;
  lon: number;
  district: string;
  category: string;
  menu: MenuSection[];
  menuImages: string[];
  /** The place's logo, shown on its map pin and at the top of its menu booklet. */
  logo: string | null;
  isPublished: boolean;
}

export interface DirectoryListItem {
  id: string;
  nameAr: string;
  lat: number;
  lon: number;
  district: string;
  category: string;
  itemCount: number;
  cover: string | null;
  logo: string | null;
  /** Menu items that matched the search, so the list can show "كبة لبنية" under the place. */
  matches?: string[];
}

export class DirectoryError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

let schemaReady: Promise<void> | null = null;
export function ensureDirectorySchema(): Promise<void> {
  schemaReady ??= pool.query(`
    CREATE TABLE IF NOT EXISTS directory_places (
      id TEXT PRIMARY KEY,
      name_ar TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      lat DOUBLE PRECISION NOT NULL,
      lon DOUBLE PRECISION NOT NULL,
      district TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      menu JSONB NOT NULL DEFAULT '[]',
      menu_images JSONB NOT NULL DEFAULT '[]',
      logo TEXT,
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE directory_places ADD COLUMN IF NOT EXISTS logo TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS directory_place_id TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_lon DOUBLE PRECISION;
  `).then(() => undefined).catch((err) => { schemaReady = null; throw err; });
  return schemaReady;
}

const rowToPlace = (r: Record<string, unknown>): DirectoryPlace => ({
  id: String(r["id"]),
  nameAr: String(r["name_ar"]),
  phone: String(r["phone"] ?? ""),
  lat: Number(r["lat"]),
  lon: Number(r["lon"]),
  district: String(r["district"] ?? ""),
  category: String(r["category"] ?? ""),
  menu: Array.isArray(r["menu"]) ? (r["menu"] as MenuSection[]) : [],
  menuImages: Array.isArray(r["menu_images"]) ? (r["menu_images"] as string[]) : [],
  logo: r["logo"] ? String(r["logo"]) : null,
  isPublished: Boolean(r["is_published"]),
});

// The whole directory is a few hundred rows: keep it in memory and search there.
const CACHE_MS = 2 * 60 * 1000;
let cache: { at: number; places: DirectoryPlace[] } | null = null;

export function invalidateDirectoryCache(): void {
  cache = null;
}

async function publishedPlaces(): Promise<DirectoryPlace[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.places;
  await ensureDirectorySchema();
  const { rows } = await pool.query(`SELECT * FROM directory_places WHERE is_published ORDER BY name_ar`);
  const places = rows.map(rowToPlace);
  cache = { at: Date.now(), places };
  return places;
}

/**
 * Arabic search that forgives the usual spelling variants: hamza forms, taa
 * marbuta / haa, alef maqsura / yaa, tatweel and diacritics.
 */
export function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

const itemCount = (p: DirectoryPlace) => p.menu.reduce((n, s) => n + s.items.length, 0);

export async function listPlaces(opts: { q?: string; category?: string }): Promise<DirectoryListItem[]> {
  const places = await publishedPlaces();
  const q = normalizeArabic(opts.q ?? "");
  const out: DirectoryListItem[] = [];
  for (const p of places) {
    if (opts.category && p.category !== opts.category) continue;
    let matches: string[] | undefined;
    if (q) {
      const inName = normalizeArabic(p.nameAr).includes(q) || normalizeArabic(p.district).includes(q);
      matches = p.menu.flatMap((s) => s.items).filter((i) => normalizeArabic(i).includes(q)).slice(0, 5);
      if (!inName && matches.length === 0) continue;
    }
    out.push({
      id: p.id, nameAr: p.nameAr, lat: p.lat, lon: p.lon, district: p.district, category: p.category,
      itemCount: itemCount(p), cover: p.menuImages[0] ?? null, logo: p.logo, ...(matches?.length ? { matches } : {}),
    });
  }
  return out;
}

export async function getPlace(id: string): Promise<DirectoryPlace | null> {
  return (await publishedPlaces()).find((p) => p.id === id) ?? null;
}

export async function listCategories(): Promise<{ category: string; count: number }[]> {
  const counts = new Map<string, number>();
  for (const p of await publishedPlaces()) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  return [...counts].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface PlaceInput {
  id?: string;
  nameAr: string;
  phone?: string;
  lat: number;
  lon: number;
  district?: string;
  category?: string;
  menu?: MenuSection[];
  menuImages?: string[];
  logo?: string | null;
  isPublished?: boolean;
}

function cleanMenu(menu: unknown): MenuSection[] {
  if (!Array.isArray(menu)) return [];
  return menu
    .map((s) => ({
      title: String((s as MenuSection)?.title ?? "").trim().slice(0, 80),
      items: Array.isArray((s as MenuSection)?.items)
        ? (s as MenuSection).items.map((i) => String(i).trim().slice(0, 120)).filter(Boolean).slice(0, 300)
        : [],
    }))
    .filter((s) => s.items.length > 0)
    .slice(0, 60);
}

export function validatePlace(p: PlaceInput): string | null {
  if (!p.nameAr?.trim()) return "name_required";
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return "bad_location";
  return null;
}

/** Inserts or replaces places by id (a re-import updates instead of duplicating). */
export async function upsertPlaces(inputs: PlaceInput[]): Promise<{ saved: number; rejected: { index: number; reason: string }[] }> {
  await ensureDirectorySchema();
  const rejected: { index: number; reason: string }[] = [];
  let saved = 0;
  for (const [index, p] of inputs.entries()) {
    const reason = validatePlace(p);
    if (reason) { rejected.push({ index, reason }); continue; }
    const id = p.id?.trim() || `dp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO directory_places (id, name_ar, phone, lat, lon, district, category, menu, menu_images, is_published, logo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)
       ON CONFLICT (id) DO UPDATE SET name_ar = EXCLUDED.name_ar, phone = EXCLUDED.phone, lat = EXCLUDED.lat, lon = EXCLUDED.lon,
         district = EXCLUDED.district, category = EXCLUDED.category, menu = EXCLUDED.menu, menu_images = EXCLUDED.menu_images,
         is_published = EXCLUDED.is_published, logo = EXCLUDED.logo, updated_at = NOW()`,
      [id, p.nameAr.trim(), (p.phone ?? "").trim(), p.lat, p.lon, (p.district ?? "").trim(), (p.category ?? "").trim(),
        JSON.stringify(cleanMenu(p.menu)), JSON.stringify((p.menuImages ?? []).filter((u) => typeof u === "string").slice(0, 20)),
        p.isPublished ?? true, typeof p.logo === "string" && p.logo.trim() ? p.logo.trim().slice(0, 500) : null],
    );
    saved++;
  }
  invalidateDirectoryCache();
  return { saved, rejected };
}

export async function adminListPlaces(): Promise<DirectoryPlace[]> {
  await ensureDirectorySchema();
  const { rows } = await pool.query(`SELECT * FROM directory_places ORDER BY updated_at DESC`);
  return rows.map(rowToPlace);
}

export async function deletePlace(id: string): Promise<boolean> {
  await ensureDirectorySchema();
  const { rowCount } = await pool.query(`DELETE FROM directory_places WHERE id = $1`, [id]);
  invalidateDirectoryCache();
  return (rowCount ?? 0) > 0;
}
