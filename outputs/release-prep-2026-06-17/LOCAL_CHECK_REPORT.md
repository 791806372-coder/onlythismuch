# Local Check Report

Run date: 2026-06-17

## Passed

- Product invariants: `npm run check:product`
  - 30 passed.
- iOS config: `npm run check:ios-config`
  - 24 passed, 1 simulator-build warning, 0 failures.
- iOS Swift/fixture contract: `npm run check:ios`
  - Passed.
- Native XCTest build: `npm run build:ios:tests`
  - Passed.
- AppIntent metadata freshness: `npm run check:appintents:fresh`
  - 12 passed after a clean unsigned build refreshed metadata outputs.
- Mac connector bundle launch verification: `npm run mac:verify`
  - Passed.
- Script/source hygiene: `npm run check:scripts`
  - Passed.
- Connector package: `npm run check:connector-package`
  - Passed.
- Local pairing smoke: `npm run smoke:local-pairing`
  - Passed.
- Local approval smoke: `npm run smoke:local-approval`
  - Passed.
- Background service program smoke: `npm run smoke:service-program`
  - Passed.
- CodexBar fake CLI adapter smoke: `npm run smoke:codexbar:fake`
  - Passed.
- Mac bundle code signature verification:
  - `codesign --verify --deep --strict --verbose=2 mac/AIUsageConnector/dist/AIUsageConnector.app`
  - Passed after adding bundle signing to the Mac build script.
- Personal Apple signing diagnosis: `npm run device:signing`
  - Passed with warnings only.
- Physical iPhone install: `npm run device:install -- --allow-provisioning-updates`
  - Installed `AIUsageWidgetApp` on the connected iPhone.
- App Store archive/export/upload:
  - Archive succeeded at `build/AppStoreArchive/AIUsageWidget.xcarchive`.
  - Export succeeded at `build/AppStoreArchive/export/AIUsageWidgetApp.ipa`.
  - The exported IPA is version `1.0`, build `2`, bundle `com.superzhangkai.aiusagewidget`.
  - The exported IPA is signed by `Apple Distribution: Kai Zhang (5MXZ674CA6)`.
  - Upload to App Store Connect succeeded; Apple is processing the package.
- Developer ID Mac signing: `AIUW_CODESIGN_IDENTITY="Developer ID Application: Kai Zhang (5MXZ674CA6)" npm run mac:verify`
  - Signed `AIUsageConnector.app` with Developer ID Application.

## Failed / Blocked

- App Store submission:
  - App Store Connect app record exists as `AI Widget Usage`.
  - Build upload succeeded, but the build still needs Apple processing, screenshots, metadata, privacy answers, review contact info, and final manual submission.
- Developer ID notarization for public Mac download:
  - Developer ID signing is available locally, but notarization still needs App Store Connect notary credentials or an API key.
  - `xcrun notarytool history --keychain-profile AIUsageNotary` currently reports no saved keychain item.
  - `spctl` currently rejects the app as `Unnotarized Developer ID`, which is expected before notarization/stapling.
  - Current public zip should not be released until notarized and stapled.

## Current Local Signing State

- Team in local config: configured in ignored `ios/Config/Local.xcconfig`
- Bundle prefix: `com.superzhangkai`
- App Group: `group.com.superzhangkai.aiusagewidget`
- Available local identities:
  - Apple Development: Kai Zhang
  - Apple Distribution: Kai Zhang
  - Developer ID Application: Kai Zhang
  - Developer ID Installer: Kai Zhang

## Notes

- The first `check:appintents:fresh` failed because the icon file timestamp was newer than the unsigned build `Info.plist`.
- A clean unsigned iPhone build refreshed the outputs and the check passed.
- This was not a runtime AppIntent bug.
- Device install evidence is written under `outputs/device-evidence/` and intentionally ignored by git.
- The iPhone is currently visible again through CoreDevice and the latest app was installed successfully.
