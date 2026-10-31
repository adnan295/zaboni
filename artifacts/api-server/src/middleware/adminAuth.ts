import { type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { clientIp } from "../lib/clientIp";

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

// Password-guessing protection. Every admin entry point (HTTP, uploads, the
// orders socket, change-password) goes through verifyAdminToken, so the limit
// lives here rather than in per-route middleware that other paths could skip.
// Per client IP: 10 wrong passwords per 15 minutes. Across all IPs: 200, to
// slow a distributed attack. An already-verified token (cached below) is
// never throttled, so a signed-in admin keeps working during an attack.
const FAIL_WINDOW_MS = 15 * 60_000;
const FAIL_LIMIT_PER_IP = 10;
const FAIL_LIMIT_GLOBAL = 200;
const failuresByIp = new Map<string, number[]>();
let globalFailures: number[] = [];

function recent(list: number[] | undefined, now: number): number[] {
  return (list ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
}

export function adminAttemptsBlocked(ip: string): boolean {
  const now = Date.now();
  globalFailures = recent(globalFailures, now);
  return recent(failuresByIp.get(ip), now).length >= FAIL_LIMIT_PER_IP || globalFailures.length >= FAIL_LIMIT_GLOBAL;
}

function recordAdminFailure(ip: string): void {
  const now = Date.now();
  const list = recent(failuresByIp.get(ip), now);
  list.push(now);
  failuresByIp.set(ip, list);
  globalFailures.push(now);
  if (failuresByIp.size > 10_000) failuresByIp.clear();
}

/** Test hook. */
export function resetAdminThrottle(): void {
  failuresByIp.clear();
  globalFailures = [];
}

/**
 * Verify a bearer token against the DB password (if set) or ADMIN_SECRET.
 * Pass the caller's real IP (lib/clientIp) so wrong guesses are rate limited.
 */
export async function verifyAdminToken(token: string | null | undefined, ip = "unknown"): Promise<boolean> {
  if (!token) return false;
  const hash = await getAdminPasswordHash();
  const key = sha256(token);
  if (hash) {
    const exp = verifiedTokens.get(key);
    if (exp && exp > Date.now()) return true;
  }
  if (adminAttemptsBlocked(ip)) return false;
  let ok: boolean;
  if (hash) {
    ok = await bcrypt.compare(token, hash);
    if (ok) verifiedTokens.set(key, Date.now() + TOKEN_TTL_MS);
  } else {
    // Bootstrap: no password set yet — accept the env secret.
    ok = envMatches(token);
  }
  if (!ok) recordAdminFailure(ip);
  return ok;
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

/** App/restaurant JWTs (never an admin password) — header and payload are base64url JSON. */
export function looksLikeJwt(token: string): boolean {
  return /^eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+$/.test(token);
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

  const ip = clientIp(req);
  verifyAdminToken(token, ip)
    .then((authorised) => {
      if (!authorised) {
        if (adminAttemptsBlocked(ip)) {
          res.status(429).json({ error: "محاولات كثيرة، حاول بعد ربع ساعة / Too many attempts, try again in 15 minutes" });
          return;
        }
        req.log.warn({ ip }, "Failed admin auth attempt");
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
