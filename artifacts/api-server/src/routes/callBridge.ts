// "هاتف الإدارة" — see lib/callBridge.ts.
//   /bridge/*                 the office line phones (x-line-token header)
//   /admin/call-bridge/*      lines, the on/off switch and the call log
//   POST /calls/intent        the app says which order the next call is about
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/adminAuth";
import { requireAuth } from "../middleware/auth";
import {
  createLine, deleteLine, heartbeat, lineByToken, listCalls, listLines, maskingActive, recordCallEvent,
  recordCallIntent, refreshBridgeState, routeIncomingCall, setBridgeEnabled, setLineEnabled,
} from "../lib/callBridge";
import { logger } from "../lib/logger";

const router: IRouter = Router();

type LineRequest = Request & { line?: { id: string; phone: string } };

async function requireLine(req: LineRequest, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers["x-line-token"];
  const line = await lineByToken(typeof token === "string" ? token : null).catch(() => null);
  if (!line) {
    res.status(401).json({ error: "bad_line_token" });
    return;
  }
  req.line = line;
  next();
}

router.post("/bridge/heartbeat", requireLine, async (req: LineRequest, res) => {
  await heartbeat(req.line!.id);
  res.json({ ok: true, phone: req.line!.phone, masking: maskingActive() });
});

router.post("/bridge/route", requireLine, async (req: LineRequest, res) => {
  const from = typeof req.body?.from === "string" ? req.body.from : "";
  void heartbeat(req.line!.id).catch(() => {});
  const result = await routeIncomingCall(req.line!.id, from);
  logger.info({ lineId: req.line!.id, result: "reject" in result ? result.reason : "dial" }, "call bridge route");
  res.json(result);
});

const eventSchema = z.object({ event: z.enum(["merged", "ended", "failed"]), reason: z.string().max(60).optional() });
router.post("/bridge/calls/:id/event", requireLine, async (req: LineRequest, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_event" });
    return;
  }
  const ok = await recordCallEvent(req.line!.id, String(req.params.id), parsed.data.event, parsed.data.reason);
  res.status(ok ? 200 : 404).json({ ok });
});

// ── Admin ────────────────────────────────────────────────────────────────────

router.get("/admin/call-bridge", requireAdmin, async (_req, res) => {
  const [lines, calls, setting] = await Promise.all([
    listLines(),
    listCalls(150),
    pool.query(`SELECT value FROM system_settings WHERE key = 'call_bridge_enabled' LIMIT 1`),
  ]);
  res.json({ enabled: setting.rows[0]?.value === "true", masking: maskingActive(), lines, calls });
});

router.put("/admin/call-bridge/enabled", requireAdmin, async (req, res) => {
  await setBridgeEnabled(req.body?.enabled === true);
  res.json({ ok: true, masking: maskingActive() });
});

const lineSchema = z.object({ label: z.string().max(40).optional(), phone: z.string().min(9).max(20) });
router.post("/admin/call-bridge/lines", requireAdmin, async (req, res) => {
  const parsed = lineSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "رقم الشريحة مطلوب" });
    return;
  }
  try {
    // The token is shown once: it is typed into the line phone and only its hash is kept.
    res.json(await createLine(parsed.data));
  } catch {
    res.status(400).json({ error: "رقم الشريحة غير صحيح" });
  }
});

router.patch("/admin/call-bridge/lines/:id", requireAdmin, async (req, res) => {
  const ok = await setLineEnabled(String(req.params.id), req.body?.enabled === true);
  res.status(ok ? 200 : 404).json({ ok });
});

router.delete("/admin/call-bridge/lines/:id", requireAdmin, async (req, res) => {
  const ok = await deleteLine(String(req.params.id));
  res.status(ok ? 200 : 404).json({ ok });
});

// ── Apps ─────────────────────────────────────────────────────────────────────

router.post("/calls/intent", requireAuth, async (req, res) => {
  const orderId = typeof req.body?.orderId === "string" ? req.body.orderId : "";
  const userId = req.auth!.userId;
  const { rows } = await pool.query(
    `SELECT 1 FROM orders WHERE id = $1 AND (user_id = $2 OR courier_id = $2) LIMIT 1`,
    [orderId, userId],
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  await recordCallIntent(userId, orderId);
  res.json({ ok: true });
});

export { refreshBridgeState };
export default router;
