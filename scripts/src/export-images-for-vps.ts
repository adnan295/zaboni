/**
 * One-off migration helper: downloads every image referenced in the
 * production database (restaurants, menu_items, restaurant_categories,
 * promo_images, users.avatar_url) from Replit Object Storage (GCS) and
 * writes them to ./export-images/uploads/<uuid> (+ .meta.json sidecars),
 * matching the layout expected by LOCAL_STORAGE_PUBLIC_DIR on a
 * STORAGE_MODE=local VPS deployment.
 *
 * Resumable: already-downloaded files (with a matching .meta.json) are
 * skipped, so it is safe to re-run after a partial/interrupted run.
 *
 * Usage: PRODUCTION_DATABASE_URL=... PUBLIC_OBJECT_SEARCH_PATHS=... tsx ./src/export-images-for-vps.ts
 */
import { Client } from "pg";
import { Storage } from "@google-cloud/storage";
import { promises as fs } from "fs";
import path from "path";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const CONCURRENCY = 25;

const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function parseObjectPath(p: string): { bucketName: string; objectName: string } {
  if (!p.startsWith("/")) p = `/${p}`;
  const parts = p.split("/");
  const bucketName = parts[1];
  const objectName = parts.slice(2).join("/");
  return { bucketName, objectName };
}

function extractUploadsRelPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/uploads\/[A-Za-z0-9-]+/);
  return match ? match[0] : null;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const dbUrl = process.env.PRODUCTION_DATABASE_URL;
  if (!dbUrl) {
    console.error("PRODUCTION_DATABASE_URL env var is required");
    process.exit(1);
  }

  const publicPathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
  const publicPaths = publicPathsStr.split(",").map((s) => s.trim()).filter(Boolean);
  if (publicPaths.length === 0) {
    console.error("PUBLIC_OBJECT_SEARCH_PATHS env var is required");
    process.exit(1);
  }
  const baseDir = publicPaths[0];

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const relPaths = new Set<string>();

  const queries: Array<{ sql: string; col: string }> = [
    { sql: "SELECT image AS v FROM restaurants", col: "v" },
    { sql: "SELECT image AS v FROM menu_items", col: "v" },
    { sql: "SELECT image_url AS v FROM restaurant_categories", col: "v" },
    { sql: "SELECT food_image_url AS v FROM promo_images", col: "v" },
    { sql: "SELECT avatar_url AS v FROM users", col: "v" },
  ];

  for (const q of queries) {
    const res = await client.query(q.sql);
    for (const row of res.rows) {
      const rel = extractUploadsRelPath(row[q.col]);
      if (rel) relPaths.add(rel);
    }
  }

  await client.end();

  const all = Array.from(relPaths);
  console.log(`Found ${all.length} unique image objects to export`);

  const outDir = path.resolve(process.cwd(), "export-images");
  await fs.mkdir(outDir, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;
  let processed = 0;

  async function processOne(relPath: string) {
    const localPath = path.join(outDir, relPath);
    const metaPath = `${localPath}.meta.json`;

    if (await fileExists(metaPath)) {
      skipped++;
      processed++;
      return;
    }

    const fullPath = `${baseDir}/${relPath}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    try {
      const [metadata] = await file.getMetadata();
      const contentType = (metadata.contentType as string | undefined) ?? "image/jpeg";
      const [buffer] = await file.download();

      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, buffer);
      await fs.writeFile(
        metaPath,
        JSON.stringify({ contentType, acl: { owner: "migration", visibility: "public" } }),
      );
      downloaded++;
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 404) {
        missing++;
      } else {
        failed++;
        console.error(`FAILED: ${relPath}: ${(err as Error).message}`);
      }
    } finally {
      processed++;
      if (processed % 200 === 0) {
        console.log(`  progress: ${processed}/${all.length} (downloaded=${downloaded} skipped=${skipped} missing=${missing} failed=${failed})`);
      }
    }
  }

  let cursor = 0;
  async function worker() {
    while (cursor < all.length) {
      const idx = cursor++;
      await processOne(all[idx]);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(
    `\nDone. downloaded=${downloaded} skipped(already had)=${skipped} missing=${missing} failed=${failed} total=${all.length}`,
  );
  console.log(`Files written to: ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
