# Mac Connector GitHub Release Draft

## Recommendation

Use GitHub Releases for the Mac connector first, but only publish a public release after Developer ID signing and notarization. The current zip in this folder is ad-hoc signed and suitable for internal validation only.

## Release Title

AI Usage Connector for macOS 0.1.0 beta

## Tag

`mac-connector-v0.1.0-beta.1`

## Assets

Internal/private only:

- `AIUsageConnector-mac-adhoc-0.1.0.zip`
- `SHA256SUMS.txt`

Public release should instead use:

- `AIUsageConnector-mac-developerid-notarized-0.1.0.zip`
- `SHA256SUMS.txt`

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

## GitHub Upload Path

This workspace is now initialized as a git repo and points at the GitHub repository. Public release upload should wait until the Mac app is signed with Developer ID and notarized; pushing/uploading still depends on GitHub CLI, SSH, or HTTPS authentication.

Once a repo exists and GitHub CLI is authenticated, the command shape is:

```sh
gh release create mac-connector-v0.1.0-beta.1 \
  outputs/release-prep-2026-06-17/AIUsageConnector-mac-developerid-notarized-0.1.0.zip \
  outputs/release-prep-2026-06-17/SHA256SUMS.txt \
  --title "AI Usage Connector for macOS 0.1.0 beta" \
  --notes-file outputs/release-prep-2026-06-17/MAC_CONNECTOR_GITHUB_RELEASE.md
```
