# App Store Metadata Draft

## Name

AI Usage

## Subtitle

Claude and Codex usage widgets

## Promotional Text

Pair your iPhone with a Mac connector and keep Claude/Codex usage on your Home Screen without logging into provider accounts inside the app.

## Description

AI Usage is a local-first iPhone app and WidgetKit widget for people who want a quick glance at Claude and Codex usage.

Install the Mac connector, pair your iPhone by scanning a QR code, then add the widget to your Home Screen. The widget can show Claude, Codex, or both, with last-known values when the Mac is offline.

Privacy boundary:
- No GPT, Claude, OpenAI, or Anthropic login inside this iPhone app.
- No cookies, tokens, Keychain values, transcripts, raw logs, or long provider output are sent to the iPhone.
- The Mac connector owns the sanitized snapshot and shares only minimal usage/status fields.
- Local Wi-Fi is used first. Cloud relay is not part of v1.

Supported languages:
- English
- 简体中文
- 繁體中文
- Español
- Português
- 日本語

## Keywords

AI usage, widget, Claude, Codex, usage tracker, productivity, WidgetKit

## Support URL

`[TBD: product support page or GitHub issues page]`

## Privacy Policy URL

`[TBD: hosted privacy policy page]`

## Mac Connector Download URL

`[TBD: GitHub Releases latest URL or product download page]`

## Review Notes Short Version

AI Usage requires a separate Mac connector because iOS widgets cannot read local Claude/Codex desktop state directly. The app pairs with the Mac connector over local Wi-Fi by QR code. The iPhone app does not ask for OpenAI/Anthropic credentials and does not collect personal data.
