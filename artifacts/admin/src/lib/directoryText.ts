// Helpers for the «دليل حمص» page: reading a location from whatever the admin
// pastes, the menu as plain text, and rows pasted from Excel.

import type { DirectoryMenuSection, DirectoryPlaceInput } from "@/lib/api";

const inRange = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);

/**
 * A location from a Google Maps link or plain coordinates:
 *   "34.7324, 36.7137" · ".../@34.73,36.71,17z" · "...?q=34.73,36.71" · "...!3d34.73!4d36.71".
 * Short links (maps.app.goo.gl) do not carry the numbers: open them first and copy the long link.
 */
export function parseLocation(raw: string): { lat: number; lon: number } | null {
  const s = decodeURIComponent(String(raw ?? "")).trim();
  if (!s) return null;
  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const patterns = [
    new RegExp(`!3d${num}!4d${num}`),
    new RegExp(`@${num},${num}`),
    new RegExp(`[?&](?:q|query|ll|destination|daddr)=${num},\\s*${num}`),
    new RegExp(`^${num}\\s*[,،\\s]\\s*${num}$`),
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m) {
      const lat = Number(m[1]), lon = Number(m[2]);
      if (inRange(lat, lon)) return { lat, lon };
    }
  }
  return null;
}

/**
 * The menu as text: a line starting with "#" opens a section, every other
 * non-empty line is an item. Items before any "#" go in an untitled section.
 */
export function menuFromText(text: string): DirectoryMenuSection[] {
  const sections: DirectoryMenuSection[] = [];
  let cur: DirectoryMenuSection | null = null;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#")) {
      cur = { title: t.replace(/^#+\s*/, ""), items: [] };
      sections.push(cur);
    } else {
      if (!cur) { cur = { title: "", items: [] }; sections.push(cur); }
      cur.items.push(t);
    }
  }
  return sections.filter((s) => s.items.length > 0);
}

export function menuToText(menu: DirectoryMenuSection[]): string {
  return menu.map((s) => [s.title ? `# ${s.title}` : null, ...s.items].filter((l) => l !== null).join("\n")).join("\n\n");
}

export interface PastedRow {
  line: number;
  place: DirectoryPlaceInput | null;
  error: string | null;
}

/**
 * Rows pasted from Excel / Google Sheets (tab-separated), in this order:
 *   الاسم · النوع · الرقم · الحي · الموقع (رابط غوغل ماب أو lat,lon)
 * A first row that looks like headers is skipped.
 */
export function parsePastedRows(text: string): PastedRow[] {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
  const out: PastedRow[] = [];
  lines.forEach((raw, i) => {
    const cells = (raw.includes("\t") ? raw.split("\t") : raw.split(/\s*[,;]\s*(?=\D)/)).map((c) => c.trim());
    const [name = "", category = "", phone = "", district = "", where = ""] = cells;
    if (i === 0 && /^(الاسم|اسم|name)$/i.test(name)) return;
    if (!name) { out.push({ line: i + 1, place: null, error: "بلا اسم" }); return; }
    const loc = parseLocation(where);
    if (!loc) { out.push({ line: i + 1, place: null, error: "الموقع مو مفهوم" }); return; }
    out.push({ line: i + 1, error: null, place: { nameAr: name, category, phone, district, lat: loc.lat, lon: loc.lon, isPublished: true } });
  });
  return out;
}
