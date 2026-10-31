# Zaboni · زبوني

[![Quality](https://github.com/adnan295/zaboni/actions/workflows/api-quality.yml/badge.svg)](https://github.com/adnan295/zaboni/actions/workflows/api-quality.yml)

**Food and errand delivery for Homs, Syria.** Customers order from local restaurants, or describe anything
they need from any shop ("errand"), and follow the courier live on a map to their door. Couriers receive
nearby orders, deliver, and track earnings in the same app. Operators run everything from a web dashboard;
restaurants manage their own menus and orders in a portal.

- Website: [zaboni.site](https://zaboni.site) · Direct Android download: [zaboni.site/download](https://zaboni.site/download)
- iOS: [App Store](https://apps.apple.com/app/zaboni/id6763415681) · Android: [Google Play](https://play.google.com/store/apps/details?id=com.zaboni.delivery)

## What's in this repository

| Part | Path | Stack | Size* |
|---|---|---|---|
| Mobile app (customer + courier, iOS & Android) | `artifacts/marsool` | Expo / React Native, TypeScript | ~24.5k lines |
| Backend API + real-time server | `artifacts/api-server` | Node.js, Express 5, Socket.IO, TypeScript | ~18k lines, 294 endpoints |
| Admin dashboard | `artifacts/admin` | React, Vite, TanStack Query, Tailwind | ~18.6k lines |
| Restaurant portal | `artifacts/restaurant-portal` | React, Vite | ~10.2k lines |
| Database schema & migrations | `lib/db` | PostgreSQL, Drizzle ORM | 51 tables |
| Website, landing & legal pages | `artifacts/marsool/server`, `artifacts/zaboni-web` | Static HTML / React | |
| Release automation | `.github/workflows`, `fastlane`, `ci` | GitHub Actions, fastlane | |

<sub>*TypeScript source only, excluding tests and generated code.</sub>

## Architecture

```
 iOS / Android app ──┐                         ┌── PostgreSQL
 Admin dashboard  ───┼─▶ Cloudflare ─▶ nginx ─▶│   API server (Express + Socket.IO)
 Restaurant portal ──┤                         │     ├─ order dispatch to nearest couriers
 Website / download ─┘                         │     ├─ push: FCM, APNs, Expo (with fallbacks)
                                               │     ├─ OTP login via WhatsApp (multi-number failover) / SMS
                                               │     └─ background jobs: dispatch retries, stuck-order
                                               │        alerts, crash grouping, APK mirroring
                                               └── Object storage (images)
```

Everything runs as Docker containers (`docker-compose.yml`) on one VPS behind Cloudflare.
See [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Key capabilities

- **Ordering:** restaurant menus with options and deals; free-text errands; server-side price calculation;
  distance-based delivery fees and coverage areas; promo codes; loyalty points; referrals.
- **Dispatch:** proximity-based offers to online couriers, automatic widening and retries, live courier
  location, customer ↔ courier chat, ratings both ways.
- **Operations:** live dashboard, stuck-order and WhatsApp-health alerts, cancellation and fraud analysis,
  courier subscriptions and performance, app crash monitoring with WhatsApp alerts.
- **Distribution:** automated iOS and Android store releases; a Google-signed direct APK served from our own
  domain for users who can't reach Google Play.

## Running locally

Requirements: Node.js 22+, pnpm 10, PostgreSQL.

```bash
pnpm install
cp artifacts/api-server/.env.example artifacts/api-server/.env   # set DATABASE_URL, JWT_SECRET, ADMIN_SECRET
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/admin run dev
pnpm --filter @workspace/marsool run dev                          # Expo
```

## Quality

- `pnpm run typecheck` — strict TypeScript across every app and library.
- `pnpm --filter @workspace/api-server test` — API test suite (real PostgreSQL semantics via PGlite): order
  lifecycle, dispatch, payments/points ledger, notifications, security hardening.
- Both run in CI on every push.

## Documentation

| Document | Contents |
|---|---|
| [`docs/TECHNICAL_DUE_DILIGENCE.md`](docs/TECHNICAL_DUE_DILIGENCE.md) | Technical summary, security review, known limitations and roadmap |
| [`docs/PRODUCT_OVERVIEW.md`](docs/PRODUCT_OVERVIEW.md) | Full feature list per app |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Server setup and operations |
| [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) | Threat model |
| [`docs/github-mobile-releases.md`](docs/github-mobile-releases.md) | Store release pipelines |

## License

Proprietary and confidential — see [`LICENSE`](LICENSE). All rights reserved.
