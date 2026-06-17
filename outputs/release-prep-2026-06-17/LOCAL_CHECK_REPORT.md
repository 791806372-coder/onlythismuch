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

## Failed / Blocked

- Signing diagnosis: `npm run device:signing`
  - `xctrace` did not list the iPhone.
  - The iPhone may need unlock/trust/reconnect/Xcode Devices visibility before another true-device install check.
- Apple Distribution signing:
  - Not available locally.
  - Local signing identities need to be regenerated from the personal Apple Developer account.
- Developer ID signing for public Mac download:
  - Not available locally.
  - Current Mac zip is ad-hoc signed and rejected by Gatekeeper policy for public distribution.

## Current Local Signing State

- Team in local config: configured in ignored `ios/Config/Local.xcconfig`
- Bundle prefix: `com.kai`
- App Group: `group.com.kai.aiusagewidget`
- Available local identity:
  - None after removing the old company-email certificate

## Notes

- The first `check:appintents:fresh` failed because the icon file timestamp was newer than the unsigned build `Info.plist`.
- A clean unsigned iPhone build refreshed the outputs and the check passed.
- This was not a runtime AppIntent bug.
