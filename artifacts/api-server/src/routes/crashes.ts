import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import jwt from "jsonwebtoken";
import { requireAdmin } from "../middleware/adminAuth";
import { logger } from "../lib/logger";
import {
  alertCrash,
  getActiveCrashAlerts,
  getCrashAlertPhone,
  getCrashEvents,
  getCrashOverview,
  parseCrashInput,
  recordCrash,
  saveCrashAlertPhone,
  setCrashGroupState,
} from "../lib/crashReports";

const router: IRouter = Router();

// A crashing loop on one phone must not flood the table.
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_MAX = 20;
const hits = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_MAX;
}

/** Signed-in user id if the report carries a valid app token; crashes before login are still accepted. */
function optionalUserId(header: string | undefined): string | null {
  const secret = process.env["JWT_SECRET"];
  if (!secret || !header?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(header.slice(7), secret) as { userId?: string; tokenType?: string };
    return payload.tokenType === "restaurant_portal" ? null : (payload.userId ?? null);
  } catch {
    return null;
  }
}

router.post("/app/crash", async (req, res) => {
  const input = parseCrashInput(req.body);
  if (!input) {
    res.status(400).json({ error: "invalid crash report" });
    return;
  }
  const ip = req.ip ?? "";
  if (rateLimited(ip)) {
    res.status(429).json({ error: "too many reports" });
    return;
  }
  const userId = optionalUserId(req.headers.authorization);
  // Counts affected people: the account, or (signed out) this network + phone model.
  const reporter = userId ?? `anon:${createHash("sha1").update(`${ip}|${input.device}`).digest("hex").slice(0, 16)}`;
  try {
    const fingerprint = await recordCrash(input, { userId, reporter });
    res.json({ ok: true });
    void alertCrash(fingerprint, input).catch((err) => logger.warn({ err }, "[crash] alert failed"));
  } catch (err) {
    logger.error({ err }, "[crash] could not record report");
    res.status(500).json({ error: "could not record" });
  }
});

router.get("/admin/crashes", requireAdmin, async (req, res) => {
  const days = Math.min(60, Math.max(1, parseInt(String(req.query.days ?? "7")) || 7));
  res.json(await getCrashOverview(days));
});

router.get("/admin/crashes/alerts", requireAdmin, async (_req, res) => {
  res.json({ alerts: await getActiveCrashAlerts() });
});

router.get("/admin/crashes/settings", requireAdmin, async (_req, res) => {
  res.json({ alertPhone: await getCrashAlertPhone() });
});

router.put("/admin/crashes/settings", requireAdmin, async (req, res) => {
  const raw = String(req.body?.alertPhone ?? "").replace(/[\s-]/g, "");
  if (raw && !/^\+\d{8,15}$/.test(raw)) {
    res.status(400).json({ error: "اكتب الرقم بالصيغة الدولية، مثل ‎+963912345678" });
    return;
  }
  await saveCrashAlertPhone(raw);
  res.json({ alertPhone: raw });
});

router.get("/admin/crashes/:fingerprint", requireAdmin, async (req, res) => {
  res.json({ events: await getCrashEvents(String(req.params.fingerprint)) });
});

router.patch("/admin/crashes/:fingerprint", requireAdmin, async (req, res) => {
  const muted = typeof req.body?.muted === "boolean" ? req.body.muted : undefined;
  const resolved = typeof req.body?.resolved === "boolean" ? req.body.resolved : undefined;
  if (muted === undefined && resolved === undefined) {
    res.status(400).json({ error: "muted or resolved required" });
    return;
  }
  await setCrashGroupState(String(req.params.fingerprint), { muted, resolved });
  res.json({ ok: true });
});

export default router;
