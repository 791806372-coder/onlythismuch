# AI Usage Release Prep - 2026-06-17

This folder is the handoff for the iOS App Store path plus the Mac connector direct-install path.

## Current Decision

- iOS app goes to App Store.
- Mac connector stays direct-install first, preferably via GitHub Releases or a product download page.
- Do not put the Mac connector in the Mac App Store for v1. It runs a local helper/service and reads local CLI/app status; Mac App Store sandbox/review would add friction before the local product is proven.
- Mainland China release is deferred. Chinese localization stays in the app, but initial availability should target regions where GitHub/download access and local-only positioning are simpler.

## Generated Artifacts

- `build/AppStoreArchive/export/AIUsageWidgetApp.ipa`
  - iOS App Store Connect export.
  - Version `1.0`, build `2`.
  - Signed with `Apple Distribution: Kai Zhang (5MXZ674CA6)`.
  - Uploaded successfully to App Store Connect on 2026-06-17; wait for Apple processing before selecting it on the version page.
- `AIUsageConnector-mac-adhoc-0.1.0.zip`
  - Current Mac connector bundle, ad-hoc signed.
  - Use for private/internal validation only.
  - Not ready for public GitHub release until Developer ID signing + notarization are done.
- `SHA256SUMS.txt`
  - Checksum for the zip.
- `AIUsageConnector-mac-developerid-notarization-pending-0.1.0.zip`
  - Developer ID signed Mac connector bundle.
  - Generated for notarization input only; not ready for public release until accepted and stapled.
- `SHA256SUMS-developerid-pending.txt`
  - Checksum for the Developer ID signed, not-yet-notarized zip.
- `APP_STORE_CONNECT_CHECKLIST.md`
  - What to fill in App Store Connect.
- `APP_STORE_METADATA_DRAFT.md`
  - Store metadata draft.
- `PRIVACY_POLICY_DRAFT.md`
  - Public privacy policy draft in supported languages.
- `REVIEW_NOTES.md`
  - App Review notes draft.
- `MAC_CONNECTOR_GITHUB_RELEASE.md`
  - GitHub Release draft and upload checklist.
- `MAC_CONNECTOR_INSTALL.md`
  - User-facing Mac connector install guide.
- `NOTARIZATION_CREDENTIALS.md`
  - How to create and save the local Apple notarization credential profile without exposing passwords.
- `MISSING_USER_ACTIONS.md`
  - Things only you/account owner can do.
- `LOCAL_CHECK_REPORT.md`
  - Checks I ran tonight and their result.
- `../app-store-screenshots/`
  - App Store screenshot candidates.
  - Current usable English candidates:
    - `01-sao-dashboard-en.png`
    - `04-first-run-mac-connector-en.png`
  - The gallery should lead with the `骚话` usage/dashboard/widget screenshots, then show setup.

## What Changed In App Code

- iOS marketing version is now `1.0` to match the App Store Connect version record.
- iPhone first-run pairing now includes a Mac connector install guidance card before the QR scan card.
- Mac connector bundle assembly now re-signs the complete `.app` bundle by default with ad-hoc signing.
- The same Mac packaging script can later use Developer ID signing by setting `AIUW_CODESIGN_IDENTITY`.

## Release Stance

The iOS app now installs on the connected iPhone, archives as version `1.0` build `2`, exports as an App Store Connect IPA, and uploads successfully to App Store Connect. The remaining iOS release work is App Store Connect listing metadata, App Store screenshots, app privacy, review contact info, build selection after Apple processing, and final submission. Screenshot order should lead with the playful usage/dashboard/widget surfaces, not a plain setup intro. The Mac connector can be Developer ID signed locally with Hardened Runtime, but public download still requires notarization credentials, stapling, a GitHub Release asset, and either bundled connector runtime packaging or an explicit developer-only beta requirement.
