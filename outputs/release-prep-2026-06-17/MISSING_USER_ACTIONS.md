# Missing User Actions

## Must Do Before App Store Upload

1. Create the App Store Connect app record.
   - Platform: iOS
   - Name: AI Usage
   - Primary language: English, unless you want Simplified Chinese first.
   - Bundle ID: `com.superzhangkai.aiusagewidget`
   - SKU: `ai-usage-ios-001`

2. Create App Store signing profiles for archive/upload.
   - Personal Apple Developer certificates now exist locally: Apple Development, Apple Distribution, Developer ID Application, and Developer ID Installer.
   - Xcode still needs App Store distribution provisioning profiles for the app and widget extension.
   - Use the personal Apple Developer team only.

3. Confirm App Group capability in Apple Developer.
   - App Group: `group.com.superzhangkai.aiusagewidget`
   - App: `com.superzhangkai.aiusagewidget`
   - Widget: `com.superzhangkai.aiusagewidget.widget`

4. Provide public URLs.
   - Privacy Policy URL
   - Support URL
   - Mac connector download URL

5. Provide screenshots.
   - iPhone 6.9-inch screenshots for the App Store listing.
   - Recommended surfaces: onboarding, paired dashboard, widget on Home Screen, language/settings screen.

6. Decide launch regions.
   - Recommended v1: regions outside Mainland China first.
   - Keep zh-Hans/zh-Hant localization available, but do not promise Mainland China support until the download/distribution path is settled.

## Must Do Before Public Mac Connector Download

1. Use the Developer ID Application certificate.
   - The personal Developer ID Application identity is now available locally.
   - Needed for a direct-download Mac app outside the Mac App Store.

2. Sign the Mac app with Developer ID.
   - Example shape:
     - `AIUW_CODESIGN_IDENTITY="Developer ID Application: <Name> (<TEAMID>)" npm run mac:verify`

3. Notarize and staple.
   - Use `xcrun notarytool` with App Store Connect credentials or a key.
   - Staple the accepted ticket before publishing.

4. Publish the connector.
   - Recommended: GitHub Release first.
   - The current workspace is pushed to the GitHub repo.
   - Public release upload should wait for a notarized Developer ID zip.

## Optional But Useful

- Buy or set up a simple product domain for privacy/support/download pages.
- Add a short Chinese installation page outside GitHub if you later want Mainland China users.
- Run TestFlight once even if you plan direct App Store submission; it catches signing/capability mistakes cheaply.
