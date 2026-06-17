# AI Usage Release Prep - 2026-06-17

This folder is the handoff for the iOS App Store path plus the Mac connector direct-install path.

## Current Decision

- iOS app goes to App Store.
- Mac connector stays direct-install first, preferably via GitHub Releases or a product download page.
- Do not put the Mac connector in the Mac App Store for v1. It runs a local helper/service and reads local CLI/app status; Mac App Store sandbox/review would add friction before the local product is proven.
- Mainland China release is deferred. Chinese localization stays in the app, but initial availability should target regions where GitHub/download access and local-only positioning are simpler.

## Generated Artifacts

- `AIUsageConnector-mac-adhoc-0.1.0.zip`
  - Current Mac connector bundle, ad-hoc signed.
  - Use for private/internal validation only.
  - Not ready for public GitHub release until Developer ID signing + notarization are done.
- `SHA256SUMS.txt`
  - Checksum for the zip.
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
- `MISSING_USER_ACTIONS.md`
  - Things only you/account owner can do.
- `LOCAL_CHECK_REPORT.md`
  - Checks I ran tonight and their result.

## What Changed In App Code

- iPhone first-run pairing now includes a Mac connector install guidance card before the QR scan card.
- Mac connector bundle assembly now re-signs the complete `.app` bundle by default with ad-hoc signing.
- The same Mac packaging script can later use Developer ID signing by setting `AIUW_CODESIGN_IDENTITY`.

## Release Stance

The iOS app is close to App Store packaging, but not upload-ready from this machine yet because Apple Distribution signing is missing locally. The Mac connector is locally valid as a bundle, but public download requires Developer ID signing and notarization.
