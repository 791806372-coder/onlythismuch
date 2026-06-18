# App Store Connect Checklist

## App Information

- App Store name: `AI Widget Usage`
- In-app display name: `AI Usage`
- Bundle ID: `com.superzhangkai.aiusagewidget`
- SKU: `ai-usage-ios-001`
- Category: Productivity
- Content rights: owns/has rights to app content
- Age rating: likely 4+
- Availability: start outside Mainland China
- Languages:
  - English
  - Simplified Chinese
  - Traditional Chinese
  - Spanish
  - Portuguese
  - Japanese

## Build

- Archive scheme: `AIUsageWidgetApp`
- App target: `AIUsageWidgetApp`
- Widget extension target: `AIUsageWidgetExtension`
- Version: `1.0`
- Build: `2`
- Upload:
  - `build/AppStoreArchive/export/AIUsageWidgetApp.ipa`
  - Uploaded successfully to App Store Connect on 2026-06-17.
  - Wait for Apple processing before selecting the build on the version page.

## Privacy

- Tracking: No
- Data collected: None for v1 local Wi-Fi release
- Required permission explanations:
  - Camera: scan pairing QR code shown by Mac connector
  - Local Network: connect to paired Mac connector on same Wi-Fi
  - App Group/UserDefaults: share pairing, cached snapshot, widget settings between app and widget

## App Review Notes

- The iOS app does not ask users to log into OpenAI, Anthropic, GPT, or Claude.
- Usage data comes from a separately installed Mac connector on the same Wi-Fi.
- Pairing uses a QR/manual code generated on the Mac connector.
- Snapshot contains provider names, status, usage percentages when available, reset labels, and timestamps only.
- No cookies, tokens, transcripts, Keychain values, raw logs, or long provider output leave the Mac.

## Screenshots Needed

Lead with the funny product surface, not the setup explanation. The first screenshots should make people understand the attitude immediately.

Recommended order:

1. Paired dashboard with the playful headline and Claude/Codex usage cards.
   - Use the `骚话` surface first.
   - Candidate file: `outputs/app-store-screenshots/01-sao-dashboard-en.png`
2. Medium widget on Home Screen.
   - Show the playful header plus both providers.
   - This should be the strongest feature screenshot.
3. Small widget on Home Screen.
   - Show the single-provider mode and refresh icon.
4. Language/settings screen.
   - Show language picker plus Claude/Codex display options.
5. First launch pairing guidance.
   - Candidate file: `outputs/app-store-screenshots/04-first-run-mac-connector-en.png`
6. QR pairing screen or manual pairing screen.

For localized App Store pages, repeat the same order. Do not put a plain Mac-connector intro as screenshot 1.

## External URLs Needed

- Privacy Policy URL: `https://github.com/791806372-coder/onlythismuch/blob/main/outputs/release-prep-2026-06-17/PRIVACY_POLICY_DRAFT.md`
- Support URL: `https://github.com/791806372-coder/onlythismuch/issues`
- Mac Connector Download URL: `https://github.com/791806372-coder/onlythismuch/releases/tag/mac-connector-v0.1.0-beta.1`
