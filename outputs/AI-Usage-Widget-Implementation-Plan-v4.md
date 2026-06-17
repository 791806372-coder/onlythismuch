# AI Usage Widget — Implementation Plan v4

Prepared for: Kai + Fable 5 review loop  
Reviewed by: Codex  
Date: 2026-06-11  
Status: Fable 5 review v2 absorbed; fixture-first M0-M3 local implementation exists; real iPhone gates still pending  
Widget header: `别问了还剩这么点🤏`

## 1. Codex Opinion

Fable 5's plan is directionally strong and much more buildable than the v1 handoff. I agree with the core architecture: native iOS WidgetKit app, Mac-first connector, QR pairing, same-Wi-Fi proof of concept, and a later cloud relay.

My recommended adjustments:

1. **Use CodexBar as an optional collector adapter, not the foundation of our product.** Its CLI and provider work look real and useful, but our connector should own the stable snapshot schema and sanitize everything before the phone sees it.
2. **Build M0-M3 with fixtures only.** Do not block iOS/widget progress on real usage collection.
3. **At M4, verify CodexBar output on Kai's actual Mac before assuming exact fields.** Pin the tested CodexBar version and fail soft to `用量装神秘🙄`.
4. **Do not read tokens, browser cookies, Keychain items, or provider private storage ourselves in v1.** If CodexBar needs local credentials, that is a user-approved local tool step; our connector only consumes its sanitized CLI output.
5. **Keep local Wi-Fi first, but design transport as replaceable.** Widget LAN refresh can be unreliable on iOS. If device testing burns a day, pull cloud relay forward.
6. **Keep Hermes/OpenClaw out of the medium widget UI for v1.** Keep the runtime schema Claude + Codex only until later collectors are actually implemented and tested.

Bottom line: proceed with Fable 5's milestone plan, but treat CodexBar integration as a measured M4 validation step rather than a guaranteed dependency from day one.

Fable 5 review v2 changes incorporated:

- CLI name is `aiuw`, not `aiaw`.
- Canonical usage fields are `fiveHourRemainingPercent` and `weeklyRemainingPercent`.
- V1 runtime accepts only `usage.source="codexbar"` for exact percentages. Future sources such as `sessions_jsonl` and `provider_api` stay planned work until their adapters exist and pass privacy tests.
- App Group entitlement proof moves to M0; if it fails on the free Apple account, the real fallback is a paid Apple Developer account.
- iOS project generation uses XcodeGen plus an untracked local signing config.
- Fixtures cover every display state, not only normal/degraded/offline.
- CodexBar adapter must use allowlist extraction, output caps, timeout, and live-path serializer tests.
- Real-device LAN reachability moves to M2.
- Fallback sublines can rotate by day; header never rotates.
- Swift/iOS must reject unsafe raw snapshot JSON before `Codable` decoding can drop unknown fields.
- `SnapshotStore` remains useful for fixture injection/cache, but it is not a real fallback if App Groups fail.
- M0-M3 are allowed to ship with fixture/mock data only; real collectors stay out until the local app/widget path is proven.
- The running connector must accept a newly rotated pairing token after `aiuw pair` and reject the old token.
- Pairing QR may contain the bearer token, but terminal JSON should be redacted by default. Full pasteable JSON requires explicit `--manual`.
- Manual pairing rotates the local connector bearer token, so old QR codes and saved pairings should be expected to return `401`.
- Cached snapshots should carry saved-at/source metadata so the app Preview and widget can distinguish preview, fixture cache, LAN cache, and offline states.
- Widget-side LAN refresh is implemented only as a bounded best-effort path; app-side cache remains primary because WidgetKit can throttle or skip network work.
- Pairing host lists are capped at four hosts and rejected on iOS if oversized, so widget refresh cannot burn its execution window on a long interface list.
- The widget extension carries local-network plist metadata, but real-device testing still owns the final proof that extension-originated LAN works after the app prompts for Local Network access.
- The M0 App Group proof write now fails visibly if the app cannot write/read back the shared value, so the app cannot pretend proof mode worked before the widget sees it.
- The app shows proof mode as on/off and clears stale widget LAN diagnostics when proof mode changes, because proof mode intentionally blocks widget-originated LAN refresh.
- The app records bounded ping/snapshot host-attempt diagnostics during `测试连接`, and the widget records bounded App Group diagnostics for widget-originated LAN attempts so device QA can distinguish no widget run, skip, success, and failure.
- The no-signing Swift validator now proves embedded Swift preview fixtures match root fixtures, and mocks LAN requests to prove bearer-header use, host-attempt caps, 401-to-sanitized-diagnostic behavior, and no token/header/response-body leakage in stored reports.
- The widget now uses `aiusage://refresh` so tapping the medium widget opens the app's refresh surface.
- The no-cache widget fallback must never show real-looking fixture percentages; it uses unknown/no-meter copy until fixture cache, LAN, or real collector data exists.
- A device preflight command now checks signing, App Group wiring, local-network plist keys, connector readiness, optional LaunchAgent status, QR host candidates, temporary mock ping plus Swift-valid snapshot reachability through those hosts, and Xcode/CoreDevice iPhone visibility before the real-device loop.
- A device next-step command now summarizes the current Mac state, detects Apple Development Team ID mismatch, parses only physical iPhones from `xctrace`, checks CoreDevice visibility before command-line install readiness, prints the single next real-device gate, and lists useful unsigned compile/evidence commands while signing/device access is blocked.
- Device preflight now also validates the connector's full-token QR payload with the app's Swift pairing parser, so connector/iOS drift is caught before the iPhone scan loop.
- A device evidence command now provides a read-only post-run audit for machine-checkable proof, validates the screenshot manifest, checks saved screenshots are usable PNG proof, and lists required manual screenshots without treating missing screenshots as hard failures.
- A no-signing iOS config drift guard now verifies `Local.xcconfig`, source plists/entitlements, XcodeGen wiring, and existing build products agree on `APP_GROUP_IDENTIFIER` before the phone test loop.
- A device build/install helper now builds the signed `Debug-iphoneos` app + embedded widget and installs with `devicectl` only through the explicit install script path; it does not touch connector pairing, launchd, or tokens. Successful command-line install writes a token-free `outputs/device-evidence/00-install-summary.json`.
- A signing diagnosis command now checks local signing config, Xcode first-launch state, Apple Development identities, Team ID identity match when inferable, provisioning profile presence, and physical iPhone visibility before the real-device loop without writing project state.
- `aiuw status` remains a redacted pairing/config report; `aiuw status --live` is the explicit authenticated `/v1/ping` plus `/v1/snapshot` probe for a running connector and must never print tokens, authorization headers, snapshots, provider output, or raw response bodies.
- The iOS project now includes a reproducible XcodeGen XCTest target, `AIUsageWidgetTests`, covering the shared Swift contract, exact Claude+Codex provider-set validation, `usage` vs rejected `allowance`, unavailable/available usage contradiction rejection, unsafe raw snapshot fields, local-only pairing, bounded host lists, and token-free widget LAN diagnostics.
- A repeatable `npm run smoke:real-collectors` command now validates the real Tier 0 Claude/Codex collectors on this Mac without emitting usage percentages or secret-bearing fields.
- Codex Tier 0 now includes a sanitized `codex doctor --json --summary` health probe. The connector reads only redacted `overallStatus`, never doctor detail fields, and can mark Codex degraded without inventing usage percentages.
- CodexBar remains a usage overlay only. It can add usage only for a connected, working Tier 0 provider whose usage reason is still `no_stable_source`; it cannot promote logged-out, missing, timed-out, third-party/no-quota, degraded, error, or already-metered Tier 0 status.
- Claude third-party detection now keeps official Anthropic base URLs first-party unknown usage and maps only explicit third-party/custom routes to `third_party_no_quota`.
- Tier 0 executable discovery now includes Claude Code version-store binaries and the bundled Codex.app CLI path, while preserving sanitized fallback semantics.
- Persisted iOS pairing rejects loopback hosts (`localhost` and `127.*`), malformed hosts, unknown fields, oversized host lists, and invalid tokens before saving. App Group pairing saves now fail loudly if the widget would not be able to read the saved payload.

## 2. Product Target

Build a native iOS app and medium WidgetKit widget that shows AI coding-tool usage/status for a user's own Mac.

The widget should match the provided screenshot vibe:

- dark rounded widget
- compact two-column layout
- Claude + Codex provider cards
- playful Chinese copy
- header fixed as `别问了还剩这么点🤏`
- green/orange/red remaining-usage bars when real percentages exist
- funny, slightly mocking fallbacks when percentages are unavailable

Primary states:

| State | Display |
|---|---|
| Fresh data | normal meters and `刚刚` / relative update time |
| Stale data | keep last meters, mark as `旧账别太信🧊` |
| Mac offline | dim last-known values, show `Mac 摆烂了💤 · 最后 HH:mm` |
| Unknown usage | `用量装神秘🙄` + `官方又藏了` |
| Third-party/no quota | `无表可看😏` + `走的野路子😏` / `没用量账本` |
| Not logged in | `没登录还想看？😒` + `去 Mac 上登录` |
| Collector error | `探测翻车了🤡` + `接口又演了` |

Emoji/tone rule:

- The widget should feel like a friend lightly roasting your usage situation, not like a support dashboard.
- Prefer dry, mocking emoji: `🤏`, `🙄`, `😏`, `😒`, `🤡`.
- Avoid overly gentle emoji for fallback states: `🤷`, `🍵`, `🥲` are too soft for this product direction.
- Do not mock the user for privacy/security failures; roast the tool/provider/state instead.
- Keep success state deadpan: fresh data shows meters and `刚刚`, no jokes.
- Header is fixed forever. Fallback sublines may rotate deterministically by day so jokes do not get stale.
- Keep fallback copy compact: target about 7 CJK chars plus one emoji per subline.

## 3. Architecture

V1 has three local components:

1. **iOS app**
   - Scans QR code from the Mac connector.
   - Stores endpoint and token.
   - Tests Local Network access from the app, not the widget.
   - Shows an in-app status preview.
   - Refreshes and caches the latest snapshot for the widget.

2. **WidgetKit extension**
   - Medium widget only.
   - Reads cached snapshot and optionally attempts a bounded best-effort fetch from the saved pairing payload.
   - Falls back to cache on network failure.
   - Tapping the widget opens the app for a manual refresh.

3. **Mac connector**
   - Node 20+ / TypeScript CLI for POC.
   - Serves `GET /v1/ping` and `GET /v1/snapshot` over LAN with bearer-token auth.
   - Prints a QR code containing host, port, device id, and token.
   - Polls collectors on a timer, but HTTP requests always return the cached snapshot quickly.

Later beta:

- Add a cloud relay, likely Cloudflare Worker + KV.
- Connector pushes sanitized snapshots.
- iOS reads snapshots over HTTPS.
- Same snapshot schema; different transport only.

## 4. Snapshot Contract

The connector owns this sanitized schema. The phone should never receive raw provider output.

```json
{
  "schemaVersion": 1,
  "device": {
    "id": "mac-stable-id",
    "name": "Kai's Mac",
    "platform": "macOS",
    "connectorVersion": "0.1.0",
    "online": true,
    "updatedAt": "2026-06-11T19:30:00+08:00"
  },
  "providers": [
    {
      "id": "claude",
      "displayName": "Claude",
      "connected": true,
      "health": "working",
      "version": "2.1.170",
      "usage": {
        "available": false,
        "reason": "no_stable_source"
      }
    },
    {
      "id": "codex",
      "displayName": "Codex",
      "connected": true,
      "health": "degraded",
      "version": "0.139.0",
      "usage": {
        "available": false,
        "reason": "no_stable_source"
      }
    }
  ]
}
```

Rules:

- Percent means **remaining**, not used.
- V1 snapshots must contain exactly one Claude provider and one Codex provider.
- A percent can only render if `available=true`, `source` exists, and `capturedAt` exists.
- `usage.available=false` requires `reason`: `no_stable_source`, `third_party_no_quota`, `not_logged_in`, or `collector_error`.
- `usage.available=false` must not carry provider `capturedAt`, source, percent, or reset values.
- `usage.available=true` must not carry a fallback `reason`.
- `usage.source` is required when `available=true`; V1 accepts only `codexbar`.
- `usage.sourceVersion` is optional, string, max 40 chars, and should record adapter/tool version when available.
- Optional `error.message` must be short and sanitized. No raw command output dumps.
- No email addresses, cookies, OAuth tokens, Keychain values, transcripts, or long strings in snapshots.

Fixtures to create first:

- User-cacheable fixtures: `normal.json`, `degraded.json`, `offline.json`, `not_logged_in.json`, `error.json`, and `stale.json`.
- All user-cacheable fixtures keep every provider at `usage.available=false`; no fixture cache or default mock path may show fake usage percentages.
- `normal.json`: connected providers with unknown/no-meter usage.
- `degraded.json`: unknown usage and third-party/no-meter states.
- `offline.json`: Mac offline with no-meter last-known status.
- `not_logged_in.json`: one or both providers disconnected.
- `error.json`: collector error with sanitized short message.
- `stale.json`: stale/no-meter display state.
- Internal layout fixtures: `internal_meter_layout.json` and `internal_stale_meter_layout.json`. They exist only for display-state tests and preview/layout review, not app cache buttons or default mock usage.

## 5. Pairing And Local Endpoint

QR payload:

```json
{
  "v": 1,
  "deviceId": "mac-stable-id",
  "name": "Kai's Mac",
  "hosts": ["192.168.1.23", "Kais-Mac.local"],
  "port": 8787,
  "token": "base64url-32-bytes"
}
```

Endpoint behavior:

- `GET /v1/ping` returns `{ "ok": true, "deviceId": "...", "name": "..." }`.
- `GET /v1/snapshot` returns the snapshot contract.
- Both require `Authorization: Bearer <token>`.
- Invalid auth returns `401`.
- Logs include timestamps/status only, not snapshot content.
- `aiuw pair` rotates the token and prints a new QR code.
- `aiuw pair --manual` / `npm run pair:manual` is the explicit pasteable full-token path for users who cannot scan QR, and it rotates the local connector bearer token.
- `aiuw status --live` checks only the connector's capped local advertised hosts through `/v1/ping` and `/v1/snapshot`, reporting ping-reachable hosts, snapshot-ready hosts, `snapshotLooksValid`, and sanitized failures. It proves Mac-local connector reachability/auth/snapshot shape only, not iPhone Local Network permission.
- `aiuw service plist` and `aiuw service install` generate a user LaunchAgent that starts the connector with `--quiet-pairing`, so service logs do not contain QR codes, pairing payloads, bearer tokens, snapshots, or provider output. `aiuw service status` is read-only and reports plist/launchd state without raw launchctl output. `aiuw service load/unload` are explicit user actions and are not called by tests.

iOS details:

- Add `NSLocalNetworkUsageDescription`.
- Add ATS local networking permission for the POC.
- Trigger Local Network permission from the app's "测试连接" button.
- Widget network calls are best-effort only; cache is primary.
- Keep widget fetch timeouts short and host attempts capped.
- Use XcodeGen for the iOS project. Commit `project.yml`; ignore generated `.xcodeproj`.
- Keep native iOS tests in the XcodeGen spec so contract and pairing rules compile inside Xcode, not only in script-level Swift checks.
- Pin the XcodeGen version in repo setup instructions.
- Use an untracked `Local.xcconfig` for `DEVELOPMENT_TEAM`, `PRODUCT_BUNDLE_IDENTIFIER_PREFIX`, and `APP_GROUP_IDENTIFIER`.
- M0 must prove App Group sharing on the real iPhone before any feature depends on it.
- If signed entitlements look correct but the widget never shows `✓ Proof HH:mm:ss`, stop before QR/LAN testing and resolve App Group provisioning/account capability.
- Run `npm run device:preflight` before M0 and resolve every failure; it is a diagnostic gate, not a CI check.
- Run `npm run device:next` whenever the real-device loop is unclear; it reports the next gate from the current local state, including Team ID mismatch and CoreDevice visibility.
- Run `npm run device:signing` when `DEVELOPMENT_TEAM`, certificate, provisioning, or device visibility fails.
- Run `npm run device:build:unsigned` only as arm64 iphoneos compile proof; it is not installable proof.
- Run `npm run device:build` after signing is configured to prove the iphoneos app and widget are signed, provisioned, and carry the configured App Group entitlement before installing.
- Run `npm run device:install` to install with `devicectl`, or install from Xcode if command-line CoreDevice remains unreliable.
- Run `npm run device:evidence` after real-device attempts to separate machine-verifiable evidence from manual screenshot proof, including a separate unsigned-compile vs signed-installable product check and `outputs/device-evidence/manifest.json` validation.
- Run `npm run check:ios-config` before device testing or after changing signing/App Group settings. It must fail on source/build App Group drift but only warn on an empty `DEVELOPMENT_TEAM`.
- Treat `00-install-summary.json` as command-line install evidence when `device:install` succeeds. If installing from Xcode because CoreDevice is unreliable, continue manual QA but expect `device:evidence` to warn until command-line evidence exists.
- Keep a `SnapshotStore` abstraction for fixture injection and tests, not as a substitute for App Group transport.
- Store cache saved-at/source metadata alongside the snapshot. The widget should show preview, fixture, LAN, proof, and offline states explicitly.
- Store only bounded LAN diagnostics: path, host, status, timestamp, and short captions. Never store tokens, auth headers, response bodies, or raw provider output in diagnostics.
- After saving a pairing payload, redact the raw token immediately in the app UI.

## 6. Collector Plan

### Tier 0: Local health, always implemented by us

Codex:

- Implemented now: run `codex --version`.
- Implemented now: run `codex login status`.
- Implemented now: run `codex doctor --json --summary` as a coarse health probe, reading only redacted `overallStatus` and never transmitting doctor details.
- Implemented now: locate Codex CLI through `PATH` plus fixed common local paths such as `~/.local/bin/codex`, `~/.hermes/node/bin`, `/opt/homebrew/bin/codex`, and `/usr/local/bin/codex`.
- Implemented now: locate the bundled Codex CLI at `/Applications/Codex.app/Contents/Resources/codex` and `~/Applications/Codex.app/Contents/Resources/codex` before falling back to app metadata.
- Implemented now: locate `/Applications/Codex.app` and `~/Applications/Codex.app`, reading only `CFBundleShortVersionString` as sanitized version fallback when CLI version output is unavailable.
- Map health to `working`, `degraded`, `error`, or `unknown`.

Claude:

- Implemented now: run `claude --version`.
- Implemented now: run `claude auth status` with timeout/cap safeguards.
- Implemented now: locate Claude CLI through `PATH` plus fixed common local paths such as `~/.local/bin/claude`, `~/.hermes/node/bin`, `/opt/homebrew/bin/claude`, and `/usr/local/bin/claude`.
- Implemented now: locate executable Claude Code version-store binaries in `~/.local/share/claude/versions`, newest semantic version first.
- Implemented now: locate `/Applications/Claude.app` and `~/Applications/Claude.app`, reading only `CFBundleShortVersionString` as sanitized version fallback when CLI version output is unavailable.
- Implemented now: map explicit Claude third-party/provider-route signals such as CC Switch, OpenRouter, OpenAI-compatible, custom API base/provider, Vertex AI, Bedrock, or non-Anthropic base URLs to `usage.reason="third_party_no_quota"` while keeping usage percentages unavailable.
- Implemented now: keep official Anthropic base URLs such as `https://api.anthropic.com` first-party with `usage.reason="no_stable_source"`.
- Still pending: locate a stable Claude Desktop app-bundle CLI path if Anthropic ships one; this Mac currently exposes Claude Code through the version store instead.
- Still pending: broaden first-party vs CC Switch-style third-party detection only if more stable, sanitized CLI signals are proven.
- If `apiProvider` is not first-party or a CC Switch-style third-party route is detected, render `No usage meter` instead of usage percentages.

Current Tier 0 rule:

- Version/auth collectors never set usage percentages.
- Connected first-party status maps to `usage.available=false` and `reason="no_stable_source"` until a stable usage source exists.
- Explicit logout maps to `reason="not_logged_in"`.
- Missing, timed-out, capped, or unstable collector commands map to `reason="collector_error"` with generic sanitized messages.
- `npm run smoke:real-collectors` is the current repeatable proof that this Mac's real Tier 0 collector path stays sanitized and percentage-free.

### Tier 1: CodexBar CLI, optional primary usage source

Implemented as an explicit opt-in adapter; live verification should still wait until device gates and CodexBar installation are ready.

Expected commands to validate on Kai's Mac:

- `codexbar --version`
- `codexbar usage --provider both --format json --json-only`

Safe local probe:

- `npm run smoke:codexbar`
- If CodexBar is missing, the probe reports `skipped: true` with `reason="codexbar_not_found"` and exits without blocking the fixture-first build.
- If CodexBar is present, the probe prints only command status and allowlisted usage summary. It must not print raw CodexBar stdout/stderr.

Integration rule:

- Parse only `provider`, sanitized version metadata, `usage.primary.usedPercent/resetsAt`, and `usage.secondary.usedPercent/resetsAt`.
- Convert used percent to remaining percent when necessary.
- Record `source: "codexbar"` and the CodexBar version.
- Store the CodexBar version in `usage.sourceVersion`; do not overload `usage.source`.
- Normalize provider `version` and `usage.sourceVersion` through the version extractor; drop arbitrary non-version text instead of copying it into the snapshot.
- If CodexBar output changes or fails, degrade to `用量装神秘🙄`.
- Use allowlist extraction only. Unknown CodexBar fields are dropped, never passed through.
- Preserve Tier 0 status. CodexBar cannot set `connected=true`, clear sanitized errors, upgrade health, or override a provider that the local CLI collector says is logged out, missing, timed out, third-party/no-quota, degraded, error, or already metered.
- Apply CodexBar usage only when Tier 0 already says the provider is connected, working, error-free, and still has `usage.reason = "no_stable_source"`.
- Reject invalid JSON, invalid dates, missing primary/secondary windows, unknown providers, and out-of-range/non-integer percentages instead of clamping or fabricating data.
- Cap subprocess stdout, apply timeout, and treat capped/killed output as no overlay rather than breaking Tier 0 status.
- Keep default connector mode off; enable only with `--codexbar`.
- Run the forbidden-key serializer test against live adapter output as well as fixtures once CodexBar is installed.

Important: CodexBar may access local credentials/cookies/Keychain depending on source settings. That should remain a local, user-approved CodexBar concern. Our connector should not duplicate that behavior in v1.

### Tier 2: Codex sessions fallback, Codex only

Optional fallback after Tier 1:

- Scan newest `~/.codex/sessions/**/*.jsonl` from the end.
- Extract only timestamp and `rate_limits`.
- Never read, log, or transmit prompt/response content.
- Mark stale using `capturedAt`.
- Record `source: "sessions_jsonl"`.
- Do not add `sessions_jsonl` to the accepted V1 schema until this adapter and its privacy tests are implemented.

### Tier 3: Unknown

If no stable source works:

- `usage.available=false`
- `reason="no_stable_source"`
- UI renders `用量装神秘🙄`.

## 7. Sub-Agent Team

Use these roles when implementation starts:

1. **Protocol/Security Agent**
   - Snapshot schema, pairing token, auth, serializer tests, stale/offline rules.

2. **Mac Connector Agent**
   - Node/TS CLI, Fastify/Hono server, QR output, config, collector loop.

3. **Provider Collector Agent**
   - Codex/Claude Tier 0 collectors, CodexBar adapter, fallback behavior.

4. **iOS App Agent**
   - SwiftUI app, QR scan, Local Network permission flow, in-app status view.

5. **WidgetKit Agent**
   - Medium widget UI, fixture rendering, cache/fetch timeline behavior.

6. **Product/UX Agent**
   - Screenshot fidelity, playful zh-CN microcopy, SBTI-meme vibe.

7. **QA/Device Agent**
   - iPhone 16 Pro Max + Mac same-Wi-Fi test pass, screenshots, offline/stale scenarios.

8. **Cloud Relay Agent, later**
   - Cloudflare Worker/KV relay after local POC proves the schema.

## 8. Milestones

### M0 — Monorepo scaffold, contract, and iOS project proof

Deliver:

- `/fixtures`
- `/connector`
- `/ios`
- `CONTRACT.md`
- `project.yml` for XcodeGen.
- `.gitignore` rule for generated `.xcodeproj`.
- `Local.xcconfig.example`; real `Local.xcconfig` stays untracked.

Acceptance:

- Zod schema validates all six fixtures.
- Zod schema rejects missing, duplicate, or future V1 providers; every snapshot has exactly one Claude and one Codex provider.
- Zod coverage also validates the internal meter-layout fixtures while keeping the six user-cacheable fixtures no-meter.
- Swift Codable structs decode all six fixtures.
- Swift validation rejects missing/duplicate provider sets and contradictory usage objects.
- Serializer test rejects forbidden keys like token/cookie/secret/key/credential and long strings.
- iOS raw snapshot decoding rejects unsafe raw JSON before model decoding.
- Zod rejects unknown `usage.source` values.
- Empty app + widget extension generated via XcodeGen.
- Pairing persistence fails visibly if App Group storage is unavailable; there is no fake shared-storage fallback.
- The M0 proof button writes and reads back the App Group proof value before reporting success.
- Signed `Debug-iphoneos` app build embeds `AIUsageWidgetExtension.appex`.
- On the real iPhone 16 Pro Max with the free Apple account, app writes one test string into the App Group container and widget reads it.
- If App Group proof fails, stop and upgrade to paid Apple Developer Program before continuing.

### M1 — Mock Mac connector

Deliver:

- `aiuw start --mock fixtures/normal.json --port 8787`
- `aiuw pair`
- `aiuw status`
- `aiuw status --live`
- `aiuw service plist`
- `aiuw service install`
- `aiuw service status`
- `aiuw service load`
- `aiuw service unload`
- `aiuw service uninstall`

Acceptance:

- `/v1/ping` and `/v1/snapshot` work with token.
- Missing/wrong token returns `401`.
- Re-pairing rotates the token while the server is running; old token fails and new token works.
- QR payload decodes to the expected JSON.
- Plain `aiuw status` never prints the token; `aiuw status --live` never prints tokens, authorization headers, snapshots, provider output, or raw response bodies.
- `aiuw service status` is read-only and never prints pairing tokens, authorization headers, snapshots, provider output, raw launchctl output, or response bodies.
- LaunchAgent plist uses absolute `ProgramArguments`, not shell strings or `npm run`, and includes no tokens, pairing payloads, snapshots, provider output, or broad secret-bearing environment variables.
- LaunchAgent load/unload commands use fixed `launchctl` argv without shell strings; tests validate argv only and never load services.

### M2 — iOS pairing and in-app status

Deliver:

- QR scanner.
- Scanner sheet header with `aiuw pair` guidance plus cancel/manual-paste actions.
- Manual JSON entry fallback.
- Test connection button.
- In-app preview using fetched snapshot.

Acceptance:

- iPhone scans Mac QR on same Wi-Fi.
- Local Network prompt appears in the app.
- iOS rejects malformed or non-local QR hosts before saving the pairing.
- iOS rejects `localhost` and `127.*` for persisted real-device pairing; those hosts point at the phone, not the Mac.
- Saving a pairing round-trips through App Group storage before the app reports `已配`.
- Manual pairing input disables autocorrection/capitalization and clears token-bearing text after a successful save.
- Re-pairing after token rotation works.
- Real-device LAN reachability is tested here with the mock connector, before real collectors exist.
- App-side connection diagnostics show ping vs snapshot host attempts and the winning host/status without displaying tokens or response bodies.
- If app-side LAN fetch is unreliable after one day of testing, pull M7 cloud relay forward.

### M3 — Medium widget

Deliver:

- WidgetKit medium widget.
- Fixture-driven UI.
- Fixture-based SVG visual-review artifacts under `outputs/widget-previews`.
- Debug native `PreviewProvider` gallery for key medium-widget states.
- Cache-first timeline.
- Tap-to-open app.

Acceptance:

- `normal.json` renders the screenshot-style structure without fake usage percentages.
- Internal meter-layout fixtures exercise meter bars and stale meter copy without being app-cacheable mock data.
- `npm run render:widget-previews` generates six user fixture SVGs plus internal layout SVGs for copy/layout review, without treating them as real WidgetKit proof.
- User and internal fixtures together cover all seven display states.
- Offline header shows `Mac 摆烂了💤 · 最后 HH:mm`.
- Stale meters show `旧账别太信🧊`.
- Widget header distinguishes proof mode, preview fixture, fixture cache, LAN cache, and offline snapshot states.
- Widget-originated LAN attempts leave an App Group diagnostic visible in the app so testers can tell whether the widget ran, skipped, succeeded, or failed.
- Fallback sublines rotate deterministically by day while the header remains fixed.
- Widget refresh observed within iOS budget.

### M4 — Real collectors

Deliver:

- Basic Tier 0 Codex and Claude CLI collectors.
- CodexBar adapter.
- Soft-failure path to Unknown/No usage meter.

Acceptance:

- Codex auth/version/health shown correctly.
- Claude auth/version/provider shown correctly.
- Tier 0 collectors never report usage percentages.
- Collector timeouts, capped output, and missing CLIs produce generic `collector_error` snapshots with no raw stdout/stderr.
- CodexBar meters match provider UI within a small tolerance after manual verification.
- Temporarily disabling CodexBar degrades gracefully.
- CC Switch/third-party/no-quota path renders `无表可看😏`.
- CodexBar adapter drops unknown fields, caps stdout, times out safely, and passes serializer tests on live output.
- Local unit coverage proves CodexBar is opt-in, invokes fixed argv without shell strings, drops account/email/dashboard fields, and converts used percent to remaining percent.

### M5 — Offline and stale behavior

Deliver:

- Stale thresholds.
- Offline rendering.
- Last-known snapshot persistence.

Acceptance:

- Killing connector produces dimmed last-known widget state.
- Old provider `capturedAt` marks the provider as stale.

### M6 — Device QA

Deliver:

- Test checklist and screenshots.
- `npm run device:evidence` post-run proof audit.
- `outputs/device-evidence/manifest.json` as the stable list of required screenshot filenames and proof text.

Acceptance:

- Fresh pair.
- Re-pair.
- Router IP change / `.local` fallback.
- Overnight phone sleep.
- Provider logout/login.
- All key UI states photographed.
- Device evidence validates the screenshot manifest, rejects corrupt/tiny screenshot placeholders, distinguishes signing/build/connector facts from screenshots, and exits nonzero only for machine-verifiable missing prerequisites.

### M7 — Cloud relay, post-POC

Deliver:

- Small HTTPS relay using same snapshot schema.
- Connector push mode.
- iOS relay source.

Acceptance:

- Phone works away from same Wi-Fi.
- Relay marks Mac offline when snapshots age out.
- No new secret-bearing fields.

## 9. Main Risks

| Risk | Response |
|---|---|
| Widget LAN fetch is unreliable | App cache first; test reachability in M2; if still bad after one day, pull cloud relay forward. |
| CodexBar output changes | Pin version, parse defensively, degrade to Unknown. |
| Provider internals change | Version-gate collectors and never crash the connector. |
| Free Apple account limits | Accept 7-day redeploy during POC; paid Apple account needed for TestFlight/closed beta. |
| App Groups fail with personal team | M0 proof catches this early; real fallback is paid Apple Developer account, not a fake storage abstraction. |
| Privacy/App Store concerns | No provider login in iOS app; Mac connector emits only sanitized snapshots. |

## 10. External Facts Verified By Codex

- CodexBar repository exists, is public, and is MIT-licensed.
- CodexBar currently advertises Codex and Claude provider support.
- CodexBar docs describe CLI JSON usage output and a local `serve` command.
- CodexBar's `serve` command is localhost-only, so our Mac connector should call the CLI or wrap sanitized output rather than exposing CodexBar directly to the LAN.
- CodexBar docs describe Codex data paths including OAuth API, Codex CLI RPC, and optional OpenAI web extras.
- CodexBar docs describe Claude data paths including OAuth usage and CLI PTY fallback.

References:

- CodexBar: https://github.com/steipete/CodexBar
- CodexBar CLI docs: https://github.com/steipete/CodexBar/blob/main/docs/cli.md
- CodexBar Codex provider docs: https://github.com/steipete/CodexBar/blob/main/docs/codex.md
- CodexBar Claude provider docs: https://github.com/steipete/CodexBar/blob/main/docs/claude.md
- Codex CLI usage issue: https://github.com/openai/codex/issues/15281
- Claude Code costs: https://code.claude.com/docs/en/costs
- Claude Pro/Max with Claude Code: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
