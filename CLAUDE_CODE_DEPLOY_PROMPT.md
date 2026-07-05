# Task: Deploy Zaboni/Marsool with Docker on this VPS

You are Claude Code running on my Hostinger Linux VPS over SSH. Deploy this
project end-to-end using Docker, entirely from the terminal (no control
panel). Work through the steps below in order, run the commands yourself,
read the output, and fix problems as they come up. Stop and ask me only if
you need a secret or a decision I haven't given you.

## Current state (already done — do NOT redo)

- Docker and `docker compose` are installed and working.
- The repository is already cloned and I am in the repo root (the folder
  that contains `docker-compose.yml`).
- I already have a **PostgreSQL database with all tables/data already
  created**, hosted externally. I will paste its connection string into
  `.env` as `DATABASE_URL`. Because of this:
  - Do **not** run any schema push (`drizzle-kit push`).
  - Do **not** run any data dump/restore/migration.
  - Do **not** rely on the bundled `postgres` container for real data.
- **DNS is already fully set up and verified.** The domain `zaboni.app` is
  managed on Replit and its `A` record already points at this VPS's IP
  (confirmed by ping). Do **not** touch, edit, or manage any DNS records, and
  do **not** run anything that would change them.

## What this project serves

- `api-server` — Express 5 + Socket.IO API.
- `web` — nginx serving 3 built SPAs (admin panel, zaboni-web legal pages,
  restaurant portal) and reverse-proxying `/api`, `/support`, `/privacy`,
  `/delete-my-account` to `api-server`. Published on the host at
  `127.0.0.1:8090` only.

A separate system nginx (installed via `apt`) will terminate HTTPS on my
public domain and proxy to `127.0.0.1:8090`.

## Steps

### 1. Inspect the repo before changing anything

Read `docker-compose.yml` and `.env.docker.example` and report back briefly:
which env vars are required, what services are defined, and whether
`DATABASE_URL` can be supplied externally to override the bundled `postgres`
container. Confirm how the `web` container port is published (expected:
`127.0.0.1:8090:80`).

### 2. Configure environment variables

```bash
cp .env.docker.example .env
```

Then edit `.env` and set:

- `DATABASE_URL` — **I will paste my external database connection string
  here.** Leave a clear placeholder and pause for me to fill it if it's not
  already set. This external DB already has the schema and data, so it is the
  source of truth.
- `JWT_SECRET` — generate a fresh one: `openssl rand -hex 32`.
- `ADMIN_SECRET` — the bearer token protecting `/api/admin/*`. Ask me for the
  value the admin panel already expects, or generate a strong one and tell me
  the value so I can update the panel/app.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — for web push. If I don't already
  have a pair, generate one: `pnpx web-push generate-vapid-keys`.
- `FIREBASE_*` and `APN_*` — leave blank unless I provide them (native
  FCM/APNs push auto-disables when blank; Expo push still works).
- `WAVERIFY_API_KEY`, `ADMIN_ALERT_WEBHOOK_URL`, `APPLE_REVIEW_PHONE` —
  optional; leave blank unless I provide them.

Since I'm using an external `DATABASE_URL`, the bundled `postgres`
container's data is irrelevant. If `docker-compose.yml` makes `api-server`
hard-depend on the `postgres` service, that's fine to leave as-is (an unused
idle container is harmless) — but do not run migrations against it and do
not treat it as the real database. If it's trivial and safe to disable the
`postgres` service so it doesn't run at all, propose that change to me first
before editing the compose file.

`STORAGE_MODE=local` and the `LOCAL_STORAGE_*` paths are already wired to
Docker named volumes in `docker-compose.yml` — leave them as-is.

### 3. Build and start

```bash
docker compose up -d --build
docker compose ps                    # services should show healthy/running
docker compose logs -f api-server    # wait for "Server listening", then Ctrl+C
```

The app's own idempotent startup migrations run automatically on container
start, so no manual schema step is needed — the external DB already has the
tables. If `api-server` logs a DB connection error, re-check `DATABASE_URL`
in `.env` (reachability from the container, SSL mode, credentials) and fix
it, then `docker compose up -d` again.

### 4. Point a system nginx at the `web` container

Install nginx + certbot if not already present:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

My domain is **`zaboni.app`**. Create the site config:

```bash
sudo nano /etc/nginx/sites-available/zaboni
```

```nginx
server {
    listen 80;
    server_name zaboni.app www.zaboni.app;

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
}
```

(`8090` must match the `web` container's published port — adjust both if
`docker-compose.yml` differs.)

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/zaboni /etc/nginx/sites-enabled/zaboni
sudo nginx -t
sudo systemctl reload nginx
```

**DNS is already fully configured — do NOT touch, change, or attempt to
manage any DNS records.** The domain is registered/managed on Replit and its
`A` record already points at this VPS's public IP (I confirmed it by
pinging). Do not run DNS-editing commands, do not use any registrar/Replit
API, and do not suggest DNS changes. Just issue the certificate:

```bash
sudo certbot --nginx -d zaboni.app -d www.zaboni.app
sudo systemctl status certbot.timer   # auto-renew should be active
```

If certbot fails validation only for `www.zaboni.app`, re-run with just
`-d zaboni.app` — but still make no DNS changes.

### 5. Verify

```bash
curl -I https://zaboni.app/api/healthz          # expect 200
curl -I https://zaboni.app/admin/                # expect 200
curl -I https://zaboni.app/zaboni-web/           # expect 200
curl -I https://zaboni.app/restaurant-portal/    # expect 200
```

Report the status codes back to me. Then remind me to log into the admin
panel with `ADMIN_SECRET` and confirm my restaurants/orders/couriers show up
(proof the external DB is wired correctly).

## Updating later (for reference — do not run now)

Always **rebuild**, never just restart:

```bash
git pull
docker compose build
docker compose up -d
```

`docker compose restart` reuses the old image and silently serves stale
code — never use it as a substitute for the rebuild above.

## Troubleshooting to watch for

- **App behaves like old code after a deploy:** someone ran `docker compose
  restart` instead of `build` + `up -d`. Rebuild.
- **`DATABASE_URL must be set` / DB connection errors:** confirm `.env` has a
  valid external `DATABASE_URL` and that the container can reach that host
  (network, SSL mode, credentials).
- **Build runs out of memory on a small VPS:** add swap —
  `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap
  /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' |
  sudo tee -a /etc/fstab`.
- **Websockets (live order tracking) don't update:** ensure the system nginx
  config includes the `Upgrade`/`Connection "upgrade"` headers (above) so
  Socket.IO's `/api/socket.io` upgrade passes through.
- **`bind() to 0.0.0.0:80 failed (address already in use)`:** another web
  server holds port 80/443. Find it with `sudo ss -tlnp | grep -E ':80|:443'`
  and stop it or serve both under the one system nginx via distinct
  `server_name`s.
