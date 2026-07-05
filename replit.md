# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `node_modules/.bin/tsx lib/db/src/seed.ts` — re-seed restaurants/menu data

## Marsool App (Expo/React Native)

Arabic RTL delivery app. Features:
- Auth flow (phone + OTP + name)
- Home screen: real restaurant data from PostgreSQL API
- Restaurant detail + menu (real data)
- Order flow: free-text order → real POST to API → mock courier assigned → status simulation
- Address management: CRUD via REST API, default address selection
- Search with filters, favorites, notifications, chat, order tracking

## Database Schema (`lib/db/src/schema/`)

- `restaurants` — restaurant info (name, nameAr, category, rating, delivery details)
- `menu_items` — menu items per restaurant (name, nameAr, price, image, category)
- `orders` — orders with status (searching → accepted → on_way → delivered), courier info
- `addresses` — user delivery addresses with default flag
- `promo_codes` — discount codes (percent/fixed, max_uses, expiry, isActive)
- `promo_uses` — tracks per-user promo code redemptions (promoId, userId, orderId)
- `restaurant_hours` — weekly schedules per restaurant (dayOfWeek 0-6, openTime, closeTime, isClosed)
- `notification_logs` — broadcast push notification history (title, body, target, sentCount, failedCount)
- `delivery_zones` — zone-based delivery pricing (id, label, fromKm, toKm, fee, isActive); admin-managed; courier keeps 100% of fee
- `courier_applications` — courier join requests (userId, status: pending/approved/rejected, fullName, vehicleType, vehiclePlate, idNumber, notes, adminNote)
- `work_zones` — admin-managed dispatch zones (id, name, nameAr, city, isActive). `users.zone_id` (couriers) and `restaurants.zone_id` are nullable FKs into this table. Unrelated to `delivery_zones` (distance-based fee table).

## Zone-Based Courier Dispatch (Task #388 — 2026-07-05)

Order dispatch matches couriers to orders by admin-assigned **work zone**, not GPS distance. Replaces the old tiered/radius-based `notifyNearbyCouriers`.

- On order creation, `notifyNearbyCouriers` (`artifacts/api-server/src/orders/server.ts`) broadcasts immediately (single notification, no tiering/delay) to every **online** courier whose `zoneId` matches the order's restaurant's `zoneId`. Errand orders (no `restaurantId`) broadcast to all online couriers regardless of zone.
- If the restaurant has no zone, or no couriers share that zone, no one is notified — no fallback/backfill guessing.
- `GET /api/courier/orders/available` filters by zone match instead of GPS radius/location-freshness; courier GPS is no longer required to see or receive orders (still used for live tracking during an active delivery).
- `POST /api/courier/orders/:id/accept` gates on zone match plus the existing atomic `WHERE status = 'searching'` conditional update (first-accept-wins, unchanged).
- Admin manages zones on the **Work Zones** page (`artifacts/admin/src/pages/WorkZones.tsx`, full CRUD; deleting a zone nulls `zoneId` on affected users/restaurants in a transaction). Zone assignment also available on the Restaurants form, Couriers list, and the Courier Applications approval action (`PATCH /admin/couriers/:id/zone`, `PATCH /admin/courier-applications/:id/approve` with optional `zoneId`).
- Existing couriers/restaurants have `zoneId = null` after this ships — no automatic backfill. Admin must assign zones manually post-deploy or dispatch will silently notify no one for unassigned restaurants/couriers.

## Object Storage

Replit Object Storage is configured (bucket: `replit-objstore-55ff7d0a-e715-4d9a-b9aa-3d6d7ae80f97`).
- `POST /api/storage/uploads/request-url` — get presigned upload URL (public, no auth)
- `GET /api/storage/public-objects/*` — serve public assets
- `GET /api/storage/objects/*` — serve private objects

Admin panel uses `ImageUpload` component (`artifacts/admin/src/components/ImageUpload.tsx`) to upload images for restaurants and menu items. The component uses the two-step presigned URL flow: request URL → PUT file directly to GCS. Uploaded images are served via `/api/storage/objects/uploads/{uuid}`.

Library: `lib/object-storage-web/` — `useUpload` hook and `ObjectUploader` component (Uppy-based).
Server: `artifacts/api-server/src/lib/objectStorage.ts` — `ObjectStorageService` class.

### STORAGE_MODE (local-disk backend for self-hosted VPS deployments)

`ObjectStorageService` supports two backends, selected by the `STORAGE_MODE` env var:
- `STORAGE_MODE` unset or `gcs` (default) — Replit Object Storage sidecar. Unchanged Replit dev/prod behavior.
- `STORAGE_MODE=local` — stores files on local disk under `LOCAL_STORAGE_PUBLIC_DIR` / `LOCAL_STORAGE_PRIVATE_DIR` (both required in this mode). Intended for VPS deployments (e.g. Hostinger/aaPanel) that don't have the Replit sidecar available.

In local mode there is no presigned-URL equivalent, so uploads go through the app server itself: the request-url endpoint mints a short-lived (15 min) in-memory token and returns `/api/storage/local-upload/:token`; the client's PUT streams raw bytes to `artifacts/api-server/src/routes/storage.ts`, which writes them to disk. ACL/content-type per object is tracked in a sidecar `<file>.meta.json` (see `artifacts/api-server/src/lib/localStorageMeta.ts`) since local disk has no GCS-style object metadata.

The mobile app's `fetch(uploadURL)` requires an absolute URL (no page origin in React Native), so in local mode the request-url response builds the URL from the incoming request's host; web clients receive/consume the same absolute URL transparently.

`restaurant-portal.ts`'s promo-banner compositing (`readFoodImageFromStorage`/`uploadBannerToPublicStorage`) goes through `ObjectStorageService.readPublicFile`/`writePublicFile`, which also branch on `STORAGE_MODE` — no direct GCS client usage remains outside `objectStorage.ts`.

## API Endpoints (`artifacts/api-server/`)

- `GET /api/restaurants` — list all restaurants (sorted by rating)
- `GET /api/restaurants/:id` — restaurant details
- `GET /api/restaurants/:id/menu` — restaurant menu items
- `GET /api/orders?userId=guest` — list user orders
- `POST /api/orders` — create order from a structured cart (`items: [{menuItemId, qty}]`). Server recomputes every line price from the DB (client `totalPrice` is ignored/removed), derives the restaurant from the cart items, enforces a single-restaurant cart (400 `items_cross_restaurant`), auto-generates `orderText`, and returns `items[]` in the response. Legacy free-text `orderText`-only orders are still accepted (no priced items)
- `GET /api/orders/:id` — order details
- `PATCH /api/orders/:id/status` — update order status
- `GET /api/addresses?userId=guest` — list addresses
- `POST /api/addresses` — create address
- `PUT /api/addresses/:id` — update address
- `DELETE /api/addresses/:id` — delete address
- `PATCH /api/addresses/:id/default` — set default address
- `POST /api/orders/validate-promo` — validate a promo code for the current user
- `GET /api/courier/earnings` — courier earnings summary; uses orders.delivery_fee directly (fixed bug)
- `GET /api/delivery-fee-preview?lat=&lon=` — preview delivery fee by Haversine distance from Damascus center
- `GET /api/admin/promos` — list all promo codes with use count
- `POST /api/admin/promos` — create a promo code
- `PUT /api/admin/promos/:id` — update a promo code
- `DELETE /api/admin/promos/:id` — delete a promo code
- `GET /api/admin/delivery-zones` — list delivery zones sorted by fromKm
- `POST /api/admin/delivery-zones` — create a delivery zone
- `PUT /api/admin/delivery-zones/:id` — update a delivery zone
- `DELETE /api/admin/delivery-zones/:id` — delete a delivery zone

## API Client

Generated by Orval from `lib/api-spec/openapi.yaml`. React Query hooks in `lib/api-client-react/`.
Expo app connects via `EXPO_PUBLIC_API_HOST` env var (see `artifacts/marsool/.env`).

## Order Auto-Expiry

Background job (`artifacts/api-server/src/lib/orderExpiry.ts`) runs every 5 minutes on server startup.
- Finds orders with `status='searching'` older than 30 minutes
- Cancels them, records `note='auto_expired'` in `order_status_history`
- Sends push notification to customer: "لم يتوفر سائق لطلبك"
- Emits socket event via `notifyOrderUpdate`

## Onboarding

3-slide onboarding carousel shown to first-time users before the auth flow.
- File: `artifacts/marsool/app/onboarding.tsx`
- Stored in AsyncStorage with key `marsool_onboarding_seen_v1`
- Exported constant `ONBOARDING_SEEN_KEY` consumed by `_layout.tsx`'s `AuthGate`
- Slides: Welcome → How it works → Live tracking

## Legal Pages

In-app privacy policy and terms of service pages.
- `artifacts/marsool/app/privacy.tsx` — Privacy Policy (Arabic + English, 7 sections)
- `artifacts/marsool/app/terms.tsx` — Terms of Service (Arabic + English, 8 sections)
- Both navigable from About screen and the terms text on the Phone auth screen

## i18n

Arabic (default, RTL) + English (LTR). Keys in `artifacts/marsool/i18n/ar.json` and `en.json`.
All screens use `AppText` wrapper instead of React Native `Text`.

## E2E Test Coverage (Task #57 — 2026-04-13)

All three critical user journeys have been validated end-to-end with Playwright:

### Customer Flow ✅
- Phone login with +963911000001 (auto-OTP devCode mode bypasses OTP screen)
- Onboarding skip → phone auth → home tabs
- Free-text order placement via `POST /api/orders`
- Order tracking screen: searching state, spinning icon, cancel button
- Cancel with confirmation dialog → `DELETE /api/orders/:id` → back to home

### Courier Flow ✅
- Phone login with +963911000002 (online=true, role="courier")
- Courier UI: available orders screen with online/offline toggle
- Order acceptance: `POST /api/courier/orders/:id/accept`
- Status progression: accepted → picked_up → on_way → delivered via `PATCH /api/courier/orders/:id/status`

### Admin Panel Flow ✅
- Login with ADMIN_SECRET on `/admin/`
- Dashboard stats: 19 total orders, 4 couriers, 13 users
- Orders section with status badges (cancelled/delivered/searching)
- Couriers section with names, phones, online status
- API direct-verified: GET /api/admin/stats, /orders, /couriers all return 200

### Bug Fixed During Testing

| # | Screen | Trigger | Expected | Actual | Fix |
|---|--------|---------|----------|--------|-----|
| 1 | Admin Panel — Sidebar Nav (`/admin/`) | Browser console check during any admin page navigation | No HTML nesting warnings | `a cannot be a descendant of a` warning — `<Link>` from wouter renders as `<a>`, and a nested `<a>` was inside it | Removed inner `<a>` element from each nav item in `Layout.tsx`; moved `className`, `onClick`, `title` props directly onto `<Link>` |

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Push Notification System (Task #58 — 2026-04-13)

### Notification Routing (usePushNotifications.ts)
- `getNotificationTargetRoute()` is role-aware — takes `userRole: "customer" | "courier"` param
- `order_update` → customer goes to `/order-tracking/[orderId]`; courier goes to `/(courier)/active`
- `chat_message` + orderId → `/chat/[orderId]` for both roles
- `new_order` → `/(courier)/available` (courier only)
- Falls back to `/(tabs)` or `null` if orderId missing

### Push Token Registration
- `getExpoPushTokenAsync()` reads `EXPO_PUBLIC_PROJECT_ID` from env (optional)
- If set, passes `{ projectId }` to the call (required for standalone builds on SDK 50+)
- If not set, no-arg call — works in Expo Go development

### devCode Security
- `POST /api/auth/send-otp` only includes `devCode` field when `NODE_ENV !== "production"`
- Production builds never expose the OTP code in the response

### Backend Notification Data Payloads
All push notifications now carry structured `data` fields for client-side routing:
- Order updates: `{ type: "order_update", recipientId, orderId }`
- Chat messages: `{ type: "chat_message", userId, orderId }`
- New order (couriers): `{ type: "new_order" }`

## Native Push (FCM + APNs) — Task #99 (2026-04-23)

The Replit-managed Expo account cannot reliably deliver Expo push for production builds. We send pushes through three channels in parallel: Expo (legacy), FCM (Android native), and direct APNs HTTP/2 (iOS native). The unified helper is `artifacts/api-server/src/lib/push.ts` (`sendPushToUsers`, `sendPushToRole`, `sendPushToTokens`).

### Bundle ID
- iOS / Android: `com.zaboni.delivery` (must match Firebase project and the APNs key topic)

### Required Replit Secrets
- `FIREBASE_PROJECT_ID` — from the Firebase service-account JSON
- `FIREBASE_CLIENT_EMAIL` — from the service-account JSON
- `FIREBASE_PRIVATE_KEY` — full private_key value from the service-account JSON (escaped `\n` is handled)
- `APN_KEY` — full `.p8` content **including** `-----BEGIN PRIVATE KEY-----` … `-----END PRIVATE KEY-----`
- `APN_KEY_ID` — 10-char Apple Key ID
- `APPLE_TEAM_ID` — 10-char Apple Team ID
- `APN_BUNDLE_ID` — optional override; defaults to `com.zaboni.delivery`

If FCM/APNs creds are missing, the corresponding channel auto-disables (warning logged); Expo path keeps running.

### DB Schema
`users.fcm_token (varchar 512)`, `users.apn_token (varchar 256)` — populated by the mobile app via `PUT /api/auth/device-tokens` on each foreground (with a 30 s cooldown).

### Building
- Android: `cd artifacts/marsool && eas build --platform android --profile production --local` (Gradle local). APK lands in `artifacts/marsool/`.
- iOS: `cd artifacts/marsool && eas build --platform ios --profile production` (EAS remote — requires Apple credentials and login).

### Foreground Token Refresh
`hooks/usePushNotifications.ts` re-registers on every `AppState=active` (cooldown 30 s) so token rotations are picked up without a relaunch.

## OTA Updates (EAS Update)

`expo-updates ~0.28.x` is installed and configured for over-the-air JS/UI updates without a Play Store submission.

### One-time setup (required before first OTA-enabled build)
```bash
cd artifacts/marsool
eas login                   # login with your Expo account
eas init                    # links project → writes projectId to app.json + eas.json
```
After `eas init`, replace both `YOUR_PROJECT_ID` placeholders in `artifacts/marsool/app.json` with the real UUID it outputs.

### Build once & upload to Play
```bash
eas build --platform android --profile production  # produces AAB
# Upload the AAB to Google Play Console as a new release
```
This is the last time you need to touch Play Store for UI/JS-only changes.

### Push an OTA update (after the one-time build is live)
```bash
cd artifacts/marsool
eas update --channel production --message "وصف التعديل"
```
Users receive the update silently on next app launch (no Play Store action needed).

### Config files
- `artifacts/marsool/app.json` — `expo.updates`, `expo.runtimeVersion`, `expo.extra.eas.projectId`
- `artifacts/marsool/eas.json` — each build profile has a `channel` (`production` / `preview`)
