import Foundation

@main
struct ValidateFixtures {
    static func main() async throws {
        let userFixtureNames = [
            "normal.json",
            "degraded.json",
            "offline.json",
            "not_logged_in.json",
            "error.json",
            "stale.json"
        ]
        let internalFixtureNames = [
            "internal_meter_layout.json",
            "internal_stale_meter_layout.json"
        ]

        let fixturesURL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            .appendingPathComponent("fixtures", isDirectory: true)

        for fixtureName in userFixtureNames + internalFixtureNames {
            let data = try Data(contentsOf: fixturesURL.appendingPathComponent(fixtureName))
            _ = try AIUsageSnapshot.decodeValidated(from: data)
            print("decoded \(fixtureName)")
        }

        try validateEmbeddedPreviewFixtures(
            fixturesURL: fixturesURL,
            userFixtureNames: userFixtureNames,
            internalFixtureNames: internalFixtureNames
        )

        for fixtureName in userFixtureNames {
            let data = try Data(contentsOf: fixturesURL.appendingPathComponent(fixtureName))
            let snapshot = try AIUsageSnapshot.decodeValidated(from: data)
            for provider in snapshot.providers {
                guard provider.capturedAt == nil,
                      provider.usage.available == false,
                      provider.usage.source == nil,
                      provider.usage.sourceVersion == nil,
                      provider.usage.fiveHourRemainingPercent == nil,
                      provider.usage.fiveHourResetAt == nil,
                      provider.usage.weeklyRemainingPercent == nil,
                      provider.usage.weeklyResetAt == nil,
                      provider.usage.reason != nil else {
                    throw FixtureValidationFailure.userFixtureHadFakeMeter(fixtureName)
                }
            }
        }
        print("validated user fixtures have no fake meters")

        let unsafeJSON = """
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
              "id": "codex",
              "displayName": "Codex",
              "connected": true,
              "health": "working",
              "capturedAt": "2026-06-11T19:29:41+08:00",
              "apiToken": "do-not-ship",
              "usage": {
                "available": true,
                "source": "codexbar",
                "sourceVersion": "0.1.0",
                "fiveHourRemainingPercent": 85,
                "fiveHourResetAt": "2026-06-11T20:30:00+08:00",
                "weeklyRemainingPercent": 27,
                "weeklyResetAt": "2026-06-11T21:45:00+08:00"
              }
            }
          ]
        }
        """
        let safeSingleProviderJSON = """
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
              "id": "codex",
              "displayName": "Codex",
              "connected": true,
              "health": "working",
              "capturedAt": "2026-06-11T19:29:41+08:00",
              "usage": {
                "available": true,
                "source": "codexbar",
                "sourceVersion": "0.1.0",
                "fiveHourRemainingPercent": 85,
                "fiveHourResetAt": "2026-06-11T20:30:00+08:00",
                "weeklyRemainingPercent": 27,
                "weeklyResetAt": "2026-06-11T21:45:00+08:00"
              }
            }
          ]
        }
        """

        do {
            _ = try AIUsageSnapshot.decodeValidated(from: Data(unsafeJSON.utf8))
            throw FixtureValidationFailure.unsafeSnapshotWasAccepted
        } catch SnapshotValidationError.unsafeText {
            print("rejected unsafe raw snapshot")
        }

        do {
            let unsafeValueJSON = safeSingleProviderJSON
                .replacingOccurrences(
                    of: #""displayName": "Codex""#,
                    with: #""displayName": "Bearer secret-token provider output""#
                )
            _ = try AIUsageSnapshot.decodeValidated(from: Data(unsafeValueJSON.utf8))
            throw FixtureValidationFailure.unsafeSnapshotValueWasAccepted
        } catch SnapshotValidationError.unsafeText {
            print("rejected unsafe snapshot string value")
        }

        for unsafeDisplayName in ["http://192.168.1.7/status", "KaideMacBook-Pro.local", "localhost", "192.168.1.7"] {
            do {
                let unsafeValueJSON = safeSingleProviderJSON
                    .replacingOccurrences(
                        of: #""displayName": "Codex""#,
                        with: #""displayName": "\#(unsafeDisplayName)""#
                    )
                _ = try AIUsageSnapshot.decodeValidated(from: Data(unsafeValueJSON.utf8))
                throw FixtureValidationFailure.unsafeSnapshotValueWasAccepted
            } catch SnapshotValidationError.unsafeText {
                continue
            }
        }
        print("rejected unsafe snapshot network text")

        do {
            let invalidPlatformJSON = safeSingleProviderJSON
                .replacingOccurrences(of: #""platform": "macOS""#, with: #""platform": "iOS""#)
            _ = try AIUsageSnapshot.decodeValidated(from: Data(invalidPlatformJSON.utf8))
            throw FixtureValidationFailure.invalidPlatformWasAccepted
        } catch SnapshotValidationError.invalidPlatform {
            print("rejected invalid platform")
        }

        do {
            let longDisplayName = String(repeating: "x", count: 41)
            let oversizedDisplayNameJSON = safeSingleProviderJSON
                .replacingOccurrences(of: #""displayName": "Codex""#, with: #""displayName": "\#(longDisplayName)""#)
            _ = try AIUsageSnapshot.decodeValidated(from: Data(oversizedDisplayNameJSON.utf8))
            throw FixtureValidationFailure.oversizedContractStringWasAccepted
        } catch SnapshotValidationError.invalidStringLength {
            print("rejected oversized contract string")
        }

        do {
            let futureProviderJSON = safeSingleProviderJSON
                .replacingOccurrences(of: #""id": "codex""#, with: #""id": "hermes""#)
            _ = try AIUsageSnapshot.decodeValidated(from: Data(futureProviderJSON.utf8))
            throw FixtureValidationFailure.futureProviderWasAccepted
        } catch SnapshotValidationError.invalidProvider {
            print("rejected future provider id")
        }

        for source in ["sessions_jsonl", "provider_api"] {
            do {
                let futureSourceJSON = safeSingleProviderJSON
                    .replacingOccurrences(of: #""source": "codexbar""#, with: #""source": "\#(source)""#)
                _ = try AIUsageSnapshot.decodeValidated(from: Data(futureSourceJSON.utf8))
                throw FixtureValidationFailure.futureUsageSourceWasAccepted(source)
            } catch DecodingError.dataCorrupted {
                continue
            }
        }
        print("rejected future usage sources")

        let normalFixtureJSON = try String(
            contentsOf: fixturesURL.appendingPathComponent("normal.json"),
            encoding: .utf8
        )
        let internalMeterFixtureJSON = try String(
            contentsOf: fixturesURL.appendingPathComponent("internal_meter_layout.json"),
            encoding: .utf8
        )

        do {
            let claudeCodeTtySourceJSON = normalFixtureJSON.replacingOccurrences(
                of: #"""
      "version": "2.1.170",
      "usage": {
        "available": false,
        "reason": "no_stable_source"
      }
      """#,
                with: #"""
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
      """#
            )
            _ = try AIUsageSnapshot.decodeValidated(from: Data(claudeCodeTtySourceJSON.utf8))
            print("accepted Claude Code TTY usage source")
        }

        do {
            let duplicateProviderJSON = normalFixtureJSON
                .replacingOccurrences(of: #""id": "codex""#, with: #""id": "claude""#)
            _ = try AIUsageSnapshot.decodeValidated(from: Data(duplicateProviderJSON.utf8))
            throw FixtureValidationFailure.invalidProviderSetWasAccepted
        } catch SnapshotValidationError.invalidProviderSet {
            print("rejected duplicate provider set")
        }

        do {
            let unavailableMeterJSON = normalFixtureJSON
                .replacingOccurrences(of: #""available": false,"#, with: #""available": false, "fiveHourRemainingPercent": 42,"#)
            _ = try AIUsageSnapshot.decodeValidated(from: Data(unavailableMeterJSON.utf8))
            throw FixtureValidationFailure.unavailableMeterFieldsWereAccepted
        } catch SnapshotValidationError.unavailableUsageHasMeterFields {
            print("rejected unavailable usage meter fields")
        }

        do {
            let unavailableCapturedAtJSON = normalFixtureJSON
                .replacingOccurrences(
                    of: #""version": "2.1.170","#,
                    with: #""version": "2.1.170", "capturedAt": "2026-06-11T19:29:41+08:00","#
                )
            _ = try AIUsageSnapshot.decodeValidated(from: Data(unavailableCapturedAtJSON.utf8))
            throw FixtureValidationFailure.unavailableMeterFieldsWereAccepted
        } catch SnapshotValidationError.unavailableUsageHasMeterFields {
            print("rejected unavailable usage capturedAt")
        }

        do {
            let availableReasonJSON = internalMeterFixtureJSON
                .replacingOccurrences(
                    of: #""weeklyResetAt": "2026-06-11T21:45:00+08:00""#,
                    with: #""weeklyResetAt": "2026-06-11T21:45:00+08:00", "reason": "no_stable_source""#
                )
            _ = try AIUsageSnapshot.decodeValidated(from: Data(availableReasonJSON.utf8))
            throw FixtureValidationFailure.availableReasonWasAccepted
        } catch SnapshotValidationError.availableUsageHasReason {
            print("rejected available usage fallback reason")
        }

        try validatePairingHosts()
        try validateWidgetTapProof()
        try validateUsageFreshness()
        try validateAppGroupIdentifierResolution()
        try validateWidgetLANDiagnostic()
        try await validateWidgetRefreshCoordinator()
        try validateApprovalStore()
        try validateApprovalAttemptDiagnostic()
        try await validateApprovalDecisionHandler()
        try await validateLocalHTTPRequests()
    }

    private static func validateEmbeddedPreviewFixtures(
        fixturesURL: URL,
        userFixtureNames: [String],
        internalFixtureNames: [String]
    ) throws {
        let embeddedUserSnapshots = Dictionary(
            uniqueKeysWithValues: PreviewSnapshots.allFixtures.map { ("\($0.id).json", $0.snapshot) }
        )
        let embeddedInternalSnapshots = [
            "internal_meter_layout.json": PreviewSnapshots.meterLayout,
            "internal_stale_meter_layout.json": PreviewSnapshots.staleMeterLayout
        ]

        for fixtureName in userFixtureNames {
            let data = try Data(contentsOf: fixturesURL.appendingPathComponent(fixtureName))
            let rootSnapshot = try AIUsageSnapshot.decodeValidated(from: data)
            guard embeddedUserSnapshots[fixtureName] == rootSnapshot else {
                throw FixtureValidationFailure.embeddedPreviewFixtureDrift(fixtureName)
            }
        }

        for fixtureName in internalFixtureNames {
            let data = try Data(contentsOf: fixturesURL.appendingPathComponent(fixtureName))
            let rootSnapshot = try AIUsageSnapshot.decodeValidated(from: data)
            guard embeddedInternalSnapshots[fixtureName] == rootSnapshot else {
                throw FixtureValidationFailure.embeddedPreviewFixtureDrift(fixtureName)
            }
        }

        print("validated Swift preview fixtures match root fixtures")
    }

    private static func validateWidgetTapProof() throws {
        guard WidgetRefreshDeepLink.isRefreshURL(URL(string: "aiusage://refresh")!),
              !WidgetRefreshDeepLink.isRefreshURL(URL(string: "aiusage://approval")!),
              !WidgetRefreshDeepLink.isRefreshURL(URL(string: "https://refresh")!) else {
            throw FixtureValidationFailure.widgetRefreshDeepLinkFailed
        }

        var dateComponents = DateComponents()
        dateComponents.calendar = Calendar(identifier: .gregorian)
        dateComponents.timeZone = .current
        dateComponents.year = 2026
        dateComponents.month = 6
        dateComponents.day = 12
        dateComponents.hour = 9
        dateComponents.minute = 8
        dateComponents.second = 7
        let proofDate = dateComponents.date!

        guard WidgetTapProofText.initial == "Proof 07 · 还没从 Widget 打开",
              WidgetTapProofText.openedWithoutPairing(at: proofDate) == "Proof 07 · 09:08:07 Widget 打开了 App，未配 Mac",
              WidgetTapProofText.openedRefreshing(at: proofDate) == "Proof 07 · 09:08:07 Widget 打开了 App，正在刷新",
              WidgetTapProofText.openedRefreshed(at: proofDate) == "Proof 07 · 09:08:07 Widget 叫醒成功",
              WidgetTapProofText.openedRefreshFailed(at: proofDate) == "Proof 07 · 09:08:07 Widget 叫了，但 Mac 装睡" else {
            throw FixtureValidationFailure.widgetTapProofTextFailed
        }

        let deniedReport = LocalHTTPReport(
            path: "/v1/ping",
            attemptedAt: proofDate,
            attempts: [
                LocalHTTPAttempt(
                    host: "redacted.local",
                    path: "/v1/ping",
                    succeeded: false,
                    httpStatus: nil,
                    message: "同 Wi-Fi 下没摸到 Mac"
                )
            ],
            winningHost: nil
        )
        guard LocalNetworkPermissionHint.text(for: deniedReport) == LocalNetworkPermissionHint.message else {
            throw FixtureValidationFailure.localNetworkProofHintFailed
        }

        let httpReport = LocalHTTPReport(
            path: "/v1/ping",
            attemptedAt: proofDate,
            attempts: [
                LocalHTTPAttempt(
                    host: "redacted.local",
                    path: "/v1/ping",
                    succeeded: false,
                    httpStatus: 401,
                    message: "HTTP 401"
                )
            ],
            winningHost: nil
        )
        let emptyReport = LocalHTTPReport(path: "/v1/ping", attemptedAt: proofDate, attempts: [], winningHost: nil)
        guard LocalNetworkPermissionHint.text(for: httpReport).isEmpty,
              LocalNetworkPermissionHint.text(for: emptyReport).isEmpty else {
            throw FixtureValidationFailure.localNetworkProofHintFailed
        }

        print("validated widget tap proof helpers")
    }

    private static func validatePairingHosts() throws {
        let store = PairedDeviceStore()
        let accepted = [
            "KaideMacBook-Pro.local",
            "10.0.0.7",
            "172.16.0.7",
            "172.31.0.7",
            "192.168.1.7",
            "169.254.4.7"
        ]
        let rejected = [
            "localhost",
            "127.0.0.1",
            "127.4.5.6",
            "198.18.0.1",
            "8.8.8.8",
            "172.32.0.7",
            "192.168.1.999",
            "192.168.1",
            "192.168..7",
            "bad.local.local",
            "bad host.local",
            "-bad.local",
            "bad-.local",
            "localhost.local",
            "example.com"
        ]

        for host in accepted {
            _ = try store.parse(pairingJSON(host: host))
        }

        for host in rejected {
            do {
                _ = try store.parse(pairingJSON(host: host))
                throw FixtureValidationFailure.invalidHostWasAccepted(host)
            } catch PairingError.loopbackHost {
                continue
            } catch PairingError.nonLocalHost {
                continue
            }
        }

        do {
            _ = try store.parse(pairingJSON(hosts: [
                "192.168.1.7",
                "10.0.0.7",
                "172.16.0.7",
                "169.254.4.7",
                "KaideMacBook-Pro.local"
            ]))
            throw FixtureValidationFailure.tooManyHostsWasAccepted
        } catch PairingError.tooManyHosts {
            print("rejected oversized pairing host list")
        }

        let displayPayload = try store.parse(pairingJSON(hosts: [
            "192.168.1.7",
            "KaideMacBook-Pro.local"
        ]))
        guard displayPayload.displaySummary == "2 个地址 · 端口 8787",
              !displayPayload.displaySummary.contains("192.168.1.7"),
              !displayPayload.displaySummary.contains("KaideMacBook-Pro.local"),
              !displayPayload.displaySummary.contains("test-token") else {
            throw FixtureValidationFailure.pairingDisplaySummaryLeakedHost
        }
        print("validated pairing display summary privacy")

        for unsafeName in ["192.168.1.7", "KaideMacBook-Pro.local", "localhost", "http://192.168.1.7", "Bearer secret-token"] {
            do {
                _ = try store.parse(pairingJSON(host: "192.168.1.7", name: unsafeName))
                throw FixtureValidationFailure.unsafePairingNameWasAccepted
            } catch PairingError.invalidName {
                continue
            }
        }
        print("rejected unsafe pairing names")

        do {
            _ = try store.parse(pairingJSON(host: "192.168.1.7").replacingOccurrences(
                of: #""token": "test-token""#,
                with: #""token": "test-token", "authorization": "Bearer nope""#
            ))
            throw FixtureValidationFailure.unknownPairingFieldWasAccepted
        } catch PairingError.unknownField("authorization") {
            guard !PairingError.unknownField("authorization").localizedDescription.contains("authorization"),
                  !PairingError.unknownField("authorization").localizedDescription.contains("Bearer") else {
                throw FixtureValidationFailure.unknownPairingFieldLeakedText
            }
            print("rejected unknown pairing field")
        }

        do {
            _ = try store.parse(pairingJSON(host: "192.168.1.7", token: "test token"))
            throw FixtureValidationFailure.invalidTokenWasAccepted
        } catch PairingError.invalidToken {
            print("rejected invalid pairing token")
        }

        do {
            _ = try store.parse(pairingJSON(host: "192.168.1.7", token: String(repeating: "a", count: 257)))
            throw FixtureValidationFailure.oversizedPairingTokenWasAccepted
        } catch PairingError.invalidToken {
            print("rejected oversized pairing token")
        }

        do {
            _ = try store.parse(String(repeating: "x", count: 8_193) + pairingJSON(host: "192.168.1.7"))
            throw FixtureValidationFailure.oversizedPairingPasteWasAccepted
        } catch PairingError.invalidPayload {
            print("rejected oversized pairing paste")
        }

        let manualTerminalBlock = """
        AI Usage Widget manual pairing payload (contains local bearer token):
        \(pairingJSON(host: "192.168.1.7", token: "test-token"))
        """
        let manualPayload = try store.parse(manualTerminalBlock)
        guard manualPayload.hosts == ["192.168.1.7"],
              manualPayload.token == "test-token" else {
            throw FixtureValidationFailure.manualTerminalBlockWasRejected
        }
        print("validated manual pairing terminal block")

        let suiteName = "AIUsageWidgetValidateFixtures.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            throw FixtureValidationFailure.pairingDefaultsUnavailable
        }
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }
        let appGroupStore = PairedDeviceStore(defaults: defaults)
        try appGroupStore.save(manualPayload)
        guard appGroupStore.load() == manualPayload else {
            throw FixtureValidationFailure.persistedPairingWasRejected
        }
        let invalidPersistedPayload = PairingPayload(
            v: 1,
            deviceId: "mac-test",
            name: "Test Mac",
            hosts: ["127.0.0.1"],
            port: 8787,
            token: "test-token"
        )
        defaults.set(try JSONEncoder().encode(invalidPersistedPayload), forKey: "aiuw.pairingPayload")
        guard appGroupStore.load() == nil,
              defaults.data(forKey: "aiuw.pairingPayload") == nil else {
            throw FixtureValidationFailure.invalidPersistedPairingWasAccepted
        }
        defaults.set(Data(pairingJSON(host: "192.168.1.7").replacingOccurrences(
            of: #""token": "test-token""#,
            with: #""token": "test-token", "authorization": "Bearer nope""#
        ).utf8), forKey: "aiuw.pairingPayload")
        guard appGroupStore.load() == nil,
              defaults.data(forKey: "aiuw.pairingPayload") == nil else {
            throw FixtureValidationFailure.invalidPersistedPairingWasAccepted
        }
        do {
            try appGroupStore.save(invalidPersistedPayload)
            throw FixtureValidationFailure.invalidPersistedPairingWasAccepted
        } catch PairingError.loopbackHost {
            print("validated persisted pairing payload policy")
        }

        let redactedTerminalBlock = """
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
        try expectRedactedPairingError(redactedTerminalBlock)

        let redactedStatusBlock = """
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
        try expectRedactedPairingError(redactedStatusBlock)
        print("rejected redacted pairing payloads with manual-pairing message")

        print("validated pairing host rules")
    }

    private static func expectRedactedPairingError(_ text: String) throws {
        do {
            _ = try PairedDeviceStore().parse(text)
            throw FixtureValidationFailure.redactedPairingPayloadWasAccepted
        } catch PairingError.redactedPayload {
            guard PairingError.redactedPayload.localizedDescription.contains("npm run pair:manual") else {
                throw FixtureValidationFailure.redactedPairingPayloadHadWrongMessage
            }
        }
    }

    private static func validateUsageFreshness() throws {
        let now = Date(timeIntervalSince1970: 1_800_000_000)

        guard !UsageFreshness.isStale(
            snapshotUpdatedAt: now.addingTimeInterval(-60),
            providerCapturedAt: now.addingTimeInterval(-90),
            cacheSavedAt: now.addingTimeInterval(-30),
            now: now
        ) else {
            throw FixtureValidationFailure.freshUsageWasMarkedStale
        }

        guard UsageFreshness.isStale(
            snapshotUpdatedAt: now.addingTimeInterval(-60),
            providerCapturedAt: now.addingTimeInterval(-90),
            cacheSavedAt: now.addingTimeInterval(-4 * 60 * 60),
            now: now
        ) else {
            throw FixtureValidationFailure.oldUsageCacheWasAcceptedAsFresh
        }

        guard UsageFreshness.isStale(
            snapshotUpdatedAt: now,
            providerCapturedAt: now.addingTimeInterval(-4 * 60 * 60),
            cacheSavedAt: now,
            now: now
        ) else {
            throw FixtureValidationFailure.oldProviderCaptureWasAcceptedAsFresh
        }

        guard UsageFreshness.isLastKnownFallback(
            snapshotUpdatedAt: now,
            providerCapturedAt: now.addingTimeInterval(-10 * 60),
            cacheSource: "widget-lan",
            providerId: "claude"
        ) else {
            throw FixtureValidationFailure.laggedProviderCaptureWasNotMarkedLastKnown
        }

        print("validated usage freshness stale-meter policy")
    }

    private static func validateAppGroupIdentifierResolution() throws {
        guard AppGroup.resolveIdentifier(rawValue: nil) == AppGroupIdentifierResolution(
            identifier: AppGroup.fallbackIdentifier,
            source: .fallbackMissingInfoPlist
        ) else {
            throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
        }
        guard AppGroup.resolveIdentifier(rawValue: "$(APP_GROUP_IDENTIFIER)").source == .fallbackUnexpandedInfoPlist else {
            throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
        }
        guard AppGroup.resolveIdentifier(rawValue: "com.superzhangkai.not-a-group").source == .fallbackInvalidInfoPlist else {
            throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
        }
        guard AppGroup.resolveIdentifier(rawValue: " group.com.superzhangkai.aiusagewidget ") == AppGroupIdentifierResolution(
            identifier: "group.com.superzhangkai.aiusagewidget",
            source: .infoPlist
        ) else {
            throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
        }

        print("validated App Group identifier resolution")
    }

    private static func validateWidgetLANDiagnostic() throws {
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
        guard decoded.path == "/v1/snapshot",
              decoded.httpStatus == 200,
              decoded.attemptedHostCount == 1,
              decoded.approvalSync?.outcome == .savedRequest,
              decoded.approvalSync?.httpStatus == 200,
              decoded.approvalSync?.attemptedHostCount == 1 else {
            throw FixtureValidationFailure.widgetLANDiagnosticRoundTripFailed
        }

        let serialized = String(decoding: data, as: UTF8.self)
        guard !serialized.contains("192.168.1.7"),
              !serialized.contains("token"),
              !serialized.contains("Bearer"),
              !serialized.contains("Authorization") else {
            throw FixtureValidationFailure.widgetLANDiagnosticLeakedSensitiveText
        }

        let hostnameDiagnostic = WidgetLANDiagnostic.failure(
            "Could not connect to KaideMacBook-Pro.local after timeout",
            report: nil
        )
        let hostnameData = try JSONEncoder.aiUsageSnapshotEncoder.encode(hostnameDiagnostic)
        let hostnameDecoded = try JSONDecoder.aiUsageSnapshotDecoder.decode(
            WidgetLANDiagnostic.self,
            from: hostnameData
        )
        let hostnameSerialized = String(decoding: hostnameData, as: UTF8.self)
        guard hostnameDecoded.detail == "Widget LAN 诊断已脱敏",
              !hostnameSerialized.contains("KaideMacBook-Pro.local"),
              !hostnameSerialized.contains("MacBook"),
              !hostnameSerialized.contains(".local") else {
            throw FixtureValidationFailure.widgetLANDiagnosticLeakedSensitiveText
        }

        let approvalFailure = WidgetApprovalSyncDiagnostic.failure(
            "Could not connect to KaideMacBook-Pro.local with Bearer token",
            report: nil
        )
        let approvalFailureData = try JSONEncoder.aiUsageSnapshotEncoder.encode(approvalFailure)
        let approvalFailureDecoded = try JSONDecoder.aiUsageSnapshotDecoder.decode(
            WidgetApprovalSyncDiagnostic.self,
            from: approvalFailureData
        )
        guard approvalFailureDecoded.detail == "Widget LAN 诊断已脱敏",
              !String(decoding: approvalFailureData, as: UTF8.self).contains("KaideMacBook-Pro.local") else {
            throw FixtureValidationFailure.widgetLANDiagnosticLeakedSensitiveText
        }

        print("validated widget LAN diagnostic")
    }

    private static func validateApprovalStore() throws {
        let suiteName = "AIUsageWidgetApprovalValidation.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            throw FixtureValidationFailure.approvalDefaultsUnavailable
        }
        defaults.removePersistentDomain(forName: suiteName)
        defer {
            defaults.removePersistentDomain(forName: suiteName)
        }

        let now = Date(timeIntervalSince1970: 1_781_178_600)
        let store = ApprovalStore(defaults: defaults)
        let request = ApprovalRequest(
            schemaVersion: 1,
            id: "fixture-approval",
            source: "Mac 请求",
            title: "允许这一步继续？",
            createdAt: now,
            expiresAt: now.addingTimeInterval(900)
        )

        try store.savePendingRequest(request, now: now)
        guard store.loadPendingRequest(now: now) == request else {
            throw FixtureValidationFailure.approvalRequestRoundTripFailed
        }

        let decision = try store.recordDecision(
            requestId: request.id,
            action: .deny,
            decidedAt: now.addingTimeInterval(60)
        )
        guard store.loadPendingRequest(now: now.addingTimeInterval(60)) == nil,
              store.loadLastDecision() == decision else {
            throw FixtureValidationFailure.approvalDecisionRoundTripFailed
        }

        try store.savePendingRequest(request, now: now)
        do {
            _ = try store.recordDecision(
                requestId: request.id,
                action: .approve,
                decidedAt: now.addingTimeInterval(60),
                requiresLocalFixture: true
            )
            throw FixtureValidationFailure.macApprovalClearedAsLocalFixture
        } catch ApprovalStoreError.macRequestNeedsPairedMac {
            print("rejected local clearing for Mac-owned approval")
        }

        let localRequest = try store.seedFixtureRequest(now: now)
        guard localRequest.isLocalUIFixture,
              localRequest.id == "local-fixture-1781178600",
              localRequest.source == "本地测试" else {
            throw FixtureValidationFailure.localApprovalFixtureWasNotLabeled
        }
        _ = try store.recordDecision(
            requestId: localRequest.id,
            action: .deny,
            decidedAt: now.addingTimeInterval(60),
            requiresLocalFixture: true
        )

        do {
            _ = try ApprovalRequest(
                schemaVersion: 1,
                id: "fixture-unsafe",
                source: "Mac 请求",
                title: "Bearer secret-token raw log",
                createdAt: now,
                expiresAt: nil
            ).validated()
            throw FixtureValidationFailure.unsafeApprovalTextWasAccepted
        } catch ApprovalStoreError.unsafeText {
            print("rejected unsafe approval text")
        }

        for (source, title) in [
            ("http://192.168.1.7", "允许这一步继续？"),
            ("KaideMacBook-Pro.local", "允许这一步继续？"),
            ("localhost", "允许这一步继续？"),
            ("Mac 请求", "去 http://KaideMacBook-Pro.local 看")
        ] {
            do {
                _ = try ApprovalRequest(
                    schemaVersion: 1,
                    id: "fixture-unsafe-network",
                    source: source,
                    title: title,
                    createdAt: now,
                    expiresAt: nil
                ).validated()
                throw FixtureValidationFailure.unsafeApprovalTextWasAccepted
            } catch ApprovalStoreError.unsafeText {
                continue
            }
        }
        print("rejected network details in approval text")

        let expiredRequest = ApprovalRequest(
            schemaVersion: 1,
            id: "fixture-expiring",
            source: "Mac 请求",
            title: "允许这一步继续？",
            createdAt: now,
            expiresAt: now.addingTimeInterval(60)
        )
        try store.savePendingRequest(expiredRequest, now: now)
        guard store.loadPendingRequestForDiagnostics() == expiredRequest,
              store.loadPendingRequestForDiagnostics()?.isExpired(now: now.addingTimeInterval(61)) == true else {
            throw FixtureValidationFailure.approvalRequestRoundTripFailed
        }

        print("validated approval store")
    }

    private static func validateApprovalAttemptDiagnostic() throws {
        let suiteName = "AIUsageWidgetApprovalAttemptValidation.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            throw FixtureValidationFailure.approvalDefaultsUnavailable
        }
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
        let successDiagnostic = try ApprovalAttemptDiagnostic.success(
            result: .sentToMac(decision),
            origin: .widget,
            attemptedAt: now
        ).validated()

        try store.saveApprovalAttemptDiagnostic(successDiagnostic)
        guard store.loadLastAttemptDiagnostic() == successDiagnostic else {
            throw FixtureValidationFailure.approvalAttemptDiagnosticRoundTripFailed
        }

        do {
            _ = try ApprovalAttemptDiagnostic(
                schemaVersion: 1,
                attemptedAt: now,
                requestId: "fixture-approval",
                action: .approve,
                origin: .widget,
                outcome: .writeFailed,
                detail: "http://192.168.1.7 Bearer secret-token raw log",
                httpStatus: nil,
                attemptedHostCount: nil
            ).validated()
            throw FixtureValidationFailure.unsafeApprovalDiagnosticWasAccepted
        } catch ApprovalStoreError.unsafeText {
            print("rejected unsafe approval attempt diagnostic")
        }

        do {
            _ = try ApprovalAttemptDiagnostic(
                schemaVersion: 1,
                attemptedAt: now,
                requestId: "fixture-approval",
                action: .approve,
                origin: .widget,
                outcome: .writeFailed,
                detail: String(repeating: "x", count: 121),
                httpStatus: nil,
                attemptedHostCount: nil
            ).validated()
            throw FixtureValidationFailure.oversizedApprovalDiagnosticWasAccepted
        } catch ApprovalStoreError.invalidText(_) {
            print("rejected oversized approval attempt diagnostic")
        }

        let unsafeFailure = LocalHTTPFailure(
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
        let failureDiagnostic = try ApprovalAttemptDiagnostic.failure(
            requestId: "fixture-approval",
            action: .deny,
            origin: .widget,
            error: unsafeFailure,
            attemptedAt: now
        ).validated()
        guard failureDiagnostic.outcome == .rejectedByMac,
              failureDiagnostic.httpStatus == 401,
              failureDiagnostic.attemptedHostCount == 1 else {
            throw FixtureValidationFailure.approvalAttemptDiagnosticRoundTripFailed
        }

        let diagnosticText = String(
            decoding: try JSONEncoder.aiUsageSnapshotEncoder.encode(failureDiagnostic),
            as: UTF8.self
        )
        guard !diagnosticText.contains("192.168.1.7"),
              !diagnosticText.contains("Bearer"),
              !diagnosticText.contains("secret-token"),
              !diagnosticText.contains("raw URL marker") else {
            throw FixtureValidationFailure.approvalAttemptDiagnosticLeakedSensitiveText
        }

        let expiredDiagnostic = try ApprovalAttemptDiagnostic.failure(
            requestId: "fixture-approval",
            action: .approve,
            origin: .widget,
            error: ApprovalStoreError.expiredRequest,
            attemptedAt: now
        ).validated()
        guard expiredDiagnostic.outcome == .expiredRequest,
              expiredDiagnostic.detail == "请求过期了" else {
            throw FixtureValidationFailure.approvalAttemptDiagnosticRoundTripFailed
        }

        print("validated approval attempt diagnostic")
    }

    private static func validateApprovalDecisionHandler() async throws {
        let now = Date(timeIntervalSince1970: 1_781_178_600)
        let localRequest = ApprovalRequest(
            schemaVersion: 1,
            id: "local-fixture-1781178600",
            source: "本地测试",
            title: "允许这一步继续？",
            createdAt: now,
            expiresAt: now.addingTimeInterval(900)
        )
        let macRequest = ApprovalRequest(
            schemaVersion: 1,
            id: "fixture-approval",
            source: "Mac 请求",
            title: "允许这一步继续？",
            createdAt: now,
            expiresAt: now.addingTimeInterval(900)
        )
        let pairedDevice = try PairedDeviceStore().parse(pairingJSON(host: "192.168.1.7", token: "secret-token"))

        var localSubmitCalled = false
        let localHandler = ApprovalDecisionHandler(
            loadPendingRequest: { _ in localRequest },
            recordDecision: { requestId, action, decidedAt, requiresLocalFixture in
                guard requestId == localRequest.id,
                      action == .deny,
                      decidedAt == now,
                      requiresLocalFixture else {
                    throw FixtureValidationFailure.approvalDecisionHandlerFailed
                }
                return try ApprovalDecision(
                    schemaVersion: 1,
                    requestId: requestId,
                    action: action,
                    decidedAt: decidedAt
                ).validated()
            },
            loadPairedDevice: { nil },
            submitDecision: { _, _ in
                localSubmitCalled = true
            }
        )
        let localResult = try await localHandler.decide(
            requestId: localRequest.id,
            action: .deny,
            decidedAt: now
        )
        guard case .recordedLocal(let localDecision) = localResult,
              localDecision.requestId == localRequest.id,
              !localSubmitCalled else {
            throw FixtureValidationFailure.approvalDecisionHandlerFailed
        }

        var missingPairingSubmitted = false
        var missingPairingRecorded = false
        let missingPairingHandler = ApprovalDecisionHandler(
            loadPendingRequest: { _ in macRequest },
            recordDecision: { _, _, _, _ in
                missingPairingRecorded = true
                throw FixtureValidationFailure.approvalDecisionHandlerFailed
            },
            loadPairedDevice: { nil },
            submitDecision: { _, _ in
                missingPairingSubmitted = true
            }
        )
        do {
            _ = try await missingPairingHandler.decide(
                requestId: macRequest.id,
                action: .approve,
                decidedAt: now
            )
            throw FixtureValidationFailure.approvalDecisionHandlerFailed
        } catch ApprovalStoreError.macRequestNeedsPairedMac {
            guard !missingPairingSubmitted, !missingPairingRecorded else {
                throw FixtureValidationFailure.approvalDecisionHandlerFailed
            }
        }

        var submittedDecision: ApprovalDecision?
        var submittedPayload: PairingPayload?
        var recordedRequiresLocalFixture: Bool?
        let macHandler = ApprovalDecisionHandler(
            loadPendingRequest: { _ in macRequest },
            recordDecision: { requestId, action, decidedAt, requiresLocalFixture in
                recordedRequiresLocalFixture = requiresLocalFixture
                return try ApprovalDecision(
                    schemaVersion: 1,
                    requestId: requestId,
                    action: action,
                    decidedAt: decidedAt
                ).validated()
            },
            loadPairedDevice: { pairedDevice },
            submitDecision: { decision, payload in
                submittedDecision = decision
                submittedPayload = payload
            }
        )
        let macResult = try await macHandler.decide(
            requestId: macRequest.id,
            action: .approve,
            decidedAt: now
        )
        guard case .sentToMac(let macDecision) = macResult,
              macDecision.requestId == macRequest.id,
              macDecision.action == .approve,
              submittedDecision == macDecision,
              submittedPayload == pairedDevice,
              recordedRequiresLocalFixture == false else {
            throw FixtureValidationFailure.approvalDecisionHandlerFailed
        }

        print("validated approval decision handler")
    }

    private static func validateWidgetRefreshCoordinator() async throws {
        let pairedDevice = try PairedDeviceStore().parse(
            pairingJSON(host: "192.168.1.7", token: "secret-token")
        )
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
        let request = ApprovalRequest(
            schemaVersion: 1,
            id: "fixture-approval",
            source: "Mac 请求",
            title: "允许这一步继续？",
            createdAt: Date(timeIntervalSince1970: 1_781_178_600),
            expiresAt: nil
        )

        var proofModeSnapshotCalled = false
        var proofModeDiagnostics: [WidgetLANDiagnostic] = []
        let proofModeCoordinator = WidgetRefreshCoordinator(
            isProofModeEnabled: { true },
            loadPairedDevice: { pairedDevice },
            saveWidgetLANDiagnostic: { proofModeDiagnostics.append($0) },
            snapshotWithReport: { _ in
                proofModeSnapshotCalled = true
                throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
            },
            saveCachedSnapshot: { _, _ in },
            approvalRequestWithReport: { _ in
                throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
            },
            savePendingRequest: { _ in }
        )
        await proofModeCoordinator.refresh()
        guard proofModeDiagnostics.last?.outcome == .skipped,
              proofModeDiagnostics.last?.detail.contains("证明模式") == true,
              !proofModeSnapshotCalled else {
            throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
        }

        var missingPairingSnapshotCalled = false
        var missingPairingDiagnostics: [WidgetLANDiagnostic] = []
        let missingPairingCoordinator = WidgetRefreshCoordinator(
            isProofModeEnabled: { false },
            loadPairedDevice: { nil },
            saveWidgetLANDiagnostic: { missingPairingDiagnostics.append($0) },
            snapshotWithReport: { _ in
                missingPairingSnapshotCalled = true
                throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
            },
            saveCachedSnapshot: { _, _ in },
            approvalRequestWithReport: { _ in
                throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
            },
            savePendingRequest: { _ in }
        )
        await missingPairingCoordinator.refresh()
        guard missingPairingDiagnostics.last?.outcome == .skipped,
              missingPairingDiagnostics.last?.detail.contains("还没配 Mac") == true,
              !missingPairingSnapshotCalled else {
            throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
        }

        var savedSnapshot: AIUsageSnapshot?
        var savedSource: String?
        var savedRequest: ApprovalRequest?
        var successDiagnostics: [WidgetLANDiagnostic] = []
        let successCoordinator = WidgetRefreshCoordinator(
            isProofModeEnabled: { false },
            loadPairedDevice: { pairedDevice },
            saveWidgetLANDiagnostic: { successDiagnostics.append($0) },
            snapshotWithReport: { payload in
                guard payload == pairedDevice else {
                    throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
                }
                return LocalHTTPResult(value: PreviewSnapshots.normal, report: report)
            },
            saveCachedSnapshot: { snapshot, source in
                savedSnapshot = snapshot
                savedSource = source
            },
            approvalRequestWithReport: { payload in
                guard payload == pairedDevice else {
                    throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
                }
                return LocalHTTPResult(value: request, report: report)
            },
            savePendingRequest: { savedRequest = $0 }
        )
        await successCoordinator.refresh()
        guard savedSnapshot == PreviewSnapshots.normal,
              savedSource == "widget-lan",
              savedRequest == request,
              successDiagnostics.last?.outcome == .success,
              successDiagnostics.last?.path == "/v1/snapshot",
              successDiagnostics.last?.httpStatus == 200,
              successDiagnostics.last?.attemptedHostCount == 1,
              successDiagnostics.last?.approvalSync?.outcome == .savedRequest,
              successDiagnostics.last?.approvalSync?.attemptedHostCount == 1 else {
            throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
        }

        var nullApprovalSavedRequest = false
        var nullApprovalDiagnostics: [WidgetLANDiagnostic] = []
        let nullApprovalCoordinator = WidgetRefreshCoordinator(
            isProofModeEnabled: { false },
            loadPairedDevice: { pairedDevice },
            saveWidgetLANDiagnostic: { nullApprovalDiagnostics.append($0) },
            snapshotWithReport: { _ in LocalHTTPResult(value: PreviewSnapshots.normal, report: report) },
            saveCachedSnapshot: { _, _ in },
            approvalRequestWithReport: { _ in LocalHTTPResult(value: nil, report: report) },
            savePendingRequest: { _ in
                nullApprovalSavedRequest = true
            }
        )
        await nullApprovalCoordinator.refresh()
        guard !nullApprovalSavedRequest,
              nullApprovalDiagnostics.last?.approvalSync?.outcome == .noRequest else {
            throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
        }

        var slowApprovalSavedSnapshot: AIUsageSnapshot?
        var slowApprovalSavedRequest: ApprovalRequest?
        var slowApprovalDiagnostics: [WidgetLANDiagnostic] = []
        let slowApprovalStartedAt = Date()
        let slowApprovalCoordinator = WidgetRefreshCoordinator(
            isProofModeEnabled: { false },
            loadPairedDevice: { pairedDevice },
            saveWidgetLANDiagnostic: { slowApprovalDiagnostics.append($0) },
            snapshotWithReport: { _ in LocalHTTPResult(value: PreviewSnapshots.normal, report: report) },
            saveCachedSnapshot: { snapshot, _ in
                slowApprovalSavedSnapshot = snapshot
            },
            approvalRequestWithReport: { _ in
                try await Task.sleep(nanoseconds: 300_000_000)
                return LocalHTTPResult(value: request, report: report)
            },
            savePendingRequest: { slowApprovalSavedRequest = $0 },
            refreshBudget: 0.45,
            approvalSyncBudget: 0.05
        )
        await slowApprovalCoordinator.refresh()
        guard slowApprovalSavedSnapshot == PreviewSnapshots.normal,
              slowApprovalSavedRequest == nil,
              slowApprovalDiagnostics.last?.outcome == .success,
              slowApprovalDiagnostics.last?.approvalSync?.outcome == .timedOut,
              Date().timeIntervalSince(slowApprovalStartedAt) < 0.30 else {
            throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
        }

        var failureSavedSnapshot = false
        var failureSavedRequest: ApprovalRequest?
        var failureDiagnostics: [WidgetLANDiagnostic] = []
        let failureReport = LocalHTTPReport(
            path: "/v1/snapshot",
            attemptedAt: Date(timeIntervalSince1970: 1_781_178_660),
            attempts: [
                LocalHTTPAttempt(
                    host: "192.168.1.7",
                    path: "/v1/snapshot",
                    succeeded: false,
                    httpStatus: nil,
                    message: "同 Wi-Fi 下没摸到 Mac"
                )
            ],
            winningHost: nil
        )
        let failureCoordinator = WidgetRefreshCoordinator(
            isProofModeEnabled: { false },
            loadPairedDevice: { pairedDevice },
            saveWidgetLANDiagnostic: { failureDiagnostics.append($0) },
            snapshotWithReport: { _ in
                throw LocalHTTPFailure(report: failureReport, message: "同 Wi-Fi 下没摸到 Mac")
            },
            saveCachedSnapshot: { _, _ in
                failureSavedSnapshot = true
            },
            approvalRequestWithReport: { payload in
                guard payload == pairedDevice else {
                    throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
                }
                return LocalHTTPResult(value: request, report: report)
            },
            savePendingRequest: { failureSavedRequest = $0 }
        )
        await failureCoordinator.refresh()
        guard failureDiagnostics.last?.outcome == .failure,
              failureDiagnostics.last?.path == "/v1/snapshot",
              failureDiagnostics.last?.attemptedHostCount == 1,
              failureDiagnostics.last?.approvalSync?.outcome == .savedRequest,
              failureSavedRequest == request,
              !failureSavedSnapshot else {
            throw FixtureValidationFailure.widgetRefreshCoordinatorFailed
        }

        print("validated widget refresh coordinator")
    }

    private static func validateLocalHTTPRequests() async throws {
        MockURLProtocol.reset()
        MockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw FixtureValidationFailure.localHTTPMissingRequestURL
            }

            guard request.value(forHTTPHeaderField: "Authorization") == "Bearer secret-token" else {
                throw FixtureValidationFailure.localHTTPMissingAuthorizationHeader
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
        configuration.protocolClasses = [MockURLProtocol.self]
        let source = LocalHTTPSource(
            session: URLSession(configuration: configuration),
            requestTimeout: 1,
            maxHostAttempts: 3
        )

        let payload = try PairedDeviceStore().parse(pairingJSON(hosts: [
            "192.168.1.7",
            "192.168.1.8",
            "192.168.1.9",
            "192.168.1.10"
        ], token: "secret-token"))

        do {
            _ = try await source.snapshotWithReport(payload)
            throw FixtureValidationFailure.localHTTPUnauthorizedWasAccepted
        } catch let failure as LocalHTTPFailure {
            guard failure.report.attempts.count == 3,
                  failure.report.attempts.map(\.host) == ["192.168.1.7", "192.168.1.8", "192.168.1.9"],
                  failure.report.attempts.allSatisfy({ $0.httpStatus == 401 && $0.succeeded == false }),
                  MockURLProtocol.requests.count == 3,
                  MockURLProtocol.requests.allSatisfy({ $0.value(forHTTPHeaderField: "Authorization") == "Bearer secret-token" }) else {
                throw FixtureValidationFailure.localHTTPHostCapFailed
            }

            let serialized = try JSONEncoder.aiUsageSnapshotEncoder.encode(failure.report)
            let reportText = String(decoding: serialized, as: UTF8.self)
            let diagnostic = WidgetLANDiagnostic.failure(failure.message, report: failure.report)
            let diagnosticText = String(
                decoding: try JSONEncoder.aiUsageSnapshotEncoder.encode(diagnostic),
                as: UTF8.self
            )
            let combinedText = "\(failure.message)\n\(reportText)\n\(diagnosticText)"
            guard !diagnosticText.contains("192.168.1.7"),
                  !diagnosticText.contains("192.168.1.8"),
                  !diagnosticText.contains("192.168.1.9") else {
                throw FixtureValidationFailure.widgetLANDiagnosticLeakedSensitiveText
            }
            guard !combinedText.contains("secret-token"),
                  !combinedText.contains("Bearer"),
                  !combinedText.contains("Authorization"),
                  !combinedText.contains("apiToken"),
                  !combinedText.contains("response body marker") else {
                throw FixtureValidationFailure.localHTTPDiagnosticLeakedSensitiveText
            }
        }

        MockURLProtocol.reset()
        MockURLProtocol.handler = { _ in
            throw NSError(
                domain: NSURLErrorDomain,
                code: URLError.timedOut.rawValue,
                userInfo: [
                    NSLocalizedDescriptionKey: "Bearer secret-token apiToken raw URL marker"
                ]
            )
        }

        do {
            _ = try await source.pingWithReport(payload)
            throw FixtureValidationFailure.localHTTPTransportErrorWasAccepted
        } catch let failure as LocalHTTPFailure {
            guard failure.message == "Mac 摸太久没回",
                  failure.report.attempts.first?.message == "Mac 摸太久没回" else {
                throw FixtureValidationFailure.localHTTPTransportErrorWasNotSanitized
            }

            let reportText = String(
                decoding: try JSONEncoder.aiUsageSnapshotEncoder.encode(failure.report),
                as: UTF8.self
            )
            let combinedText = "\(failure.message)\n\(reportText)"
            guard !combinedText.contains("secret-token"),
                  !combinedText.contains("Bearer"),
                  !combinedText.contains("apiToken"),
                  !combinedText.contains("raw URL marker") else {
                throw FixtureValidationFailure.localHTTPDiagnosticLeakedSensitiveText
            }
        }

        MockURLProtocol.reset()
        MockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw FixtureValidationFailure.localHTTPMissingRequestURL
            }

            return (HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!, Data(#"{"ok":false,"deviceId":"mac-test","name":"Kai's Mac"}"#.utf8))
        }

        do {
            _ = try await source.pingWithReport(payload)
            throw FixtureValidationFailure.localHTTPPingOkFalseWasAccepted
        } catch let failure as LocalHTTPFailure {
            guard failure.message == "Mac 回包解不开",
                  failure.report.winningHost == "192.168.1.7",
                  failure.report.attempts.first?.succeeded == true,
                  failure.report.attempts.first?.httpStatus == 200 else {
                throw FixtureValidationFailure.localHTTPPingOkFalseWasAccepted
            }
        }
        print("rejected unhealthy ping response")

        MockURLProtocol.reset()
        MockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw FixtureValidationFailure.localHTTPMissingRequestURL
            }

            return (HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!, Data(#"{"ok":true,"deviceId":"mac-test","name":"http://192.168.1.7 Bearer secret-token"}"#.utf8))
        }

        do {
            _ = try await source.pingWithReport(payload)
            throw FixtureValidationFailure.localHTTPUnsafePingNameWasAccepted
        } catch let failure as LocalHTTPFailure {
            let reportText = String(
                decoding: try JSONEncoder.aiUsageSnapshotEncoder.encode(failure.report),
                as: UTF8.self
            )
            let combinedText = "\(failure.message)\n\(reportText)"
            guard failure.message == "Mac 回包解不开",
                  !combinedText.contains("secret-token"),
                  !combinedText.contains("Bearer"),
                  !combinedText.contains("http://") else {
                throw FixtureValidationFailure.localHTTPUnsafePingNameWasAccepted
            }
        }
        print("rejected unsafe ping name")

        MockURLProtocol.reset()
        MockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw FixtureValidationFailure.localHTTPMissingRequestURL
            }

            return (HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!, Data(#"{"ok":true,"deviceId":"other-mac","name":"Wrong Mac"}"#.utf8))
        }

        do {
            _ = try await source.pingWithReport(payload)
            throw FixtureValidationFailure.localHTTPMismatchedDeviceWasAccepted
        } catch let failure as LocalHTTPFailure {
            guard failure.message == "配对 Mac 身份对不上",
                  failure.report.winningHost == "192.168.1.7",
                  failure.report.attempts.first?.succeeded == true,
                  failure.report.attempts.first?.httpStatus == 200 else {
                throw FixtureValidationFailure.localHTTPMismatchedDeviceWasAccepted
            }
        }

        MockURLProtocol.reset()
        MockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw FixtureValidationFailure.localHTTPMissingRequestURL
            }

            return (HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!, Data(snapshotJSON(deviceId: "other-mac").utf8))
        }

        do {
            _ = try await source.snapshotWithReport(payload)
            throw FixtureValidationFailure.localHTTPMismatchedDeviceWasAccepted
        } catch let failure as LocalHTTPFailure {
            guard failure.message == "配对 Mac 身份对不上",
                  failure.report.winningHost == "192.168.1.7",
                  failure.report.attempts.first?.succeeded == true,
                  failure.report.attempts.first?.httpStatus == 200 else {
                throw FixtureValidationFailure.localHTTPMismatchedDeviceWasAccepted
            }
        }
        print("rejected mismatched Mac identity")

        MockURLProtocol.reset()
        MockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw FixtureValidationFailure.localHTTPMissingRequestURL
            }

            return (HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!, Data(#"{"ok":true,"deviceId":"mac-test","name":"Kai's Mac"}"#.utf8))
        }

        let success = try await source.pingWithReport(payload)
        guard success.value == "Kai's Mac",
              success.report.winningHost == "192.168.1.7",
              success.report.attempts.count == 1,
              success.report.attempts.first?.httpStatus == 200 else {
            throw FixtureValidationFailure.localHTTPSuccessReportFailed
        }

        MockURLProtocol.reset()
        MockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw FixtureValidationFailure.localHTTPMissingRequestURL
            }
            guard request.httpMethod == "POST",
                  url.path == "/v1/approval-decisions",
                  request.value(forHTTPHeaderField: "Authorization") == "Bearer secret-token",
                  request.value(forHTTPHeaderField: "Content-Type") == "application/json",
                  let body = requestBodyData(request),
                  let object = try JSONSerialization.jsonObject(with: body) as? [String: Any],
                  object["schemaVersion"] as? Int == 1,
                  object["requestId"] as? String == "fixture-approval",
                  object["action"] as? String == "approve",
                  object["decidedAt"] == nil,
                  object["message"] == nil,
                  object["prompt"] == nil,
                  object["comment"] == nil else {
                throw FixtureValidationFailure.localHTTPApprovalPostFailed
            }

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
              "action": "approve",
              "decidedAt": "2026-06-11T00:00:00Z"
            }
            """.utf8))
        }

        let decision = ApprovalDecision(
            schemaVersion: 1,
            requestId: "fixture-approval",
            action: .approve,
            decidedAt: Date(timeIntervalSince1970: 1_781_178_600)
        )
        let approvalResult = try await source.submitApprovalDecisionWithReport(decision, payload: payload)
        guard approvalResult.value.ok,
              approvalResult.value.requestId == "fixture-approval",
              approvalResult.value.action == .approve,
              approvalResult.report.winningHost == "192.168.1.7" else {
            throw FixtureValidationFailure.localHTTPApprovalPostFailed
        }

        for response in [
            #"{"ok":true,"schemaVersion":1,"requestId":"wrong-request","action":"approve","decidedAt":"2026-06-11T00:00:00Z"}"#,
            #"{"ok":true,"schemaVersion":1,"requestId":"fixture-approval","action":"deny","decidedAt":"2026-06-11T00:00:00Z"}"#,
            #"{"ok":false,"schemaVersion":1,"requestId":"fixture-approval","action":"approve","decidedAt":"2026-06-11T00:00:00Z"}"#
        ] {
            MockURLProtocol.reset()
            MockURLProtocol.handler = { request in
                guard let url = request.url else {
                    throw FixtureValidationFailure.localHTTPMissingRequestURL
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
                throw FixtureValidationFailure.localHTTPApprovalPostFailed
            } catch let failure as LocalHTTPFailure {
                guard failure.message == "Mac 没收这票" else {
                    throw FixtureValidationFailure.localHTTPApprovalPostFailed
                }
            }
        }

        MockURLProtocol.reset()
        MockURLProtocol.handler = { request in
            guard let url = request.url else {
                throw FixtureValidationFailure.localHTTPMissingRequestURL
            }
            guard request.httpMethod == "GET",
                  url.path == "/v1/approval-request",
                  request.value(forHTTPHeaderField: "Authorization") == "Bearer secret-token",
                  request.value(forHTTPHeaderField: "Content-Type") == nil,
                  requestBodyData(request) == nil else {
                throw FixtureValidationFailure.localHTTPApprovalRequestFetchFailed
            }

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

        let requestResult = try await source.approvalRequestWithReport(payload)
        guard requestResult.value?.id == "fixture-approval",
              requestResult.value?.source == "Mac 请求",
              requestResult.value?.title == "允许这一步继续？",
              requestResult.report.winningHost == "192.168.1.7" else {
            throw FixtureValidationFailure.localHTTPApprovalRequestFetchFailed
        }

        print("validated local HTTP request behavior")
    }

    private static func pairingJSON(host: String, name: String = "Test Mac", token: String = "test-token") -> String {
        pairingJSON(hosts: [host], name: name, token: token)
    }

    private static func pairingJSON(hosts: [String], name: String = "Test Mac", token: String = "test-token") -> String {
        let hostJSON = hosts.map { "\"\($0)\"" }.joined(separator: ", ")
        return """
        {
          "v": 1,
          "deviceId": "mac-test",
          "name": "\(name)",
          "hosts": [\(hostJSON)],
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

enum FixtureValidationFailure: Error {
    case unsafeSnapshotWasAccepted
    case unsafeSnapshotValueWasAccepted
    case invalidPlatformWasAccepted
    case oversizedContractStringWasAccepted
    case futureProviderWasAccepted
    case futureUsageSourceWasAccepted(String)
    case invalidProviderSetWasAccepted
    case unavailableMeterFieldsWereAccepted
    case availableReasonWasAccepted
    case userFixtureHadFakeMeter(String)
    case embeddedPreviewFixtureDrift(String)
    case widgetRefreshDeepLinkFailed
    case widgetTapProofTextFailed
    case localNetworkProofHintFailed
    case invalidHostWasAccepted(String)
    case tooManyHostsWasAccepted
    case unknownPairingFieldWasAccepted
    case unknownPairingFieldLeakedText
    case unsafePairingNameWasAccepted
    case invalidTokenWasAccepted
    case oversizedPairingTokenWasAccepted
    case oversizedPairingPasteWasAccepted
    case manualTerminalBlockWasRejected
    case pairingDefaultsUnavailable
    case persistedPairingWasRejected
    case invalidPersistedPairingWasAccepted
    case pairingDisplaySummaryLeakedHost
    case redactedPairingPayloadWasAccepted
    case redactedPairingPayloadHadWrongMessage
    case freshUsageWasMarkedStale
    case oldUsageCacheWasAcceptedAsFresh
    case oldProviderCaptureWasAcceptedAsFresh
    case laggedProviderCaptureWasNotMarkedLastKnown
    case widgetLANDiagnosticRoundTripFailed
    case widgetLANDiagnosticLeakedSensitiveText
    case approvalDefaultsUnavailable
    case approvalRequestRoundTripFailed
    case approvalDecisionRoundTripFailed
    case macApprovalClearedAsLocalFixture
    case localApprovalFixtureWasNotLabeled
    case unsafeApprovalTextWasAccepted
    case approvalAttemptDiagnosticRoundTripFailed
    case unsafeApprovalDiagnosticWasAccepted
    case oversizedApprovalDiagnosticWasAccepted
    case approvalAttemptDiagnosticLeakedSensitiveText
    case approvalDecisionHandlerFailed
    case widgetRefreshCoordinatorFailed
    case localHTTPMissingRequestURL
    case localHTTPMissingAuthorizationHeader
    case localHTTPUnauthorizedWasAccepted
    case localHTTPTransportErrorWasAccepted
    case localHTTPTransportErrorWasNotSanitized
    case localHTTPPingOkFalseWasAccepted
    case localHTTPUnsafePingNameWasAccepted
    case localHTTPMismatchedDeviceWasAccepted
    case localHTTPHostCapFailed
    case localHTTPDiagnosticLeakedSensitiveText
    case localHTTPSuccessReportFailed
    case localHTTPApprovalPostFailed
    case localHTTPApprovalRequestFetchFailed
}

private final class MockURLProtocol: URLProtocol {
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
            client?.urlProtocol(self, didFailWithError: FixtureValidationFailure.localHTTPMissingRequestURL)
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
