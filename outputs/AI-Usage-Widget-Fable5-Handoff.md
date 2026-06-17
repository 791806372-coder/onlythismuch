# Handoff: AI Usage Widget

> Superseded note: this was a pre-implementation handoff. The current source of truth is `CONTRACT.md` plus `outputs/AI-Usage-Widget-Implementation-Plan-v4.md`. In particular, V1 snapshots now require exactly one Claude provider and one Codex provider, and valid unavailable usage reasons are `no_stable_source`, `third_party_no_quota`, `not_logged_in`, and `collector_error`.

Audience: Fable 5 reviewer  
Status: Product/architecture handoff; implementation has not started  
Working title: `别问了还剩这么点🤏`

## 1. What We Want To Build

Build a native iOS app with a WidgetKit medium widget that shows AI coding-tool status and usage meters, visually inspired by the provided iPhone screenshot.

The key widget vibe is intentionally playful, with a mocking meme tone:

- Keep the header line: `别问了还剩这么点🤏`
- Dark rounded widget, compact status cards, green/orange meter bars.
- It should feel like a friend lightly roasting your usage situation, not an enterprise admin panel.
- User mentioned SBTI as inspiration: treat that as meme/social-product flavor, similar to a funny MBTI-style identity/status layer, not a clinical personality system.
- Fallback copy should be sharper than polite defaults: prefer `用量装神秘🙄`, `无表可看😏`, `Mac 摆烂了💤`, `没登录还想看？😒`, `探测翻车了🤡`.

Core user story:

> I want to glance at my iPhone widget and know whether Codex/Claude/Hermes-like tools are usable, how much usage remains when available, and whether my Mac is currently reporting data.

## 2. Product Decisions Already Made

- Use a **native iOS WidgetKit app**, not Scriptable.
- First widget size is **medium**, matching the screenshot.
- V1 targets **Mac first**, Windows later.
- First technical proof of concept uses **same-Wi-Fi local connection**.
- Closed beta should add a **cloud relay** so the widget works away from home.
- Pair phone and desktop by **QR code**.
- Do **not** ask users to log into GPT/Claude inside our iPhone app unless official account APIs expose the exact data we need.
- If exact usage is unavailable, show `Unknown` or `No usage meter`, never fake a percentage.
- If Mac is offline, show `Offline` plus last known values/timestamp.

## 3. Architecture Recommendation

### MVP: Local Wi-Fi Proof Of Concept

Components:

1. **iOS app**
   - Scans QR code from Mac connector.
   - Stores paired endpoint URL/token.
   - Lets user choose enabled providers: Codex, Claude Code, Hermes/OpenClaw later.
   - Shares latest snapshot with WidgetKit through an app group.

2. **WidgetKit extension**
   - Renders medium widget.
   - Shows provider cards and status bars.
   - Uses cached snapshot from the iOS app.
   - Shows stale/offline state based on `updatedAt`.

3. **Mac connector**
   - Runs locally on the Mac.
   - Exposes a small authenticated JSON endpoint on LAN.
   - Displays a QR code containing endpoint URL + pairing token.
   - Collects only safe signals: auth status, version, health, provider type, usage if stable source exists.

4. **Cloud relay, beta phase**
   - Desktop connector pushes small snapshots.
   - iPhone reads latest snapshot from relay.
   - Relay marks computer stale/offline if updates stop.
   - No cookies, raw logs, transcripts, or provider tokens should be uploaded.

## 4. Snapshot Contract

Use one minimal JSON shape for both local endpoint and future cloud relay:

```json
{
  "schemaVersion": 1,
  "device": {
    "id": "mac-stable-id",
    "name": "Kai's Mac",
    "platform": "macOS",
    "online": true,
    "updatedAt": "2026-06-11T20:30:00+08:00"
  },
  "providers": [
    {
      "id": "codex",
      "displayName": "Codex",
      "connected": true,
      "health": "working",
      "version": "0.139.0",
      "usage": {
        "available": false,
        "reason": "no_stable_source",
        "fiveHourRemainingPercent": null,
        "weeklyRemainingPercent": null,
        "fiveHourResetAt": null,
        "weeklyResetAt": null
      }
    },
    {
      "id": "claude",
      "displayName": "Claude",
      "connected": true,
      "health": "working",
      "version": "2.1.170",
      "usage": {
        "available": false,
        "reason": "third_party_no_quota",
        "fiveHourRemainingPercent": null,
        "weeklyRemainingPercent": null,
        "fiveHourResetAt": null,
        "weeklyResetAt": null
      }
    }
  ]
}
```

Important rule:

- `usage.available = false` means render `Unknown` or `No usage meter`.
- Only render green/orange percentage bars when the connector has a stable, explainable source.
- Canonical fields are `fiveHourRemainingPercent`, `weeklyRemainingPercent`, `fiveHourResetAt`, and `weeklyResetAt`. Do not use the older `fiveHourPercent` / `weeklyPercent` shape.

## 5. Current Mac Findings

These were observed on the user's Mac during planning:

- `Codex.app` is installed.
- Codex CLI exists at `/Users/kaizhang/.local/bin/codex`.
- Codex CLI version: `0.139.0`.
- `codex login status` reports: `Logged in using ChatGPT`.
- `codex doctor --json --summary` exposes useful redacted health data.
- Codex install appears managed through a Hermes Node path under `/Users/kaizhang/.hermes/node/...`.
- No obvious stable `codex usage` CLI command was visible.
- `Claude.app` is installed.
- Claude Desktop bundle id: `com.anthropic.claudefordesktop`.
- Claude Desktop version observed: `1.11847.5`.
- Bundled Claude Code executable exists under `Application Support/Claude/claude-code/2.1.170`.
- Claude Code version: `2.1.170`.
- `claude auth status` returned machine-readable JSON:
  - `loggedIn: true`
  - `authMethod: oauth_token`
  - `apiProvider: firstParty`
- Local `cc` is `/usr/bin/cc`, Apple compiler, not Claude Code.
- `ccswitch` was not found in the current shell path.
- Process listing was blocked in the sandbox, so the connector should use normal app APIs/permissions rather than assuming shell process inspection always works.

## 6. Provider Behavior

### Codex

V1 reliable signals:

- installed/not installed
- logged in/logged out
- version
- health from redacted doctor output

Unclear:

- exact 5-hour and weekly usage percentage for personal ChatGPT/Codex subscription.

Render rule:

- If no stable usage source exists, show connected/working plus `Unknown` usage.

### Claude / Claude Code

V1 reliable signals:

- Claude Desktop installed/not installed
- Claude Code bundled version
- auth status from `claude auth status`
- first-party vs third-party provider when available

Special case:

- If user uses CC Switch or broadcasts terminal Claude Code to another provider, do not show a remaining usage meter unless the collector knows that provider has a quota and can read it safely.

Render rule:

- First-party Claude auth can show connected.
- Third-party/no-limit providers should show `No usage meter`.

### Hermes / OpenClaw

V1 should not overreach.

Possible first signals:

- Hermes runtime path exists
- Codex installed through Hermes
- future known daemon/process/health command

Render rule:

- Status-only first: `Working`, `Offline`, or `Unknown`.

## 7. Proposed Sub-Agent Team

Use these sub-agents when implementation starts:

1. **Product/UX Agent**
   - Owns widget tone, Chinese microcopy, SBTI-inspired mocking feel, and screenshot fidelity.
   - Keeps `别问了还剩这么点🤏`.

2. **iOS WidgetKit Agent**
   - Builds SwiftUI app, WidgetKit extension, app group cache, QR scanner flow, and medium widget layout.

3. **Mac Connector Agent**
   - Builds Mac local server, QR pairing screen, safe provider collectors, and status snapshot endpoint.

4. **Provider Collector Agent**
   - Implements Codex and Claude collectors.
   - Strictly separates auth/health from usage.
   - Avoids cookies, local storage scraping, transcript reading, or fragile UI scraping.

5. **Protocol/Security Agent**
   - Defines pairing token, local endpoint auth, snapshot schema, stale/offline logic, and future cloud relay compatibility.

6. **QA/Device Agent**
   - Tests on this Mac and iPhone 16 Pro Max.
   - Verifies same-Wi-Fi pairing, widget refresh, offline state, stale last-known display, Codex/Claude auth status, and CC Switch/no-limit behavior.

7. **Cloud Relay Agent, later**
   - Designs beta relay only after local POC works.
   - Ensures snapshots are minimal and privacy-preserving.

## 8. Implementation Order

Recommended sequence:

1. Build Mac connector mock endpoint with static sample JSON.
2. Build iOS app QR pairing against that local endpoint.
3. Build medium WidgetKit UI using cached sample snapshot.
4. Replace mock endpoint with real Codex/Claude safe collectors.
5. Add offline/stale behavior.
6. Test on iPhone 16 Pro Max over same Wi-Fi.
7. Add cloud relay only after POC works reliably.

## 9. Review Questions For Fable 5

Please review these decisions:

1. Is local Wi-Fi POC before cloud relay the right build order?
2. Is the snapshot schema minimal enough while still future-proof?
3. Is QR pairing the right user experience for a non-technical user?
4. Should the Mac connector be native Swift, Electron, or a small local CLI/server for the POC?
5. Are the provider collector boundaries strict enough for privacy and App Store review?
6. Should the first widget include only Codex/Claude, or include a placeholder Hermes/OpenClaw status slot too?
7. How should the widget phrase `Unknown` vs `No usage meter` so it feels fun rather than broken?

## 10. External Context Checked

- SBTI appears to be a 2026 Chinese social-media meme/personality-test trend inspired by MBTI, with humorous/abstract labels and AI-assisted origin. Use it as tone inspiration, not as a serious personality model.
- Claude Code docs mention cost/usage concepts and `/usage` in Claude Code, but the local Claude CLI help did not show a clean non-interactive `usage` subcommand.
- OpenAI usage APIs exist for API/organization usage, but that is not the same as a personal ChatGPT/Codex subscription usage counter.

References:

- Claude Code costs and usage: https://code.claude.com/docs/en/costs
- Claude Pro/Max with Claude Code: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
- SBTI context: https://zh.wikipedia.org/wiki/SBTI%E6%B5%8B%E8%AF%95
- KDE Connect local device precedent: https://userbase.kde.org/KDEConnect
- Signal linked-device QR precedent: https://support.signal.org/hc/en-us/articles/360007320551-Linked-Devices
