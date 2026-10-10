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
