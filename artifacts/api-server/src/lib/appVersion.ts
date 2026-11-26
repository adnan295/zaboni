// App versions. Apps from 1.0.23 on send their version with every request
// (header X-Zaboni-App: "1.0.23 ios"); older apps send nothing and are served
// exactly as before (see lib/orderPrep) — they are never refused.
//
// From 1.0.23 on the admin can set, from the dashboard:
//   • the latest version — the app suggests updating once, and can be dismissed;
//   • a minimum version (off by default) — only for a real emergency: apps below
//     it show an update page and their orders are refused.

import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

export const APP_VERSION_HEADER = "x-zaboni-app";
export const MIN_APP_SETTING_KEY = "min_app_version";

export interface MinAppVersion {
  enabled: boolean;
  /** "x.y.z": the minimum, enforced only when enabled. */
  version: string;
  /** "x.y.z": the version in the stores, suggested once to older apps. */
  latest?: string;
}

export const UPDATE_MESSAGE = "نسخة التطبيق عندك قديمة. حدّث زبوني من المتجر لتقدر تطلب 🙏";
export const COURIER_UPDATE_MESSAGE = "نسخة التطبيق عندك قديمة. حدّث زبوني من المتجر لتقدر تقبل طلبات";

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

export function validVersion(v: string): boolean {
  return VERSION.test(v);
}

/** -1, 0 or 1; unparseable versions count as oldest. */
export function compareVersions(a: string | null | undefined, b: string): number {
  const pa = VERSION.exec(a ?? ""), pb = VERSION.exec(b);
  if (!pb) return 0;
  if (!pa) return -1;
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** "1.0.23 ios" → "1.0.23"; null when the app did not say (apps before 1.0.23). */
export function versionFromHeader(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().split(/\s+/)[0] ?? "";
  return VERSION.test(v) ? v : null;
}

/** Web visits are always the latest build. */
export function platformFromHeader(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return raw.trim().split(/\s+/)[1] ?? null;
}

export function isOutdated(header: unknown, min: MinAppVersion): boolean {
  if (!min.enabled || !validVersion(min.version)) return false;
  if (platformFromHeader(header) === "web") return false;
  const version = versionFromHeader(header);
  // Apps from before 1.0.23 cannot show an update page: never refuse them.
  if (version == null) return false;
  return compareVersions(version, min.version) < 0;
}

export function parseMinApp(raw: string | null | undefined): MinAppVersion {
  try {
    const v = JSON.parse(raw ?? "") as Partial<MinAppVersion>;
    return {
      enabled: v.enabled === true,
      version: typeof v.version === "string" && validVersion(v.version) ? v.version : "1.0.0",
      latest: typeof v.latest === "string" && validVersion(v.latest) ? v.latest : undefined,
    };
  } catch {
    return { enabled: false, version: "1.0.0" };
  }
}

let cache: { at: number; value: MinAppVersion } | null = null;

export async function getMinApp(): Promise<MinAppVersion> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const { rows } = await pool.query(`SELECT value FROM system_settings WHERE key = $1 LIMIT 1`, [MIN_APP_SETTING_KEY]);
  cache = { at: Date.now(), value: parseMinApp(rows[0]?.value) };
  return cache.value;
}

export async function saveMinApp(v: MinAppVersion): Promise<void> {
  await pool.query(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [MIN_APP_SETTING_KEY, JSON.stringify(v)],
  );
  cache = { at: Date.now(), value: v };
}

/** Express guard for placing orders and accepting them. */
export function requireCurrentApp(message: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (isOutdated(req.headers[APP_VERSION_HEADER], await getMinApp())) {
        res.status(426).json({ error: "update_required", message });
        return;
      }
    } catch {
      // A settings read failure must never block orders.
    }
    next();
  };
}
