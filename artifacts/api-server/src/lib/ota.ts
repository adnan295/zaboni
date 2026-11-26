// Over-the-air updates for the Zaboni app, served from our own server (the
// expo-updates protocol, v1). Store builds from 1.0.23 ask
// https://zaboni.site/api/ota/manifest on launch; when there is a newer update
// for their runtime version (= the store version they were built as) and
// platform, they download it in the background and run it on the next launch.
//
// An update is a `expo export` of the app: one JS bundle plus its assets.
// Publishing (GitHub workflow «Zaboni OTA update», ci/ota-publish.mjs) uploads the
// files one by one, then «finish» makes it the current update. Rolling back points
// «current» to the previous update, or to none — the code built into the app.
//
// Only JavaScript changes can ship this way. Anything native (a new library, a
// permission, the icon) needs a store build, which also gets a new runtime version.
//
// On disk (a persistent volume): <OTA_DIR>/<runtime>/<platform>/
//   <updateId>/manifest.json + files/…      one published update
//   current.json                            { id } or { id: null } after a full rollback
//   history.json                            [{ id, createdAt, message }] newest first

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type Platform = "ios" | "android";

export interface OtaAsset {
  /** Path inside the export ("_expo/static/js/ios/index-….hbc", "assets/…"). */
  path: string;
  /** ".hbc", ".png" … */
  ext: string;
  contentType: string;
  /** SHA-256, base64url: what expo-updates checks the download against. */
  hash: string;
  /** MD5 hex: the asset's key. */
  key: string;
}

export interface OtaUpdate {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  platform: Platform;
  message: string;
  launchAsset: OtaAsset;
  assets: OtaAsset[];
  /** The public app config (`expo config --type public`), so Constants.expoConfig works in the update. */
  expoClient: Record<string, unknown>;
}

const RUNTIME = /^\d+\.\d+\.\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class OtaError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export function otaDir(): string {
  return process.env["OTA_DIR"]
    ?? path.join(process.env["LOCAL_STORAGE_PRIVATE_DIR"] ?? path.join(process.cwd(), "data"), "ota");
}

export function checkTarget(runtime: unknown, platform: unknown): { runtime: string; platform: Platform } {
  if (typeof runtime !== "string" || !RUNTIME.test(runtime)) throw new OtaError(400, "bad_runtime");
  if (platform !== "ios" && platform !== "android") throw new OtaError(400, "bad_platform");
  return { runtime, platform };
}

export function checkId(id: unknown): string {
  if (typeof id !== "string" || !UUID.test(id)) throw new OtaError(400, "bad_update_id");
  return id;
}

/** A path inside an export: no "..", no absolute paths, sane characters only. */
export function safeAssetPath(p: unknown): string {
  if (typeof p !== "string" || p.length === 0 || p.length > 300) throw new OtaError(400, "bad_path");
  const norm = path.posix.normalize(p);
  if (norm.startsWith("/") || norm.startsWith("..") || norm.includes("/../") || !/^[\w@.\-/]+$/.test(norm)) {
    throw new OtaError(400, "bad_path");
  }
  return norm;
}

const targetDir = (runtime: string, platform: Platform) => path.join(otaDir(), runtime, platform);
const updateDir = (runtime: string, platform: Platform, id: string) => path.join(targetDir(runtime, platform), id);

export function hashes(buf: Buffer): { hash: string; key: string } {
  return {
    hash: crypto.createHash("sha256").update(buf).digest("base64url"),
    key: crypto.createHash("md5").update(buf).digest("hex"),
  };
}

export const CONTENT_TYPES: Record<string, string> = {
  ".hbc": "application/javascript", ".js": "application/javascript", ".bundle": "application/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".ttf": "font/ttf", ".otf": "font/otf", ".json": "application/json", ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4",
};

/** Store one uploaded file of an update that is being published. */
export async function saveFile(runtime: string, platform: Platform, id: string, assetPath: string, body: Buffer): Promise<void> {
  const file = path.join(updateDir(runtime, platform, id), "files", assetPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body);
}

export async function readFile(runtime: string, platform: Platform, id: string, assetPath: string): Promise<Buffer> {
  try {
    return await fs.readFile(path.join(updateDir(runtime, platform, id), "files", assetPath));
  } catch {
    throw new OtaError(404, "not_found");
  }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/**
 * Seal an uploaded update: check every file arrived, compute the hashes, and make
 * it the current update for this runtime and platform.
 */
export async function finishUpdate(input: {
  runtime: string; platform: Platform; id: string; message: string;
  launchAsset: string; assets: { path: string; ext: string }[]; expoClient: Record<string, unknown>;
}, now = new Date()): Promise<OtaUpdate> {
  const describe = async (p: string, ext: string): Promise<OtaAsset> => {
    const safe = safeAssetPath(p);
    const buf = await readFile(input.runtime, input.platform, input.id, safe).catch(() => {
      throw new OtaError(400, `missing_file:${safe}`);
    });
    const e = ext.startsWith(".") ? ext : `.${ext}`;
    return { path: safe, ext: e, contentType: CONTENT_TYPES[e.toLowerCase()] ?? "application/octet-stream", ...hashes(buf) };
  };
  const update: OtaUpdate = {
    id: input.id,
    createdAt: now.toISOString(),
    runtimeVersion: input.runtime,
    platform: input.platform,
    message: input.message.slice(0, 200),
    launchAsset: { ...(await describe(input.launchAsset, ".bundle")), contentType: "application/javascript" },
    assets: await Promise.all(input.assets.map((a) => describe(a.path, a.ext))),
    expoClient: input.expoClient,
  };
  const dir = targetDir(input.runtime, input.platform);
  await fs.writeFile(path.join(updateDir(input.runtime, input.platform, input.id), "manifest.json"), JSON.stringify(update));
  const history = await readJson<{ id: string; createdAt: string; message: string }[]>(path.join(dir, "history.json"), []);
  await fs.writeFile(path.join(dir, "history.json"), JSON.stringify([
    { id: update.id, createdAt: update.createdAt, message: update.message },
    ...history.filter((h) => h.id !== update.id),
  ].slice(0, 50)));
  await fs.writeFile(path.join(dir, "current.json"), JSON.stringify({ id: update.id }));
  return update;
}

export async function currentUpdate(runtime: string, platform: Platform): Promise<OtaUpdate | null> {
  const cur = await readJson<{ id: string | null }>(path.join(targetDir(runtime, platform), "current.json"), { id: null });
  if (!cur.id) return null;
  return readJson<OtaUpdate | null>(path.join(updateDir(runtime, platform, cur.id), "manifest.json"), null);
}

/** Back to the update before the current one, or to the code built into the app when there is none. */
export async function rollback(runtime: string, platform: Platform): Promise<{ id: string | null }> {
  const dir = targetDir(runtime, platform);
  const cur = await readJson<{ id: string | null }>(path.join(dir, "current.json"), { id: null });
  const history = await readJson<{ id: string }[]>(path.join(dir, "history.json"), []);
  const i = history.findIndex((h) => h.id === cur.id);
  const prev = i >= 0 ? history[i + 1]?.id ?? null : null;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "current.json"), JSON.stringify({ id: prev }));
  return { id: prev };
}

/** Everything published, for the admin dashboard. */
export async function listUpdates(): Promise<{ runtime: string; platform: Platform; currentId: string | null; history: { id: string; createdAt: string; message: string }[] }[]> {
  const out: Awaited<ReturnType<typeof listUpdates>> = [];
  const runtimes = await fs.readdir(otaDir()).catch(() => [] as string[]);
  for (const runtime of runtimes.filter((r) => RUNTIME.test(r)).sort().reverse()) {
    for (const platform of ["ios", "android"] as Platform[]) {
      const dir = targetDir(runtime, platform);
      const history = await readJson<{ id: string; createdAt: string; message: string }[]>(path.join(dir, "history.json"), []);
      if (history.length === 0) continue;
      const cur = await readJson<{ id: string | null }>(path.join(dir, "current.json"), { id: null });
      out.push({ runtime, platform, currentId: cur.id, history });
    }
  }
  return out;
}

/** The expo-updates manifest for an update; `assetUrl` builds each file's download address. */
export function manifestFor(u: OtaUpdate, assetUrl: (a: OtaAsset) => string): Record<string, unknown> {
  const asset = (a: OtaAsset) => ({ hash: a.hash, key: a.key, contentType: a.contentType, fileExtension: a.ext, url: assetUrl(a) });
  return {
    id: u.id,
    createdAt: u.createdAt,
    runtimeVersion: u.runtimeVersion,
    launchAsset: asset(u.launchAsset),
    assets: u.assets.map(asset),
    metadata: {},
    extra: { expoClient: u.expoClient },
  };
}

/** A multipart/mixed body with named JSON parts, as expo-updates expects. */
export function multipart(parts: { name: string; json: unknown }[]): { body: string; contentType: string } {
  const boundary = `zaboni-${crypto.randomBytes(12).toString("hex")}`;
  const body = parts.map((p) =>
    `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${JSON.stringify(p.json)}\r\n`,
  ).join("") + `--${boundary}--\r\n`;
  return { body, contentType: `multipart/mixed; boundary=${boundary}` };
}
