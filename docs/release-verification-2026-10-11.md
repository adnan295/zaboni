# Release candidate 1.0.18 — 11 October 2026

## Authorized scope
Customer retains the existing published design except the previously approved search layout. Courier workspace changes and functional admin/order fixes are included. Customer home/address concept previews are excluded. No private reference images or fixture previews are part of this release.

## Validation
- 87 tests passed: server lifecycle/integration/reliability, mobile checkout/search, and release signing guards.
- Workspace TypeScript checks passed for all projects.
- API and admin production builds passed.
- iOS and Android Expo exports passed. This validates JS bundles, not native device behavior or signing.
- Ruby Fastfile syntax and git diff checks passed.
- Search layout restored to the approved local version after the user's explicit clarification.

## Known limit
The complete redesigned admin prototype still uses fixtures and is not wired to production. It is preserved locally and MUST NOT replace the working admin. The current release includes the real admin order search/status fixes. Completing the full admin redesign remains outstanding.
No new real order, payment, or push to a real courier was created during this verification. The user previously confirmed notification receipt; physical-device testing of this candidate remains separate.

## Release
Version 1.0.18, Android versionCode 112, iOS build 31. Prior confirmed iOS upload was 1.0.17 (28) to TestFlight; prior Android 109 was build-only. Store submission status must be reported from workflow results, never inferred from local export.
