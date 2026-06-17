# AI Usage Widget Contract

This is the canonical wire contract for the Mac connector, local Wi-Fi endpoint, iOS app, WidgetKit extension, and future cloud relay.

## Product Language

- Product term: **Usage**.
- JSON field: `usage`.
- Do not use `allowance` in code or schema names.
- Widget header is fixed: `别问了还剩这么点🤏`.

## Snapshot Shape

The connector owns this sanitized shape. Provider output must be parsed into this contract before the phone or widget sees it.

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

## Rules

- Percent fields are **remaining**, not used.
- Canonical percent fields are `fiveHourRemainingPercent` and `weeklyRemainingPercent`.
- Canonical reset fields are `fiveHourResetAt` and `weeklyResetAt`.
- A provider may render a percentage only when `usage.available=true`, `usage.source` exists, and provider `capturedAt` exists.
- V1 snapshots must contain exactly one Claude provider and one Codex provider.
- V1 runtime accepts only `usage.source="codex_app_server"`, `usage.source="codexbar"`, or `usage.source="claude_code_tty"` for exact percentages. Planned future sources such as `sessions_jsonl` or `provider_api` must stay rejected until their adapters have privacy tests.
- `usage.sourceVersion` is optional, max 40 chars.
- `usage.available=false` requires `reason`: `no_stable_source`, `third_party_no_quota`, `not_logged_in`, or `collector_error`.
- `usage.available=false` must not carry source, sourceVersion, captured-at, percent, or reset keys, even as `null` placeholders.
- `usage.available=true` must not carry a fallback `reason`.
- Tier 0 CLI health/auth collectors must always use `usage.available=false`; they may prove status, not remaining quota.
- Codex app-server usage may set `usage.available=true` for Codex only from the local `account/rateLimits/read` result, using only `primary.usedPercent/windowDurationMins/resetsAt` and `secondary.usedPercent/windowDurationMins/resetsAt`, converted from used percent to remaining percent. The primary window must be 300 minutes and the secondary window must be 10,080 minutes.
- CodexBar usage may set `usage.available=true` only from allowlisted `usage.primary.usedPercent/resetsAt` and `usage.secondary.usedPercent/resetsAt`, converted from used percent to remaining percent.
- Raw CodexBar fields such as identity, account email, dashboard payloads, credits, and provider-specific extras must not pass through to snapshots.
- Claude Code TTY usage may set `usage.available=true` for Claude only from the local `/usage` screen, using only parsed current-session used percent/reset time, weekly used percent/reset time, and sanitized Claude Code version. Raw terminal output, account identifiers, prompts, transcripts, model breakdowns, and long provider text must not pass through to snapshots.
- Snapshots must not include tokens, cookies, credentials, secrets, Keychain values, transcripts, raw logs, email addresses, or long provider output.

## Approval Requests

Pending approval requests are owned by the Mac connector and are intentionally separate from the usage snapshot. The phone/widget may fetch one pending request from the paired Mac and cache it in App Group for widget buttons.

```json
{
  "ok": true,
  "request": {
    "schemaVersion": 1,
    "id": "fixture-approval",
    "source": "Mac 请求",
    "title": "允许这一步继续？",
    "createdAt": "2026-06-11T00:00:00.000Z",
    "expiresAt": "2026-06-11T00:15:00.000Z"
  }
}
```

Rules:

- Endpoint: `GET /v1/approval-request`.
- Authentication: same local bearer token as `/v1/ping` and `/v1/snapshot`.
- Empty state is `{ "ok": true, "request": null }`.
- Request fields are limited to `schemaVersion`, `id`, `source`, `title`, `createdAt`, and optional `expiresAt`.
- Dates must be iOS-decodable ISO strings, using `Z` or an explicit offset.
- The connector validates the request again at the HTTP response boundary before returning it.
- The iOS side rejects expired requests before writing to App Group. A successful `request:null` fetch means the Mac has no new request to offer; it must not clear a local Mac-owned pending request. Transport failure also preserves the current pending state.
- No prompt/message/comment/reason text, tokens, cookies, credentials, transcripts, raw logs, provider output, account identifiers, or long text may appear in an approval request.
- Approval fields must never appear inside the usage snapshot.

## Approval Decisions

Approval is intentionally separate from the usage snapshot. The phone/widget may submit a decision to the paired Mac connector, but `/v1/snapshot` must stay read-only status data.

```json
{
  "schemaVersion": 1,
  "requestId": "fixture-approval",
  "action": "approve"
}
```

Rules:

- Endpoint: `POST /v1/approval-decisions`.
- Authentication: same local bearer token as `/v1/ping` and `/v1/snapshot`.
- Allowed `action` values: `approve`, `deny`.
- The connector generates `decidedAt` and stores a local JSONL decision record under the private `.aiuw` directory.
- A matching decision clears the Mac-side pending approval request.
- A decision with no matching pending Mac request is rejected and stores nothing.
- No message/comment/reason/prompt text is accepted. Users who need to type should open the Claude/GPT app.
- Approval fields must never appear inside the usage snapshot.

## iOS Approval Attempt Diagnostics

The iOS app group may store one local `ApprovalAttemptDiagnostic` so the app can show what happened when the widget AppIntent was tapped. This is QA state only; it is not sent to the connector and it is not a decision record.

Rules:

- The diagnostic stores only `schemaVersion`, `attemptedAt`, `requestId`, optional binary `action`, `origin`, `outcome`, short `detail`, optional HTTP status, and attempted host count.
- It must not store URLs, hostnames, tokens, cookies, request/response bodies, prompt/message/comment/reason text, transcripts, raw logs, provider output, or long error strings.
- It never clears a pending approval request. Only a matching Mac-side decision receipt or a local UI fixture decision can clear pending state.
- The widget still exposes only approve/deny buttons.

## Fixtures

`fixtures/` contains six user-cacheable contract fixtures. These fixtures do not carry fake percentages; every provider uses `usage.available=false` until a real adapter supplies proven usage.

- `normal.json`: connected providers with unknown/no-meter usage.
- `degraded.json`: unknown usage and no-meter states.
- `offline.json`: Mac offline with no-meter last-known status.
- `not_logged_in.json`: provider disconnected.
- `error.json`: collector error with sanitized message.
- `stale.json`: stale/no-meter display state.
- `internal_meter_layout.json` and `internal_stale_meter_layout.json`: layout/test-only meter fixtures. They are not app-cacheable mock data and must not be presented as live usage proof.

Validate with:

```sh
npm run test:contract
```
