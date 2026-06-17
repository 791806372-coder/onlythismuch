# iOS Agent Notes

- Scope: Worker A iOS/XcodeGen scaffold only.
- Project spec lives at `ios/project.yml`; generated `.xcodeproj` is ignored under `ios/.gitignore`.
- App Group entitlement placeholder is `group.aiuw.shared` for both the app and widget extension.
- `ios/Config/Local.xcconfig.example` is only a template. No real local signing config was created.
- Swift snapshot structs live under `ios/Shared/AIUsageSnapshot.swift` and now include validation for schema version, provider ids, usage source/reason requirements, percent ranges, and unsafe text.
- Widget is constrained to `.systemMedium` and uses the embedded normal snapshot fixture when no App Group cache exists.
- `npm run check:ios` decodes all six root fixtures through the Swift model via `ios/Tools/ValidateFixtures.swift`.
- The app includes manual pairing JSON entry, QR scanner wrapper, local HTTP ping/snapshot fetch, token redaction after save, and in-app preview from cached/fetched snapshots.
