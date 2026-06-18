# Release Commands

## Build / Verify iOS Locally

```sh
npm run check:product
npm run check:ios-config
npm run check:ios
npm run build:ios:tests
npm run check:appintents:fresh
```

## Build / Verify Mac Connector Locally

```sh
npm run mac:verify
codesign --verify --deep --strict --verbose=2 mac/AIUsageConnector/dist/AIUsageConnector.app
```

## Build Mac Connector With Developer ID

```sh
AIUW_CODESIGN_IDENTITY="Developer ID Application: Kai Zhang (5MXZ674CA6)" npm run mac:verify
```

Then zip, notarize, staple, and checksum.

## Save Notarization Credentials

Create an Apple ID app-specific password in your Apple Account, then run:

```sh
scripts/setup-notary-profile.sh
```

This saves a local Keychain profile named `AIUsageNotary` without putting the password in shell history.

## Create Zip

```sh
COPYFILE_DISABLE=1 ditto -c -k --norsrc --noextattr --keepParent \
  mac/AIUsageConnector/dist/AIUsageConnector.app \
  outputs/release-prep-2026-06-17/AIUsageConnector-mac-developerid-notarized-0.1.0.zip

shasum -a 256 \
  outputs/release-prep-2026-06-17/AIUsageConnector-mac-developerid-notarized-0.1.0.zip \
  > outputs/release-prep-2026-06-17/SHA256SUMS-notarized.txt
```

## Notarization Shape

```sh
xcrun notarytool submit outputs/release-prep-2026-06-17/AIUsageConnector-mac-developerid-notarized-0.1.0.zip \
  --keychain-profile AIUsageNotary \
  --wait

xcrun stapler staple mac/AIUsageConnector/dist/AIUsageConnector.app
spctl -a -vv mac/AIUsageConnector/dist/AIUsageConnector.app
```

If the login Keychain blocks non-interactive storage, create a temporary unlocked Keychain and pass it with `--keychain`. Do not put the app-specific password in shell history.

## iOS Archive Shape

Use Xcode with the personal Apple Distribution signing identity and App Store profiles:

1. Open `ios/AIUsageWidget.xcodeproj`.
2. Select scheme `AIUsageWidgetApp`.
3. Select `Any iOS Device`.
4. Product -> Archive.
5. Distribute App -> App Store Connect.

CLI archive can be added after the App Store profiles are present locally.
