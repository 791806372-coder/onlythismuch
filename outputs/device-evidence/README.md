# AI Usage Widget Device Evidence

This folder is the handoff point for the real iPhone 16 Pro Max test pass.

`manifest.json` is the source of truth for required manual screenshots. `npm run device:evidence` validates the manifest shape, requires usable PNG files at least `300x180`, validates the fingerprint sidecar for present screenshots, and prints the expected proof text for anything still missing. Before install proof exists, missing screenshots remain warnings so signing/install blockers stay clear. After install proof exists, strict `npm run device:evidence` exits nonzero until all required screenshots are present and sidecar-bound. While Apple signing is still blocked, `npm run device:evidence:local` runs the same token-safe audit with the missing signing team downgraded to a warning; it is not installed-iPhone, WidgetKit-rendering, iOS Local Network permission, or phone-to-Mac approval proof.

`npm run device:install` writes this machine-verifiable file after a successful command-line install:

- `00-install-summary.json`: token-free summary proving signed app/widget install through `devicectl`

`npm run device:next` writes this machine-verifiable file before install succeeds:

- `00-device-readiness.json`: token-free current gate summary for signing, local preflight, build/install readiness, pairing, and screenshot-manifest counts. It intentionally omits Team IDs, device identifiers, pairing payloads, bearer tokens, and raw command logs.

`npm run device:evidence` writes this machine-verifiable file on every strict audit run:

- `00-evidence-summary.json`: token-free strict post-run audit summary with pass/warning/failure counts, install-evidence readiness, screenshot-manifest readiness, screenshot proof counts, and bounded check names only. It intentionally omits raw command output, device identifiers, pairing payloads, bearer tokens, local host details, and screenshot contents.
- `screenshot-proofs.json`: token-free fingerprint sidecar binding each present screenshot to its manifest index, proof-text hash, file hash, byte size, dimensions, and modified time. It intentionally omits screenshot contents, raw command output, device identifiers, pairing payloads, bearer tokens, local host details, and provider data.

`npm run device:evidence:local` writes this machine-verifiable file while signing is blocked:

- `00-local-evidence-summary.json`: token-free local-only audit summary for Mac-side/source/build readiness. It does not replace `00-evidence-summary.json`, does not bind screenshots, and does not prove install, WidgetKit rendering, iOS Local Network permission, or phone-to-Mac approval.

`screenshot-proofs.json` proves file identity and basic PNG dimensions only; it does not visually inspect whether the screenshot content is correct.

After adding or replacing screenshot PNGs, run `npm run device:evidence` once to write the updated `screenshot-proofs.json`, then run it again to prove the screenshots still match the sidecar. If `00-install-summary.json` exists, screenshot proof files must be newer than that install summary.

Save iPhone proof screenshots here with these filenames:

Before QR pairing, run `npm run connector:service:status`. If the LaunchAgent is loaded/running, use that connector and confirm it with `npm run connector:status:live`. If you specifically want the fixture mock proof and the service already owns port `8787`, run `npm run connector:service:unload` before `npm run start:mock`; after the mock proof, stop `npm run start:mock` before `npm run start:real` or `npm run connector:service:load`, because all three connector modes use port `8787`.

| File | Proof required |
|---|---|
| `01-app-group-proof.png` | Medium widget header shows `✓ Proof HH:mm:ss` after tapping `写入测试字符串`. |
| `02-qr-pairing.png` | App shows the Mac pairing is saved after QR scan or manual JSON paste, with host count/port only and no raw LAN host or token. |
| `03-lan-cache.png` | App shows successful `测试连接`, `LAN · 刚刚` cache, and no token or raw host in diagnostics. |
| `04-widget-lan.png` | After `关闭证明模式`, Widget shows `Widget LAN` or app `Widget LAN 诊断` shows `Widget 摸到了` plus approval sync, with no token/host/URL/body. |
| `05-offline-stale.png` | Widget shows `Mac 摆烂了💤` or `旧账别太信🧊` while preserving last-known safe values. |
| `06-final-widget.png` | Medium widget matches the two-column Claude/Codex direction with header `别问了还剩这么点🤏`, and small widget can show one selected provider. |
| `07-widget-tap-refresh.png` | After tapping the widget, the app opens and shows the `Widget 喊你...` refresh prompt. |
| `08-approval-pending.png` | After `npm run connector:approvals:seed` and app `从 Mac 拉请求`, Widget shows approve/deny controls for the Mac-owned request. |
| `09-approval-decision.png` | App/widget clears only after paired Mac receipt; `npm run connector:approvals` output is saved or checked with bounded id/action. |
| `10-local-network-permission.png` | iOS Local Network permission prompt is accepted, or Settings shows AI Usage Local Network enabled before LAN proof. |
| `11-approval-app-diagnostic.png` | `快速批准` shows `App 上次` diagnostic after paired app approve/deny, with `Mac 已收` or safe failure detail and no token/host/URL/body. |
| `12-approval-widget-diagnostic.png` | `快速批准` shows `Widget 上次` diagnostic after Widget approve/deny AppIntent, with `Mac 已收` or safe failure detail and no token/host/URL/body. |

Use `npm run connector:approvals:clear` to reset the local pending request after approval QA.

Do not use `本地 UI 测试请求` as acceptance proof for `08-approval-pending.png`, `09-approval-decision.png`, `11-approval-app-diagnostic.png`, or `12-approval-widget-diagnostic.png`; it is only a local UI fixture. The approval screenshots must start from `npm run connector:approvals:seed`, then `从 Mac 拉请求`, then a paired-Mac approve/deny receipt.

Then run:

```sh
npm run device:evidence
```
