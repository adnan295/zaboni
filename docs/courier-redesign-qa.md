# Courier workspace redesign

Four visible tabs: home, current trip, earnings, account. Utility routes remain reachable from account and are hidden from the tab bar. The tab bar occupies layout space instead of overlaying content. A shared courier-only palette/header leaves the customer theme unchanged.

Home shows availability, an active-trip shortcut, available orders and an explicit stale-data state. Accepting an order navigates to the trip. A per-card synchronous guard prevents repeated taps before React updates the button.

The trip has a compact three-stage summary, stage-specific navigation, wrapping contact actions and a persistent bottom action. Before pickup, an errand searches for its named pickup place instead of navigating to the customer. Missing restaurant coordinates no longer silently show the customer's marker as the restaurant. Relinquishing an assignment is shown only before pickup and explains reassignment.

Failed or malformed active-order refreshes preserve the last known orders and show an error; delivery progression is disabled until refresh succeeds. Earnings refresh on focus. Account retains points/rewards, subscription, delivery history and support access.

## Validation

- Mobile TypeScript check.
- Expo bundle export for iOS, Android and web.
- `node --test artifacts/marsool/tests/courier-recovery.test.cjs`: real provider refresh callbacks tested for outage recovery and malformed responses using isolated hook/network doubles.
- Local browser preview of the actual home/trip components at 390 and 320 CSS pixels with synthetic orders, mocked context/navigation/map and no server writes: acceptance opens trip; refresh error retains delivery and disables progression; pickup advances to customer destination; errands display the purchase pickup action; reassignment disappears after pickup.
- Native safe-area behavior, VoiceOver/TalkBack, real map navigation, actual calls and physical-device delivery remain to be validated in the new store build. Browser fixtures do not establish these results.

## Customer follow-up from code review

`POST /orders` currently generates a fresh order ID for every request. The checkout disables its button while submitting, but an uncertain network outcome followed by retry can create another order. A durable customer-scoped idempotency key shared by client and server is a high-priority follow-up; it requires transactional concurrency/replay tests, not just another button guard. No production duplicate count has been measured.

Also validate final-price parity and delivery/cancellation/refund flows end to end on designated test accounts. Do not claim these journeys have been exercised against production from these UI checks.

## Local responsive review (2026-10-10, pending user design approval)

Browser component fixtures checked all 12 preview pages across 320×568, 360×640, 390×844, 430×932 and 768×1024 CSS-pixel frames, plus 320×568 with simulated 150% and 200% text scaling (84 cases). DOM geometry initially detected horizontal overflow in delivery-history and ratings summaries at 200%; flexible summary columns corrected it. The repeated matrix reported no elements beyond the phone's horizontal bounds for these fixtures.

The shared header now omits its secondary text on short screens or large text settings, leaving more room for the task. The native tab bar grows with font scale; primary action/contact labels wrap; the help sheet scrolls within 90% of available height and respects the bottom inset. With a synthetic active order at 320×568/200%, pickup and delivery actions remained inside the frame; the delivery step retained 126px of scrollable content space in the browser harness.

Limitations: text scaling is simulated via the preview wrapper, not an OS accessibility setting. The preview uses a mock bottom navigation and safe-area values. Physical iOS/Android notch, home indicator, keyboard, native modal and maximum OS font scaling remain unverified. Changes are local; no store build or deployment was triggered for this review.

### Local account simplification (awaiting design approval)
- Replaced the large avatar/stat blocks with compact editable identity and grouped activity links.
- Added focus-refreshed subscription status, expiry when active, and separate links for subscription history and pending requests. Renewal entry appears only when inactive, matching the existing subscribe screen's active-subscription redirect.
- Preserved delivery history, points, ratings, support, vehicle information, help and sign-out. Removed duplicated availability/earnings controls from Account.
- Verified local fixture preview at 390×844 and 320×568 with simulated 200% font scaling (no horizontal overflow); subscription history link opens successfully. TypeScript and diff whitespace checks passed. Browser emitted an existing preview direction-style warning; native device behavior has not been verified.
- Local edits only; no push, build submission or deployment.

### Unified subscriptions (local preview)
- Account now has one “اشتراكاتي” entry. The destination includes subscription status, renewal entry when inactive without a pending request, current/latest request, subscription records, and older requests.
- Old subscription-request routes render the combined screen to preserve existing links. Each data source has an explicit error state; focus reloads data and failures offer retry.
- Verified Account → subscriptions → package selection in the fixture preview and no horizontal overflow at 320px with simulated 200% font size. TypeScript and whitespace checks passed. No publishing performed.
