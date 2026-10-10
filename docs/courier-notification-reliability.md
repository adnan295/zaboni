# Courier notification reliability

Searching orders are no longer automatically cancelled on a timer. They remain
visible to customers and operations until explicitly cancelled or accepted.
Operations must monitor the dashboard's two-minute pending-order alerts and
contact the customer when fulfilment is impossible.

## Dispatch and delivery

- Every searching, unassigned order is recoverable from the orders table. A
  PostgreSQL-backed worker scans every five seconds, claims work with
  `FOR UPDATE SKIP LOCKED`, renews leases, and fences completion updates.
- New and reopened orders wake their own dispatch immediately. A busy retry
  scan cannot delay this immediate path. Restart recovery does not depend on
  an in-memory timer or a message enqueued before a crash.
- Prefer eligible couriers in the restaurant's zone. Expand immediately when
  all submissions fail, and on subsequent attempts. Match the order board's
  15 km visibility radius and two-order stacking rules; exclude the customer.
- Retry failed/no-recipient dispatch after 15, 30, then 60 seconds. Repeat
  provider-accepted submissions every 60 seconds while still searching.
  Acceptance by Apple, Firebase or Expo does not mean the courier saw it.
- Prefer native FCM/APNs; fall back to Expo on rejection, timeout or missing
  native configuration. Avoid the old unconditional duplicate native+Expo send.
  Timeouts are ambiguous: delivery is at-least-once and duplicates remain possible.
- Android messages have a visible notification, high priority, sound and the
  existing `default` channel. Apple uses production APNs alert priority 10.
  New-order messages carry `orderId`, collapse identity and a 60-second TTL.
  Already submitted notifications cannot be recalled when an order is accepted;
  fresh database checks stop remaining batches, and short TTL limits stale alerts.
- Expo tickets are persisted and receipts checked every 15 seconds initially,
  then once a minute up to 24 hours. Rejections are logged and wake redispatch;
  invalid tokens are cleared only if they still equal the rejected value.
- Foreground sockets supplement push. Notification taps refresh the board before
  waiting for GPS. Background delivery is an OS alert, not JavaScript polling.

The mobile app validates token-save HTTP responses, retries, times out stalled
registration, refreshes on foreground/token changes, and warns couriers about
blocked or silent notifications. Going online requires at least one successfully
registered path. Older installed clients still receive server-side improvements;
registration and permission checks need the new mobile release (1.0.17,
Android 109 / iOS 28).

## Verification

Run from the repository root using pnpm 10.26.1:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @workspace/api-server test:notifications
corepack pnpm --filter @workspace/api-server build
```

Tests execute repository code with mocked providers, plus real PostgreSQL SQL in
an isolated PGlite database. They do not send real pushes. Test real iOS and
Android store builds with a designated test courier before claiming delivery:
foreground, background, locked screen, terminated app, Android Doze, temporary
network loss, permission/channel disabled, and token refresh. Record request,
provider acceptance and observed notification times separately. Force-stop,
no connectivity, powered-off devices and user notification settings prevent any
promise of universal immediate delivery.

## Hostinger rollout (Zaboni only)

The observed Zaboni checkout is `/www/wwwroot/zaboni`. Its Compose containers are
`zaboni-api-server-1`, `zaboni-web-1`, `zaboni-marsool-1`, `zaboni-postgres-1`,
and `zaboni-warp-1`. FitoPass shares the VPS: do not restart the VPS, host nginx,
Docker daemon, other applications, database or WARP service.

1. Verify the deployed commit and working tree; preserve local files and secrets.
   Back up only Zaboni configuration and record existing image IDs privately.
2. Verify Apple key ID/team/key match and Firebase project credentials. Presence
   of environment variables is insufficient. The pre-fix production logs showed
   APNs `InvalidProviderToken`; code changes alone cannot repair invalid credentials.
3. Build `api-server` and `web` sequentially in the Zaboni Compose project.
   The API creates the two additive dispatch/receipt tables before listening.
   Existing orders and user data are not rewritten by this migration.
4. Replace only those two services using `docker compose up -d --no-deps
   api-server web`. Never run an unscoped Compose down/up or `down -v`.
5. Check API health, web/API routing, startup logs, the dispatch queue and receipt
   errors. Verify the separate FitoPass endpoint remains healthy.
6. Publish the mobile build through the existing EAS/store process; JS bundle
   export is not a signed store release or proof of physical-device delivery.

Do not roll back to an image that re-enables the old automatic order-expiry job:
long-waiting orders would be cancelled at startup. Any rollback must preserve
`orderExpiry.ts` as a no-op. Tables are additive and may remain in place.
