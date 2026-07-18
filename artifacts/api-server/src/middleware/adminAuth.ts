import { type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const ADMIN_SECRET = process.env["ADMIN_SECRET"];
export const ADMIN_PASSWORD_KEY = "admin_password_hash";

/**
 * Admin authentication.
 *
 * The operational admin password lives (bcrypt-hashed) in `system_settings`
 * under `admin_password_hash` and is changeable from the admin panel. When it
 * is set it is authoritative — the `ADMIN_SECRET` env var no longer grants
 * access (so a changed password truly replaces the old one). Before any
 * password has been set, `ADMIN_SECRET` is the bootstrap credential used to log
 * in and set the first password.
 *
 * Recovery (locked out): delete the row to fall back to ADMIN_SECRET —
 *   DELETE FROM system_settings WHERE key = 'admin_password_hash';
 */

// Cache the stored hash briefly so we don't hit the DB on every admin request.
let hashCache: { value: string | null; exp: number } | null = null;
const HASH_TTL_MS = 30_000;

// Cache successfully-verified tokens (by sha256) so we don't run bcrypt on
// every request. Cleared whenever the password changes.
const verifiedTokens = new Map<string, number>();
const TOKEN_TTL_MS = 5 * 60_000;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function envMatches(token: string): boolean {
  if (!ADMIN_SECRET) return false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(ADMIN_SECRET);
    return a.byteLength === b.byteLength && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function getAdminPasswordHash(): Promise<string | null> {
  if (hashCache && hashCache.exp > Date.now()) return hashCache.value;
  const [row] = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, ADMIN_PASSWORD_KEY))
    .limit(1);
  const value = row?.value ?? null;
  hashCache = { value, exp: Date.now() + HASH_TTL_MS };
  return value;
}

export async function hasAdminPassword(): Promise<boolean> {
  return (await getAdminPasswordHash()) !== null;
}

/** Verify a bearer token against the DB password (if set) or ADMIN_SECRET. */
export async function verifyAdminToken(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const hash = await getAdminPasswordHash();
  if (hash) {
    const key = sha256(token);
    const exp = verifiedTokens.get(key);
    if (exp && exp > Date.now()) return true;
    const ok = await bcrypt.compare(token, hash);
    if (ok) verifiedTokens.set(key, Date.now() + TOKEN_TTL_MS);
    return ok;
  }
  // Bootstrap: no password set yet — accept the env secret.
  return envMatches(token);
}

/** Hash and store a new admin password, invalidating all caches. */
export async function setAdminPassword(newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 10);
  await db
    .insert(systemSettingsTable)
    .values({ key: ADMIN_PASSWORD_KEY, value: hash, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value: hash, updatedAt: new Date() },
    });
  hashCache = null;
  verifiedTokens.clear();
}

function bearerToken(req: Request): string | null {
  const authHeader = req.headers["authorization"];
  return typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_SECRET) {
    res.status(503).json({
      error: "Admin panel is not configured. Set the ADMIN_SECRET environment variable.",
    });
    return;
  }

  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  verifyAdminToken(token)
    .then((authorised) => {
      if (!authorised) {
        req.log.warn({ ip: req.ip }, "Failed admin auth attempt");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      next();
    })
    .catch((err) => {
      req.log.error({ err }, "Admin auth error");
      res.status(500).json({ error: "Internal error" });
    });
}
