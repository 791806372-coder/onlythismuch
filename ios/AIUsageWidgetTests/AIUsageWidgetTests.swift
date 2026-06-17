import Foundation
import XCTest

final class AIUsageSnapshotContractTests: XCTestCase {
    func testUsageSnapshotDecodesOnlyUsageContract() throws {
        let snapshot = try AIUsageSnapshot.decodeValidated(from: Data(Self.validSnapshotJSON.utf8))

        XCTAssertEqual(snapshot.schemaVersion, 1)
        XCTAssertEqual(snapshot.providers.map(\.id), ["claude", "codex"])
        XCTAssertEqual(snapshot.providers[0].usage.available, false)
        XCTAssertEqual(snapshot.providers[0].usage.reason, .noStableSource)
        XCTAssertEqual(snapshot.providers[1].usage.available, true)
        XCTAssertEqual(snapshot.providers[1].usage.fiveHourRemainingPercent, 85)
        XCTAssertEqual(snapshot.providers[1].usage.weeklyRemainingPercent, 27)
    }

    func testAllowanceFieldIsRejected() throws {
        let data = Data(Self.validSnapshotJSON.replacingOccurrences(of: #""usage""#, with: #""allowance""#).utf8)

        XCTAssertThrowsError(try AIUsageSnapshot.decodeValidated(from: data)) { error in
            guard case SnapshotValidationError.unknownField(let field) = error else {
                return XCTFail("Expected unknown field rejection, got \(error)")
            }
            XCTAssertTrue(field.contains("allowance"))
        }
    }

    func testAccountMetadataIsRejectedInV1Contract() throws {
        let data = Data(Self.validSnapshotJSON.replacingOccurrences(
            of: #""usage": {"#,
            with: #""account": {"plan": "pro"}, "usage": {"#
        ).utf8)

        XCTAssertThrowsError(try AIUsageSnapshot.decodeValidated(from: data)) { error in
            guard case SnapshotValidationError.unknownField(let field) = error else {
                return XCTFail("Expected account field rejection, got \(error)")
            }
            XCTAssertTrue(field.contains("account"))
        }
    }

    func testFutureProviderIdIsRejectedInV1Contract() throws {
        let data = Data(Self.validSnapshotJSON.replacingOccurrences(of: #""id": "claude""#, with: #""id": "hermes""#).utf8)

        XCTAssertThrowsError(try AIUsageSnapshot.decodeValidated(from: data)) { error in
            guard case SnapshotValidationError.invalidProvider(let provider) = error else {
                return XCTFail("Expected invalid provider rejection, got \(error)")
            }
            XCTAssertEqual(provider, "hermes")
        }
    }

    func testV1ContractRequiresOneClaudeAndOneCodex() throws {
        let data = Data(Self.validSnapshotJSON.replacingOccurrences(of: #""id": "codex""#, with: #""id": "claude""#).utf8)

        XCTAssertThrowsError(try AIUsageSnapshot.decodeValidated(from: data)) { error in
            guard case SnapshotValidationError.invalidProviderSet = error else {
                return XCTFail("Expected invalid provider set rejection, got \(error)")
            }
        }
    }

    func testFutureUsageSourcesAreRejectedInV1Contract() throws {
        for source in ["sessions_jsonl", "provider_api"] {
            let data = Data(Self.validSnapshotJSON.replacingOccurrences(of: #""source": "codexbar""#, with: #""source": "\#(source)""#).utf8)

            XCTAssertThrowsError(try AIUsageSnapshot.decodeValidated(from: data))
        }
    }

    func testCodexAppServerUsageSourceIsAccepted() throws {
        let data = Data(Self.validSnapshotJSON.replacingOccurrences(of: #""source": "codexbar""#, with: #""source": "codex_app_server""#).utf8)
        let snapshot = try AIUsageSnapshot.decodeValidated(from: data)

        XCTAssertEqual(snapshot.providers[1].usage.source, .codexAppServer)
    }

    func testClaudeCodeTtyUsageSourceIsAccepted() throws {
        let data = Data(Self.validSnapshotJSON
            .replacingOccurrences(of: #"""
      "connected": true,
      "health": "working",
      "version": "2.1.173",
      "usage": {
        "available": false,
        "reason": "no_stable_source"
      }
      """#, with: #"""
      "connected": true,
      "health": "working",
      "version": "2.1.177",
      "capturedAt": "2026-06-13T07:40:00Z",
      "usage": {
        "available": true,
        "source": "claude_code_tty",
        "sourceVersion": "2.1.177",
        "fiveHourRemainingPercent": 98,
        "fiveHourResetAt": "2026-06-13T12:39:00Z",
        "weeklyRemainingPercent": 100,
        "weeklyResetAt": "2026-06-16T02:59:00Z"
      }
      """#).utf8)
        let snapshot = try AIUsageSnapshot.decodeValidated(from: data)

        XCTAssertEqual(snapshot.providers[0].usage.source, .claudeCodeTty)
    }

    func testUnavailableUsageCannotCarryMeterFields() throws {
        let data = Data(Self.validSnapshotJSON.replacingOccurrences(
            of: #""available": false,"#,
            with: #""available": false, "fiveHourRemainingPercent": 42,"#
        ).utf8)

        XCTAssertThrowsError(try AIUsageSnapshot.decodeValidated(from: data)) { error in
            guard case SnapshotValidationError.unavailableUsageHasMeterFields = error else {
                return XCTFail("Expected unavailable meter-field rejection, got \(error)")
            }
        }
    }

    func testUnavailableProviderCannotCarryCapturedAt() throws {
        let data = Data(Self.validSnapshotJSON.replacingOccurrences(
            of: #""version": "2.1.173","#,
            with: #""version": "2.1.173", "capturedAt": "2026-06-11T19:29:41+08:00","#
        ).utf8)

        XCTAssertThrowsError(try AIUsageSnapshot.decodeValidated(from: data)) { error in
            guard case SnapshotValidationError.unavailableUsageHasMeterFields = error else {
                return XCTFail("Expected unavailable capturedAt rejection, got \(error)")
            }
        }
    }

    func testAvailableUsageCannotCarryFallbackReason() throws {
        let data = Data(Self.validSnapshotJSON.replacingOccurrences(
            of: #""weeklyResetAt": "2026-06-12T00:00:00+08:00""#,
            with: #""weeklyResetAt": "2026-06-12T00:00:00+08:00", "reason": "no_stable_source""#
        ).utf8)

        XCTAssertThrowsError(try AIUsageSnapshot.decodeValidated(from: data)) { error in
            guard case SnapshotValidationError.availableUsageHasReason = error else {
                return XCTFail("Expected available reason rejection, got \(error)")
            }
        }
    }

    func testUnsafeRawFieldsAreRejectedBeforeDecode() throws {
        let unsafeJSON = Self.validSnapshotJSON.replacingOccurrences(
            of: #""usage": {"#,
            with: #""apiToken": "do-not-ship", "usage": {"#
        )

        XCTAssertThrowsError(try AIUsageSnapshot.decodeValidated(from: Data(unsafeJSON.utf8))) { error in
            guard case SnapshotValidationError.unsafeText = error else {
                return XCTFail("Expected unsafe text rejection, got \(error)")
            }
        }
    }

    func testUnsafeStringValuesAreRejectedBeforeDecode() throws {
        let unsafeJSON = Self.validSnapshotJSON.replacingOccurrences(
            of: #""displayName": "Codex""#,
            with: #""displayName": "Bearer secret-token provider output""#
        )

        XCTAssertThrowsError(try AIUsageSnapshot.decodeValidated(from: Data(unsafeJSON.utf8))) { error in
            guard case SnapshotValidationError.unsafeText = error else {
                return XCTFail("Expected unsafe string-value rejection, got \(error)")
            }
        }
    }

    func testNetworkLikeStringValuesAreRejectedBeforeDecode() throws {
        for value in ["http://192.168.1.7/status", "KaideMacBook-Pro.local", "localhost", "192.168.1.7"] {
            let unsafeJSON = Self.validSnapshotJSON.replacingOccurrences(
                of: #""displayName": "Codex""#,
                with: #""displayName": "\#(value)""#
            )

            XCTAssertThrowsError(try AIUsageSnapshot.decodeValidated(from: Data(unsafeJSON.utf8))) { error in
                guard case SnapshotValidationError.unsafeText = error else {
                    return XCTFail("Expected unsafe network-like string rejection, got \(error)")
                }
            }
        }
    }

    func testInvalidPlatformIsRejected() throws {
        let data = Data(Self.validSnapshotJSON.replacingOccurrences(
            of: #""platform": "macOS""#,
            with: #""platform": "iOS""#
        ).utf8)

        XCTAssertThrowsError(try AIUsageSnapshot.decodeValidated(from: data)) { error in
            guard case SnapshotValidationError.invalidPlatform(let platform) = error else {
                return XCTFail("Expected invalid platform rejection, got \(error)")
            }
            XCTAssertEqual(platform, "iOS")
        }
    }

    func testContractBoundedStringsAreRejected() throws {
        let longDisplayName = String(repeating: "x", count: 41)
        let data = Data(Self.validSnapshotJSON.replacingOccurrences(
            of: #""displayName": "Codex""#,
            with: #""displayName": "\#(longDisplayName)""#
        ).utf8)

        XCTAssertThrowsError(try AIUsageSnapshot.decodeValidated(from: data)) { error in
            guard case SnapshotValidationError.invalidStringLength(let field) = error else {
                return XCTFail("Expected bounded string rejection, got \(error)")
            }
            XCTAssertEqual(field, "codex.displayName")
        }
    }

    private static let validSnapshotJSON = """
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
          "version": "2.1.173",
          "usage": {
            "available": false,
            "reason": "no_stable_source"
          },
          "error": null
        },
        {
          "id": "codex",
          "displayName": "Codex",
          "connected": true,
          "health": "working",
          "version": "0.139.0",
          "capturedAt": "2026-06-11T19:29:41+08:00",
          "usage": {
            "available": true,
            "source": "codexbar",
            "sourceVersion": "0.1.0",
            "fiveHourRemainingPercent": 85,
            "fiveHourResetAt": "2026-06-11T20:30:00+08:00",
            "weeklyRemainingPercent": 27,
            "weeklyResetAt": "2026-06-12T00:00:00+08:00"
          },
          "error": null
        }
      ]
    }
    """
}

final class PairingPayloadTests: XCTestCase {
    func testLocalPairingHostsAreAccepted() throws {
        let store = PairedDeviceStore()

        for host in ["KaideMacBook-Pro.local", "10.0.0.7", "172.31.0.7", "192.168.1.7", "169.254.4.7"] {
            XCTAssertEqual(try store.parse(Self.payloadJSON(hosts: [host])).hosts, [host])
        }
    }

    func testLoopbackPairingHostsAreRejectedForRealDevicePairing() throws {
        let store = PairedDeviceStore()

        for host in ["localhost", "127.0.0.1", "127.4.5.6"] {
            XCTAssertThrowsError(try store.parse(Self.payloadJSON(hosts: [host]))) { error in
                XCTAssertEqual(error as? PairingError, .loopbackHost)
            }
        }
    }

    func testPublicPairingHostsAreRejected() throws {
        let store = PairedDeviceStore()

        for host in ["8.8.8.8", "172.32.0.7", "example.com"] {
            XCTAssertThrowsError(try store.parse(Self.payloadJSON(hosts: [host]))) { error in
                XCTAssertEqual(error as? PairingError, .nonLocalHost)
            }
        }
    }

    func testMalformedBonjourPairingHostsAreRejected() throws {
        let store = PairedDeviceStore()

        for host in [".local", "bad.local.local", "bad host.local", "bad..local", "-bad.local", "bad-.local", "bad_thing.local", "localhost.local"] {
            XCTAssertThrowsError(try store.parse(Self.payloadJSON(hosts: [host]))) { error in
                XCTAssertEqual(error as? PairingError, .nonLocalHost)
            }
        }
    }

    func testPairingHostsStayBoundedForWidgetRefresh() throws {
        let store = PairedDeviceStore()
        let hosts = ["192.168.1.7", "10.0.0.7", "172.16.0.7", "169.254.4.7", "KaideMacBook-Pro.local"]

        XCTAssertThrowsError(try store.parse(Self.payloadJSON(hosts: hosts))) { error in
            XCTAssertEqual(error as? PairingError, .tooManyHosts)
        }
    }

    func testPairingDisplaySummaryDoesNotExposeRawHosts() throws {
        let store = PairedDeviceStore()
        let payload = try store.parse(Self.payloadJSON(hosts: ["192.168.1.7", "KaideMacBook-Pro.local"]))

        XCTAssertEqual(payload.displaySummary, "2 个地址 · 端口 8787")
        XCTAssertFalse(payload.displaySummary.contains("192.168.1.7"))
        XCTAssertFalse(payload.displaySummary.contains("KaideMacBook-Pro.local"))
        XCTAssertFalse(payload.displaySummary.contains("test-token"))
    }

    func testPairingNameCannotExposeHostsOrSecrets() throws {
        let store = PairedDeviceStore()

        for name in ["192.168.1.7", "KaideMacBook-Pro.local", "localhost", "http://192.168.1.7", "Bearer secret-token"] {
            XCTAssertThrowsError(try store.parse(Self.payloadJSON(hosts: ["192.168.1.7"], name: name))) { error in
                XCTAssertEqual(error as? PairingError, .invalidName)
            }
        }
    }

    func testUnknownPairingFieldsAreRejected() throws {
        let store = PairedDeviceStore()
        let payload = Self.payloadJSON(hosts: ["192.168.1.7"])
            .replacingOccurrences(of: #""token": "test-token""#, with: #""token": "test-token", "authorization": "Bearer nope""#)

        XCTAssertThrowsError(try store.parse(payload)) { error in
            XCTAssertEqual(error as? PairingError, .unknownField("authorization"))
            XCTAssertFalse(error.localizedDescription.contains("authorization"))
            XCTAssertFalse(error.localizedDescription.contains("Bearer"))
        }
    }

    func testOversizedPairingTextIsRejected() throws {
        let store = PairedDeviceStore()
        let longName = String(repeating: "Mac", count: 40)
        let payload = Self.payloadJSON(hosts: ["192.168.1.7"], name: longName)

        XCTAssertThrowsError(try store.parse(payload)) { error in
            XCTAssertEqual(error as? PairingError, .invalidName)
        }
    }

    func testWhitespaceTokenIsRejected() throws {
        let store = PairedDeviceStore()
        let payload = Self.payloadJSON(hosts: ["192.168.1.7"], token: "test token")

        XCTAssertThrowsError(try store.parse(payload)) { error in
            XCTAssertEqual(error as? PairingError, .invalidToken)
        }
    }

    func testManualTerminalBlockContainingPairingJSONIsAccepted() throws {
        let store = PairedDeviceStore()
        let terminalBlock = """
        AI Usage Widget manual pairing payload (contains local bearer token):
        \(Self.payloadJSON(hosts: ["192.168.1.7"], token: "test-token"))
        """

        let payload = try store.parse(terminalBlock)

        XCTAssertEqual(payload.hosts, ["192.168.1.7"])
        XCTAssertEqual(payload.token, "test-token")
    }

    func testRedactedTerminalPayloadIsStillRejected() throws {
        let store = PairedDeviceStore()
        let terminalBlock = """
        Terminal JSON is redacted and is not pasteable.
        {
          "v": 1,
          "deviceId": "mac-test",
          "name": "Test Mac",
          "hosts": ["192.168.1.7"],
          "port": 8787,
          "tokenRedacted": true
        }
        """

        XCTAssertThrowsError(try store.parse(terminalBlock)) { error in
            XCTAssertEqual(error as? PairingError, .redactedPayload)
            XCTAssertTrue(error.localizedDescription.contains("npm run pair:manual"))
        }
    }

    func testStatusPayloadRedactedPairingSummaryIsRejectedWithManualPairingMessage() throws {
        let store = PairedDeviceStore()
        let statusBlock = """
        {
          "ok": true,
          "statusKind": "pairing_config",
          "deviceId": "mac-test",
          "name": "Test Mac",
          "pairingPayloadRedacted": {
            "v": 1,
            "deviceId": "mac-test",
            "name": "Test Mac",
            "hosts": ["192.168.1.7"],
            "port": 8787,
            "tokenRedacted": true
          },
          "manualPairCommand": "aiuw pair --port 8787 --manual"
        }
        """

        XCTAssertThrowsError(try store.parse(statusBlock)) { error in
            XCTAssertEqual(error as? PairingError, .redactedPayload)
            XCTAssertTrue(error.localizedDescription.contains("脱敏摘要"))
        }
    }

    func testOversizedPairingPasteIsRejectedBeforeJSONExtraction() throws {
        let store = PairedDeviceStore()
        let oversized = "\(String(repeating: "x", count: 8_193))\(Self.payloadJSON(hosts: ["192.168.1.7"]))"

        XCTAssertThrowsError(try store.parse(oversized)) { error in
            XCTAssertEqual(error as? PairingError, .invalidPayload)
        }
    }

    func testPairingStoreRoundTripsThroughInjectedDefaults() throws {
        let suiteName = "AIUsageWidgetPairingTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }

        let store = PairedDeviceStore(defaults: defaults)
        let payload = try store.parse(Self.payloadJSON(hosts: ["192.168.1.7"]))

        try store.save(payload)

        XCTAssertEqual(store.load(), payload)
        XCTAssertEqual(PairedDeviceStore(defaults: defaults).load(), payload)
    }

    func testPairingStoreRejectsInvalidPayloadOnSave() throws {
        let suiteName = "AIUsageWidgetPairingTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }

        let store = PairedDeviceStore(defaults: defaults)
        let payload = PairingPayload(
            v: 1,
            deviceId: "mac-test",
            name: "Test Mac",
            hosts: ["localhost"],
            port: 8787,
            token: "test-token"
        )

        XCTAssertThrowsError(try store.save(payload)) { error in
            XCTAssertEqual(error as? PairingError, .loopbackHost)
        }
    }

    func testPairingStoreDropsInvalidPersistedPayloadOnLoad() throws {
        let suiteName = "AIUsageWidgetPairingTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }

        let invalidPayload = PairingPayload(
            v: 1,
            deviceId: "mac-test",
            name: "Test Mac",
            hosts: ["127.0.0.1"],
            port: 8787,
            token: "test-token"
        )
        defaults.set(try JSONEncoder().encode(invalidPayload), forKey: "aiuw.pairingPayload")

        let store = PairedDeviceStore(defaults: defaults)

        XCTAssertNil(store.load())
        XCTAssertNil(defaults.data(forKey: "aiuw.pairingPayload"))
    }

    func testPairingStoreDropsPersistedPayloadWithUnknownFieldsOnLoad() throws {
        let suiteName = "AIUsageWidgetPairingTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }

        let unsafePayload = Self.payloadJSON(hosts: ["192.168.1.7"])
            .replacingOccurrences(
                of: #""token": "test-token""#,
                with: #""token": "test-token", "authorization": "Bearer nope""#
            )
        defaults.set(Data(unsafePayload.utf8), forKey: "aiuw.pairingPayload")

        let store = PairedDeviceStore(defaults: defaults)

        XCTAssertNil(store.load())
        XCTAssertNil(defaults.data(forKey: "aiuw.pairingPayload"))
    }

    func testPairingSaveFailsWhenAppGroupDefaultsAreUnavailable() throws {
        let store = PairedDeviceStore(defaults: nil)
        let payload = try store.parse(Self.payloadJSON(hosts: ["192.168.1.7"]))

        XCTAssertThrowsError(try store.save(payload)) { error in
            XCTAssertEqual(error as? PairingError, .appGroupUnavailable)
        }
    }

    private static func payloadJSON(hosts: [String], name: String = "Test Mac", token: String = "test-token") -> String {
        let encodedHosts = hosts.map { "\"\($0)\"" }.joined(separator: ", ")
        return """
        {
          "v": 1,
          "deviceId": "mac-test",
          "name": "\(name)",
          "hosts": [\(encodedHosts)],
          "port": 8787,
          "token": "\(token)"
        }
        """
    }
}

final class PreviewSnapshotsTests: XCTestCase {
    func testUserCacheablePreviewFixturesNeverFakeUsageMeters() throws {
        for fixture in PreviewSnapshots.allFixtures {
            for provider in fixture.snapshot.providers {
                XCTAssertFalse(provider.usage.available, "\(fixture.id):\(provider.id)")
                XCTAssertNil(provider.capturedAt, "\(fixture.id):\(provider.id)")
                XCTAssertNil(provider.usage.source, "\(fixture.id):\(provider.id)")
                XCTAssertNil(provider.usage.sourceVersion, "\(fixture.id):\(provider.id)")
                XCTAssertNil(provider.usage.fiveHourRemainingPercent, "\(fixture.id):\(provider.id)")
                XCTAssertNil(provider.usage.fiveHourResetAt, "\(fixture.id):\(provider.id)")
                XCTAssertNil(provider.usage.weeklyRemainingPercent, "\(fixture.id):\(provider.id)")
                XCTAssertNil(provider.usage.weeklyResetAt, "\(fixture.id):\(provider.id)")
                XCTAssertNotNil(provider.usage.reason, "\(fixture.id):\(provider.id)")
            }
        }
    }
}

final class AppLanguageOptionTests: XCTestCase {
    func testSystemPreferredLanguageUsesSupportedLocales() {
        XCTAssertEqual(AppLanguageOption.systemPreferredOption(preferredLanguages: ["en-US"]), .english)
        XCTAssertEqual(AppLanguageOption.systemPreferredOption(preferredLanguages: ["zh-Hans-CN"]), .simplifiedChinese)
        XCTAssertEqual(AppLanguageOption.systemPreferredOption(preferredLanguages: ["zh-Hant-HK"]), .traditionalChinese)
        XCTAssertEqual(AppLanguageOption.systemPreferredOption(preferredLanguages: ["es-MX"]), .spanish)
        XCTAssertEqual(AppLanguageOption.systemPreferredOption(preferredLanguages: ["ja-JP"]), .japanese)
    }

    func testSystemPreferredLanguageFallsBackToEnglish() {
        XCTAssertEqual(AppLanguageOption.systemPreferredOption(preferredLanguages: ["fr-FR"]), .english)
    }
}

final class CacheStatusFormatterTests: XCTestCase {
    func testCacheCaptionsMatchDeviceEvidenceLanguage() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)

        XCTAssertEqual(
            CacheStatusFormatter.caption(source: "lan", savedAt: now, fallbackDate: now, now: now),
            "刚摸完，很润😏"
        )
        XCTAssertEqual(
            CacheStatusFormatter.caption(source: "widget-lan", savedAt: now, fallbackDate: now, now: now),
            "刚摸完，很润😏"
        )
        XCTAssertEqual(
            CacheStatusFormatter.caption(source: "widget-lan", savedAt: now, fallbackDate: now, now: now, language: .traditionalChinese),
            "剛摸完，很潤😏"
        )
        XCTAssertEqual(
            CacheStatusFormatter.caption(source: "widget-lan", savedAt: now, fallbackDate: now, now: now, language: .japanese),
            "なでたて、しっとり😏"
        )
        XCTAssertEqual(
            CacheStatusFormatter.caption(source: "widget-lan", savedAt: now.addingTimeInterval(-120), fallbackDate: now, now: now, language: .japanese),
            "2分前になでた😏"
        )
        XCTAssertEqual(
            CacheStatusFormatter.caption(source: "widget-lan", savedAt: now.addingTimeInterval(-120), fallbackDate: now, now: now, language: .english),
            "Touched Mac · warm 2m😏"
        )
        XCTAssertEqual(
            CacheStatusFormatter.caption(source: "widget-lan", savedAt: now, fallbackDate: now, now: now, language: .english),
            "Touched Mac · hot😏"
        )
        XCTAssertEqual(
            CacheStatusFormatter.caption(source: "widget-lan", savedAt: now.addingTimeInterval(-120), fallbackDate: now, now: now, language: .spanish),
            "Mac tocado · tibio 2 min😏"
        )
        XCTAssertEqual(
            CacheStatusFormatter.caption(source: "widget-lan", savedAt: now, fallbackDate: now, now: now, language: .portuguese),
            "Mac tocado · quente😏"
        )
        XCTAssertEqual(
            CacheStatusFormatter.caption(source: "widget-lan", savedAt: now.addingTimeInterval(-25 * 60 * 60), fallbackDate: now, now: now, language: .english),
            "not sure · need touching😏"
        )
        XCTAssertEqual(
            CacheStatusFormatter.caption(source: "fixture:normal", savedAt: nil, fallbackDate: now.addingTimeInterval(-120), now: now),
            "Fixture · 2分前"
        )
        XCTAssertEqual(
            CacheStatusFormatter.caption(source: nil, savedAt: now.addingTimeInterval(-3_600), fallbackDate: now, now: now),
            "缓存 · 1小时前"
        )
    }
}

final class AppGroupIdentifierTests: XCTestCase {
    func testAppGroupIdentifierResolutionMakesFallbackVisible() throws {
        XCTAssertEqual(
            AppGroup.resolveIdentifier(rawValue: nil),
            AppGroupIdentifierResolution(
                identifier: AppGroup.fallbackIdentifier,
                source: .fallbackMissingInfoPlist
            )
        )
        XCTAssertEqual(
            AppGroup.resolveIdentifier(rawValue: "$(APP_GROUP_IDENTIFIER)").source,
            .fallbackUnexpandedInfoPlist
        )
        XCTAssertEqual(
            AppGroup.resolveIdentifier(rawValue: "not-a-group").source,
            .fallbackInvalidInfoPlist
        )
        XCTAssertEqual(
            AppGroup.resolveIdentifier(rawValue: " group.com.kai.aiusagewidget "),
            AppGroupIdentifierResolution(
                identifier: "group.com.kai.aiusagewidget",
                source: .infoPlist
            )
        )
    }
}

final class UsageFreshnessTests: XCTestCase {
    func testFreshUsageIsNotStale() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)

        XCTAssertFalse(UsageFreshness.isStale(
            snapshotUpdatedAt: now.addingTimeInterval(-60),
            providerCapturedAt: now.addingTimeInterval(-90),
            cacheSavedAt: now.addingTimeInterval(-30),
            now: now
        ))
    }

    func testOldCacheMarksAvailableUsageStale() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)

        XCTAssertTrue(UsageFreshness.isStale(
            snapshotUpdatedAt: now.addingTimeInterval(-60),
            providerCapturedAt: now.addingTimeInterval(-90),
            cacheSavedAt: now.addingTimeInterval(-4 * 60 * 60),
            now: now
        ))
    }

    func testOldProviderCaptureMarksUsageStale() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)

        XCTAssertTrue(UsageFreshness.isStale(
            snapshotUpdatedAt: now,
            providerCapturedAt: now.addingTimeInterval(-4 * 60 * 60),
            cacheSavedAt: now,
            now: now
        ))
    }

    func testLaggedProviderCaptureMarksLastKnownFallback() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)

        XCTAssertTrue(UsageFreshness.isLastKnownFallback(
            snapshotUpdatedAt: now,
            providerCapturedAt: now.addingTimeInterval(-10 * 60),
            cacheSource: "widget-lan",
            providerId: "claude"
        ))
        XCTAssertTrue(UsageFreshness.isLastKnownFallback(
            snapshotUpdatedAt: now,
            providerCapturedAt: now,
            cacheSource: "widget-lan+last-known:claude",
            providerId: "claude"
        ))
        XCTAssertFalse(UsageFreshness.isLastKnownFallback(
            snapshotUpdatedAt: now,
            providerCapturedAt: now.addingTimeInterval(-60),
            cacheSource: "widget-lan",
            providerId: "claude"
        ))
    }
}

final class WidgetLANDiagnosticTests: XCTestCase {
    func testDiagnosticRoundTripDoesNotLeakAuthMaterial() throws {
        let report = LocalHTTPReport(
            path: "/v1/snapshot",
            attemptedAt: Date(timeIntervalSince1970: 1_781_178_600),
            attempts: [
                LocalHTTPAttempt(
                    host: "192.168.1.7",
                    path: "/v1/snapshot",
                    succeeded: true,
                    httpStatus: 200,
                    message: "OK"
                )
            ],
            winningHost: "192.168.1.7"
        )
        let diagnostic = WidgetLANDiagnostic.success(
            report: report,
            approvalSync: .savedRequest(report: report)
        )
        let data = try JSONEncoder.aiUsageSnapshotEncoder.encode(diagnostic)
        let decoded = try JSONDecoder.aiUsageSnapshotDecoder.decode(WidgetLANDiagnostic.self, from: data)

        XCTAssertEqual(decoded.path, "/v1/snapshot")
        XCTAssertEqual(decoded.httpStatus, 200)
        XCTAssertEqual(decoded.attemptedHostCount, 1)
        XCTAssertEqual(decoded.approvalSync?.outcome, .savedRequest)
        XCTAssertEqual(decoded.approvalSync?.httpStatus, 200)
        XCTAssertEqual(decoded.approvalSync?.attemptedHostCount, 1)

        let serialized = String(decoding: data, as: UTF8.self)
        XCTAssertFalse(serialized.contains("192.168.1.7"))
        XCTAssertFalse(serialized.contains("token"))
        XCTAssertFalse(serialized.contains("Bearer"))
        XCTAssertFalse(serialized.contains("Authorization"))
    }

    func testFailureDiagnosticDoesNotPersistLocalHostnames() throws {
        let diagnostic = WidgetLANDiagnostic.failure(
            "Could not connect to KaideMacBook-Pro.local after timeout",
            report: nil
        )
        let data = try JSONEncoder.aiUsageSnapshotEncoder.encode(diagnostic)
        let decoded = try JSONDecoder.aiUsageSnapshotDecoder.decode(WidgetLANDiagnostic.self, from: data)

        XCTAssertEqual(decoded.detail, "Widget LAN 诊断已脱敏")

        let serialized = String(decoding: data, as: UTF8.self)
        XCTAssertFalse(serialized.contains("KaideMacBook-Pro.local"))
        XCTAssertFalse(serialized.contains("MacBook"))
        XCTAssertFalse(serialized.contains(".local"))
    }

    func testApprovalSyncDiagnosticDoesNotPersistUnsafeDetails() throws {
        let diagnostic = WidgetApprovalSyncDiagnostic.failure(
            "Could not connect to KaideMacBook-Pro.local with Bearer secret-token",
            report: nil
        )
        let data = try JSONEncoder.aiUsageSnapshotEncoder.encode(diagnostic)
        let decoded = try JSONDecoder.aiUsageSnapshotDecoder.decode(WidgetApprovalSyncDiagnostic.self, from: data)

        XCTAssertEqual(decoded.outcome, .failure)
        XCTAssertEqual(decoded.detail, "Widget LAN 诊断已脱敏")

        let serialized = String(decoding: data, as: UTF8.self)
        XCTAssertFalse(serialized.contains("KaideMacBook-Pro.local"))
        XCTAssertFalse(serialized.contains("Bearer"))
        XCTAssertFalse(serialized.contains("secret-token"))
    }
}

final class LocalHTTPReportFormatterTests: XCTestCase {
    func testAppConnectionDiagnosticsDoNotRenderHostsOrSecrets() {
        let report = LocalHTTPReport(
            path: "/v1/snapshot",
            attemptedAt: Date(timeIntervalSince1970: 1_781_178_600),
            attempts: [
                LocalHTTPAttempt(
                    host: "192.168.1.7",
                    path: "/v1/snapshot",
                    succeeded: true,
                    httpStatus: 200,
                    message: "OK"
                ),
                LocalHTTPAttempt(
                    host: "KaideMacBook-Pro.local",
                    path: "/v1/snapshot",
                    succeeded: false,
                    httpStatus: nil,
                    message: "Bearer secret-token at http://KaideMacBook-Pro.local"
                )
            ],
            winningHost: "192.168.1.7"
        )

        let text = LocalHTTPReportFormatter.diagnosticText(report: report, label: "snapshot")

        XCTAssertTrue(text.contains("snapshot: 摸到第 1 个地址"))
        XCTAssertTrue(text.contains("✓ 地址 1 HTTP 200"))
        XCTAssertTrue(text.contains("× 地址 2 诊断已脱敏"))
        XCTAssertFalse(text.contains("192.168.1.7"))
        XCTAssertFalse(text.contains("KaideMacBook-Pro.local"))
        XCTAssertFalse(text.contains("secret-token"))
        XCTAssertFalse(text.contains("Bearer"))
        XCTAssertFalse(text.contains("http://"))
    }
}

final class LocalHTTPSourceTests: XCTestCase {
    override func tearDown() {
        LANMockURLProtocol.reset()
        super.tearDown()
    }

    func testUnauthorizedRequestsAreBoundedAndTokenSafe() async throws {
        LANMockURLProtocol.reset()
        LANMockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw URLError(.badURL)
            }

            let body = Data(#"{"error":"Bearer secret-token apiToken response body marker"}"#.utf8)
            return (HTTPURLResponse(
                url: url,
                statusCode: 401,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!, body)
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [LANMockURLProtocol.self]
        let source = LocalHTTPSource(
            session: URLSession(configuration: configuration),
            requestTimeout: 1,
            maxHostAttempts: 3
        )
        let payload = try PairedDeviceStore().parse(Self.payloadJSON(
            hosts: ["192.168.1.7", "192.168.1.8", "192.168.1.9", "192.168.1.10"],
            token: "secret-token"
        ))

        do {
            _ = try await source.snapshotWithReport(payload)
            XCTFail("Expected unauthorized LAN request to fail")
        } catch let failure as LocalHTTPFailure {
            XCTAssertEqual(LANMockURLProtocol.requests.count, 3)
            XCTAssertEqual(LANMockURLProtocol.requests.compactMap { $0.url?.host }, ["192.168.1.7", "192.168.1.8", "192.168.1.9"])
            XCTAssertTrue(LANMockURLProtocol.requests.allSatisfy {
                $0.value(forHTTPHeaderField: "Authorization") == "Bearer secret-token"
            })

            XCTAssertEqual(failure.report.attempts.count, 3)
            XCTAssertNil(failure.report.winningHost)
            XCTAssertTrue(failure.report.attempts.allSatisfy { $0.httpStatus == 401 && $0.succeeded == false })

            let reportText = String(
                decoding: try JSONEncoder.aiUsageSnapshotEncoder.encode(failure.report),
                as: UTF8.self
            )
            let diagnostic = WidgetLANDiagnostic.failure(failure.localizedDescription, report: failure.report)
            let diagnosticText = String(
                decoding: try JSONEncoder.aiUsageSnapshotEncoder.encode(diagnostic),
                as: UTF8.self
            )
            let combined = "\(failure.localizedDescription)\n\(reportText)\n\(diagnosticText)"

            XCTAssertEqual(diagnostic.httpStatus, 401)
            XCTAssertEqual(diagnostic.attemptedHostCount, 3)
            XCTAssertFalse(diagnosticText.contains("192.168.1.7"))
            XCTAssertFalse(diagnosticText.contains("192.168.1.8"))
            XCTAssertFalse(diagnosticText.contains("192.168.1.9"))
            XCTAssertFalse(combined.contains("secret-token"))
            XCTAssertFalse(combined.contains("Bearer"))
            XCTAssertFalse(combined.contains("Authorization"))
            XCTAssertFalse(combined.contains("apiToken"))
            XCTAssertFalse(combined.contains("response body marker"))
        }
    }

    func testTransportErrorsUseSanitizedDiagnosticMessages() async throws {
        LANMockURLProtocol.reset()
        LANMockURLProtocol.handler = { _ in
            throw NSError(
                domain: NSURLErrorDomain,
                code: URLError.timedOut.rawValue,
                userInfo: [
                    NSLocalizedDescriptionKey: "Bearer secret-token apiToken raw URL marker"
                ]
            )
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [LANMockURLProtocol.self]
        let source = LocalHTTPSource(
            session: URLSession(configuration: configuration),
            requestTimeout: 1,
            maxHostAttempts: 1
        )
        let payload = try PairedDeviceStore().parse(Self.payloadJSON(
            hosts: ["192.168.1.7"],
            token: "secret-token"
        ))

        do {
            _ = try await source.pingWithReport(payload)
            XCTFail("Expected transport error to fail")
        } catch let failure as LocalHTTPFailure {
            XCTAssertEqual(failure.message, "Mac 摸太久没回")
            XCTAssertEqual(failure.report.attempts.first?.message, "Mac 摸太久没回")

            let reportText = String(
                decoding: try JSONEncoder.aiUsageSnapshotEncoder.encode(failure.report),
                as: UTF8.self
            )
            let combined = "\(failure.localizedDescription)\n\(reportText)"

            XCTAssertFalse(combined.contains("secret-token"))
            XCTAssertFalse(combined.contains("Bearer"))
            XCTAssertFalse(combined.contains("apiToken"))
            XCTAssertFalse(combined.contains("raw URL marker"))
        }
    }

    func testPingRejectsUnhealthyOkFalseResponse() async throws {
        LANMockURLProtocol.reset()
        LANMockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw URLError(.badURL)
            }
            XCTAssertEqual(url.path, "/v1/ping")

            return (HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!, Data(#"{"ok":false,"deviceId":"mac-test","name":"Test Mac"}"#.utf8))
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [LANMockURLProtocol.self]
        let source = LocalHTTPSource(
            session: URLSession(configuration: configuration),
            requestTimeout: 1,
            maxHostAttempts: 1
        )
        let payload = try PairedDeviceStore().parse(Self.payloadJSON(
            hosts: ["192.168.1.7"],
            token: "secret-token"
        ))

        do {
            _ = try await source.pingWithReport(payload)
            XCTFail("Expected ok:false ping response to fail")
        } catch let failure as LocalHTTPFailure {
            XCTAssertEqual(failure.message, "Mac 回包解不开")
            XCTAssertEqual(failure.report.winningHost, "192.168.1.7")
            XCTAssertEqual(failure.report.attempts.first?.succeeded, true)
            XCTAssertEqual(failure.report.attempts.first?.httpStatus, 200)
        }
    }

    func testPingRejectsUnsafeMacName() async throws {
        LANMockURLProtocol.reset()
        LANMockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw URLError(.badURL)
            }
            XCTAssertEqual(url.path, "/v1/ping")

            return (HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!, Data(#"{"ok":true,"deviceId":"mac-test","name":"http://192.168.1.7 Bearer secret-token"}"#.utf8))
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [LANMockURLProtocol.self]
        let source = LocalHTTPSource(
            session: URLSession(configuration: configuration),
            requestTimeout: 1,
            maxHostAttempts: 1
        )
        let payload = try PairedDeviceStore().parse(Self.payloadJSON(
            hosts: ["192.168.1.7"],
            token: "secret-token"
        ))

        do {
            _ = try await source.pingWithReport(payload)
            XCTFail("Expected unsafe Mac name to fail")
        } catch let failure as LocalHTTPFailure {
            XCTAssertEqual(failure.message, "Mac 回包解不开")
            XCTAssertEqual(failure.report.winningHost, "192.168.1.7")

            let combined = "\(failure.localizedDescription)\n\(String(decoding: try JSONEncoder.aiUsageSnapshotEncoder.encode(failure.report), as: UTF8.self))"
            XCTAssertFalse(combined.contains("secret-token"))
            XCTAssertFalse(combined.contains("Bearer"))
            XCTAssertFalse(combined.contains("http://"))
        }
    }

    func testPingRejectsMismatchedPairedMacIdentity() async throws {
        LANMockURLProtocol.reset()
        LANMockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw URLError(.badURL)
            }
            XCTAssertEqual(url.path, "/v1/ping")

            return (HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!, Data(#"{"ok":true,"deviceId":"other-mac","name":"Wrong Mac"}"#.utf8))
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [LANMockURLProtocol.self]
        let source = LocalHTTPSource(
            session: URLSession(configuration: configuration),
            requestTimeout: 1,
            maxHostAttempts: 1
        )
        let payload = try PairedDeviceStore().parse(Self.payloadJSON(
            hosts: ["192.168.1.7"],
            token: "secret-token"
        ))

        do {
            _ = try await source.pingWithReport(payload)
            XCTFail("Expected mismatched ping identity to fail")
        } catch let failure as LocalHTTPFailure {
            XCTAssertEqual(failure.message, "配对 Mac 身份对不上")
            XCTAssertEqual(failure.report.winningHost, "192.168.1.7")
            XCTAssertEqual(failure.report.attempts.first?.succeeded, true)
            XCTAssertEqual(failure.report.attempts.first?.httpStatus, 200)
        }
    }

    func testSnapshotRejectsMismatchedPairedMacIdentity() async throws {
        LANMockURLProtocol.reset()
        LANMockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw URLError(.badURL)
            }
            XCTAssertEqual(url.path, "/v1/snapshot")

            return (HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!, Data(Self.snapshotJSON(deviceId: "other-mac").utf8))
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [LANMockURLProtocol.self]
        let source = LocalHTTPSource(
            session: URLSession(configuration: configuration),
            requestTimeout: 1,
            maxHostAttempts: 1
        )
        let payload = try PairedDeviceStore().parse(Self.payloadJSON(
            hosts: ["192.168.1.7"],
            token: "secret-token"
        ))

        do {
            _ = try await source.snapshotWithReport(payload)
            XCTFail("Expected mismatched snapshot identity to fail")
        } catch let failure as LocalHTTPFailure {
            XCTAssertEqual(failure.message, "配对 Mac 身份对不上")
            XCTAssertEqual(failure.report.winningHost, "192.168.1.7")
            XCTAssertEqual(failure.report.attempts.first?.succeeded, true)
            XCTAssertEqual(failure.report.attempts.first?.httpStatus, 200)
        }
    }

    func testApprovalDecisionPostsMinimalBody() async throws {
        LANMockURLProtocol.reset()
        LANMockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw URLError(.badURL)
            }
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(url.path, "/v1/approval-decisions")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer secret-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")

            let body = try XCTUnwrap(Self.requestBodyData(request))
            let object = try JSONSerialization.jsonObject(with: body) as? [String: Any]
            XCTAssertEqual(object?["schemaVersion"] as? Int, 1)
            XCTAssertEqual(object?["requestId"] as? String, "fixture-approval")
            XCTAssertEqual(object?["action"] as? String, "deny")
            XCTAssertNil(object?["decidedAt"])
            XCTAssertNil(object?["message"])
            XCTAssertNil(object?["prompt"])
            XCTAssertNil(object?["comment"])

            return (HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!, Data("""
            {
              "ok": true,
              "schemaVersion": 1,
              "requestId": "fixture-approval",
              "action": "deny",
              "decidedAt": "2026-06-11T00:00:00Z"
            }
            """.utf8))
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [LANMockURLProtocol.self]
        let source = LocalHTTPSource(
            session: URLSession(configuration: configuration),
            requestTimeout: 1,
            maxHostAttempts: 1
        )
        let payload = try PairedDeviceStore().parse(Self.payloadJSON(
            hosts: ["192.168.1.7"],
            token: "secret-token"
        ))
        let decision = ApprovalDecision(
            schemaVersion: 1,
            requestId: "fixture-approval",
            action: .deny,
            decidedAt: Date(timeIntervalSince1970: 1_781_178_600)
        )

        let result = try await source.submitApprovalDecisionWithReport(decision, payload: payload)

        XCTAssertEqual(result.value.ok, true)
        XCTAssertEqual(result.value.requestId, "fixture-approval")
        XCTAssertEqual(result.value.action, .deny)
        XCTAssertEqual(result.report.winningHost, "192.168.1.7")
    }

    func testApprovalDecisionRejectsMismatchedMacReceipt() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [LANMockURLProtocol.self]
        let source = LocalHTTPSource(
            session: URLSession(configuration: configuration),
            requestTimeout: 1,
            maxHostAttempts: 1
        )
        let payload = try PairedDeviceStore().parse(Self.payloadJSON(
            hosts: ["192.168.1.7"],
            token: "secret-token"
        ))
        let decision = ApprovalDecision(
            schemaVersion: 1,
            requestId: "fixture-approval",
            action: .approve,
            decidedAt: Date(timeIntervalSince1970: 1_781_178_600)
        )

        for response in [
            #"{"ok":true,"schemaVersion":1,"requestId":"wrong-request","action":"approve","decidedAt":"2026-06-11T00:00:00Z"}"#,
            #"{"ok":true,"schemaVersion":1,"requestId":"fixture-approval","action":"deny","decidedAt":"2026-06-11T00:00:00Z"}"#,
            #"{"ok":false,"schemaVersion":1,"requestId":"fixture-approval","action":"approve","decidedAt":"2026-06-11T00:00:00Z"}"#
        ] {
            LANMockURLProtocol.reset()
            LANMockURLProtocol.handler = { request in
                guard let url = request.url else {
                    throw URLError(.badURL)
                }
                return (HTTPURLResponse(
                    url: url,
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )!, Data(response.utf8))
            }

            do {
                _ = try await source.submitApprovalDecisionWithReport(decision, payload: payload)
                XCTFail("Expected mismatched approval receipt to fail")
            } catch let failure as LocalHTTPFailure {
                XCTAssertEqual(failure.message, "Mac 没收这票")
                XCTAssertEqual(failure.report.winningHost, "192.168.1.7")
            }
        }
    }

    func testApprovalRequestFetchesPendingMacRequest() async throws {
        LANMockURLProtocol.reset()
        LANMockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw URLError(.badURL)
            }
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(url.path, "/v1/approval-request")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer secret-token")
            XCTAssertNil(request.value(forHTTPHeaderField: "Content-Type"))
            XCTAssertNil(Self.requestBodyData(request))

            return (HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!, Data("""
            {
              "ok": true,
              "request": {
                "schemaVersion": 1,
                "id": "fixture-approval",
                "source": "Mac 请求",
                "title": "允许这一步继续？",
                "createdAt": "2026-06-11T00:00:00Z",
                "expiresAt": "2026-06-11T00:15:00Z"
              }
            }
            """.utf8))
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [LANMockURLProtocol.self]
        let source = LocalHTTPSource(
            session: URLSession(configuration: configuration),
            requestTimeout: 1,
            maxHostAttempts: 1
        )
        let payload = try PairedDeviceStore().parse(Self.payloadJSON(
            hosts: ["192.168.1.7"],
            token: "secret-token"
        ))

        let result = try await source.approvalRequestWithReport(payload)

        XCTAssertEqual(result.value?.id, "fixture-approval")
        XCTAssertEqual(result.value?.source, "Mac 请求")
        XCTAssertEqual(result.value?.title, "允许这一步继续？")
        XCTAssertEqual(result.report.winningHost, "192.168.1.7")
    }

    func testApprovalRequestFetchAcceptsNullPendingRequest() async throws {
        LANMockURLProtocol.reset()
        LANMockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw URLError(.badURL)
            }
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(url.path, "/v1/approval-request")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer secret-token")
            XCTAssertNil(request.value(forHTTPHeaderField: "Content-Type"))
            XCTAssertNil(Self.requestBodyData(request))
            return (HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!, Data(#"{"ok":true,"request":null}"#.utf8))
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [LANMockURLProtocol.self]
        let source = LocalHTTPSource(
            session: URLSession(configuration: configuration),
            requestTimeout: 1,
            maxHostAttempts: 1
        )
        let payload = try PairedDeviceStore().parse(Self.payloadJSON(
            hosts: ["192.168.1.7"],
            token: "secret-token"
        ))

        let result = try await source.approvalRequestWithReport(payload)

        XCTAssertNil(result.value)
    }

    private static func payloadJSON(hosts: [String], token: String) -> String {
        let encodedHosts = hosts.map { "\"\($0)\"" }.joined(separator: ", ")
        return """
        {
          "v": 1,
          "deviceId": "mac-test",
          "name": "Test Mac",
          "hosts": [\(encodedHosts)],
          "port": 8787,
          "token": "\(token)"
        }
        """
    }

    private static func snapshotJSON(deviceId: String) -> String {
        """
        {
          "schemaVersion": 1,
          "device": {
            "id": "\(deviceId)",
            "name": "Test Mac",
            "platform": "macOS",
            "connectorVersion": "0.1.0",
            "online": true,
            "updatedAt": "2026-06-11T00:00:00Z"
          },
          "providers": [
            {
              "id": "claude",
              "displayName": "Claude",
              "connected": true,
              "health": "working",
              "usage": {
                "available": false,
                "reason": "no_stable_source"
              }
            },
            {
              "id": "codex",
              "displayName": "Codex",
              "connected": true,
              "health": "working",
              "usage": {
                "available": false,
                "reason": "no_stable_source"
              }
            }
          ]
        }
        """
    }

    private static func requestBodyData(_ request: URLRequest) -> Data? {
        if let body = request.httpBody {
            return body
        }
        guard let stream = request.httpBodyStream else {
            return nil
        }

        stream.open()
        defer {
            stream.close()
        }

        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1_024)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count > 0 {
                data.append(buffer, count: count)
            } else {
                break
            }
        }
        return data
    }
}

final class SnapshotStoreProofModeTests: XCTestCase {
    func testSavingUnavailableUsagePreservesLastKnownMeter() throws {
        let suiteName = "AIUsageWidgetSnapshotStoreTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }

        let store = SnapshotStore(defaults: defaults)
        let previous = try AIUsageSnapshot.decodeValidated(from: Data(Self.previousClaudeMeterJSON.utf8))
        let current = try AIUsageSnapshot.decodeValidated(from: Data(Self.currentClaudeUnavailableJSON.utf8))

        try store.saveCachedSnapshot(previous, source: "lan")
        try store.saveCachedSnapshot(current, source: "widget-lan")

        let record = try XCTUnwrap(store.loadCachedSnapshotRecord())
        let claude = try XCTUnwrap(record.snapshot.providers.first { $0.id == "claude" })
        XCTAssertTrue(claude.usage.available)
        XCTAssertEqual(claude.usage.source, .claudeCodeTty)
        XCTAssertEqual(claude.usage.fiveHourRemainingPercent, 97)
        XCTAssertEqual(record.source, "widget-lan+last-known:claude")
    }

    func testWritingAndDisablingProofModeIsExplicit() throws {
        let suiteName = "AIUsageWidgetTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }

        let store = SnapshotStore(defaults: defaults)
        XCTAssertFalse(store.isProofModeEnabled())

        try store.writeAppGroupProof("Proof 12:34:56")
        XCTAssertTrue(store.isProofModeEnabled())
        XCTAssertEqual(store.readAppGroupProof(), "Proof 12:34:56")

        try store.disableProofMode()
        XCTAssertFalse(store.isProofModeEnabled())
        XCTAssertEqual(store.readAppGroupProof(), "Proof 12:34:56")
    }

    func testUsageProviderModeIsSharedThroughSnapshotStore() throws {
        let suiteName = "AIUsageWidgetTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }

        let store = SnapshotStore(defaults: defaults)
        XCTAssertNil(store.loadUsageProviderModeRaw())

        store.saveUsageProviderModeRaw("codex")
        XCTAssertEqual(store.loadUsageProviderModeRaw(), "codex")
    }

    private static let previousClaudeMeterJSON = """
    {
      "schemaVersion": 1,
      "device": {
        "id": "mac-stable-id",
        "name": "Kai's Mac",
        "platform": "macOS",
        "connectorVersion": "0.1.0",
        "online": true,
        "updatedAt": "2026-06-13T10:27:30Z"
      },
      "providers": [
        {
          "id": "claude",
          "displayName": "Claude",
          "connected": true,
          "health": "working",
          "version": "2.1.177",
          "capturedAt": "2026-06-13T10:27:30Z",
          "usage": {
            "available": true,
            "source": "claude_code_tty",
            "sourceVersion": "2.1.177",
            "fiveHourRemainingPercent": 97,
            "fiveHourResetAt": "2026-06-13T12:39:00Z",
            "weeklyRemainingPercent": 100,
            "weeklyResetAt": "2026-06-16T02:59:00Z"
          }
        },
        {
          "id": "codex",
          "displayName": "Codex",
          "connected": true,
          "health": "working",
          "capturedAt": "2026-06-13T10:28:08Z",
          "usage": {
            "available": true,
            "source": "codex_app_server",
            "fiveHourRemainingPercent": 87,
            "fiveHourResetAt": "2026-06-13T14:06:31Z",
            "weeklyRemainingPercent": 4,
            "weeklyResetAt": "2026-06-16T01:23:31Z"
          }
        }
      ]
    }
    """

    private static let currentClaudeUnavailableJSON = """
    {
      "schemaVersion": 1,
      "device": {
        "id": "mac-stable-id",
        "name": "Kai's Mac",
        "platform": "macOS",
        "connectorVersion": "0.1.0",
        "online": true,
        "updatedAt": "2026-06-13T10:31:00Z"
      },
      "providers": [
        {
          "id": "claude",
          "displayName": "Claude",
          "connected": true,
          "health": "working",
          "version": "2.1.177",
          "usage": {
            "available": false,
            "reason": "no_stable_source"
          }
        },
        {
          "id": "codex",
          "displayName": "Codex",
          "connected": true,
          "health": "working",
          "capturedAt": "2026-06-13T10:31:10Z",
          "usage": {
            "available": true,
            "source": "codex_app_server",
            "fiveHourRemainingPercent": 86,
            "fiveHourResetAt": "2026-06-13T14:06:31Z",
            "weeklyRemainingPercent": 4,
            "weeklyResetAt": "2026-06-16T01:23:31Z"
          }
        }
      ]
    }
    """
}

final class ApprovalStoreTests: XCTestCase {
    func testSeededFixtureRequestIsLocalUIOnly() throws {
        let suiteName = "AIUsageWidgetApprovalTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }

        let now = Date(timeIntervalSince1970: 1_781_178_600)
        let store = ApprovalStore(defaults: defaults)
        let request = try store.seedFixtureRequest(now: now)

        XCTAssertTrue(request.isLocalUIFixture)
        XCTAssertEqual(request.id, "local-fixture-1781178600")
        XCTAssertEqual(request.source, "本地测试")

        let decision = try store.recordDecision(
            requestId: request.id,
            action: .deny,
            decidedAt: now.addingTimeInterval(60),
            requiresLocalFixture: true
        )

        XCTAssertNil(store.loadPendingRequest(now: now.addingTimeInterval(60)))
        XCTAssertEqual(decision.action, .deny)
    }

    func testMacOwnedRequestCannotBeClearedAsLocalFixture() throws {
        let suiteName = "AIUsageWidgetApprovalTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }

        let createdAt = Date(timeIntervalSince1970: 1_781_178_600)
        let store = ApprovalStore(defaults: defaults)
        let request = ApprovalRequest(
            schemaVersion: 1,
            id: "fixture-approval",
            source: "Mac 请求",
            title: "允许这一步继续？",
            createdAt: createdAt,
            expiresAt: createdAt.addingTimeInterval(900)
        )

        try store.savePendingRequest(request, now: createdAt)

        XCTAssertFalse(request.isLocalUIFixture)
        XCTAssertThrowsError(try store.recordDecision(
            requestId: request.id,
            action: .approve,
            decidedAt: createdAt.addingTimeInterval(60),
            requiresLocalFixture: true
        )) { error in
            XCTAssertEqual(error as? ApprovalStoreError, .macRequestNeedsPairedMac)
        }
        XCTAssertEqual(store.loadPendingRequest(now: createdAt.addingTimeInterval(60)), request)
        XCTAssertNil(store.loadLastDecision())
    }

    func testPendingApprovalAndDecisionRoundTripThroughInjectedDefaults() throws {
        let suiteName = "AIUsageWidgetApprovalTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }

        let createdAt = Date(timeIntervalSince1970: 1_781_178_600)
        let store = ApprovalStore(defaults: defaults)
        let request = ApprovalRequest(
            schemaVersion: 1,
            id: "fixture-approval",
            source: "Mac 请求",
            title: "允许这一步继续？",
            createdAt: createdAt,
            expiresAt: createdAt.addingTimeInterval(900)
        )

        try store.savePendingRequest(request, now: createdAt)
        XCTAssertEqual(store.loadPendingRequest(now: createdAt), request)

        let decision = try store.recordDecision(
            requestId: request.id,
            action: .approve,
            decidedAt: createdAt.addingTimeInterval(60)
        )

        XCTAssertNil(store.loadPendingRequest(now: createdAt.addingTimeInterval(60)))
        XCTAssertEqual(decision.action, .approve)
        XCTAssertEqual(store.loadLastDecision(), decision)
    }

    func testExpiredApprovalIsClearedOnLoad() throws {
        let suiteName = "AIUsageWidgetApprovalTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }

        let createdAt = Date(timeIntervalSince1970: 1_781_178_600)
        let store = ApprovalStore(defaults: defaults)
        let request = ApprovalRequest(
            schemaVersion: 1,
            id: "fixture-expiring",
            source: "Mac 请求",
            title: "允许这一步继续？",
            createdAt: createdAt,
            expiresAt: createdAt.addingTimeInterval(60)
        )

        try store.savePendingRequest(request, now: createdAt)

        XCTAssertNil(store.loadPendingRequest(now: createdAt.addingTimeInterval(61)))
        XCTAssertNil(defaults.data(forKey: AppGroup.approvalRequestKey))
    }

    func testExpiredApprovalCanBeReadForDiagnosticsBeforeClearing() throws {
        let suiteName = "AIUsageWidgetApprovalTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }

        let createdAt = Date(timeIntervalSince1970: 1_781_178_600)
        let expiredAt = createdAt.addingTimeInterval(60)
        let store = ApprovalStore(defaults: defaults)
        let request = ApprovalRequest(
            schemaVersion: 1,
            id: "fixture-expiring",
            source: "Mac 请求",
            title: "允许这一步继续？",
            createdAt: createdAt,
            expiresAt: expiredAt
        )

        try store.savePendingRequest(request, now: createdAt)

        let diagnosticRequest = store.loadPendingRequestForDiagnostics()
        XCTAssertEqual(diagnosticRequest, request)
        XCTAssertEqual(diagnosticRequest?.isExpired(now: expiredAt.addingTimeInterval(1)), true)
    }

    func testExpiredApprovalIsRejectedOnSave() throws {
        let suiteName = "AIUsageWidgetApprovalTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }

        let createdAt = Date(timeIntervalSince1970: 1_781_178_600)
        let store = ApprovalStore(defaults: defaults)
        let request = ApprovalRequest(
            schemaVersion: 1,
            id: "fixture-expired",
            source: "Mac 请求",
            title: "允许这一步继续？",
            createdAt: createdAt,
            expiresAt: createdAt.addingTimeInterval(60)
        )

        XCTAssertThrowsError(try store.savePendingRequest(request, now: createdAt.addingTimeInterval(61))) { error in
            XCTAssertEqual(error as? ApprovalStoreError, .expiredRequest)
        }
        XCTAssertNil(defaults.data(forKey: AppGroup.approvalRequestKey))
    }

    func testApprovalRequestRejectsUnsafeText() throws {
        let request = ApprovalRequest(
            schemaVersion: 1,
            id: "fixture-unsafe",
            source: "Mac 请求",
            title: "Bearer secret-token raw log",
            createdAt: Date(timeIntervalSince1970: 1_781_178_600),
            expiresAt: nil
        )

        XCTAssertThrowsError(try request.validated()) { error in
            XCTAssertEqual(error as? ApprovalStoreError, .unsafeText)
        }
    }

    func testApprovalRequestRejectsNetworkDetails() throws {
        let createdAt = Date(timeIntervalSince1970: 1_781_178_600)

        for (source, title) in [
            ("http://192.168.1.7", "允许这一步继续？"),
            ("KaideMacBook-Pro.local", "允许这一步继续？"),
            ("localhost", "允许这一步继续？"),
            ("Mac 请求", "去 http://KaideMacBook-Pro.local 看")
        ] {
            let request = ApprovalRequest(
                schemaVersion: 1,
                id: "fixture-unsafe",
                source: source,
                title: title,
                createdAt: createdAt,
                expiresAt: nil
            )

            XCTAssertThrowsError(try request.validated()) { error in
                XCTAssertEqual(error as? ApprovalStoreError, .unsafeText)
            }
        }
    }

    func testApprovalAttemptDiagnosticRoundTripsWithoutNetworkDetails() throws {
        let suiteName = "AIUsageWidgetApprovalTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }

        let now = Date(timeIntervalSince1970: 1_781_178_600)
        let store = ApprovalStore(defaults: defaults)
        let decision = ApprovalDecision(
            schemaVersion: 1,
            requestId: "fixture-approval",
            action: .approve,
            decidedAt: now
        )
        let diagnostic = try ApprovalAttemptDiagnostic.success(
            result: .sentToMac(decision),
            origin: .widget,
            attemptedAt: now
        ).validated()

        try store.saveApprovalAttemptDiagnostic(diagnostic)

        XCTAssertEqual(store.loadLastAttemptDiagnostic(), diagnostic)
        XCTAssertNotNil(defaults.data(forKey: AppGroup.approvalAttemptDiagnosticKey))
    }

    func testApprovalAttemptDiagnosticMapsFailuresWithoutLeakingDetails() throws {
        let now = Date(timeIntervalSince1970: 1_781_178_600)
        let failure = LocalHTTPFailure(
            report: LocalHTTPReport(
                path: "/v1/approval-decisions",
                attemptedAt: now,
                attempts: [
                    LocalHTTPAttempt(
                        host: "192.168.1.7",
                        path: "/v1/approval-decisions",
                        succeeded: false,
                        httpStatus: 401,
                        message: "Bearer secret-token raw URL marker"
                    )
                ],
                winningHost: nil
            ),
            message: "Bearer secret-token raw URL marker"
        )

        let diagnostic = try ApprovalAttemptDiagnostic.failure(
            requestId: "fixture-approval",
            action: .deny,
            origin: .widget,
            error: failure,
            attemptedAt: now
        ).validated()
        let data = try JSONEncoder.aiUsageSnapshotEncoder.encode(diagnostic)
        let text = String(decoding: data, as: UTF8.self)

        XCTAssertEqual(diagnostic.outcome, .rejectedByMac)
        XCTAssertEqual(diagnostic.httpStatus, 401)
        XCTAssertEqual(diagnostic.attemptedHostCount, 1)
        XCTAssertFalse(text.contains("192.168.1.7"))
        XCTAssertFalse(text.contains("Bearer"))
        XCTAssertFalse(text.contains("secret-token"))
        XCTAssertFalse(text.contains("raw URL marker"))
    }

    func testApprovalAttemptDiagnosticRejectsUnsafeOrOversizedDetail() throws {
        let now = Date(timeIntervalSince1970: 1_781_178_600)

        XCTAssertThrowsError(try ApprovalAttemptDiagnostic(
            schemaVersion: 1,
            attemptedAt: now,
            requestId: "fixture-approval",
            action: .approve,
            origin: .widget,
            outcome: .writeFailed,
            detail: "http://192.168.1.7 Bearer secret-token raw log",
            httpStatus: nil,
            attemptedHostCount: nil
        ).validated()) { error in
            XCTAssertEqual(error as? ApprovalStoreError, .unsafeText)
        }

        XCTAssertThrowsError(try ApprovalAttemptDiagnostic(
            schemaVersion: 1,
            attemptedAt: now,
            requestId: "fixture-approval",
            action: .approve,
            origin: .widget,
            outcome: .writeFailed,
            detail: String(repeating: "x", count: 121),
            httpStatus: nil,
            attemptedHostCount: nil
        ).validated())
    }
}

final class ApprovalDecisionHandlerTests: XCTestCase {
    func testLocalFixtureDecisionRecordsWithoutMacSubmit() async throws {
        let decidedAt = Date(timeIntervalSince1970: 1_781_178_600)
        let request = ApprovalRequest(
            schemaVersion: 1,
            id: "local-fixture-1781178600",
            source: "本地测试",
            title: "允许这一步继续？",
            createdAt: decidedAt,
            expiresAt: decidedAt.addingTimeInterval(900)
        )
        var submitCalled = false
        let handler = ApprovalDecisionHandler(
            loadPendingRequest: { _ in request },
            recordDecision: { requestId, action, recordedAt, requiresLocalFixture in
                XCTAssertEqual(requestId, request.id)
                XCTAssertEqual(action, .deny)
                XCTAssertEqual(recordedAt, decidedAt)
                XCTAssertTrue(requiresLocalFixture)
                return ApprovalDecision(
                    schemaVersion: 1,
                    requestId: requestId,
                    action: action,
                    decidedAt: recordedAt
                )
            },
            loadPairedDevice: {
                XCTFail("Local UI fixtures must not require a paired Mac")
                return nil
            },
            submitDecision: { _, _ in
                submitCalled = true
            }
        )

        let result = try await handler.decide(requestId: request.id, action: .deny, decidedAt: decidedAt)

        XCTAssertEqual(result, .recordedLocal(ApprovalDecision(
            schemaVersion: 1,
            requestId: request.id,
            action: .deny,
            decidedAt: decidedAt
        )))
        XCTAssertFalse(submitCalled)
    }

    func testMacOwnedDecisionRequiresPairedMacBeforeRecording() async throws {
        let decidedAt = Date(timeIntervalSince1970: 1_781_178_600)
        let request = ApprovalRequest(
            schemaVersion: 1,
            id: "fixture-approval",
            source: "Mac 请求",
            title: "允许这一步继续？",
            createdAt: decidedAt,
            expiresAt: decidedAt.addingTimeInterval(900)
        )
        var submitCalled = false
        var recordCalled = false
        let handler = ApprovalDecisionHandler(
            loadPendingRequest: { _ in request },
            recordDecision: { _, _, _, _ in
                recordCalled = true
                return ApprovalDecision(
                    schemaVersion: 1,
                    requestId: request.id,
                    action: .approve,
                    decidedAt: decidedAt
                )
            },
            loadPairedDevice: { nil },
            submitDecision: { _, _ in
                submitCalled = true
            }
        )

        do {
            _ = try await handler.decide(requestId: request.id, action: .approve, decidedAt: decidedAt)
            XCTFail("Expected missing paired Mac to fail")
        } catch {
            XCTAssertEqual(error as? ApprovalStoreError, .macRequestNeedsPairedMac)
        }
        XCTAssertFalse(submitCalled)
        XCTAssertFalse(recordCalled)
    }

    func testMacOwnedDecisionSubmitsBeforeRecording() async throws {
        let decidedAt = Date(timeIntervalSince1970: 1_781_178_600)
        let request = ApprovalRequest(
            schemaVersion: 1,
            id: "fixture-approval",
            source: "Mac 请求",
            title: "允许这一步继续？",
            createdAt: decidedAt,
            expiresAt: decidedAt.addingTimeInterval(900)
        )
        let payload = try PairedDeviceStore().parse(Self.payloadJSON(host: "192.168.1.7", token: "secret-token"))
        var submittedDecision: ApprovalDecision?
        var submittedPayload: PairingPayload?
        var recordedRequiresLocalFixture: Bool?
        let handler = ApprovalDecisionHandler(
            loadPendingRequest: { _ in request },
            recordDecision: { requestId, action, recordedAt, requiresLocalFixture in
                recordedRequiresLocalFixture = requiresLocalFixture
                return ApprovalDecision(
                    schemaVersion: 1,
                    requestId: requestId,
                    action: action,
                    decidedAt: recordedAt
                )
            },
            loadPairedDevice: { payload },
            submitDecision: { decision, payload in
                submittedDecision = decision
                submittedPayload = payload
            }
        )

        let result = try await handler.decide(requestId: request.id, action: .approve, decidedAt: decidedAt)
        let expected = ApprovalDecision(
            schemaVersion: 1,
            requestId: request.id,
            action: .approve,
            decidedAt: decidedAt
        )

        XCTAssertEqual(result, .sentToMac(expected))
        XCTAssertEqual(submittedDecision, expected)
        XCTAssertEqual(submittedPayload, payload)
        XCTAssertEqual(recordedRequiresLocalFixture, false)
    }

    private static func payloadJSON(host: String, token: String) -> String {
        """
        {
          "v": 1,
          "deviceId": "mac-test",
          "name": "Test Mac",
          "hosts": ["\(host)"],
          "port": 8787,
          "token": "\(token)"
        }
        """
    }
}

private final class LANMockURLProtocol: URLProtocol {
    typealias Handler = (URLRequest) throws -> (HTTPURLResponse, Data)

    static var handler: Handler?
    static var requests: [URLRequest] = []

    static func reset() {
        handler = nil
        requests = []
    }

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        Self.requests.append(request)

        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
