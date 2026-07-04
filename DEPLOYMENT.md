# Deploying Zaboni/Marsool with Docker on an aaPanel VPS

This guide walks through deploying the API server and the three web
artifacts (admin panel, zaboni-web legal pages, restaurant portal) to a
Hostinger (or any) VPS managed with aaPanel, using Docker instead of the
PM2-based approach. It also covers migrating your existing production
database and uploaded images into the new setup so the app works "from the
first time" with all your real data.

The Expo mobile app (`marsool`) is **not** part of this Docker setup — it is
shipped separately via EAS/Play Store/App Store (see `replit.md`). Once the
API is live on your VPS, point the mobile app at it by setting
`EXPO_PUBLIC_API_HOST` to your domain (e.g. `https://api.yourdomain.com` or
`https://yourdomain.com` if you're not using a subdomain — see the routing
section below) before your next EAS build/OTA update.

## What gets built

| Container    | What it serves                                                | Exposed to host |
|--------------|-----------------------------------------------------------------|------------------|
| `postgres`   | PostgreSQL 16 database, data persisted in a Docker volume       | no (internal only) |
| `api-server` | Express 5 + Socket.IO API (esbuild bundle), reads/writes Postgres and local-disk object storage | no (internal only) |
| `web`        | nginx serving the 3 built SPAs + reverse-proxying `/api`, `/support`, `/privacy`, `/delete-my-account` to `api-server` | `127.0.0.1:8090` |

Only `web` is exposed on the host (bound to `127.0.0.1` only), and aaPanel's
own nginx (or a dedicated site) reverse-proxies your public domain to it.
This mirrors the structure of the earlier PM2 deployment but with everything
built from source inside Docker, so **you can never accidentally run a stale
build again** — `docker compose up -d --build` always rebuilds from the
current source before starting.

## 0. Prerequisites

- A VPS with aaPanel installed, and the **Docker Manager** plugin installed
  and enabled from the aaPanel App Store.
- A domain (or subdomain) pointed at the VPS's IP address.
- Your existing Replit deployment's `PRODUCTION_DATABASE_URL` (from Replit's
  Secrets) — needed only for the one-time data/image migration in step 4.
  Treat it as a secret and delete it from the VPS once the migration is done.

## 1. Get the code onto the VPS

SSH into the VPS (aaPanel exposes an SSH terminal, or use your own SSH
client):

```bash
mkdir -p /www/wwwroot/zaboni && cd /www/wwwroot/zaboni
git clone <your-repo-url> .
```

If you don't use git on the VPS, upload the repo as a zip via aaPanel's File
Manager and extract it into `/www/wwwroot/zaboni` instead.

## 2. Configure environment variables

```bash
cp .env.docker.example .env
nano .env   # or use aaPanel's File Manager editor
```

Fill in, at minimum:

- `POSTGRES_PASSWORD` — pick a strong random password (this also becomes
  part of the auto-built `DATABASE_URL` for `api-server`; you don't need to
  set `DATABASE_URL` yourself unless you're using an external Postgres).
- `JWT_SECRET` — generate with `openssl rand -hex 32`. This must be a new
  value distinct from the one used on Replit (rotating it invalidates all
  existing user sessions/JWTs, which is expected on a fresh deployment).
- `ADMIN_SECRET` — the bearer token protecting `/api/admin/*`. Reuse the
  same value your admin panel already expects, or pick a new strong secret
  and update wherever the admin panel/app stores it.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — for web push; generate with
  `pnpx web-push generate-vapid-keys` if you don't already have a pair.
- `FIREBASE_*` and `APN_*` — copy these from your existing Replit secrets if
  you want native push (FCM/APNs) to keep working; otherwise leave blank and
  those channels auto-disable (Expo push keeps working either way).
- `WAVERIFY_API_KEY`, `ADMIN_ALERT_WEBHOOK_URL`, `APPLE_REVIEW_PHONE` —
  optional, copy from Replit secrets if you use them.

`STORAGE_MODE=local` and the `LOCAL_STORAGE_PUBLIC_DIR` /
`LOCAL_STORAGE_PRIVATE_DIR` paths are already wired up in
`docker-compose.yml` to Docker named volumes (`storage-public`,
`storage-private`) — you don't need to change these unless you want images
to live on a specific host path instead of a Docker-managed volume.

## 3. First-time build and startup

From `/www/wwwroot/zaboni` (the repo root, where `docker-compose.yml`
lives):

```bash
docker compose up -d --build
docker compose ps        # all three services should show healthy/running
docker compose logs -f api-server   # watch startup logs, Ctrl+C to stop tailing
```

The API server logs `"Server listening"` once it's up. At this point the
app is running with an **empty** database — the next two steps push the
schema and your real data into it.

## 4. Create the schema, then migrate your production data

### 4a. Push the schema

Run `drizzle-kit push` against the new container's Postgres. Easiest way is
from inside the `api-server` container, which already has the full
workspace and `DATABASE_URL` configured:

```bash
docker compose exec api-server pnpm --filter @workspace/db run push
```

Answer any interactive prompts with the default (create table) since the
database is empty. This creates every table in `lib/db/src/schema/`. The
app's own startup-time migrations (in `artifacts/api-server/src/index.ts`,
~25 idempotent `add-*`/`backfill-*` functions) already ran once on
container start and will re-run safely on every future restart, so you
don't need to run them manually — they just fill in any schema pieces added
after the initial `drizzle-kit push` baseline.

### 4b. Migrate the database contents (data)

From your **local machine** (or anywhere with network access to both the
old Replit Postgres and the new VPS), dump the old database and restore it
into the new container. Do this only once, right after step 4a, before real
traffic hits the new deployment:

```bash
# 1. Dump the existing production database (run wherever you have
#    PRODUCTION_DATABASE_URL available, e.g. your local dev shell)
pg_dump "$PRODUCTION_DATABASE_URL" --no-owner --no-privileges -Fc -f zaboni-prod.dump

# 2. Copy the dump to the VPS
scp zaboni-prod.dump user@your-vps:/www/wwwroot/zaboni/

# 3. On the VPS: restore it into the postgres container.
#    --clean drops the empty tables from step 4a first so the restore is exact.
cd /www/wwwroot/zaboni
docker compose exec -T postgres pg_restore \
  -U "$(grep ^POSTGRES_USER .env | cut -d= -f2)" \
  -d "$(grep ^POSTGRES_DB .env | cut -d= -f2)" \
  --clean --if-exists --no-owner --no-privileges \
  < zaboni-prod.dump

# 4. Clean up the dump file — it contains all production data.
rm zaboni-prod.dump
```

Restart the API server afterwards so it re-runs its startup migrations
against the freshly-restored schema:

```bash
docker compose restart api-server
```

### 4c. Migrate uploaded images

The existing helper script `scripts/src/export-images-for-vps.ts` downloads
every image referenced in the production database (restaurant/menu/category
images, promo banners, avatars) from Replit Object Storage into a local
`export-images/uploads/<uuid>` folder with `.meta.json` sidecars — exactly
the layout `LOCAL_STORAGE_PUBLIC_DIR` expects.

Run this from your **local machine** (or the Replit workspace shell, which
already has `PRODUCTION_DATABASE_URL` and the object-storage sidecar
available):

```bash
PUBLIC_OBJECT_SEARCH_PATHS=<same value used in your Replit deployment> \
  pnpm --filter @workspace/scripts run export-images-for-vps
```

This writes to `./export-images/uploads/`. Then copy that folder onto the
VPS and into the `storage-public` Docker volume:

```bash
# From your local machine: copy the exported folder to the VPS
scp -r export-images/uploads user@your-vps:/tmp/zaboni-uploads

# On the VPS: copy the files into the running api-server container's
# mounted public storage volume
docker cp /tmp/zaboni-uploads/. zaboni-api-server-1:/data/storage/public/uploads
rm -rf /tmp/zaboni-uploads
```

(If your container name differs, check it with `docker compose ps`.)

Reload any pages referencing images to confirm they now load from the new
VPS — e.g. `curl -I https://yourdomain.com/api/storage/public-objects/uploads/<uuid>`
should return `200`.

## 5. Point aaPanel's nginx at the `web` container

In aaPanel: **Website → Add site**, using your domain, with no PHP/backend
selected (static site is fine, since aaPanel's nginx is just a reverse
proxy here). Then edit that site's nginx config (aaPanel → Website → your
site → Config) and replace the `location /` block with:

```nginx
location / {
    proxy_pass http://127.0.0.1:8090;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 90s;
}
```

`8090` matches the port `web` is published on in `docker-compose.yml`
(`127.0.0.1:8090:80`) — change both if you edit that mapping.

Then enable **SSL** for the site from aaPanel's site settings (Let's
Encrypt, one click) so the domain serves over HTTPS.

## 6. Verify the deployment

```bash
curl -I https://yourdomain.com/api/healthz          # expect 200
curl -I https://yourdomain.com/admin/                # expect 200
curl -I https://yourdomain.com/zaboni-web/           # expect 200
curl -I https://yourdomain.com/restaurant-portal/    # expect 200
```

Then log into the admin panel with your `ADMIN_SECRET` and confirm your
restaurants/orders/couriers show up (proof the data migration worked), and
open a restaurant's menu to confirm images load (proof the image migration
worked).

Finally, update the mobile app's `EXPO_PUBLIC_API_HOST` (in
`artifacts/marsool/.env` for local builds, or as an EAS build/update secret
for production builds) to your new domain, and ship an EAS update or new
build so the app talks to the VPS instead of the old backend.

## 7. Updating the deployment later

**Always rebuild, never just restart** — this is the whole point of moving
to Docker. A `docker compose restart` reuses the already-built image, so
code changes without a rebuild will silently keep serving the old bundle
(exactly the stale-`dist/index.mjs` bug this migration was meant to avoid).

```bash
cd /www/wwwroot/zaboni
git pull
docker compose build
docker compose up -d
```

`docker compose up -d` recreates only the containers whose image actually
changed, so this is safe to run after every deploy.

## 8. Shipping a new feature / build

This is the day-to-day workflow once the app is live — every time you push
a code change (new feature, bug fix, config tweak) that should go live on
the VPS:

```bash
cd /www/wwwroot/zaboni
git pull
docker compose build
docker compose up -d
```

What each step does:

1. **`git pull`** brings the latest committed source onto the VPS. Nothing
   is live yet at this point — the running containers are still on the old
   code.
2. **`docker compose build`** rebuilds the Docker images from that new
   source: a fresh `pnpm install` plus the TypeScript/esbuild build for
   `api-server` and the Vite builds for `admin` / `zaboni-web` /
   `restaurant-portal`, baked into new images. The old images and running
   containers are untouched during this step, so the site stays up.
3. **`docker compose up -d`** swaps in the new images. Compose only
   recreates containers whose image actually changed — e.g. a
   frontend-only change rebuilds just the `web` container and leaves
   `api-server` and `postgres` running uninterrupted.

If the update includes a database schema change, run the schema push once
the containers are back up:

```bash
docker compose exec api-server pnpm --filter @workspace/db run push
```

**Never substitute `docker compose restart` for this.** Restart just
re-runs the existing image's startup command — it does not pick up new
source code, which is exactly the stale-bundle bug described in the
Troubleshooting section below.

**Verifying you're on the new code:**

```bash
docker compose exec api-server cat /repo/.git/HEAD   # only works if .git wasn't excluded from the build context
# or compare `docker images` creation timestamps against `git log -1`
```

**If this VPS also runs a second, non-Docker (PM2) project:** `docker
compose` only ever affects the containers defined in the
`docker-compose.yml` in your current directory — it has no visibility into
processes managed by PM2, and PM2 commands (`pm2 kill`, `pm2 restart`,
etc.) have no visibility into Docker containers. The two are fully isolated
at the OS level. The only things to double-check are that each project
listens on a different host port (this project's `web` container is
published on `127.0.0.1:8090` only) and that aaPanel's site-level nginx
routes each domain/subdomain to the correct project. Always run the
`docker compose` commands above from inside this project's directory so
you don't accidentally target the wrong `docker-compose.yml`.

## Troubleshooting

**Symptom: after deploying new code, the app still 401s / behaves like the
old version.**
You (or a script) ran `docker compose restart` instead of `docker compose
build && docker compose up -d`. Restarting a container just re-runs the
existing image's entrypoint — it does not pick up new source code. Always
rebuild after a `git pull`. To confirm which commit a running container was
built from: `docker compose exec api-server cat /repo/.git/HEAD` (only
works if `.git` wasn't excluded from the build context — otherwise compare
`docker images` creation timestamps against your last `git log`).

**Symptom: `docker compose exec api-server pnpm --filter @workspace/db run
push` fails with "DATABASE_URL must be set".**
The `api-server` container wasn't started with the compose file's env
wiring — make sure you're running the command from the same directory as
`docker-compose.yml` and that `.env` has `POSTGRES_PASSWORD` set (the
default `DATABASE_URL` is assembled from `POSTGRES_USER`/`PASSWORD`/`DB`).

**Symptom: images return 404 after migration.**
Check that `PUBLIC_OBJECT_SEARCH_PATHS` used for the export matched the
value from your original Replit deployment (mismatched paths mean the
script can't find the source files), and that the `docker cp` destination
path was exactly `/data/storage/public/uploads` (matching
`LOCAL_STORAGE_PUBLIC_DIR=/data/storage/public` from `.env`).

**Symptom: `docker compose up -d --build` runs out of memory on a small
VPS.**
The build stage runs a full `pnpm install` + TypeScript build for the whole
workspace, which can be memory-hungry on a 1-2 GB VPS. Add a swap file via
aaPanel (Files → Swap) or build the images on a beefier machine and push
them to a private registry instead of building on the VPS directly.

**Symptom: websocket features (live order tracking) don't update in
real time behind aaPanel's nginx.**
Make sure both the `web` container's `nginx.conf` (already included in this
repo, no changes needed) *and* aaPanel's site-level nginx config include the
`Upgrade`/`Connection "upgrade"` headers shown in step 5 above — Socket.IO's
`/api/socket.io` path needs the websocket upgrade to pass through both proxy
hops untouched.
