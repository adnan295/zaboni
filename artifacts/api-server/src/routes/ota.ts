// Over-the-air updates — see lib/ota.ts.
//   GET  /ota/manifest                                  the app asks (expo-updates protocol v1)
//   GET  /ota/assets/:runtime/:platform/:id?path=…      one file of an update
//   POST /ota/publish/:runtime/:platform/:id/file?path= upload a file   (Bearer OTA_PUBLISH_TOKEN)
//   POST /ota/publish/:runtime/:platform/:id/finish     make it current (Bearer OTA_PUBLISH_TOKEN)
//   GET  /admin/ota, POST /admin/ota/rollback           dashboard
import crypto from "node:crypto";
import express, { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/adminAuth";
import {
  checkId, checkTarget, currentUpdate, finishUpdate, listUpdates, manifestFor, multipart, OtaError, readFile,
  rollback, safeAssetPath, saveFile,
} from "../lib/ota";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function fail(res: Response, err: unknown) {
  if (err instanceof OtaError) {
    res.status(err.status).json({ error: err.code });
    return;
  }
  logger.error({ err }, "[ota] failed");
  res.status(500).json({ error: "server_error" });
}

function baseUrl(req: Request): string {
  const configured = process.env["OTA_PUBLIC_URL"];
  if (configured) return configured.replace(/\/+$/, "");
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol).split(",")[0]!.trim();
  return `${proto}://${req.get("host")}`;
}

router.get("/ota/manifest", async (req, res) => {
  try {
    const { runtime, platform } = checkTarget(
      req.headers["expo-runtime-version"] ?? req.query["runtime-version"],
      req.headers["expo-platform"] ?? req.query["platform"],
    );
    res.setHeader("expo-protocol-version", "1");
    res.setHeader("expo-sfv-version", "0");
    res.setHeader("cache-control", "private, max-age=0");
    const update = await currentUpdate(runtime, platform);
    const running = String(req.headers["expo-current-update-id"] ?? "");
    // Nothing published (or rolled all the way back), or the phone already runs it.
    if (!update || update.id === running) {
      const out = multipart([{ name: "directive", json: { type: update ? "noUpdateAvailable" : "rollBackToEmbedded", ...(update ? {} : { parameters: { commitTime: new Date().toISOString() } }) } }]);
      res.setHeader("content-type", out.contentType);
      res.end(Buffer.from(out.body, "utf8"));
      return;
    }
    const base = baseUrl(req);
    const out = multipart([
      { name: "manifest", json: manifestFor(update, (a) => `${base}/api/ota/assets/${runtime}/${platform}/${update.id}?path=${encodeURIComponent(a.path)}`) },
      { name: "extensions", json: { assetRequestHeaders: {} } },
    ]);
    res.setHeader("content-type", out.contentType);
    res.end(Buffer.from(out.body, "utf8"));
  } catch (err) {
    fail(res, err);
  }
});

router.get("/ota/assets/:runtime/:platform/:id", async (req, res) => {
  try {
    const { runtime, platform } = checkTarget(req.params.runtime, req.params.platform);
    const id = checkId(req.params.id);
    const assetPath = safeAssetPath(req.query["path"]);
    const update = await currentUpdate(runtime, platform);
    const buf = await readFile(runtime, platform, id, assetPath);
    const known = update?.id === id ? [update.launchAsset, ...update.assets].find((a) => a.path === assetPath) : undefined;
    res.setHeader("content-type", known?.contentType ?? "application/octet-stream");
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.send(buf);
  } catch (err) {
    fail(res, err);
  }
});

/** Only the publishing workflow holds OTA_PUBLISH_TOKEN. Without it set, publishing is off. */
function requirePublisher(req: Request, res: Response, next: NextFunction) {
  const expected = process.env["OTA_PUBLISH_TOKEN"] ?? "";
  const given = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const ok = expected.length >= 24 && given.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

router.post(
  "/ota/publish/:runtime/:platform/:id/file",
  requirePublisher,
  express.raw({ type: "*/*", limit: "40mb" }),
  async (req, res) => {
    try {
      const { runtime, platform } = checkTarget(req.params.runtime, req.params.platform);
      const id = checkId(req.params.id);
      const assetPath = safeAssetPath(req.query["path"]);
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new OtaError(400, "empty_file");
      await saveFile(runtime, platform, id, assetPath, req.body);
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  },
);

const finishBody = z.object({
  message: z.string().max(200).default(""),
  launchAsset: z.string(),
  assets: z.array(z.object({ path: z.string(), ext: z.string().max(10) })).max(2000),
  expoClient: z.record(z.string(), z.unknown()),
});

router.post("/ota/publish/:runtime/:platform/:id/finish", requirePublisher, express.json({ limit: "2mb" }), async (req, res) => {
  try {
    const { runtime, platform } = checkTarget(req.params.runtime, req.params.platform);
    const id = checkId(req.params.id);
    const body = finishBody.safeParse(req.body);
    if (!body.success) throw new OtaError(400, "bad_request");
    const update = await finishUpdate({ runtime, platform, id, ...body.data });
    logger.info({ runtime, platform, id, assets: update.assets.length }, "[ota] update published");
    res.json({ ok: true, id: update.id, assets: update.assets.length });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/admin/ota", requireAdmin, async (_req, res) => {
  res.json({ targets: await listUpdates() });
});

router.post("/admin/ota/rollback", requireAdmin, async (req, res) => {
  try {
    const { runtime, platform } = checkTarget(req.body?.runtime, req.body?.platform);
    res.json(await rollback(runtime, platform));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
