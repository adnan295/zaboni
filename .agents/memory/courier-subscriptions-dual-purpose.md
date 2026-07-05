---
name: courier_subscriptions table serves two flows
description: courier_subscriptions is shared by the legacy admin-gifted/waived subscription feature and the newer self-serve plan-request/approval flow — don't assume it's single-purpose.
---

`lib/db/src/schema/courier_subscriptions.ts` (`courier_subscriptions` table) is written to by two independent features:

1. **Legacy admin-gift/waived flow** — admin can directly insert a row (`status: paid|waived|pending`, `gifted`, `createdByAdmin`) without a courier request. Surfaced to couriers via `GET /api/courier/subscription/today` and `GET /api/courier/subscription/history` (mobile screen `subscription-history.tsx`, "سجل الاشتراكات").
2. **Newer self-serve plan/receipt-approval flow** — courier picks a plan on "الباقات" (`courier-subscribe.tsx`), uploads a payment receipt, admin approves/rejects via `courier_subscription_requests`; approval inserts/activates a row in the same `courier_subscriptions` table with `planId/planName/planPeriod` populated.

**Why:** both features gate order-receiving off the same `is_active` + `ends_at > now()` check, so they had to share the table rather than duplicate the gating logic.

**How to apply:** when changing `courier_subscriptions` columns, check both `courier.ts` route handlers (`/subscription/today`, `/subscription/history`, `/subscription/status`, request-approval logic) and both mobile screens (`subscription-history.tsx` legacy view, `courier-subscribe.tsx` new self-serve flow) — a column drop that looks safe for one flow can break the other silently.
