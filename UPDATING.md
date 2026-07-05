# Deploying app changes on the VPS (Docker)

Quick runbook for updating **zaboni.app** after you push changes to the repo.
Everything runs from the repo root:

```bash
cd /www/wwwroot/zaboni
```

## The standard update (do this every time)

```bash
git pull
docker compose build
docker compose up -d
```

That's it. `build` rebuilds the images with the new code, `up -d` swaps the
running containers to the new images. The database and uploaded images are
NOT touched by this (they live outside the containers, see below).

> ⚠️ **Never use `docker compose restart` to deploy.** It restarts the OLD
> image and silently serves stale code. Always `build` + `up -d`.

Building everything takes roughly 5–10 minutes on this 2-CPU VPS. If you
know what changed, build only that service (faster):

| What you changed | Command |
|---|---|
| API server code (`artifacts/api-server`, `lib/…`) | `docker compose build api-server && docker compose up -d` |
| Admin panel / legal pages / restaurant portal | `docker compose build web && docker compose up -d` |
| Mobile app (`artifacts/marsool`) — landing page or the Expo bundles it serves | `docker compose build marsool && docker compose up -d` |
| Only `.env` values | `docker compose up -d` (no build needed) |
| `docker/nginx.conf` routing | `docker compose build web && docker compose up -d` |

Notes:
- The three SPAs (admin, zaboni-web, restaurant-portal) are all baked into
  the `web` image — rebuilding `web` rebuilds all three.
- The `marsool` image bakes the domain (`zaboni.app`) into the Expo bundle
  URLs at build time, and runs Metro during the build — it's the slowest
  image (~3–4 min). Rebuild it when the mobile app code changes.
- Database schema: the api-server runs its own idempotent migrations on
  every start — no manual migration step.

## Verify after deploying

```bash
docker compose ps                          # api-server should show (healthy)
curl -I https://zaboni.app/api/healthz     # 200
curl -I https://zaboni.app/                # 200 (landing page)
curl -I https://zaboni.app/admin/          # 200
docker compose logs --tail 50 api-server   # look for "Server listening"
```

## What lives where (don't delete these)

| Thing | Location | In git? |
|---|---|---|
| Secrets / config | `/www/wwwroot/zaboni/.env` | ❌ server-only |
| DB + storage wiring | `/www/wwwroot/zaboni/docker-compose.override.yml` | ❌ server-only, **load-bearing** |
| Uploaded images | `/www/wwwroot/zaboni/storage/public/uploads/` (bind-mounted into api-server) | ❌ server-only — back it up |
| Database | Host PostgreSQL 18 (aaPanel install, port 5432, db `marsool_db`) | ❌ — back it up |
| HTTPS cert | Let's Encrypt via certbot, auto-renews (`certbot.timer`) | ❌ automatic |
| Public nginx | `/etc/nginx/conf.d/zaboni.app.conf` → proxies to `127.0.0.1:8090` | ❌ server-only |

`git pull` will never overwrite those, and `docker compose build` never
touches the DB or images.

## If something goes wrong

```bash
docker compose logs --tail 100 api-server   # API errors, DB connection issues
docker compose logs --tail 50 web marsool   # routing / landing page issues
docker compose ps                           # anything restarting/unhealthy?
```

- **Site serves old code after deploy** → someone ran `restart` instead of
  `build` + `up -d`. Run the standard update again.
- **DB connection errors** → host Postgres must be running:
  `systemctl status pgsql` (it listens on `172.17.0.1:5432` for containers).
- **Build killed / out of memory** → build one service at a time
  (`build api-server`, then `build web`, then `build marsool`).
- **Roll back** → `git log` to find the previous commit, `git checkout <sha>`,
  then the standard `build` + `up -d`, and `git checkout main` when done
  investigating.
