import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/adminAuth";
import { checkMetaAccess, metaConfig, validPixelId, validToken, type StoredMeta } from "../lib/metaEvents";
import { getStoredMeta, saveStoredMeta } from "../lib/metaTrack";

/**
 * Facebook ads (Meta Conversions API) settings from the dashboard. The token is
 * write-only: it is never sent back, only whether one is saved and its last 4.
 */
const router: IRouter = Router();

async function view() {
  const s = await getStoredMeta();
  const envPixel = (process.env.META_PIXEL_ID ?? "").trim();
  const envToken = (process.env.META_CAPI_TOKEN ?? "").trim();
  const cfg = metaConfig(process.env, s);
  const token = envToken || s.token || "";
  return {
    pixelId: envPixel || s.pixelId || "",
    hasToken: token.length > 0,
    tokenEnd: token ? token.slice(-4) : "",
    testCode: s.testCode ?? "",
    sypPerUsd: cfg?.sypPerUsd ?? s.sypPerUsd ?? 120,
    pixelFromFile: Boolean(envPixel),
    tokenFromFile: Boolean(envToken),
    active: cfg !== null,
  };
}

router.get("/admin/meta-ads", requireAdmin, async (_req, res) => {
  res.json(await view());
});

const body = z.object({
  pixelId: z.string().trim().refine(validPixelId, "pixel").optional(),
  // Empty or missing = keep the saved token.
  token: z.string().trim().refine((t) => t === "" || validToken(t), "token").optional(),
  clearToken: z.boolean().optional(),
  testCode: z.string().trim().max(40).optional(),
  sypPerUsd: z.number().positive().max(1_000_000).optional(),
});

router.put("/admin/meta-ads", requireAdmin, async (req, res) => {
  const p = body.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: p.error.issues[0]?.message ?? "invalid" });
    return;
  }
  const cur = await getStoredMeta();
  const next: StoredMeta = {
    pixelId: p.data.pixelId ?? cur.pixelId,
    token: p.data.clearToken ? undefined : p.data.token ? p.data.token : cur.token,
    testCode: p.data.testCode !== undefined ? p.data.testCode || undefined : cur.testCode,
    sypPerUsd: p.data.sypPerUsd ?? cur.sypPerUsd,
  };
  await saveStoredMeta(next);
  res.json(await view());
});

/** Can the saved token send to the dataset? Sends one test-coded event Meta never counts. */
router.post("/admin/meta-ads/check", requireAdmin, async (_req, res) => {
  const cfg = metaConfig(process.env, await getStoredMeta());
  if (!cfg) {
    res.json({ ok: false, error: "missing" });
    return;
  }
  try {
    const received = await checkMetaAccess(cfg);
    res.json(received > 0 ? { ok: true, name: "Zaboni" } : { ok: false, error: "Facebook did not accept the test event" });
  } catch (err) {
    res.json({ ok: false, error: String((err as Error)?.message ?? err).replace(/^meta_capi_\d+: /, "").slice(0, 300) });
  }
});

export default router;
