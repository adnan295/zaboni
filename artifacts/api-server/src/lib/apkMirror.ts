// Direct-download Android app for people who can't reach Google Play (Syria).
//
// The "Zaboni Android → direct-download APK" workflow publishes the
// Google-signed universal APK of each Play version as a GitHub release
// (tag android-apk-<versionCode>, assets zaboni-<version>.apk + zaboni-apk.json).
// This server mirrors the newest one onto its own storage volume, so users
// download it from zaboni.site and never have to reach GitHub or Google.

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { logger } from "./logger";

export interface ApkInfo {
  version: string;
  versionCode: number;
  size: number;
  sha256: string;
  file: string;
  syncedAt: string;
}

const REPO = process.env["APK_GITHUB_REPO"] ?? "adnan295/zaboni";
const SYNC_EVERY_MS = 30 * 60_000;
const TAG = /^android-apk-(\d+)$/;

export function apkDir(): string {
  return process.env["APK_DIR"] ?? "/data/storage/public/apk";
}

let current: ApkInfo | null = null;
let syncing: Promise<ApkInfo | null> | null = null;

export async function getApkInfo(): Promise<ApkInfo | null> {
  if (current) return current;
  try {
    current = JSON.parse(await readFile(path.join(apkDir(), "current.json"), "utf8")) as ApkInfo;
    await stat(path.join(apkDir(), current.file));
    return current;
  } catch {
    current = null;
    return null;
  }
}

export function apkFilePath(info: ApkInfo): string {
  return path.join(apkDir(), info.file);
}

type Release = { tag_name: string; draft: boolean; assets: { name: string; browser_download_url: string; size: number }[] };

async function gh<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "zaboni-apk-mirror" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`);
  return (await res.json()) as T;
}

/** Fetches the newest released APK if it is newer than the mirrored one. */
async function doSync(): Promise<ApkInfo | null> {
  const releases = await gh<Release[]>(`https://api.github.com/repos/${REPO}/releases?per_page=30`);
  const candidates = releases
    .filter((r) => !r.draft && TAG.test(r.tag_name))
    .map((r) => ({ r, code: Number(TAG.exec(r.tag_name)![1]) }))
    .sort((a, b) => b.code - a.code);
  const newest = candidates[0];
  if (!newest) return getApkInfo();

  const have = await getApkInfo();
  if (have && have.versionCode >= newest.code) return have;

  const metaAsset = newest.r.assets.find((a) => a.name === "zaboni-apk.json");
  if (!metaAsset) throw new Error(`${newest.r.tag_name} has no zaboni-apk.json`);
  const meta = await gh<Omit<ApkInfo, "syncedAt">>(metaAsset.browser_download_url);
  if (!/^zaboni-\d+\.\d+\.\d+\.apk$/.test(meta.file) || meta.versionCode !== newest.code) {
    throw new Error(`${newest.r.tag_name} has unexpected metadata`);
  }
  const apkAsset = newest.r.assets.find((a) => a.name === meta.file);
  if (!apkAsset) throw new Error(`${newest.r.tag_name} has no ${meta.file}`);

  const dir = apkDir();
  await mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${meta.file}.part`);
  const res = await fetch(apkAsset.browser_download_url, {
    headers: { "User-Agent": "zaboni-apk-mirror" },
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!res.ok || !res.body) throw new Error(`APK download failed: ${res.status}`);
  const hash = createHash("sha256");
  let size = 0;
  try {
    await pipeline(
      Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
      async function* (src) {
        for await (const chunk of src) {
          hash.update(chunk as Buffer);
          size += (chunk as Buffer).length;
          yield chunk;
        }
      },
      createWriteStream(tmp),
    );
    const sha256 = hash.digest("hex");
    if (size !== meta.size || sha256 !== meta.sha256) {
      throw new Error(`APK integrity check failed (size ${size}/${meta.size})`);
    }
    await rename(tmp, path.join(dir, meta.file));
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }

  const info: ApkInfo = { ...meta, syncedAt: new Date().toISOString() };
  await writeFile(path.join(dir, "current.json.tmp"), JSON.stringify(info));
  await rename(path.join(dir, "current.json.tmp"), path.join(dir, "current.json"));
  current = info;
  // Keep only the APK being served.
  for (const name of await readdir(dir)) {
    if (name.endsWith(".apk") && name !== info.file) await rm(path.join(dir, name), { force: true });
  }
  logger.info({ version: info.version, versionCode: info.versionCode, size }, "[apk] mirrored new direct-download APK");
  return info;
}

export function syncApk(): Promise<ApkInfo | null> {
  if (!syncing) {
    syncing = doSync().finally(() => { syncing = null; });
  }
  return syncing;
}

export function startApkMirrorJob(): void {
  const run = () => void syncApk().catch((err) => logger.warn({ err }, "[apk] mirror sync failed"));
  run();
  setInterval(run, SYNC_EVERY_MS).unref();
}
