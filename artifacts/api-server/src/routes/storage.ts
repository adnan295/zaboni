import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { createWriteStream } from "fs";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import {
  ObjectStorageService,
  ObjectNotFoundError,
  MAX_PUBLIC_UPLOAD_SIZE_BYTES,
  isLocalStorageMode,
  consumePendingLocalUpload,
} from "../lib/objectStorage";
import { writeLocalObjectMeta } from "../lib/localStorageMeta";
import { ObjectPermission } from "../lib/objectAcl";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_UPLOAD_SIZE_BYTES = MAX_PUBLIC_UPLOAD_SIZE_BYTES;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const DAILY_UPLOAD_LIMIT = 50;

interface UserUploadBucket {
  count: number;
  dateUtc: string;
}

const userUploadBuckets = new Map<string, UserUploadBucket>();

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function checkAndIncrementDailyQuota(userId: string): boolean {
  const today = todayUtc();
  const bucket = userUploadBuckets.get(userId);
  if (!bucket || bucket.dateUtc !== today) {
    userUploadBuckets.set(userId, { count: 1, dateUtc: today });
    return true;
  }
  if (bucket.count >= DAILY_UPLOAD_LIMIT) {
    return false;
  }
  bucket.count++;
  return true;
}

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
}

function requireUploadAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const adminSecret = process.env["ADMIN_SECRET"];
  if (adminSecret && token === adminSecret) {
    res.locals["isAdmin"] = true;
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as { userId?: string };
    res.locals["isAdmin"] = false;
    res.locals["userId"] = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request, res: Response) => {
    const userId = res.locals["userId"] as string | undefined;
    return userId ?? req.ip ?? "unknown";
  },
  message: { error: "Too many upload requests. Please try again later." },
  skip: (_req: Request, res: Response) => res.locals["isAdmin"] === true,
});

/**
 * POST /storage/uploads/request-url
 *
 * Authenticated (admin secret OR valid user JWT): Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Enforces: max 5MB, only image/jpeg | image/png | image/webp.
 * Rate limited to 20 requests per minute per authenticated user.
 */
router.post("/storage/uploads/request-url", requireUploadAuth, uploadRateLimit, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { name, size, contentType } = parsed.data;

  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    res.status(400).json({ error: "نوع الملف غير مدعوم. يُسمح فقط بـ JPG وPNG وWebP" });
    return;
  }

  if (size > MAX_UPLOAD_SIZE_BYTES) {
    res.status(400).json({ error: "حجم الملف يتجاوز الحد المسموح (5 ميغابايت)" });
    return;
  }

  const isAdmin = res.locals["isAdmin"] as boolean;
  const userId = res.locals["userId"] as string | undefined;
  if (!isAdmin && userId) {
    const allowed = checkAndIncrementDailyQuota(userId);
    if (!allowed) {
      res.status(429).json({ error: "تجاوزت الحد اليومي لرفع الملفات" });
      return;
    }
  }

  try {
    const { uploadURL, objectPath } = await objectStorageService.getPublicObjectUploadURL(contentType);

    // Local-disk upload URLs are server-relative paths. Web clients can fetch()
    // a relative URL fine (resolved against the page origin), but the Expo/React
    // Native client has no page origin, so it needs an absolute URL.
    // Force https for any non-localhost host: the API is only served over https
    // in production, and a cleartext http:// upload URL is blocked by Android and
    // by browsers (mixed content). Guarantees it even if the proxy omits
    // X-Forwarded-Proto, so `trust proxy` alone couldn't recover the scheme.
    const host = req.get("host") ?? "";
    const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
    const scheme = isLocalHost ? req.protocol : "https";
    const absoluteUploadURL = isLocalStorageMode
      ? `${scheme}://${host}${uploadURL}`
      : uploadURL;

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL: absoluteUploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // User-uploaded objects land under uploads/. Validate actual size and magic
    // bytes before serving — this catches oversized or non-image payloads that
    // bypassed the client-declared metadata check at upload-URL request time.
    if (filePath.startsWith("uploads/")) {
      const valid = await objectStorageService.validatePublicUpload(file, MAX_UPLOAD_SIZE_BYTES);
      if (!valid) {
        res.status(404).json({ error: "File not found" });
        return;
      }
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * Requires admin secret or valid user JWT.
 * Enforces per-object ACL: admin bypasses; non-admin callers must satisfy
 * canAccessObjectEntity (owner match or public visibility).
 */
router.get("/storage/objects/*path", requireUploadAuth, async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const isAdmin = res.locals["isAdmin"] as boolean;
    if (!isAdmin) {
      const userId = res.locals["userId"] as string | undefined;
      const allowed = await objectStorageService.canAccessObjectEntity({
        userId,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });
      if (!allowed) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

/**
 * PUT /storage/local-upload/:token
 *
 * Only active when STORAGE_MODE=local. Receives the raw file bytes for a
 * pending upload token minted by getPublicObjectUploadURL /
 * getObjectEntityUploadURL, and streams them directly to local disk.
 * This replaces the GCS presigned-URL PUT step used in the default mode.
 */
router.put("/storage/local-upload/:token", async (req: Request, res: Response) => {
  if (!isLocalStorageMode) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const token = req.params["token"] as string;
  const entry = consumePendingLocalUpload(token);
  if (!entry) {
    res.status(410).json({ error: "Upload link expired or invalid" });
    return;
  }

  const declaredLength = Number(req.headers["content-length"] ?? 0);
  if (declaredLength > entry.maxSizeBytes) {
    res.status(413).json({ error: "File too large" });
    return;
  }

  try {
    await mkdir(path.dirname(entry.absolutePath), { recursive: true });

    let bytesWritten = 0;
    let tooLarge = false;

    await new Promise<void>((resolve, reject) => {
      const writeStream = createWriteStream(entry.absolutePath);

      req.on("data", (chunk: Buffer) => {
        bytesWritten += chunk.length;
        if (bytesWritten > entry.maxSizeBytes && !tooLarge) {
          tooLarge = true;
          writeStream.destroy();
          req.destroy();
        }
      });

      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
      req.on("error", reject);
      req.on("aborted", () => reject(new Error("aborted")));

      req.pipe(writeStream);
    });

    if (tooLarge) {
      await rm(entry.absolutePath, { force: true });
      res.status(413).json({ error: "File too large" });
      return;
    }

    // Compress the image in place before it is ever served. Phone-camera photos
    // are the main cause of slow image loading, so we cap the dimensions and
    // re-encode at a web-friendly quality. Best-effort: on any failure (or if it
    // wouldn't get smaller) we keep the original bytes untouched.
    try {
      const meta = await sharp(entry.absolutePath).metadata();
      let pipeline = sharp(entry.absolutePath, { failOn: "none" })
        .rotate()
        .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true });
      if (meta.format === "png") {
        pipeline = pipeline.png({ compressionLevel: 9, palette: true });
      } else if (meta.format === "webp") {
        pipeline = pipeline.webp({ quality: 76 });
      } else {
        pipeline = pipeline.jpeg({ quality: 76, mozjpeg: true });
      }
      const optimized = await pipeline.toBuffer();
      if (optimized.length > 0 && optimized.length < bytesWritten) {
        await writeFile(entry.absolutePath, optimized);
      }
    } catch (err) {
      req.log.warn({ err }, "Image compression skipped — keeping original");
    }

    await writeLocalObjectMeta(entry.absolutePath, { contentType: entry.contentType });
    res.status(200).json({ ok: true });
  } catch (error) {
    await rm(entry.absolutePath, { force: true }).catch(() => {});
    req.log.error({ err: error }, "Error writing local upload");
    res.status(500).json({ error: "Failed to save file" });
  }
});

export default router;
