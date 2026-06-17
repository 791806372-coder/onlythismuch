# AI Usage App Store Readiness

Updated: 2026-06-17

## Decision

- iOS app goes through App Store / TestFlight.
- Mac connector stays a direct install first, distributed from a GitHub release or product download page.
- Mainland China storefront is deferred for the first public release. Start with regions outside Mainland China, then revisit ICP / app filing / China network needs after the core Mac-to-iPhone flow is proven.

## Current Local Status

- Apple Developer Program should be used through the personal Apple ID only.
- Local config points to the intended personal team.
- Local personal signing identities are available for Apple Development, Apple Distribution, Developer ID Application, and Developer ID Installer.
- The wired iPhone has been visible to Xcode/CoreDevice during local checks.
- A development build installed successfully to the connected iPhone on 2026-06-17.
- App Store upload still needs App Store Connect app setup, App Store provisioning profiles, and a Release archive/upload.
- Native iOS app + WidgetKit extension exist.
- Bundle ids are configured from `PRODUCT_BUNDLE_IDENTIFIER_PREFIX`:
  - App: `com.superzhangkai.aiusagewidget`
  - Widget: `com.superzhangkai.aiusagewidget.widget`
- App Group is configured as `group.com.superzhangkai.aiusagewidget`.
- App and widget entitlements both use `$(APP_GROUP_IDENTIFIER)`.
- `PrivacyInfo.xcprivacy` exists for app and widget.
- App privacy manifest currently declares:
  - no tracking
  - no collected data
  - UserDefaults required-reason API coverage for App Group storage
- Local Network permission is declared for app and widget.
- Camera permission is declared for QR pairing in the app.
- App icon includes the 1024px marketing icon.
- iPhone only target is intentional for V1.
- Current version is `0.1.0 (1)`.

## Changes Completed In This Pass

- Added localized iOS permission strings for:
  - English
  - 简体中文
  - 繁體中文
  - Español
  - 日本語
- Localized strings cover:
  - QR camera permission
  - Local Network permission for paired Mac connector refresh

## App Store Connect Checklist

1. Apple Developer Program
   - Confirm `ios/Config/Local.xcconfig` points to the intended personal Apple Developer team.
   - Keep only the personal Apple Developer team for this project.

2. Identifiers and capabilities
   - Register app id: `com.superzhangkai.aiusagewidget`.
   - Register widget id: `com.superzhangkai.aiusagewidget.widget`.
   - Register App Group: `group.com.superzhangkai.aiusagewidget`.
   - Enable App Groups on both app id and widget id.

3. Signing profiles
   - Create/download App Store distribution provisioning profiles for the app and widget.
   - Archive with Release signing.
   - Upload from Xcode Organizer or App Store Connect tooling.

4. App Store Connect app record
   - Name: `AI Usage`.
   - Category: Productivity or Utilities.
   - Primary language: recommend English for first release, with localized app metadata for 简体中文 / 繁體中文 / Español / 日本語.
   - Availability: start outside Mainland China.
   - Age rating: likely 4+, assuming no user-generated public content, no browser, no social features.

5. App privacy
   - Current intended answer: no tracking, no data collection.
   - Reason: iOS app stores pairing and minimal usage snapshots locally in App Group; no cloud relay in V1.
   - Revisit immediately if we add analytics, crash SDKs, accounts, cloud relay, push, or remote logs.

6. Review notes
   - Explain that the iOS app pairs with a separate Mac connector over same Wi-Fi.
   - Provide a Mac connector download link or TestFlight reviewer package.
   - Provide a safe demo path:
     - install Mac connector
     - open connector
     - scan QR in iPhone app
     - tap refresh
     - add widget
   - Explicitly state the app does not ask users to log in to OpenAI/Anthropic and does not collect tokens, cookies, transcripts, raw logs, or provider output.

7. Required URLs
   - Privacy Policy URL.
   - Support URL.
   - Mac connector download URL.
   - Optional marketing URL.

8. Screenshots
   - Capture clean App Store screenshots, not debug proof screenshots.
   - Suggested set:
     - onboarding / needs Mac connector
     - QR pairing flow
     - paired usage dashboard
     - medium widget on Home Screen
     - language/settings screen
   - Do not show private email, LAN host, token, QR bearer payload, raw diagnostics, or developer-only proof panels.

9. Mac connector release
   - For public users, sign and notarize the Mac app before linking it from the iOS App Store page.
   - A GitHub release is acceptable for early beta, but a simple product download page with install instructions is better for App Review and non-technical users.
   - Do not distribute a random unsigned `.app` to normal users.

## Mainland China Strategy

- For V1, avoid Mainland China App Store availability and avoid Mainland China-hosted cloud relay.
- Hong Kong, Taiwan, Singapore, US, EU, and other non-Mainland regions are cleaner for the first release.
- If we later open Mainland China:
  - check current Apple Mainland China compliance fields in App Store Connect,
  - confirm whether ICP / mobile app filing is required for the app and any website/cloud backend,
  - consider a Mainland-compatible relay only after legal/compliance review.

## Local Commands Before TestFlight

```sh
npm run generate:ios
npm run check:product
npm run check:ios
npm run check:ios-config
npm run build:ios:tests
npm run device:preflight:local
```

After Apple Developer membership is active and distribution signing exists:

```sh
npm run device:signing
npm run device:install
npm run device:evidence
```

Current 2026-06-15 result:

- `npm run device:signing`: 11 passes / 2 warnings / 0 failures.
- `npm run device:install`: succeeded and wrote `outputs/device-evidence/00-install-summary.json`.
- `npm run device:evidence`: 42 passes / 12 warnings / 1 failure.
- Remaining failure: capture and sidecar-bind the 12 required iPhone screenshots in `outputs/device-evidence`.

## Product Copy Guardrails

- Product term is `Usage`, not `Allowance`.
- Widget header:
  - English: `Stop asking, there’s only this much 🤏`
  - 简体中文: `别问了还剩这么点🤏`
  - Japanese should keep the same teasing tone, not become polite/helpful.
- V1 widget is Claude + Codex only for medium.
- Small/single-provider widget can show Claude-only or Codex-only.
- If usage cannot be proven, show unknown/no-meter copy. Never fake percentages.

## Official References Checked

- Apple App Review: https://developer.apple.com/app-store/review/
- App privacy details: https://developer.apple.com/app-store/app-privacy-details/
- Privacy manifest files: https://developer.apple.com/documentation/bundleresources/privacy_manifest_files
- TestFlight: https://developer.apple.com/testflight/
- App Store screenshots: https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/
- App Store Connect Mainland China compliance: https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-mainland-china-compliance-information/
