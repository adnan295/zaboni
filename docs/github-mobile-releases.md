# Publishing Zaboni from GitHub

The manual GitHub Actions workflows build native Android/iOS projects with Expo
Prebuild and upload with Fastlane. An Expo/EAS account is not required for this
build process. Run workflows on `main`; pushes alone never publish a release.

The current store version observed on October 10, 2026 is 1.0.16 (Android 108,
iOS 27). The prepared release is 1.0.17 (Android 109, iOS 28). Verify that no
newer build has been uploaded before running these defaults.

## Android credentials

Add these repository Actions secrets in `adnan295/zaboni`:

- `ANDROID_KEYSTORE_BASE64`: base64 of the existing Zaboni upload keystore.
- `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- `PLAY_SERVICE_ACCOUNT_JSON`: Google service account JSON authorized to release
  `com.zaboni.delivery` in Play Console, with the Android Publisher API enabled.

Add the repository variable `ANDROID_UPLOAD_CERT_SHA256`, copied from the
**upload key certificate** in Play Console's App signing section. This is not
the app signing certificate Google uses to distribute APKs. The workflow checks
the uploaded keystore against this fingerprint before building.

Recover the original upload key from the previous Replit/EAS build environment.
Do not run `setup-keystore.sh` to replace it casually: a different key cannot
update the current app unless Google approves an upload-key reset.

Run **Zaboni Android → Google Play** with the new version/build. The default
`build-only` signs and saves an AAB without uploading to Google; use it while an
upload-key reset or Play permissions are pending. `internal`
uploads for internal testing; `production` submits a completed full-rollout
release, subject to Google's review and managed-publishing settings.

## Apple credentials

Add these repository Actions secrets:

- `IOS_DISTRIBUTION_P12_BASE64`: base64 of an Apple Distribution certificate
  exported with its private key; `IOS_DISTRIBUTION_PASSWORD`: its export password.
- `IOS_PROVISIONING_PROFILE_BASE64`: base64 of an App Store distribution profile
  for `com.zaboni.delivery`, team `H5V2BKC8WA`, matching that certificate and
  permitting production push notifications.
- `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`: App Store Connect API key with
  permission to upload and submit Zaboni. Content accepts raw PEM or base64.

The APNs notification key is a different credential and cannot replace the
App Store Connect key. Never commit any private key, JSON credential, profile,
P12 or keystore to this public repository.

Run **Zaboni iOS → App Store Connect**. `testflight` uploads an internal beta;
`app-store` uploads and submits for review with automatic release after approval.
Apple's review cannot be bypassed. Existing screenshots/review information are
preserved; release notes come from `fastlane/metadata/en-US/release_notes.txt` and
`fastlane/metadata/ar-SA/release_notes.txt`. Both active localizations require
release notes before review submission.

The workflow imports an existing certificate into a temporary keychain. It does
not revoke or create distribution certificates and does not change FitoPass.
If certificate/profile provisioning is needed, perform that setup separately
and preserve credentials in the user's secure storage.

## Validation and updates

Run `node --test ci/mobile-release.test.mjs`, `ruby -c fastlane/Fastfile`, and
Actionlint on both workflows. Generated native projects stay ignored by Git.
Release inputs are validated before writing app configuration. Private signing
files stay in the runner's temporary directory and are removed at job completion;
only AAB/IPA files are retained as workflow artifacts for 14 days.

GitHub-built releases disable the previous EAS OTA feed so an old remotely hosted
bundle cannot replace the embedded notification fix. The Expo project ID remains
unchanged for push registration. Mobile code changes reach users through a new
store release; server fixes deployed separately still benefit older clients.

A successful bundle export or Prebuild is not a signed release. Until the real
signing credentials are installed and a workflow succeeds, store publishing is
not operational. Real iOS/Android notification delivery and latency still need
physical-device testing, including locked screens and terminated apps.
