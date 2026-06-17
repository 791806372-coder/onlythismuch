# App Store Connect Checklist

## App Information

- Name: `AI Usage`
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
- Version: `0.1.0`
- Build: `2`
- Required before upload:
  - App Store provisioning profiles for app and widget
  - App Group enabled for both bundle IDs

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

- First launch pairing guidance.
- QR pairing screen or manual pairing screen.
- Paired dashboard with Claude/Codex cards.
- Medium widget on Home Screen.
- Small widget on Home Screen.
- Language/settings screen.

## External URLs Needed

- Privacy Policy URL: `[TBD]`
- Support URL: `[TBD]`
- Mac Connector Download URL: `[TBD]`
