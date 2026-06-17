# AI Usage Widget iOS

The iOS project is generated with XcodeGen.

For a fresh checkout, start from the repository root:

```sh
npm run setup:local
```

That creates `ios/Config/Local.xcconfig` from the example and generates the Xcode project when needed, while leaving Apple signing, LaunchAgent install, connector pairing, and iPhone state untouched.

## Local Signing

Copy the example signing config before generating the project:

```sh
cp Config/Local.xcconfig.example Config/Local.xcconfig
```

Then fill in:

- `DEVELOPMENT_TEAM`: the Personal Team ID from Xcode. After Xcode account setup, `npm run device:signing:apply` can fill this safely when one Apple Development team is inferable.
- `PRODUCT_BUNDLE_IDENTIFIER_PREFIX`: a bundle prefix you can sign, for example `com.superzhangkai`.
- `APP_GROUP_IDENTIFIER`: the App Group identifier shared by the app and widget, for example `group.com.superzhangkai.aiusagewidget`.

`Config/Local.xcconfig` is intentionally ignored because it is machine-specific.

## Generate Project

This workspace has XcodeGen 2.42.0 built locally under `work/XcodeGen`.

```sh
npm run generate:ios
```

The generated `.xcodeproj` is ignored. Re-run generation after editing `project.yml`.

## Simulator Build

From the repository root:

```sh
npm run build:ios:sim
```

This builds the app and widget for a generic iOS Simulator with signing disabled and `DerivedData` inside `build/DerivedData`.

## Native Test Build

The generated project includes an `AIUsageWidgetTests` XCTest scheme:

```sh
npm run build:ios:tests
npm run check:ios-tests:fresh
```

This builds the native test bundle for generic `iphoneos` with signing disabled. The freshness command is read-only; it fails if the built `AIUsageWidgetTests.xctest` or `AIUsageWidgetTests_iphoneos*.xctestrun` is missing or older than relevant iOS source/config inputs. The tests cover the shared Swift snapshot contract, `usage` vs rejected `allowance` fields, unsafe raw snapshot fields, App Group identifier resolution, local-only pairing, bounded host lists, manual terminal-block pairing paste, redacted-payload rejection, quick approval fetch/storage/submission, mismatched Mac approval receipt rejection, bounded approval-attempt diagnostics, the shared approval decision handler used by the app and widget AppIntent, and token-free widget/LAN diagnostics including sanitized transport errors. It also compiles shared helpers such as the widget refresh coordinator through the generated app/widget/test source phases. It does not execute the tests unless a healthy simulator or real device runtime is available. Keep the Xcode build as a separate explicit proof; aggregate `npm run check` runs only the freshness guard and points back to `npm run build:ios:tests` when stale.

## Device Build And Install

Show the next real-device gate from the current Mac state:

```sh
npm run device:next
```

Check local no-signing readiness first, then diagnose signing:

```sh
npm run device:preflight:local
npm run device:signing:apply
npm run device:signing
```

`device:signing:apply` fills only `DEVELOPMENT_TEAM` in `Config/Local.xcconfig` when one Team ID is inferable; use `npm run device:signing:apply -- --team TEAMID` if multiple teams are present. `device:signing` checks local signing config, Xcode first-launch state, Apple Development identities, provisioning profile presence, and iPhone visibility through the shared strict CoreDevice/Xcode parser, so failed `devicectl` JSON, unavailable/remembered/untrusted devices, and simulators do not count as a ready iPhone.

Before signing is ready, keep the local no-signing readiness gate and arm64 iPhone compile proof fresh:

```sh
npm run device:preflight:local
npm run device:build:unsigned
```

The local preflight proves no-signing project/connector/QR readiness. The unsigned build proves the iPhone app and embedded widget compile for `iphoneos`, but the product is not installable.

Signing bootstrap:

1. Open Xcode Settings > Accounts and add/sign into the Apple ID.
2. Select the team and create/download an Apple Development certificate.
3. Run `npm run device:signing:apply` to fill `DEVELOPMENT_TEAM`, or pass `-- --team TEAMID` if multiple teams are present.
4. Confirm the bundle prefix and App Group identifier.
5. Run `npm run device:signing`.
6. If this is the first install, use `npm run device:install -- --allow-provisioning-updates` when Xcode needs to register the device or refresh profiles.

After `DEVELOPMENT_TEAM` is filled and the iPhone is trusted/visible:

```sh
npm run device:build
```

This builds the signed `Debug-iphoneos` app and verifies the embedded widget extension exists. It does not install anything on the phone.

Install with:

```sh
npm run device:install
```

`device:install` builds, verifies the app/widget signatures, embedded provisioning profile, and signed App Group entitlements, locates one available physical iPhone through the shared strict `devicectl`/`xctrace` parser, then installs `build/DerivedData/Build/Products/Debug-iphoneos/AIUsageWidgetApp.app` using `xcrun devicectl device install app`. A successful install writes `outputs/device-evidence/00-install-summary.json` with a token-free summary. It runs the same installability gate when `--skip-build` is used, so an unsigned `device:build:unsigned` product is never treated as install-ready. It does not start the connector, rotate pairing tokens, or change LaunchAgent state. If Xcode needs to update signing profiles or register the device, rerun intentionally with:

```sh
npm run device:install -- --allow-provisioning-updates
```

## Device Preflight

Before trying the iPhone loop, run this from the repository root:

```sh
npm run device:preflight:local
npm run device:preflight
```

`device:preflight:local` checks the no-signing pieces: App Group wiring, app/widget Local Network plist keys, generated Xcode project presence, connector build output, port `8787`, QR address candidate validation, the full-token QR payload through the app's Swift parser, optional LaunchAgent service status, and temporary mock connector reachability through advertised QR addresses. Empty `DEVELOPMENT_TEAM` and physical iPhone visibility are warnings there; local project, connector, parser, and mock QR regressions remain failures.

`device:preflight` runs the same local checks plus hard signing and Xcode/CoreDevice iPhone visibility gates. It exits nonzero until the real-device requirements are ready.

For a running connector, `npm run connector:status:live` performs authenticated `/v1/ping` and `/v1/snapshot` probes against advertised local addresses and reports address counts plus sanitized error buckets. It is useful before scanning the QR, but it only proves reachability/auth/snapshot shape from this Mac. `npm run connector:doctor` summarizes pairing config, LaunchAgent state, installed LaunchAgent Node/CLI path health, and setup next actions without tokens; `npm run connector:doctor:live` adds the same live ping/snapshot proof when a pairing config exists. `npm run connector:service:status` separately checks whether the optional LaunchAgent is installed/loaded/running. The iPhone app still needs to trigger Local Network permission with `刷新 Usage`, and the widget's own LAN fetch remains best-effort.

After a device run, use:

```sh
npm run device:evidence
```

This is a token-safe proof checklist. It checks machine-verifiable items such as signing config, generated project, App Group values in build products, source and bundled privacy manifests, connector/service evidence, unsigned compile proof, and whether the iphoneos product is signed/provisioned enough to install. It writes `outputs/device-evidence/00-evidence-summary.json` with bounded pass/warning/failure counts plus install and screenshot proof counts, without raw command output, local host details, device identifiers, pairing payloads, bearer tokens, or screenshot contents. Manual phone evidence still needs screenshots in `outputs/device-evidence` using the filenames documented there. After install proof exists, strict `npm run device:evidence` exits nonzero until all required screenshots are present and sidecar-bound.

While Apple signing is still blocked, use `npm run device:evidence:local` for the same token-safe source/build audit with the signing-team check downgraded to a warning. It is not installed-iPhone proof, WidgetKit-rendering proof, iOS Local Network permission proof, or phone-to-Mac approval proof; strict `npm run device:evidence` remains the post-install evidence gate.

## M0 App Group Proof

The app target writes a test string into `$(APP_GROUP_IDENTIFIER)`, reads it back, reloads widget timelines, and the widget reads the same value. A successful read changes the widget header status to `✓ Proof HH:mm:ss`. If the app cannot write/read the App Group value, it shows the error instead of pretending proof mode worked. The app also shows the App Group config source; missing, unexpanded, or invalid `AIUsageAppGroupIdentifier` values fail closed instead of silently using a runtime fallback.

Real-device proof steps:

1. Run `npm run device:preflight:local` while signing/device visibility is blocked and keep it passing.
2. Run `npm run device:preflight` after signing and device visibility are available, then resolve its failures.
3. Install the app and widget on the iPhone 16 Pro Max.
4. Open the app and tap `写入测试字符串`.
5. Add or refresh the medium widget.
6. Confirm the widget header shows the exact proof string.
7. Tap `关闭证明模式` before testing fixture or LAN cache states.

This must pass on the real iPhone before later milestones depend on App Group storage. If the app shows fallback/missing/unexpanded App Group config, fix Xcode config before QR/LAN testing. If signed entitlements are present but the widget never shows `✓ Proof HH:mm:ss`, stop before QR/LAN testing and resolve App Group provisioning/account capability first.

## Fixture And LAN Cache

The app can cache all six root fixtures into the App Group container. The widget header distinguishes:

- Xcode preview fallback: `预览 fixture`
- real no-cache fallback: `没缓存😏`
- fixture cache: `Fixture · 刚刚`
- LAN cache: `LAN · 刚刚`
- widget-originated LAN cache: `Widget LAN · 刚刚`
- offline snapshot: `Mac 装睡了💤 · 最后 HH:mm`

The no-cache widget fallback uses the degraded unknown/no-meter fixture. The six app-cacheable fixtures never show percentages; meter bars appear only from LAN/collector data or from debug/internal layout previews.

After saving a QR pairing payload, the raw token is replaced immediately in the app UI with a redacted saved message. The saved-pairing row shows the Mac name, host count, and port only; it does not render the raw LAN IP, `.local` hostname, or token. The save path fails loudly if App Group storage is unavailable or the app cannot round-trip the saved payload, because the widget would not be able to fetch without that shared storage.

The connector's default terminal JSON is also redacted and cannot be pasted into the app. Scan the QR for normal pairing. If QR scanning is unavailable or the scanner reports a startup/availability failure, generate a pasteable payload with `npm run pair:manual` and avoid sharing that terminal output. Manual pairing rotates the local connector bearer token, so paste the new JSON or the bounded terminal block containing that JSON before testing connection. If a redacted status/terminal block is pasted by mistake, the app points back to `npm run pair:manual` instead of treating it as a normal unknown-field error.

The real-device pairing path rejects `localhost` and `127.*` hosts. Those are useful for simulator-style loopback checks, but on an iPhone they point back at the phone and waste the widget's short LAN refresh window.

Before starting a connector for QR pairing, run `npm run connector:service:status`. If the optional LaunchAgent is already loaded/running on port `8787`, use it and confirm the endpoint with `npm run connector:status:live`. If you specifically want the fixture mock proof and the service already owns port `8787`, run `npm run connector:service:unload` before `npm run start:mock`; after mock proof, stop `npm run start:mock` before `npm run start:real` or `npm run connector:service:load`, because all three connector modes use port `8787`.

After starting or verifying the connector, run `npm run connector:doctor:live` or `npm run connector:status:live` in another terminal if you need to confirm the Mac connector is answering before testing the iPhone. Plain `npm run connector:status` and `npm run connector:doctor` are intentionally read-only and do not create a missing pairing config.

The app's `刷新 Usage` button shows live diagnostics for the ping and snapshot calls, then writes the latest snapshot into the App Group cache and reloads the widget timelines. The diagnostics show address index, success/failure mark, and HTTP status/error caption. They deliberately do not render LAN IPs, `.local` hostnames, the bearer token, URLs, or response bodies, so screenshots stay safer while still showing which address attempt worked.

The medium widget uses `aiusage://refresh` as its tap target. The app registers the `aiusage` URL scheme and shows a short refresh prompt when opened from the widget.

## Widget LAN Refresh

The app-side cache is the primary WidgetKit data path. After the app saves a pairing payload and proves Local Network access with `刷新 Usage`, the widget also attempts a short best-effort LAN fetch from the saved payload. If it succeeds, the cache source is saved as `widget-lan` and displayed as `Widget LAN`; if it fails, the widget silently falls back to the latest App Group cache or preview fixture.

The widget asks WidgetKit for a new timeline every 15 minutes, but iOS can still throttle or delay background widget refreshes. The header refresh icon runs `RefreshUsageIntent` in place, reuses the same bounded widget LAN fetch, and then asks WidgetKit to redraw. Tapping the widget body still opens the app through `aiusage://refresh`, and the app's `刷新 Usage` button remains the most deterministic manual refresh path.

The pairing host list is capped at four hosts, and the widget uses the same cap with a shorter timeout so it does not drop a valid fallback host while staying bounded. Device testing still needs to prove extension-originated LAN fetches after the containing app grants Local Network permission.

Each widget-side LAN attempt stores a small App Group diagnostic that the app shows in `Widget LAN 诊断`. This distinguishes no widget run from skipped/no-pairing, success, and failure. It also shows the widget refresh approval-sync outcome: saved request, no request, failed, or timed out. The diagnostic stores only path, status, attempted-host count, timestamp, approval-sync outcome, optional HTTP status/count, and short captions; it does not store hostnames, URLs, tokens, or response bodies.

The widget's refresh path is centralized in `WidgetRefreshCoordinator`, and `npm run check:ios` validates the no-device branches: proof mode skips network, missing pairing skips network, pending requests are saved, `request:null` preserves any existing Mac-owned pending request, success writes `widget-lan`, and failures preserve the existing cache while writing a bounded diagnostic. Widget-originated approval sync and snapshot fetch also share a short refresh budget; slow approval polling is allowed to time out so the snapshot fetch still gets a chance inside WidgetKit's limited execution window.

## Quick Approval

The app has a `快速批准` section for Mac-owned pending requests, with a local fixture fallback for UI-only approve/deny proof. `从 Mac 拉请求` fetches `GET /v1/approval-request` from the paired connector and saves a valid pending request into App Group. A successful empty Mac response means there is no new Mac request; it does not clear a local Mac-owned pending request. A transport failure also leaves the current request visible. The local `本地 UI 测试请求` path still creates a bounded test request for UI proof before the real Mac loop. There is intentionally no text field for user messages.

The medium widget reads the pending request from App Group and shows compact approve/deny buttons in the header. During widget-side LAN refresh, it also tries `GET /v1/approval-request`; a returned request is saved, and `request:null` is treated as no new Mac request, not as permission to clear local pending state. The app buttons and widget AppIntent are backed by the shared approval decision handler. If a paired Mac exists, the handler first posts the minimal decision to `/v1/approval-decisions`; the local Mac-owned request clears only when the connector returns `ok:true` with the same request id and action. If the Mac is unreachable or returns a mismatched receipt, the request stays pending. Without pairing, only a local UI fixture decision is recorded locally so the UI can be tested before the real Mac loop. App buttons and widget AppIntent both write one bounded local approval-attempt diagnostic that the app's `快速批准` section can show; widget-originated records appear as `Widget 上次`. Each diagnostic stores outcome, short detail, optional HTTP status, and attempted-host count only. After a paired approval succeeds, `npm run connector:approvals` shows a bounded Mac-side summary with request id, action, timestamp, and pending request metadata only.

`npm run smoke:local-approval` proves that loop without Apple signing: a temporary mock connector serves a bounded pending request, accepts a minimal approve decision, clears the Mac-side request only after a matching request-id/action receipt, validates the approval responses with the shared Swift decoder, and checks command output for bearer-token leaks.

Approval state is separate from the usage snapshot. It stores only request id, source/title fixture metadata, action, timestamps, and the local widget-attempt diagnostic described above; it does not store prompts, comments, transcripts, raw logs, tokens, cookies, URLs, hostnames, request bodies, or response bodies.

## Widget Visual Previews

The widget source includes a Debug `PreviewProvider` gallery for safe normal/offline/no-cache states plus internal meter-layout states. The app's cache buttons use only the six safe `PreviewSnapshots.allFixtures` entries.

For review outside Xcode, generate SVG previews from the root fixtures:

```sh
npm run render:widget-previews
```

The SVG files are written to `outputs/widget-previews`. The six user fixture SVGs are no-meter; internal meter SVGs are layout/copy review aids only; device proof SVGs mirror no-cache, proof mode, LAN cache, Widget LAN cache, old fixture-cache headers, pending approval, and old meter-cache stale copy. Real WidgetKit proof still needs the iPhone screenshot set in `outputs/device-evidence`. After adding or replacing those screenshots, run `npm run device:evidence` once to write `outputs/device-evidence/screenshot-proofs.json`, then run it again to prove the current screenshot files still match the manifest proof text and file fingerprints. The manifest also requires app-origin and widget-origin approval diagnostic screenshots from `快速批准` (`App 上次` and `Widget 上次`) after paired-Mac approval attempts. Run `npm run device:runbook` for the compact token-safe phone proof sequence generated from the same screenshot manifest.

## Local Validation

Run the static iOS checks and Swift fixture decoder from the repository root:

```sh
npm run check:ios
```

This validates `project.yml`, plists, entitlements, Swift parse checks, decoding the six user fixtures plus internal layout fixtures through the shared Swift `Codable` model, embedded Swift preview fixture parity with root fixtures, rejection of fake meters in user fixtures, rejection of unsafe raw snapshot JSON, root-contract platform/string bounds, the stdin pairing validator wrapper, oversized pairing host-list/text/token rejection, pairing-display privacy, the iOS local-host pairing rules, manual terminal-block pairing paste, redacted-payload rejection with the manual-pairing message, widget LAN diagnostic encode/decode, widget refresh coordinator branches, approval store validation, approval diagnostic validation, approval decision handler behavior, and mocked LAN request behavior. The LAN validator confirms the request carries the bearer header, host attempts are capped, approval GET has no body, approval POST bodies are minimal, 401 responses become sanitized diagnostics, and tokens/hostnames/response bodies are not stored in App Group diagnostics. It still does not prove iOS Local Network permission behavior or WidgetKit scheduling on a real device.

Run the no-signing App Group/config drift guard with:

```sh
npm run check:ios-config
```

This verifies `Config/Local.xcconfig`, `Config/Local.xcconfig.example`, XcodeGen source wiring, source plists/entitlements, source privacy manifests, generated privacy manifest project references, and any existing simulator/iphoneos build products all agree on `APP_GROUP_IDENTIFIER`. An empty `DEVELOPMENT_TEAM` is expected before Apple signing and is only a warning in this check.

Run the built AppIntent metadata guard with:

```sh
npm run device:build:unsigned
npm run check:appintents
```

Use `npm run check:appintents:fresh` when you want one command that first accepts already-fresh unsigned metadata, rebuilds only when it is missing/stale/invalid, and then validates again. Root `npm run check` uses that fresh path.

This reads Xcode's extracted `Metadata.appintents/extract.actionsdata` from both the standalone widget extension and the widget embedded in the app under `Debug-iphoneos`. It fails unless the built metadata contains exactly `AIUsageWidgetConfigurationIntent` with non-interactive `provider`, `RefreshUsageIntent` with no parameters, and `ApprovalDecisionIntent` with only `requestId` and `actionRawValue`; all must keep `openAppWhenRun=false` and have no interactive/freeform text-like approval parameter. This is still not a substitute for tapping the AppIntent on a real iPhone, but it proves the unsigned build metadata matches the provider-picker, refresh, and approve/deny-only source contract.

Use `npm run build:ios:tests` alongside this check when changing the shared Swift contract or pairing logic, because it compiles the same rules through the generated Xcode test target. Use `npm run check:ios-tests:fresh` afterward to prove the existing test bundle and `.xctestrun` still match the current source.

The iOS checks do not exercise real Mac collectors. Use `npm run smoke:real-collectors` from the repository root when you need fresh proof that this Mac can produce a sanitized Tier 0 Claude/Codex snapshot without usage percentages.
