# Customer reliability and original-design preview

Local changes only; no deploy, store release or push. User explicitly requested preserving all existing page designs. Existing app screens are imported into a separate preview harness; production styles and page structure are preserved apart from contextual loading/error/retry feedback.

## Search fixes
- Both existing search routes ignore superseded responses, failures and loading completions. Clearing a query or leaving a screen invalidates pending responses.
- Connection failures are distinguished from a successful empty result and can be retried.
- Standalone search uses delivery-address coordinates before GPS, consistent with checkout pricing.
- Restaurant endpoint now applies open-only, computed free-delivery, minimum-rating, selected sort and limit parameters.
- Matching includes available menu item names as well as restaurant names and categories.
- LIKE metacharacters are escaped; category exclusion conditions no longer overwrite text/category matching.

## Previously requested checkout and homepage fixes in this turn
- Address/restaurant-specific delivery quote query prevents late responses pricing a different address.
- Unknown/failed quote does not produce a misleading total excluding delivery; submission waits for a valid quote and offers retry.
- Restaurant loading failure on home is distinct from no matching restaurants.

## Validation
- API suite: 70 passed, including 4 new search filter/sort/escaping cases.
- Mobile suite: 9 passed, including 2 regression cases executing both actual search screen functions with deferred responses, query clearing and failures.
- API and mobile TypeScript checks passed.
- Browser: 26 original preview entries mounted without error; added standalone-search entry also verified (27 total). Existing root and tab search tested. Changing query retained new results; simulated network failure showed retry and recovered; available menu-name query returned fixture restaurant.
- Checkout: added a dish through the actual menu/modal; unknown fee displayed waiting state; failed fee displayed retry and disabled submit.

## Limits
Preview at http://127.0.0.1:4182 uses in-memory fixtures, simulated maps and no outbound API calls. Browser checks do not verify deployed server matching, real order delivery, payments or device notifications. Tests and changes require deployment/build approval before production rollout. No production order was created.
