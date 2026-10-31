# Zaboni — Technical Due Diligence Summary

_Last updated: 31 October 2026_

## 1. At a glance

| | |
|---|---|
| Product | Food and errand delivery marketplace, Homs (Syria) |
| Clients | iOS + Android app (customer & courier roles), admin dashboard, restaurant portal, website |
| Backend | Node.js / TypeScript, Express 5, Socket.IO, PostgreSQL (Drizzle ORM) |
| Codebase | TypeScript monorepo (pnpm): ~74k lines of application code, 294 API endpoints, 51 database tables |
| Quality gates | Strict type-checking of every package + API test suite (104 tests) in CI on every push |
| Releases | Automated App Store / Google Play pipelines (GitHub Actions + fastlane); OTA updates via Expo |
| Hosting | Docker Compose on a single VPS behind Cloudflare |

## 2. Architecture

- **One API** serves every client. Business rules (prices, delivery fees, coverage, promo and points
  ledger, order state machine) are enforced server-side; clients never set prices.
- **Real-time:** one Socket.IO channel with rooms per user, role, restaurant and operators; a client
  joins only the rooms derived from its verified token.
- **Dispatch:** an order is offered to online couriers nearest to the pickup, with automatic widening,
  retries, and persisted diagnostics (eligible couriers, delivery receipts) per order.
- **Notifications:** native FCM and APNs with Expo push as fallback, delivery receipts checked.
- **Login:** phone OTP delivered via WhatsApp (several numbers with automatic failover) or SMS.
- **Data:** PostgreSQL with hand-written, idempotent migrations run at startup.

## 3. Engineering practices

- Strict TypeScript across all apps; shared API types generated from an OpenAPI spec.
- API tests run against real PostgreSQL semantics (PGlite): order lifecycle, concurrency (double
  accept, idempotent checkout), points ledger rollback, dispatch, notifications, security controls.
- Store releases, store screenshots, the direct-download APK and release notes are fully scripted.
- Operational tooling in the dashboard: live operations, stuck-order alerts, WhatsApp health,
  cancellation/fraud analysis, app crash grouping with WhatsApp alerts.

## 4. Security

A full review of the API, clients and infrastructure was completed on 31 October 2026. Findings and
status:

| Finding | Severity | Status |
|---|---|---|
| Client IP taken from a spoofable header → all rate limits bypassable | High | **Fixed** (verified on production before the fix) |
| Admin password could be guessed without limit via uploads/socket paths | High | **Fixed** (throttled at the single check all paths use) |
| Restaurant-portal password login had no rate limit; OTP used a weak RNG | High | **Fixed** |
| Storage path joins lacked a containment check (only nginx normalisation prevented traversal) | High | **Fixed** |
| One account could create unlimited orders (courier notification flooding) | Medium | **Fixed** (3 open / 10 per hour) |
| OTP flooding could get WhatsApp sender numbers banned | Medium | **Fixed** (global cap) |
| Vulnerable server dependencies (proxy-addr, body-parser, engine.io, undici, axios, sharp, …) | High | **Fixed** (patched versions) |

Verified as sound: server-side pricing; per-user scoping of orders, addresses, tickets and chats;
couriers see customer contact only after accepting; parameterised SQL everywhere; upload type/size
checks with magic-byte validation and re-encoding; no secrets in the repository or its history;
only web ports (80/443) exposed through the public domain.

## 5. Known limitations and roadmap

These are documented openly; none blocks operation.

| Area | Current state | Planned |
|---|---|---|
| Admin access | One shared admin password | Individual operator accounts with roles and session tokens |
| User sessions | 30-day tokens without server-side revocation | Token versioning to revoke on logout / phone change |
| Infrastructure | Single VPS; manual database backups | Automated daily off-site backups; restore drill; second instance |
| WhatsApp OTP | Uses an unofficial WhatsApp Web library | Move to the WhatsApp Business API when available in-market; SMS fallback exists |
| Test coverage | Strong on the API; no automated UI tests for the apps | Smoke tests for critical app flows |
| Code structure | Some large route files (admin API); legacy "marsool" naming in places | Split admin routes by domain; naming cleanup |
| Validation library | zod 3 (one low-impact DoS advisory, mitigated by 100 KB request limit) | Upgrade to zod 4 |

## 6. Third-party services

Apple App Store, Google Play, Firebase Cloud Messaging, Apple Push Notification service, Expo push,
Google Maps, Cloudflare, Hostinger (VPS), GitHub (code + CI), WhatsApp (OTP delivery).
