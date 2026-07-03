import { Storage, File } from "@google-cloud/storage";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import { createReadStream, promises as fsPromises } from "fs";
import path from "path";
import {
  ObjectAclPolicy,
  ObjectPermission,
  StorageObjectHandle,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";
import { readLocalObjectMeta, writeLocalObjectMeta, deleteLocalObjectMeta } from "./localStorageMeta";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

/**
 * STORAGE_MODE=local switches all uploads/downloads to the VPS's local disk
 * (LOCAL_STORAGE_PUBLIC_DIR / LOCAL_STORAGE_PRIVATE_DIR) instead of the
 * Replit Object Storage sidecar. Default ("gcs") preserves current Replit behavior.
 */
export const isLocalStorageMode = (process.env["STORAGE_MODE"] ?? "gcs").toLowerCase() === "local";

export const MAX_PUBLIC_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Local-disk pending upload tokens (replaces GCS presigned URLs when
// STORAGE_MODE=local). A token is minted when the client requests an upload
// URL, and consumed exactly once when the PUT with the file bytes arrives at
// /api/storage/local-upload/:token (see routes/storage.ts).
// ---------------------------------------------------------------------------

interface PendingLocalUpload {
  absolutePath: string;
  contentType?: string;
  maxSizeBytes: number;
  expiresAt: number;
}

const LOCAL_UPLOAD_TTL_MS = 15 * 60 * 1000;
const pendingLocalUploads = new Map<string, PendingLocalUpload>();

function createPendingLocalUpload(entry: Omit<PendingLocalUpload, "expiresAt">): string {
  const token = randomUUID();
  pendingLocalUploads.set(token, { ...entry, expiresAt: Date.now() + LOCAL_UPLOAD_TTL_MS });
  return token;
}

export function consumePendingLocalUpload(token: string): PendingLocalUpload | null {
  const entry = pendingLocalUploads.get(token);
  if (!entry) return null;
  pendingLocalUploads.delete(token);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

if (isLocalStorageMode) {
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [token, entry] of pendingLocalUploads) {
      if (entry.expiresAt < now) pendingLocalUploads.delete(token);
    }
  }, 5 * 60 * 1000);
  sweep.unref();
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  private getLocalPublicDir(): string {
    const dir = process.env["LOCAL_STORAGE_PUBLIC_DIR"];
    if (!dir) {
      throw new Error(
        "LOCAL_STORAGE_PUBLIC_DIR not set. Required when STORAGE_MODE=local."
      );
    }
    return dir;
  }

  private getLocalPrivateDir(): string {
    const dir = process.env["LOCAL_STORAGE_PRIVATE_DIR"];
    if (!dir) {
      throw new Error(
        "LOCAL_STORAGE_PRIVATE_DIR not set. Required when STORAGE_MODE=local."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<StorageObjectHandle | null> {
    if (isLocalStorageMode) {
      const absolutePath = path.join(this.getLocalPublicDir(), filePath);
      try {
        await fsPromises.access(absolutePath);
        return { kind: "local", absolutePath, relativePath: filePath };
      } catch {
        return null;
      }
    }

    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return { kind: "gcs", file };
      }
    }

    return null;
  }

  async downloadObject(handle: StorageObjectHandle, cacheTtlSec: number = 3600): Promise<Response> {
    if (handle.kind === "local") {
      const meta = await readLocalObjectMeta(handle.absolutePath);
      const isPublic = meta.acl?.visibility === "public";
      const stat = await fsPromises.stat(handle.absolutePath);

      const nodeStream = createReadStream(handle.absolutePath);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;

      const headers: Record<string, string> = {
        "Content-Type": meta.contentType || "application/octet-stream",
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
        "Content-Length": String(stat.size),
      };

      return new Response(webStream, { headers });
    }

    const [metadata] = await handle.file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(handle);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = handle.file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(contentType?: string): Promise<string> {
    const objectId = randomUUID();
    const relPath = `uploads/${objectId}`;

    if (isLocalStorageMode) {
      const absolutePath = path.join(this.getLocalPrivateDir(), relPath);
      const token = createPendingLocalUpload({
        absolutePath,
        contentType,
        maxSizeBytes: MAX_PUBLIC_UPLOAD_SIZE_BYTES,
      });
      return `/api/storage/local-upload/${token}`;
    }

    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const fullPath = `${privateObjectDir}/${relPath}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
      contentType,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<StorageObjectHandle> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");

    if (isLocalStorageMode) {
      const absolutePath = path.join(this.getLocalPrivateDir(), entityId);
      try {
        await fsPromises.access(absolutePath);
      } catch {
        throw new ObjectNotFoundError();
      }
      return { kind: "local", absolutePath, relativePath: entityId };
    }

    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return { kind: "gcs", file: objectFile };
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (isLocalStorageMode) {
      return rawPath;
    }

    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  /**
   * Validate a user-uploaded public object by checking its actual stored size
   * and magic bytes. If validation fails the object is deleted (best-effort) and
   * false is returned so the serving handler can return 404 without leaking why.
   *
   * Only call this for objects that came through the presigned-URL upload flow
   * (i.e. paths starting with "uploads/"). Admin-managed assets skip this check.
   */
  async validatePublicUpload(
    handle: StorageObjectHandle,
    maxSizeBytes: number,
  ): Promise<boolean> {
    try {
      if (handle.kind === "local") {
        const stat = await fsPromises.stat(handle.absolutePath);
        if (stat.size > maxSizeBytes) {
          await fsPromises.rm(handle.absolutePath, { force: true });
          await deleteLocalObjectMeta(handle.absolutePath);
          return false;
        }

        const MAGIC_LENGTH = 12;
        const fh = await fsPromises.open(handle.absolutePath, "r");
        const buf = Buffer.alloc(MAGIC_LENGTH);
        try {
          await fh.read(buf, 0, MAGIC_LENGTH, 0);
        } finally {
          await fh.close();
        }
        if (!isAllowedImageMagicBytes(buf)) {
          await fsPromises.rm(handle.absolutePath, { force: true });
          await deleteLocalObjectMeta(handle.absolutePath);
          return false;
        }
        return true;
      }

      const [metadata] = await handle.file.getMetadata();
      const actualSize = Number(metadata.size ?? 0);
      if (actualSize > maxSizeBytes) {
        await handle.file.delete().catch(() => {});
        return false;
      }

      const MAGIC_LENGTH = 12;
      const firstBytes = await readFirstBytes(handle.file, MAGIC_LENGTH);
      if (!isAllowedImageMagicBytes(firstBytes)) {
        await handle.file.delete().catch(() => {});
        return false;
      }
    } catch {
      return false;
    }
    return true;
  }

  /**
   * Scan the public uploads directory and delete any objects that fail size or
   * magic-byte validation. Returns counts for observability logging.
   */
  async scanAndCleanPublicUploads(): Promise<{ scanned: number; deleted: number }> {
    let scanned = 0;
    let deleted = 0;

    if (isLocalStorageMode) {
      const uploadsDir = path.join(this.getLocalPublicDir(), "uploads");
      let entries: string[];
      try {
        entries = await fsPromises.readdir(uploadsDir);
      } catch {
        return { scanned: 0, deleted: 0 };
      }

      for (const entry of entries) {
        if (entry.endsWith(".meta.json")) continue;
        scanned++;
        const absolutePath = path.join(uploadsDir, entry);
        const handle: StorageObjectHandle = {
          kind: "local",
          absolutePath,
          relativePath: `uploads/${entry}`,
        };
        const valid = await this.validatePublicUpload(handle, MAX_PUBLIC_UPLOAD_SIZE_BYTES);
        if (!valid) deleted++;
      }

      return { scanned, deleted };
    }

    const publicPaths = this.getPublicObjectSearchPaths();
    const baseDir = publicPaths[0];
    const { bucketName, objectName: baseObjectName } = parseObjectPath(baseDir);
    const bucket = objectStorageClient.bucket(bucketName);
    const uploadsPrefix = `${baseObjectName}/uploads/`.replace(/^\//, "");

    const [files] = await bucket.getFiles({ prefix: uploadsPrefix });
    for (const file of files) {
      scanned++;
      const valid = await this.validatePublicUpload({ kind: "gcs", file }, MAX_PUBLIC_UPLOAD_SIZE_BYTES);
      if (!valid) {
        deleted++;
      }
    }

    return { scanned, deleted };
  }

  async getPublicObjectUploadURL(contentType?: string): Promise<{ uploadURL: string; objectPath: string }> {
    const objectId = randomUUID();
    const relPath = `uploads/${objectId}`;

    if (isLocalStorageMode) {
      const absolutePath = path.join(this.getLocalPublicDir(), relPath);
      const token = createPendingLocalUpload({
        absolutePath,
        contentType,
        maxSizeBytes: MAX_PUBLIC_UPLOAD_SIZE_BYTES,
      });
      return { uploadURL: `/api/storage/local-upload/${token}`, objectPath: relPath };
    }

    const publicPaths = this.getPublicObjectSearchPaths();
    const baseDir = publicPaths[0];

    const fullPath = `${baseDir}/${relPath}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    const uploadURL = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
      contentType,
    });

    return { uploadURL, objectPath: relPath };
  }

  /**
   * Read a file that lives directly under the public storage root (not under
   * uploads/ — e.g. promo banners composed server-side). Works in both
   * local-disk and GCS modes.
   */
  async readPublicFile(relPath: string): Promise<{ buffer: Buffer; contentType: string }> {
    if (isLocalStorageMode) {
      const absolutePath = path.join(this.getLocalPublicDir(), relPath);
      try {
        const buffer = await fsPromises.readFile(absolutePath);
        const meta = await readLocalObjectMeta(absolutePath);
        return { buffer, contentType: meta.contentType ?? "image/jpeg" };
      } catch {
        throw new ObjectNotFoundError();
      }
    }

    const publicPaths = this.getPublicObjectSearchPaths();
    const base = publicPaths[0];
    const fullPath = `${base}/${relPath}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    const [buffer] = await file.download();
    const [meta] = await file.getMetadata();
    const contentType = (meta.contentType as string | undefined) ?? "image/jpeg";
    return { buffer, contentType };
  }

  /**
   * Write a file directly under the public storage root and return its
   * externally servable path (`/api/storage/public-objects/<relPath>`).
   * Works in both local-disk and GCS modes.
   */
  async writePublicFile(relPath: string, buffer: Buffer, contentType: string): Promise<string> {
    if (isLocalStorageMode) {
      const absolutePath = path.join(this.getLocalPublicDir(), relPath);
      await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true });
      await fsPromises.writeFile(absolutePath, buffer);
      await writeLocalObjectMeta(absolutePath, { contentType });
      return `/api/storage/public-objects/${relPath}`;
    }

    const publicPaths = this.getPublicObjectSearchPaths();
    const base = publicPaths[0];
    const fullPath = `${base}/${relPath}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    await file.save(buffer, { contentType, resumable: false });
    return `/api/storage/public-objects/${relPath}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const handle = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(handle, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: StorageObjectHandle;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
  contentType,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
  contentType?: string;
}): Promise<string> {
  const request: Record<string, string> = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  if (contentType) {
    request["content_type"] = contentType;
  }
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const data = (await response.json()) as { signed_url: string };
  return data.signed_url;
}

function readFirstBytes(file: File, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = file.createReadStream({ start: 0, end: length - 1 });
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function isAllowedImageMagicBytes(buf: Buffer): boolean {
  if (buf.length < 3) return false;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return true;
  // WebP: RIFF????WEBP
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return true;
  return false;
}
