// Publishes an `expo export` of the app as an over-the-air update to our own
// server (api-server routes/ota.ts). Run by the «Zaboni OTA update» workflow.
//
//   OTA_URL            https://zaboni.site
//   OTA_PUBLISH_TOKEN  the same secret the server has
//   RELEASE_VERSION    the store version the update is for (its runtime version)
//   OTA_PLATFORMS      "ios,android" (default)
//   OTA_MESSAGE        what changed, shown in the admin dashboard
//   OTA_DIST           the export folder (default artifacts/marsool/dist-ota)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const need = (k) => { const v = process.env[k]; if (!v) throw new Error(`${k} is required`); return v; };
const base = need('OTA_URL').replace(/\/+$/, '');
const token = need('OTA_PUBLISH_TOKEN');
const runtime = need('RELEASE_VERSION');
if (!/^\d+\.\d+\.\d+$/.test(runtime)) throw new Error('RELEASE_VERSION must be x.y.z');
const dist = process.env.OTA_DIST || 'artifacts/marsool/dist-ota';
const platforms = (process.env.OTA_PLATFORMS || 'ios,android').split(',').map((p) => p.trim()).filter(Boolean);
const message = (process.env.OTA_MESSAGE || '').slice(0, 200);

const metadata = JSON.parse(fs.readFileSync(path.join(dist, 'metadata.json'), 'utf8'));
const expoClient = JSON.parse(fs.readFileSync(path.join(dist, 'expoConfig.json'), 'utf8'));

async function post(url, body, contentType) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': contentType }, body });
    if (res.ok) return res.json();
    const text = await res.text();
    if (attempt >= 3 || res.status < 500) throw new Error(`${res.status} ${url}: ${text}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

for (const platform of platforms) {
  const meta = metadata.fileMetadata?.[platform];
  if (!meta) throw new Error(`The export has no ${platform} bundle`);
  const id = crypto.randomUUID();
  const target = `${base}/api/ota/publish/${runtime}/${platform}/${id}`;
  const files = [meta.bundle, ...meta.assets.map((a) => a.path)];
  for (const file of [...new Set(files)]) {
    await post(`${target}/file?path=${encodeURIComponent(file)}`, fs.readFileSync(path.join(dist, file)), 'application/octet-stream');
  }
  const done = await post(`${target}/finish`, JSON.stringify({
    message, launchAsset: meta.bundle, assets: meta.assets.map((a) => ({ path: a.path, ext: a.ext })), expoClient,
  }), 'application/json');
  console.log(`Published ${platform} update ${done.id} for ${runtime} (${done.assets} assets)`);
}
