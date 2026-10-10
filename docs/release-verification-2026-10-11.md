# Release candidate 1.0.18 — 11 October 2026

## Authorized scope
Customer retains the existing published design except the previously approved search layout. Courier workspace changes and functional admin/order fixes are included. Customer home/address concept previews are excluded. No private reference images or fixture previews are part of this release.

## Validation
- 87 tests passed: server lifecycle/integration/reliability, mobile checkout/search, and release signing guards.
- Workspace TypeScript checks passed for all projects.
- API, admin, restaurant portal and public website production builds passed. The portal requires PORT=5173 and BASE_PATH=/restaurant-portal/, matching its Docker build.
- iOS and Android Expo exports passed. This validates JS bundles, not native device behavior or signing.
- Ruby Fastfile syntax and git diff checks passed.
- Search layout restored to the approved local version after the user's explicit clarification.

## Known limit
The complete redesigned admin prototype still uses fixtures and is not wired to production. It is preserved locally and MUST NOT replace the working admin. The current release includes the real admin order search/status fixes. Completing the full admin redesign remains outstanding.
No new real order, payment, or push to a real courier was created during this verification. The user previously confirmed notification receipt; physical-device testing of this candidate remains separate.

## Release
Version 1.0.18, Android versionCode 112, iOS build 31. Prior confirmed iOS upload was 1.0.17 (28) to TestFlight; prior Android 109 was build-only. Store submission status must be reported from workflow results, never inferred from local export.

## Publication started
PR #27 merged as ddaff6d90c5962cd893925729de4be1d383281ad after GitHub API checks passed.
- Android production workflow: https://github.com/adnan295/zaboni/actions/runs/38087684295
- iOS App Store workflow: https://github.com/adnan295/zaboni/actions/runs/38087687047
- Hostinger: backed up Zaboni configuration, database and pre-release API/web image tags under the private server directory /root/zaboni-release-20261011. Building only API and web services; FitoPass, database, WARP and host services are not restarted.
- Pre-deploy real admin check: WhatsApp 2/2 connected. One active real order was observed, not modified.

These are started workflows, not confirmation of store availability.

## Hostinger deployment verified
- API/web images built and activated with `docker compose up -d --no-deps --wait --wait-timeout 120 api-server web`. Both reached healthy state.
- Public Zaboni health returned `status: ok`; FitoPass returned HTTP 200.
- Read-only production smoke test: 47 restaurants with 47 valid distances in ascending order; rating/open filters passed; unauthenticated orders access returned 401.
- Real admin WhatsApp reconnected after restart; all accounts connected.
- Real admin order search for an impossible reference returned zero, and reset restored the full total. No real orders were created or modified.
- Store workflows remained in progress at the last check; availability is not yet confirmed.

## Connected admin navigation follow-up
- Grouped all 33 existing production routes into eight sections, with section tabs and Arabic navigation search. No production page was removed; prototype-only modules remain excluded.
- Shared WhatsApp health remains backed by the existing authenticated polling query, with loading/error states. Dashboard stats failures now offer retry instead of a blank page.
- Three route coverage/search tests, admin TypeScript and production build passed. Browser checks exercised all 33 navigation destinations using the actual Layout in a local fixture harness; this is navigation coverage, not production API action coverage.
- Small-screen navigation/search and dark header were checked at an effective 393 CSS-pixel width, with no horizontal overflow.
- iOS 1.0.18 (31) uploaded and processed successfully; review submission initially failed because Arabic release notes were missing. Added Arabic release metadata to prevent recurrence. Correct privacy endpoint /privacy is registered and returned HTTP 200 on production.
