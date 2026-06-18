# Missing User Actions

## Must Do Before App Store Submission

1. Wait for Apple to finish build processing.
   - App Store Connect app record exists.
   - App Store name: `AI Widget Usage`
   - Bundle ID: `com.superzhangkai.aiusagewidget`
   - SKU: `ai-usage-ios-001`
   - Uploaded build: version `1.0`, build `2`

2. Confirm App Group capability in Apple Developer if App Store processing flags it.
   - App Group: `group.com.superzhangkai.aiusagewidget`
   - App: `com.superzhangkai.aiusagewidget`
   - Widget: `com.superzhangkai.aiusagewidget.widget`

3. Provide public URLs.
   - Privacy Policy URL
   - Support URL
   - Mac connector download URL

4. Provide screenshots.
   - iPhone 6.9-inch screenshots for the App Store listing.
   - Put the `骚话` dashboard/widget screenshots first.
   - Recommended order: paired dashboard, medium widget, small widget, language/settings, then onboarding/pairing.
   - Current local candidates:
     - `outputs/app-store-screenshots/01-sao-dashboard-en.png`
     - `outputs/app-store-screenshots/04-first-run-mac-connector-en.png`
   - Still needed: clean Home Screen widget screenshots, preferably from the real iPhone.

5. Fill App Store metadata and privacy answers.
   - Description, keywords, support URL, privacy URL, category, age rating, app privacy.
   - App review contact information.
   - Review notes explaining that the Mac connector is required for live usage.

6. Decide launch regions and release behavior.
   - Recommended v1: regions outside Mainland China first.
   - Keep zh-Hans/zh-Hant localization available, but do not promise Mainland China support until the download/distribution path is settled.
   - Recommended first release behavior: manual release after approval.

## Must Do Before Public Mac Connector Download

1. Decide whether the first Mac connector release is developer beta or normal public download.
   - Completed: Developer ID signing, Hardened Runtime, notarization, stapling, and Gatekeeper validation.
   - Current notarized asset: `outputs/release-prep-2026-06-17/AIUsageConnector-mac-developerid-notarized-0.1.0.zip`
   - Current blocker for a normal public download: the Mac app still shells out to repo/npm paths and needs this repository checkout.
   - It can be published as a developer beta if the release notes clearly say Node.js/npm plus this repository checkout are required.

2. Publish the connector.
   - Recommended: GitHub Release first.
   - The current workspace is pushed to the GitHub repo.
   - Developer beta release upload can use the notarized Developer ID zip.

## Optional But Useful

- Buy or set up a simple product domain for privacy/support/download pages.
- Add a short Chinese installation page outside GitHub if you later want Mainland China users.
- Run TestFlight once even if you plan direct App Store submission; it catches signing/capability mistakes cheaply.
