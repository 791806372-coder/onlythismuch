# Claude Code Review Status

Status: completed on 2026-06-18.

Claude Code ran a read-only release-readiness review. No files were edited by Claude Code.

## Findings

### Resolved

- Mac Developer ID signing did not use Hardened Runtime.
  - Fixed in `mac/AIUsageConnector/script/build_and_run.sh`.
  - Rechecked with Developer ID signing; `codesign -dv --verbose=4` now reports `flags=0x10000(runtime)`.
- Mac app bundle lacked standard release version keys.
  - Fixed in `mac/AIUsageConnector/script/build_and_run.sh`.
  - Current app reports `CFBundleShortVersionString = 0.1.0` and `CFBundleVersion = 1`.

### Still Blocking

- Mac notarization credentials are not saved locally yet.
  - `AIUsageNotary` is still missing from Keychain.
  - Use `outputs/release-prep-2026-06-17/NOTARIZATION_CREDENTIALS.md`.
- Mac connector is not a normal standalone public download yet.
  - The current app still shells out to repo/npm commands and locates the source workspace.
  - Public release should wait for bundled connector runtime packaging, or be clearly labeled as a developer-only beta requiring Node.js and this repo checkout.
- App Store submission still needs listing work.
  - Hosted privacy URL.
  - Hosted support URL.
  - Mac connector download URL.
  - Store screenshots, with playful `骚话` dashboard/widget surfaces first.
  - Privacy answers, review contact info, build selection, and final manual submission.

### Review Tone Risk

Claude flagged the playful copy as a possible App Review/age-rating risk. I am not changing it automatically because the tone is intentional product identity. Before submission, review the final screenshots and age-rating answers with this risk in mind.
