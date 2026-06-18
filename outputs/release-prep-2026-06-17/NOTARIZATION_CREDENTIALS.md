# Notarization Credentials

Mac public distribution needs Apple notarization after Developer ID signing. This is only for the downloadable Mac connector. It is separate from the iPhone App Store upload.

## Current Local State

- `Developer ID Application: Kai Zhang (5MXZ674CA6)` is available locally.
- `Apple Distribution: Kai Zhang (5MXZ674CA6)` is available locally.
- The login Keychain did not allow non-interactive credential storage from the background session.
- A temporary unlocked Keychain at `build/aiusage-notary.keychain-db` was used successfully for the 2026-06-18 notarization run, then removed after the app was stapled.
- Apple accepted submission `63254f12-66da-4124-ba1b-bb9c58b74c97`, and the app was stapled and accepted by Gatekeeper.

## Recommended Credential Path

Use an Apple ID app-specific password and save it into Keychain with `notarytool`.

1. Open Apple account app-specific passwords:
   - [account.apple.com/account/manage](https://account.apple.com/account/manage)
2. Sign in with the personal developer Apple ID.
3. Go to **Sign-In and Security** -> **App-Specific Passwords**.
4. Create a password named `AIUsageNotary`.
5. Run this local helper:

```sh
scripts/setup-notary-profile.sh
```

The helper intentionally does not accept the password as a command argument. Apple's tool will ask for it in a secure prompt, then save it in Keychain as `AIUsageNotary`.

Verify:

```sh
xcrun notarytool history --keychain-profile AIUsageNotary
```

If the login Keychain rejects storage with `User interaction is not allowed`, use a temporary Keychain for the current release run:

```sh
KC="$PWD/build/aiusage-notary.keychain-db"
KC_PASS="$(openssl rand -base64 32)"
security create-keychain -p "$KC_PASS" "$KC"
security set-keychain-settings -lut 21600 "$KC"
security unlock-keychain -p "$KC_PASS" "$KC"
xcrun notarytool store-credentials AIUsageNotary \
  --keychain "$KC" \
  --apple-id superzhangkai@vip.qq.com \
  --team-id 5MXZ674CA6 \
  --validate
```

Then pass the same `--keychain "$KC"` option to `notarytool submit`, `info`, or `history`. Do not store the app-specific password in shell history or docs.

## Alternative Credential Path

An App Store Connect API key also works, but it creates another long-lived private key file that must be protected. Use it later if CI needs unattended notarization. For this Mac, the app-specific password path is simpler.

## After Credentials Exist

Submit the Developer ID signed zip:

```sh
xcrun notarytool submit outputs/release-prep-2026-06-17/AIUsageConnector-mac-developerid-clean-0.1.0.zip \
  --keychain-profile AIUsageNotary \
  --keychain "$PWD/build/aiusage-notary.keychain-db" \
  --wait
```

If accepted, staple and verify:

```sh
xcrun stapler staple mac/AIUsageConnector/dist/AIUsageConnector.app
spctl -a -vv mac/AIUsageConnector/dist/AIUsageConnector.app
```

Then create the public zip from the stapled app and upload it to GitHub Releases.
