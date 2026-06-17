# Local Check Report

Run date: 2026-06-17

## Passed

- Product invariants: `npm run check:product`
  - 30 passed.
- iOS config: `npm run check:ios-config`
  - 25 passed.
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
- Developer ID Mac signing: `AIUW_CODESIGN_IDENTITY="Developer ID Application: Kai Zhang (5MXZ674CA6)" npm run mac:verify`
  - Signed `AIUsageConnector.app` with Developer ID Application.

## Failed / Blocked

- App Store upload:
  - App Store Connect app record and App Store provisioning profiles are still external/account-owner steps.
- Developer ID notarization for public Mac download:
  - Developer ID signing is available locally, but notarization still needs App Store Connect notary credentials or an API key.
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
- A later attempt to refresh the install proof saw the iPhone as offline/unavailable through CoreDevice. Unlock/replug/trust the iPhone before the next install or screenshot run.
