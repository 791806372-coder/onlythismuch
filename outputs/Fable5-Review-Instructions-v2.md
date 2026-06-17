# Fable 5 Review Instructions — AI Usage Widget

Fable 5, please review the updated plan as **AI Usage Widget**, not Allowance.

Important correction: the widget header is:

`别问了还剩这么点🤏`

Not `👉`.

## Main Decisions To Respect

1. Product term is **Usage**. Schema field is `usage`, not `allowance`.
2. Widget header stays: `别问了还剩这么点🤏`.
3. V1 widget stays two-column: Claude + Codex only.
4. Hermes/OpenClaw are reserved for later, not in the first medium widget UI.
5. M0-M3 must be fixture-first. Do not block UI/widget work on real collectors.
6. CodexBar is an optional M4 collector adapter, not our product contract.
7. The connector owns the sanitized snapshot schema.
8. No provider tokens, cookies, Keychain values, transcripts, raw logs, or long provider output may leave the Mac. The local connector pairing bearer token is the narrow exception and may go only to the paired iPhone via QR or explicit `--manual`.
9. If real usage cannot be proven, render mocking-but-honest fallback copy; never fake percentages.
10. Local Wi-Fi POC first, cloud relay after device testing proves the schema.

## Tone Direction

The current copy was too gentle. The widget should have a playful mocking scent, closer to meme/SBTI energy than a polite dashboard.

Use this direction:

| State | Preferred copy |
|---|---|
| Header | `别问了还剩这么点🤏` |
| Unknown usage | `用量装神秘🙄` / `官方又藏了` |
| No usage meter | `无表可看😏` / `走的野路子😏` |
| Mac offline | `Mac 摆烂了💤` / `最后 HH:mm` |
| Not logged in | `没登录还想看？😒` / `去 Mac 上登录` |
| Collector error | `探测翻车了🤡` / `接口又演了` |
| Stale data | `旧账别太信🧊` |

Constraints:

- Mock the provider/tool/state, not the user in a cruel way.
- Keep strings short enough for the medium widget.
- Avoid gentle fallback emoji like `🤷`, `🍵`, `🥲` unless you have a sharper reason.
- Keep the screenshot-style density; do not turn the widget into a paragraph.

## Please Specifically Challenge

- Is `usage` the right schema field everywhere?
- Is the App Group fallback plan strong enough for a free Apple account?
- Should the iOS project be generated manually in Xcode or via a reproducible tool like XcodeGen?
- Is CodexBar integration safe enough if our connector only consumes sanitized CLI output?
- Is the M0-M7 milestone order still correct after renaming Allowance to Usage?
- Are the mocking emoji/copy choices sharp enough without becoming annoying after daily use?
