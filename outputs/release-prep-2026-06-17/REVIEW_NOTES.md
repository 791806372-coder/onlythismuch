# App Review Notes Draft

AI Usage is a local-first WidgetKit app. The iPhone app and widget show sanitized Claude/Codex usage snapshots produced by a separate Mac connector.

## How To Test

1. Install the iOS build.
2. Install AI Usage Connector on a Mac on the same Wi-Fi.
   - Mac connector download: `https://github.com/791806372-coder/onlythismuch/releases/tag/mac-connector-v0.1.0-beta.1`
   - The current connector is a developer beta and requires Node.js/npm plus this repository checkout.
3. Open the Mac connector and show the pairing QR code.
4. Open the iOS app and scan the QR code.
5. Tap refresh in the iOS app or widget.
6. Add the medium or small AI Usage widget to the Home Screen.

## Important Privacy Notes

- The iOS app does not ask users to log into GPT, Claude, OpenAI, or Anthropic.
- The iOS app cannot and does not read Claude/Codex usage directly from mobile apps.
- The Mac connector exposes a local authenticated endpoint to the paired iPhone only.
- Snapshot payloads are intentionally minimal: provider names, health state, usage percentages when available, reset labels, timestamps, and status captions.
- No cookies, tokens, Keychain values, transcripts, raw logs, raw LAN hosts, or long provider output are shown in the normal UI or sent as usage snapshots.

## V1 Scope

- V1 providers: Claude and Codex.
- Hermes/OpenClaw are reserved for later and are not in the first widget UI.
- Local Wi-Fi proof is the first transport.
- Cloud relay is not enabled in v1.
