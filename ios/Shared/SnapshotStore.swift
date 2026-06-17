import Foundation

enum AppGroupIdentifierSource: String, Equatable {
    case infoPlist
    case fallbackMissingInfoPlist
    case fallbackUnexpandedInfoPlist
    case fallbackInvalidInfoPlist

    var usesFallback: Bool {
        self != .infoPlist
    }

    var displayName: String {
        switch self {
        case .infoPlist:
            return "来源：Info.plist 已展开"
        case .fallbackMissingInfoPlist:
            return "来源：Fallback，Info.plist 没给值"
        case .fallbackUnexpandedInfoPlist:
            return "来源：Fallback，Info.plist 未展开"
        case .fallbackInvalidInfoPlist:
            return "来源：Fallback，Info.plist 值不对"
        }
    }
}

struct AppGroupIdentifierResolution: Equatable {
    let identifier: String
    let source: AppGroupIdentifierSource
}

enum AppGroup {
    static let fallbackIdentifier = "group.com.superzhangkai.aiusagewidget"
    static let proofKey = "aiuw.appGroupProof"
    static let proofModeKey = "aiuw.appGroupProofMode"
    static let cachedSnapshotKey = "aiuw.cachedSnapshot"
    static let cachedSnapshotSavedAtKey = "aiuw.cachedSnapshotSavedAt"
    static let cachedSnapshotSourceKey = "aiuw.cachedSnapshotSource"
    static let widgetLanDiagnosticKey = "aiuw.widgetLanDiagnostic"
    static let widgetRefreshStartedAtKey = "aiuw.widgetRefreshStartedAt"
    static let widgetRefreshCompletedAtKey = "aiuw.widgetRefreshCompletedAt"
    static let appLanguageOptionKey = AppLanguageOption.storageKey
    static let usageProviderModeKey = "usageProviderMode"
    static let widgetProviderOrderKey = "aiuw.widgetProviderOrder"
    static let approvalRequestKey = "aiuw.approvalRequest"
    static let approvalDecisionKey = "aiuw.approvalDecision"
    static let approvalAttemptDiagnosticKey = "aiuw.approvalAttemptDiagnostic"

    static func resolveIdentifier(rawValue: Any?) -> AppGroupIdentifierResolution {
        guard let rawIdentifier = rawValue as? String else {
            return AppGroupIdentifierResolution(
                identifier: fallbackIdentifier,
                source: .fallbackMissingInfoPlist
            )
        }

        let trimmed = rawIdentifier.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return AppGroupIdentifierResolution(
                identifier: fallbackIdentifier,
                source: .fallbackMissingInfoPlist
            )
        }
        guard !trimmed.contains("$(") else {
            return AppGroupIdentifierResolution(
                identifier: fallbackIdentifier,
                source: .fallbackUnexpandedInfoPlist
            )
        }
        guard trimmed.hasPrefix("group.") else {
            return AppGroupIdentifierResolution(
                identifier: fallbackIdentifier,
                source: .fallbackInvalidInfoPlist
            )
        }

        return AppGroupIdentifierResolution(identifier: trimmed, source: .infoPlist)
    }

    static var resolution: AppGroupIdentifierResolution {
        resolveIdentifier(rawValue: Bundle.main.object(forInfoDictionaryKey: "AIUsageAppGroupIdentifier"))
    }

    static var identifier: String {
        resolution.identifier
    }

    static var identifierSource: AppGroupIdentifierSource {
        resolution.source
    }

    static var defaults: UserDefaults? {
        let resolved = resolution
        guard !resolved.source.usesFallback else {
            return nil
        }
        return UserDefaults(suiteName: resolved.identifier)
    }

    static var isAvailable: Bool {
        defaults != nil
    }

    static var statusText: String {
        isAvailable ? "App Group 可用: \(identifier)" : "App Group 不可用: \(identifier)"
    }

    static var statusDetailText: String {
        identifierSource.displayName
    }
}

struct CachedSnapshotRecord {
    let snapshot: AIUsageSnapshot
    let savedAt: Date?
    let source: String?
}

private enum WidgetDiagnosticSafety {
    static func safeDetail(_ detail: String) -> String {
        let truncated = String(detail.prefix(120))
        let forbiddenPatterns = [
            #"(?i)https?://"#,
            #"(?i)\b(?:api[_-]?token|authorization|bearer|cookie|secret|credential|keychain|transcript|prompt|message|raw\s+(?:stdout|stderr|log|output)|provider\s+output)\b"#,
            #"\b(?:\d{1,3}\.){3}\d{1,3}\b"#,
            #"(?i)\b(?:localhost|[a-z0-9][a-z0-9-]{0,62}(?:\.[a-z0-9][a-z0-9-]{0,62})+)\b"#
        ]
        for pattern in forbiddenPatterns where truncated.range(of: pattern, options: .regularExpression) != nil {
            return "Widget LAN 诊断已脱敏"
        }
        return truncated
    }
}

struct WidgetApprovalSyncDiagnostic: Codable, Equatable {
    enum Outcome: String, Codable {
        case savedRequest
        case noRequest
        case failure
        case timedOut
    }

    let outcome: Outcome
    let detail: String
    let httpStatus: Int?
    let attemptedHostCount: Int?

    static func savedRequest(report: LocalHTTPReport) -> WidgetApprovalSyncDiagnostic {
        WidgetApprovalSyncDiagnostic(
            outcome: .savedRequest,
            detail: "审批请求摸到了",
            httpStatus: report.attempts.first(where: \.succeeded)?.httpStatus,
            attemptedHostCount: report.attempts.count
        )
    }

    static func noRequest(report: LocalHTTPReport) -> WidgetApprovalSyncDiagnostic {
        WidgetApprovalSyncDiagnostic(
            outcome: .noRequest,
            detail: "Mac 没递新活",
            httpStatus: report.attempts.first(where: \.succeeded)?.httpStatus,
            attemptedHostCount: report.attempts.count
        )
    }

    static func failure(_ detail: String, report: LocalHTTPReport?) -> WidgetApprovalSyncDiagnostic {
        WidgetApprovalSyncDiagnostic(
            outcome: .failure,
            detail: WidgetDiagnosticSafety.safeDetail(detail),
            httpStatus: report?.attempts.reversed().first { $0.httpStatus != nil }?.httpStatus,
            attemptedHostCount: report?.attempts.count
        )
    }

    static func timedOut() -> WidgetApprovalSyncDiagnostic {
        WidgetApprovalSyncDiagnostic(
            outcome: .timedOut,
            detail: "审批同步超时",
            httpStatus: nil,
            attemptedHostCount: nil
        )
    }
}

struct WidgetLANDiagnostic: Codable, Equatable {
    enum Outcome: String, Codable {
        case success
        case failure
        case skipped
    }

    let attemptedAt: Date
    let outcome: Outcome
    let detail: String
    let path: String?
    let httpStatus: Int?
    let attemptedHostCount: Int?
    let approvalSync: WidgetApprovalSyncDiagnostic?

    static func success(report: LocalHTTPReport, approvalSync: WidgetApprovalSyncDiagnostic? = nil) -> WidgetLANDiagnostic {
        WidgetLANDiagnostic(
            attemptedAt: Date(),
            outcome: .success,
            detail: "Widget 摸到了 Mac",
            path: report.path,
            httpStatus: report.attempts.first(where: \.succeeded)?.httpStatus,
            attemptedHostCount: report.attempts.count,
            approvalSync: approvalSync
        )
    }

    static func failure(
        _ detail: String,
        report: LocalHTTPReport?,
        approvalSync: WidgetApprovalSyncDiagnostic? = nil
    ) -> WidgetLANDiagnostic {
        WidgetLANDiagnostic(
            attemptedAt: Date(),
            outcome: .failure,
            detail: WidgetDiagnosticSafety.safeDetail(detail),
            path: report?.path,
            httpStatus: report?.attempts.reversed().first { $0.httpStatus != nil }?.httpStatus,
            attemptedHostCount: report?.attempts.count,
            approvalSync: approvalSync
        )
    }

    static func skipped(_ detail: String) -> WidgetLANDiagnostic {
        WidgetLANDiagnostic(
            attemptedAt: Date(),
            outcome: .skipped,
            detail: WidgetDiagnosticSafety.safeDetail(detail),
            path: nil,
            httpStatus: nil,
            attemptedHostCount: nil,
            approvalSync: nil
        )
    }
}

enum SnapshotStoreError: LocalizedError {
    case appGroupUnavailable(String)
    case appGroupWriteFailed(String)

    var errorDescription: String? {
        switch self {
        case .appGroupUnavailable(let identifier):
            return "App Group 不可用: \(identifier)"
        case .appGroupWriteFailed(let key):
            return "App Group 写入失败: \(key)"
        }
    }
}

struct SnapshotStore {
    private let defaults: UserDefaults?

    init(defaults: UserDefaults? = AppGroup.defaults) {
        self.defaults = defaults
    }

    func loadCachedSnapshotRecord() -> CachedSnapshotRecord? {
        guard let snapshot = loadCachedSnapshot() else {
            return nil
        }

        return CachedSnapshotRecord(
            snapshot: snapshot,
            savedAt: defaults?.object(forKey: AppGroup.cachedSnapshotSavedAtKey) as? Date,
            source: defaults?.string(forKey: AppGroup.cachedSnapshotSourceKey)
        )
    }

    func loadCachedSnapshot() -> AIUsageSnapshot? {
        guard let data = defaults?.data(forKey: AppGroup.cachedSnapshotKey) else {
            return nil
        }

        return try? AIUsageSnapshot.decodeValidated(from: data)
    }

    func saveCachedSnapshot(_ snapshot: AIUsageSnapshot, source: String = "cache") throws {
        let preserved = Self.snapshotPreservingLastKnownUsage(
            snapshot,
            previous: loadCachedSnapshot()
        )
        let data = try JSONEncoder.aiUsageSnapshotEncoder.encode(preserved.snapshot.validated())
        guard let defaults else {
            throw SnapshotStoreError.appGroupUnavailable(AppGroup.identifier)
        }
        defaults.set(data, forKey: AppGroup.cachedSnapshotKey)
        defaults.set(Date(), forKey: AppGroup.cachedSnapshotSavedAtKey)
        defaults.set(preserved.lastKnownProviderIds.isEmpty
            ? source
            : "\(source)+last-known:\(preserved.lastKnownProviderIds.joined(separator: ","))",
            forKey: AppGroup.cachedSnapshotSourceKey
        )
    }

    private static func snapshotPreservingLastKnownUsage(
        _ snapshot: AIUsageSnapshot,
        previous: AIUsageSnapshot?
    ) -> (snapshot: AIUsageSnapshot, lastKnownProviderIds: [String]) {
        guard let previous else {
            return (snapshot, [])
        }

        var lastKnownProviderIds: [String] = []
        let providers = snapshot.providers.map { provider in
            guard shouldPreserveLastKnownUsage(for: provider),
                  let previousProvider = previous.providers.first(where: { $0.id == provider.id }),
                  previousProvider.usage.available,
                  previousProvider.capturedAt != nil else {
                return provider
            }

            lastKnownProviderIds.append(provider.id)
            return AIUsageSnapshot.Provider(
                id: provider.id,
                displayName: provider.displayName,
                connected: provider.connected,
                health: provider.health,
                version: provider.version ?? previousProvider.version,
                capturedAt: previousProvider.capturedAt,
                usage: previousProvider.usage,
                error: provider.error
            )
        }

        return (
            AIUsageSnapshot(
                schemaVersion: snapshot.schemaVersion,
                device: snapshot.device,
                providers: providers
            ),
            lastKnownProviderIds
        )
    }

    private static func shouldPreserveLastKnownUsage(for provider: AIUsageSnapshot.Provider) -> Bool {
        guard provider.connected, !provider.usage.available else {
            return false
        }

        switch provider.usage.reason {
        case .noStableSource, .collectorError:
            return true
        case .notLoggedIn, .thirdPartyNoQuota, .none:
            return false
        }
    }

    func clearCachedSnapshot() {
        defaults?.removeObject(forKey: AppGroup.cachedSnapshotKey)
        defaults?.removeObject(forKey: AppGroup.cachedSnapshotSavedAtKey)
        defaults?.removeObject(forKey: AppGroup.cachedSnapshotSourceKey)
    }

    func loadWidgetLANDiagnostic() -> WidgetLANDiagnostic? {
        guard let data = defaults?.data(forKey: AppGroup.widgetLanDiagnosticKey) else {
            return nil
        }

        return try? JSONDecoder.aiUsageSnapshotDecoder.decode(WidgetLANDiagnostic.self, from: data)
    }

    func saveWidgetLANDiagnostic(_ diagnostic: WidgetLANDiagnostic) {
        guard let data = try? JSONEncoder.aiUsageSnapshotEncoder.encode(diagnostic) else {
            return
        }

        defaults?.set(data, forKey: AppGroup.widgetLanDiagnosticKey)
    }

    func clearWidgetLANDiagnostic() {
        defaults?.removeObject(forKey: AppGroup.widgetLanDiagnosticKey)
    }

    func markWidgetRefreshStarted(at date: Date = Date()) {
        defaults?.set(date, forKey: AppGroup.widgetRefreshStartedAtKey)
        defaults?.removeObject(forKey: AppGroup.widgetRefreshCompletedAtKey)
    }

    func clearWidgetRefreshStarted() {
        defaults?.removeObject(forKey: AppGroup.widgetRefreshStartedAtKey)
    }

    func markWidgetRefreshCompleted(at date: Date = Date()) {
        defaults?.set(date, forKey: AppGroup.widgetRefreshCompletedAtKey)
    }

    func clearWidgetRefreshCompleted() {
        defaults?.removeObject(forKey: AppGroup.widgetRefreshCompletedAtKey)
    }

    func isWidgetRefreshInProgress(now: Date = Date()) -> Bool {
        guard let startedAt = defaults?.object(forKey: AppGroup.widgetRefreshStartedAtKey) as? Date else {
            return false
        }

        if now.timeIntervalSince(startedAt) > 12 {
            clearWidgetRefreshStarted()
            return false
        }

        return true
    }

    func isWidgetRefreshJustCompleted(now: Date = Date()) -> Bool {
        guard let completedAt = defaults?.object(forKey: AppGroup.widgetRefreshCompletedAtKey) as? Date else {
            return false
        }

        if now.timeIntervalSince(completedAt) > 8 {
            clearWidgetRefreshCompleted()
            return false
        }

        return true
    }

    func loadAppLanguage() -> AppLanguageOption {
        guard let rawValue = defaults?.string(forKey: AppGroup.appLanguageOptionKey),
              let option = AppLanguageOption(rawValue: rawValue) else {
            return .systemPreferredOption()
        }
        return option
    }

    func saveAppLanguage(_ option: AppLanguageOption) {
        defaults?.set(option.rawValue, forKey: AppGroup.appLanguageOptionKey)
    }

    func loadUsageProviderModeRaw() -> String? {
        defaults?.string(forKey: AppGroup.usageProviderModeKey)
    }

    func saveUsageProviderModeRaw(_ rawValue: String) {
        defaults?.set(rawValue, forKey: AppGroup.usageProviderModeKey)
    }

    func loadWidgetProviderOrderRaw() -> String? {
        defaults?.string(forKey: AppGroup.widgetProviderOrderKey)
    }

    func saveWidgetProviderOrderRaw(_ rawValue: String) {
        defaults?.set(rawValue, forKey: AppGroup.widgetProviderOrderKey)
    }

    func writeAppGroupProof(_ value: String) throws {
        guard let defaults else {
            throw SnapshotStoreError.appGroupUnavailable(AppGroup.identifier)
        }
        defaults.set(value, forKey: AppGroup.proofKey)
        defaults.set(true, forKey: AppGroup.proofModeKey)
        guard defaults.string(forKey: AppGroup.proofKey) == value,
              defaults.bool(forKey: AppGroup.proofModeKey) else {
            throw SnapshotStoreError.appGroupWriteFailed(AppGroup.proofKey)
        }
    }

    func readAppGroupProof() -> String {
        guard defaults != nil else {
            return "App Group 不可用"
        }

        return defaults?.string(forKey: AppGroup.proofKey) ?? "未读到 App Group"
    }

    func isProofModeEnabled() -> Bool {
        defaults?.bool(forKey: AppGroup.proofModeKey) ?? false
    }

    func disableProofMode() throws {
        guard let defaults else {
            throw SnapshotStoreError.appGroupUnavailable(AppGroup.identifier)
        }
        defaults.set(false, forKey: AppGroup.proofModeKey)
        guard defaults.bool(forKey: AppGroup.proofModeKey) == false else {
            throw SnapshotStoreError.appGroupWriteFailed(AppGroup.proofModeKey)
        }
    }
}
