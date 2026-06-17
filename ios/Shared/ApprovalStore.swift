import Foundation

struct ApprovalRequest: Codable, Equatable, Identifiable {
    let schemaVersion: Int
    let id: String
    let source: String
    let title: String
    let createdAt: Date
    let expiresAt: Date?

    func validated() throws -> ApprovalRequest {
        guard schemaVersion == 1 else {
            throw ApprovalStoreError.unsupportedSchema
        }
        try ApprovalSafety.validateIdentifier(id)
        try ApprovalSafety.validateBoundedText(source, label: "source", max: 40)
        try ApprovalSafety.validateBoundedText(title, label: "title", max: 60)
        return self
    }

    func isExpired(now: Date = Date()) -> Bool {
        guard let expiresAt else {
            return false
        }
        return expiresAt <= now
    }

    var isLocalUIFixture: Bool {
        id.hasPrefix("local-fixture-") && source == "本地测试"
    }
}

struct ApprovalDecision: Codable, Equatable {
    enum Action: String, Codable, Equatable {
        case approve
        case deny

        var displayName: String {
            switch self {
            case .approve:
                return "已放行"
            case .deny:
                return "已驳回"
            }
        }
    }

    let schemaVersion: Int
    let requestId: String
    let action: Action
    let decidedAt: Date

    func validated() throws -> ApprovalDecision {
        guard schemaVersion == 1 else {
            throw ApprovalStoreError.unsupportedSchema
        }
        try ApprovalSafety.validateIdentifier(requestId)
        return self
    }
}

struct ApprovalDecisionSubmission: Codable, Equatable {
    let schemaVersion: Int
    let requestId: String
    let action: ApprovalDecision.Action

    init(decision: ApprovalDecision) throws {
        let validated = try decision.validated()
        schemaVersion = 1
        requestId = validated.requestId
        action = validated.action
    }
}

struct ApprovalAttemptDiagnostic: Codable, Equatable {
    enum Origin: String, Codable, Equatable {
        case app
        case widget
    }

    enum Outcome: String, Codable, Equatable {
        case sentToMac
        case recordedLocalFixture
        case missingPendingRequest
        case missingPairing
        case expiredRequest
        case rejectedByMac
        case transportFailure
        case writeFailed
        case invalidAction
    }

    let schemaVersion: Int
    let attemptedAt: Date
    let requestId: String
    let action: ApprovalDecision.Action?
    let origin: Origin
    let outcome: Outcome
    let detail: String
    let httpStatus: Int?
    let attemptedHostCount: Int?

    func validated() throws -> ApprovalAttemptDiagnostic {
        guard schemaVersion == 1 else {
            throw ApprovalStoreError.unsupportedSchema
        }
        try ApprovalSafety.validateIdentifier(requestId)
        try ApprovalSafety.validateDiagnosticDetail(detail, label: "approvalAttempt.detail", max: 120)
        if outcome == .invalidAction {
            guard action == nil else {
                throw ApprovalStoreError.invalidText("approvalAttempt.action")
            }
        } else if action == nil {
            throw ApprovalStoreError.invalidText("approvalAttempt.action")
        }
        if let httpStatus, !(100...599).contains(httpStatus) {
            throw ApprovalStoreError.invalidText("approvalAttempt.httpStatus")
        }
        if let attemptedHostCount, !(0...PairedDeviceStore.maxHosts).contains(attemptedHostCount) {
            throw ApprovalStoreError.invalidText("approvalAttempt.hostCount")
        }
        return self
    }

    static func invalidAction(requestId: String, origin: Origin, attemptedAt: Date = Date()) -> ApprovalAttemptDiagnostic {
        ApprovalAttemptDiagnostic(
            schemaVersion: 1,
            attemptedAt: attemptedAt,
            requestId: requestId,
            action: nil,
            origin: origin,
            outcome: .invalidAction,
            detail: "动作不认识",
            httpStatus: nil,
            attemptedHostCount: nil
        )
    }

    static func success(
        result: ApprovalDecisionHandlingResult,
        origin: Origin,
        attemptedAt: Date = Date()
    ) -> ApprovalAttemptDiagnostic {
        switch result {
        case .recordedLocal(let decision):
            return ApprovalAttemptDiagnostic(
                schemaVersion: 1,
                attemptedAt: attemptedAt,
                requestId: decision.requestId,
                action: decision.action,
                origin: origin,
                outcome: .recordedLocalFixture,
                detail: "本地测试已记下",
                httpStatus: nil,
                attemptedHostCount: nil
            )
        case .sentToMac(let decision):
            return ApprovalAttemptDiagnostic(
                schemaVersion: 1,
                attemptedAt: attemptedAt,
                requestId: decision.requestId,
                action: decision.action,
                origin: origin,
                outcome: .sentToMac,
                detail: "Mac 已收到",
                httpStatus: nil,
                attemptedHostCount: nil
            )
        }
    }

    static func failure(
        requestId: String,
        action: ApprovalDecision.Action?,
        origin: Origin,
        error: Error,
        attemptedAt: Date = Date()
    ) -> ApprovalAttemptDiagnostic {
        if let failure = error as? LocalHTTPFailure {
            let status = failure.report.attempts.reversed().first { $0.httpStatus != nil }?.httpStatus
            return ApprovalAttemptDiagnostic(
                schemaVersion: 1,
                attemptedAt: attemptedAt,
                requestId: requestId,
                action: action,
                origin: origin,
                outcome: status == nil ? .transportFailure : .rejectedByMac,
                detail: status == nil ? "同 Wi-Fi 下没摸到 Mac" : "Mac 没收这票",
                httpStatus: status,
                attemptedHostCount: failure.report.attempts.count
            )
        }

        let outcome: Outcome
        let detail: String
        switch error as? ApprovalStoreError {
        case .missingPendingRequest:
            outcome = .missingPendingRequest
            detail = "请求已经不在了"
        case .expiredRequest:
            outcome = .expiredRequest
            detail = "请求过期了"
        case .macRequestNeedsPairedMac:
            outcome = .missingPairing
            detail = "还没配上 Mac"
        case .some:
            outcome = .writeFailed
            detail = "审批没跑成"
        case .none:
            outcome = .writeFailed
            detail = "审批没跑成"
        }

        return ApprovalAttemptDiagnostic(
            schemaVersion: 1,
            attemptedAt: attemptedAt,
            requestId: requestId,
            action: action,
            origin: origin,
            outcome: outcome,
            detail: detail,
            httpStatus: nil,
            attemptedHostCount: nil
        )
    }
}

enum ApprovalStoreError: LocalizedError, Equatable {
    case appGroupUnavailable
    case unsupportedSchema
    case invalidIdentifier
    case invalidText(String)
    case unsafeText
    case writeFailed
    case missingPendingRequest
    case expiredRequest
    case macRequestNeedsPairedMac

    var errorDescription: String? {
        switch self {
        case .appGroupUnavailable:
            return "App Group 不可用，批不了"
        case .unsupportedSchema:
            return "审批版本不认识"
        case .invalidIdentifier:
            return "审批编号离谱了"
        case .invalidText(let label):
            return "审批字段离谱了：\(label)"
        case .unsafeText:
            return "审批里混进了不该出现的东西"
        case .writeFailed:
            return "审批写入失败"
        case .missingPendingRequest:
            return "这个请求已经不在了"
        case .expiredRequest:
            return "这条请求已经过期了"
        case .macRequestNeedsPairedMac:
            return "这是 Mac 请求，得等 Mac 收到才算"
        }
    }
}

struct ApprovalStore {
    private let defaults: UserDefaults?

    init(defaults: UserDefaults? = AppGroup.defaults) {
        self.defaults = defaults
    }

    func loadPendingRequest(now: Date = Date()) -> ApprovalRequest? {
        guard let data = defaults?.data(forKey: AppGroup.approvalRequestKey),
              let request = try? JSONDecoder.aiUsageSnapshotDecoder.decode(ApprovalRequest.self, from: data),
              let validated = try? request.validated() else {
            return nil
        }

        if validated.isExpired(now: now) {
            clearPendingRequest()
            return nil
        }

        return validated
    }

    func loadPendingRequestForDiagnostics() -> ApprovalRequest? {
        guard let data = defaults?.data(forKey: AppGroup.approvalRequestKey),
              let request = try? JSONDecoder.aiUsageSnapshotDecoder.decode(ApprovalRequest.self, from: data) else {
            return nil
        }

        return try? request.validated()
    }

    func savePendingRequest(_ request: ApprovalRequest, now: Date = Date()) throws {
        guard let defaults else {
            throw ApprovalStoreError.appGroupUnavailable
        }
        let validated = try request.validated()
        guard !validated.isExpired(now: now) else {
            clearPendingRequest()
            throw ApprovalStoreError.expiredRequest
        }
        let data = try JSONEncoder.aiUsageSnapshotEncoder.encode(validated)
        defaults.set(data, forKey: AppGroup.approvalRequestKey)
        guard loadPendingRequest(now: now) == validated else {
            throw ApprovalStoreError.writeFailed
        }
    }

    func clearPendingRequest() {
        defaults?.removeObject(forKey: AppGroup.approvalRequestKey)
    }

    func loadLastDecision() -> ApprovalDecision? {
        guard let data = defaults?.data(forKey: AppGroup.approvalDecisionKey),
              let decision = try? JSONDecoder.aiUsageSnapshotDecoder.decode(ApprovalDecision.self, from: data) else {
            return nil
        }

        return try? decision.validated()
    }

    func loadLastAttemptDiagnostic() -> ApprovalAttemptDiagnostic? {
        guard let data = defaults?.data(forKey: AppGroup.approvalAttemptDiagnosticKey),
              let diagnostic = try? JSONDecoder.aiUsageSnapshotDecoder.decode(ApprovalAttemptDiagnostic.self, from: data) else {
            return nil
        }

        return try? diagnostic.validated()
    }

    func saveApprovalAttemptDiagnostic(_ diagnostic: ApprovalAttemptDiagnostic) throws {
        guard let defaults else {
            throw ApprovalStoreError.appGroupUnavailable
        }
        let validated = try diagnostic.validated()
        let data = try JSONEncoder.aiUsageSnapshotEncoder.encode(validated)
        defaults.set(data, forKey: AppGroup.approvalAttemptDiagnosticKey)
        guard loadLastAttemptDiagnostic() == validated else {
            throw ApprovalStoreError.writeFailed
        }
    }

    @discardableResult
    func recordDecision(
        requestId: String,
        action: ApprovalDecision.Action,
        decidedAt: Date = Date(),
        requiresLocalFixture: Bool = false
    ) throws -> ApprovalDecision {
        guard let defaults else {
            throw ApprovalStoreError.appGroupUnavailable
        }
        guard let pending = loadPendingRequest(now: decidedAt), pending.id == requestId else {
            throw ApprovalStoreError.missingPendingRequest
        }
        if requiresLocalFixture && !pending.isLocalUIFixture {
            throw ApprovalStoreError.macRequestNeedsPairedMac
        }

        let decision = try ApprovalDecision(
            schemaVersion: 1,
            requestId: requestId,
            action: action,
            decidedAt: decidedAt
        ).validated()
        let data = try JSONEncoder.aiUsageSnapshotEncoder.encode(decision)
        defaults.set(data, forKey: AppGroup.approvalDecisionKey)
        clearPendingRequest()

        guard loadLastDecision() == decision else {
            throw ApprovalStoreError.writeFailed
        }

        return decision
    }

    @discardableResult
    func seedFixtureRequest(now: Date = Date()) throws -> ApprovalRequest {
        let request = ApprovalRequest(
            schemaVersion: 1,
            id: "local-fixture-\(Int(now.timeIntervalSince1970))",
            source: "本地测试",
            title: "允许这一步继续？",
            createdAt: now,
            expiresAt: Calendar.current.date(byAdding: .minute, value: 15, to: now)
        )
        try savePendingRequest(request, now: now)
        return request
    }
}

enum ApprovalSafety {
    private static let idPattern = #"^[A-Za-z0-9._:-]{1,80}$"#
    private static let emailPattern = #"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}"#
    private static let forbiddenPattern = #"\b(?:api[_-]?token|authorization|bearer|cookie|secret|credential|keychain|transcript|prompt|message|raw\s+(?:stdout|stderr|log|output)|provider\s+output)\b"#
    private static let urlPattern = #"(?:https?://|[A-Z0-9.-]+\.[A-Z]{2,}(?:\b|/))"#
    private static let ipAddressPattern = #"\b(?:\d{1,3}\.){3}\d{1,3}\b"#
    private static let localhostPattern = #"(^|[^A-Z0-9-])localhost([^A-Z0-9-]|$)"#

    static func validateIdentifier(_ value: String) throws {
        guard value.range(of: idPattern, options: .regularExpression) != nil else {
            throw ApprovalStoreError.invalidIdentifier
        }
    }

    static func validateBoundedText(_ value: String, label: String, max: Int) throws {
        guard !value.isEmpty, value.count <= max else {
            throw ApprovalStoreError.invalidText(label)
        }
        guard value.range(of: emailPattern, options: [.regularExpression, .caseInsensitive]) == nil,
              value.range(of: forbiddenPattern, options: [.regularExpression, .caseInsensitive]) == nil,
              value.range(of: urlPattern, options: [.regularExpression, .caseInsensitive]) == nil,
              value.range(of: ipAddressPattern, options: .regularExpression) == nil,
              value.range(of: localhostPattern, options: [.regularExpression, .caseInsensitive]) == nil else {
            throw ApprovalStoreError.unsafeText
        }
    }

    static func validateDiagnosticDetail(_ value: String, label: String, max: Int) throws {
        try validateBoundedText(value, label: label, max: max)
        guard value.range(of: urlPattern, options: [.regularExpression, .caseInsensitive]) == nil,
              value.range(of: ipAddressPattern, options: .regularExpression) == nil else {
            throw ApprovalStoreError.unsafeText
        }
    }
}
