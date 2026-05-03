# Threat Model

## Project Overview

Zaboni/Marsool is an Arabic/English delivery platform implemented as a pnpm TypeScript workspace. The production backend is an Express 5 API in `artifacts/api-server`, backed by PostgreSQL via Drizzle ORM in `lib/db`. Clients include an Expo/React Native mobile app in `artifacts/marsool`, a React admin panel in `artifacts/admin`, and public legal/support pages served by the API.

Users authenticate by phone OTP and receive JWT bearer tokens. Administrators authenticate to admin APIs with an `ADMIN_SECRET` bearer token. The platform stores restaurant/menu data, user accounts, phone numbers, saved delivery addresses, orders, courier status/location, chat metadata, ratings, promo codes, wallet/subscription records, push tokens, and public image uploads in object storage.

## Assets

- **Authentication secrets and tokens** -- `JWT_SECRET`, `ADMIN_SECRET`, OTP codes, user JWTs, admin bearer tokens, push provider credentials, FCM/APNs keys, and object-storage signing credentials. Compromise enables account impersonation, admin access, notification abuse, or storage abuse.
- **User personal data** -- phone numbers, names, delivery addresses, order history, chat messages, saved locations, profile images, and device push tokens. Disclosure harms user privacy and can expose physical locations.
- **Courier data and funds** -- courier role status, live/current locations, order assignments, earnings, subscriptions, wallet balances, deposit requests, and customer ratings. Tampering or disclosure can affect payments and safety.
- **Admin-controlled business data** -- restaurants, menus, delivery zones, promo codes, banners, categories, notifications, WhatsApp accounts, settings, and financial reports. Unauthorized modification can disrupt operations or defraud the business.
- **Object storage content** -- uploaded public images and private object paths. Upload and read endpoints must prevent arbitrary file exposure, unsafe content hosting, and unbounded storage use.
- **Database contents** -- all persistent operational records. SQL injection or broken authorization could expose or modify broad application state.

## Trust Boundaries

- **Mobile/admin/browser clients to API** -- all HTTP requests originate from untrusted clients. The API must enforce validation, authentication, authorization, size limits, and state transitions server-side.
- **Public to authenticated user boundary** -- auth, restaurant/menu browsing, public config, legal pages, and some storage routes are public or separately guarded; order/address/favorites/courier routes require valid JWTs.
- **Customer to courier boundary** -- customers can create and view their own orders and courier location for assigned orders; couriers can view/accept/update only allowed orders and must not access unrelated customer data except what is needed for delivery.
- **Authenticated user to admin boundary** -- admin endpoints under `/api/admin/*` and `/api/admin/notifications/*` use an admin bearer secret. A normal user JWT must not authorize admin operations.
- **API to PostgreSQL** -- API code has direct database access through Drizzle. Queries must use parameterization and must scope reads/writes to the authenticated principal or admin role.
- **API to external services** -- SMS/WhatsApp, WaVerify, Firebase/FCM/APNs, maps/geocoding, Replit Object Storage sidecar, and outbound webhooks cross into third-party systems. URLs, credentials, payloads, and timeouts require care.
- **API to object storage** -- presigned upload URLs and object serving expose storage operations. Public object paths are intentionally readable, while private object paths require authorization and ACL checks where applicable.
- **Production to development boundary** -- mockup sandbox, local build scripts, and dev-only OTP conveniences are out of production scope unless reachable when `NODE_ENV=production`. Production is assumed to set `NODE_ENV=production`, and platform TLS terminates client/server traffic.

## Scan Anchors

- Production API entry points: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/routes/index.ts`.
- Auth and session anchors: `artifacts/api-server/src/routes/auth.ts`, `artifacts/api-server/src/middleware/auth.ts`, `artifacts/api-server/src/orders/server.ts`, `.replit` environment configuration.
- Admin and privileged operations: `artifacts/api-server/src/routes/admin.ts`, `artifacts/api-server/src/routes/notifications.ts`, `artifacts/admin/src/lib/api.ts`.
- User/courier/order data surfaces: `artifacts/api-server/src/routes/orders.ts`, `addresses.ts`, `favorites.ts`, `courier.ts`, `orders/server.ts`.
- Storage surface: `artifacts/api-server/src/routes/storage.ts`, `artifacts/api-server/src/lib/objectStorage.ts`, `lib/object-storage-web/`, `artifacts/admin/src/components/ImageUpload.tsx`.
- Public content and possible XSS anchors: `artifacts/api-server/src/routes/legal.ts`, `artifacts/admin/src/pages/LiveMap.tsx`, web/mobile rendering of restaurant, menu, banner, and notification data.
- Dev-only or usually out-of-scope: `artifacts/mockup-sandbox/`, local Expo build scripts, generated API client code unless it changes production trust boundaries.

## Threat Categories

### Spoofing

Attackers may try to impersonate customers, couriers, or administrators by bypassing OTP verification, guessing/reusing static secrets, forging JWTs, or replaying long-lived bearer tokens. The system must ensure production OTP verification cannot be bypassed, JWTs are signed with an uncommitted high-entropy secret, admin access uses a protected secret with brute-force resistance, and every protected endpoint verifies tokens server-side.

### Tampering

Untrusted clients can submit order details, delivery coordinates, profile data, courier state changes, promo codes, wallet deposit requests, image metadata, and admin panel payloads. The API must validate all request bodies, calculate prices/fees/discounts server-side, enforce legal order state transitions, and prevent users from modifying records outside their account or role. Admin routes must require admin authorization for every privileged mutation.

### Information Disclosure

The app stores sensitive personal, location, order, chat, courier, and financial data. API responses must be scoped to the authenticated user/courier or admin, public endpoints must not expose private data, logs and errors must not leak OTPs or secrets, and object storage routes must not reveal private objects through path manipulation or missing ACL checks. Push and socket events must only be delivered to intended users or roles.

### Denial of Service

Public endpoints such as OTP sending/verification, restaurant search, delivery fee preview, legal pages, storage upload URL creation, and admin-secret checks may be targeted for abuse. The system must rate-limit authentication and privileged endpoints, cap request body and upload sizes, avoid unbounded expensive queries, and use timeouts for external service calls.

### Elevation of Privilege

Normal users may attempt to become couriers/admins, couriers may attempt to manipulate other couriers' orders or earnings, and customers may attempt to access other customers' orders/addresses or private files. Role checks must be enforced on the server, admin privileges must never depend on client-side routing, SQL queries must be parameterized, and object-storage access must be bound to intended visibility/ownership.
