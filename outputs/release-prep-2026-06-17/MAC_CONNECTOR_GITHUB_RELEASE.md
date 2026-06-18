# Mac Connector GitHub Release Draft

## Recommendation

Use GitHub Releases for the Mac connector first. The current Developer ID build is signed, notarized, stapled, and Gatekeeper-accepted, but should still be positioned as a developer beta until the connector runtime no longer depends on this repository checkout.

Current blocker: the Mac app still depends on repo/npm paths. Do not publish it as a normal end-user download until the connector runtime is bundled, or make the release explicitly developer-only and say it requires Node.js plus this repository checkout.

## Release Title

AI Usage Connector for macOS 0.1.0 beta

## Tag

`mac-connector-v0.1.0-beta.1`

## Assets

Internal/private only:

- `AIUsageConnector-mac-adhoc-0.1.0.zip`
- `SHA256SUMS.txt`

Developer beta release should use:

- `AIUsageConnector-mac-developerid-notarized-0.1.0.zip`
- `SHA256SUMS-notarized.txt`

Checksum:

```text
704637b980e6cc4431c0e9bb5e0c184242ee40d988a32dab20977febf0ac43ee  AIUsageConnector-mac-developerid-notarized-0.1.0.zip
```

Completed:

- The app is signed with Developer ID and Hardened Runtime.
- Apple notarization is accepted.
- The accepted app is stapled.

Still required before a normal public asset:

- The connector no longer depends on a local source checkout, or the release notes clearly state the developer-only dependency.

## Release Notes

AI Usage Connector pairs your Mac with the AI Usage iPhone app and WidgetKit widget over local Wi-Fi.

### What it does

- Serves sanitized Claude/Codex usage snapshots to your paired iPhone.
- Shows a pairing QR code.
- Provides a local helper so the iPhone widget can refresh while the Mac app is not frontmost.
- Keeps provider tokens, cookies, transcripts, Keychain values, raw logs, and long provider output on the Mac.

### Install

1. Download the zip.
2. Unzip it.
3. Move `AIUsageConnector.app` to Applications.
4. Open it.
5. Enable the background helper if prompted.
6. Show the pairing QR and scan it in the iPhone app.

### Requirements

- macOS 13 or later.
- iPhone and Mac on the same Wi-Fi for v1.
- For this developer beta: Node.js/npm and this repository checkout are still required.

## GitHub Upload Path

This workspace is now pushed to the GitHub repository. The notarized zip can be uploaded as a developer beta release asset.

Created prerelease:

- `https://github.com/791806372-coder/onlythismuch/releases/tag/mac-connector-v0.1.0-beta.1`
- Asset digest reported by GitHub: `sha256:704637b980e6cc4431c0e9bb5e0c184242ee40d988a32dab20977febf0ac43ee`

Once a repo exists and GitHub CLI is authenticated, the command shape is:

```sh
gh release create mac-connector-v0.1.0-beta.1 \
  outputs/release-prep-2026-06-17/AIUsageConnector-mac-developerid-notarized-0.1.0.zip \
  outputs/release-prep-2026-06-17/SHA256SUMS-notarized.txt \
  --title "AI Usage Connector for macOS 0.1.0 beta" \
  --notes-file outputs/release-prep-2026-06-17/MAC_CONNECTOR_GITHUB_RELEASE.md
```
