import Foundation

struct AIUsageSnapshot: Codable, Equatable {
    let schemaVersion: Int
    let device: Device
    let providers: [Provider]

    static func decodeValidated(from data: Data) throws -> AIUsageSnapshot {
        try SnapshotSafety.validateRawData(data)
        return try JSONDecoder.aiUsageSnapshotDecoder
            .decode(AIUsageSnapshot.self, from: data)
            .validated()
    }

    func validated() throws -> AIUsageSnapshot {
        guard schemaVersion == 1 else {
            throw SnapshotValidationError.unsupportedSchema
        }
        try validateNoUnsafeText()
        try validateDeviceMetadata()

        for provider in providers {
            guard ProviderID(rawValue: provider.id) != nil else {
                throw SnapshotValidationError.invalidProvider(provider.id)
            }
            try validateProviderMetadata(provider)

            if provider.usage.available {
                guard provider.capturedAt != nil, provider.usage.source != nil else {
                    throw SnapshotValidationError.availableUsageMissingSource
                }
                try validatePercent(provider.usage.fiveHourRemainingPercent)
                try validatePercent(provider.usage.weeklyRemainingPercent)
                guard provider.usage.fiveHourResetAt != nil,
                      provider.usage.weeklyResetAt != nil else {
                    throw SnapshotValidationError.availableUsageMissingReset
                }
                guard provider.usage.reason == nil else {
                    throw SnapshotValidationError.availableUsageHasReason
                }
            } else if provider.usage.reason == nil {
                throw SnapshotValidationError.unavailableUsageMissingReason
            } else {
                guard provider.capturedAt == nil,
                      provider.usage.source == nil,
                      provider.usage.sourceVersion == nil,
                      provider.usage.fiveHourRemainingPercent == nil,
                      provider.usage.fiveHourResetAt == nil,
                      provider.usage.weeklyRemainingPercent == nil,
                      provider.usage.weeklyResetAt == nil else {
                    throw SnapshotValidationError.unavailableUsageHasMeterFields
                }
            }
        }

        let providerIds = providers.map(\.id)
        guard providerIds.count == 2,
              Set(providerIds) == Set(["claude", "codex"]) else {
            throw SnapshotValidationError.invalidProviderSet
        }

        return self
    }

    private func validateDeviceMetadata() throws {
        try validateString(device.id, label: "device.id", min: 1, max: 80)
        try validateString(device.name, label: "device.name", min: 1, max: 80)
        guard ["macOS", "Windows", "Linux"].contains(device.platform) else {
            throw SnapshotValidationError.invalidPlatform(device.platform)
        }
        try validateString(device.connectorVersion, label: "device.connectorVersion", min: 0, max: 40)
    }

    private func validateProviderMetadata(_ provider: Provider) throws {
        try validateString(provider.displayName, label: "\(provider.id).displayName", min: 1, max: 40)
        try validateOptionalString(provider.version, label: "\(provider.id).version", max: 40)
        try validateOptionalString(provider.usage.sourceVersion, label: "\(provider.id).usage.sourceVersion", max: 40)
        try validateOptionalString(provider.error?.code, label: "\(provider.id).error.code", max: 40)
        try validateOptionalString(provider.error?.message, label: "\(provider.id).error.message", max: 120)
    }

    private func validateOptionalString(_ value: String?, label: String, max: Int) throws {
        guard let value else { return }
        try validateString(value, label: label, min: 0, max: max)
    }

    private func validateString(_ value: String, label: String, min: Int, max: Int) throws {
        guard value.count >= min, value.count <= max else {
            throw SnapshotValidationError.invalidStringLength(label)
        }
    }

    private func validatePercent(_ percent: Int?) throws {
        guard let percent, (0...100).contains(percent) else {
            throw SnapshotValidationError.invalidPercent
        }
    }
}

extension AIUsageSnapshot {
    struct Device: Codable, Equatable {
        let id: String
        let name: String
        let platform: String
        let connectorVersion: String
        let online: Bool
        let updatedAt: Date
    }

    struct Provider: Codable, Equatable, Identifiable {
        let id: String
        let displayName: String
        let connected: Bool
        let health: Health
        let version: String?
        let capturedAt: Date?
        let usage: Usage
        let error: SnapshotError?
    }

    enum ProviderID: String {
        case claude
        case codex
    }

    enum Health: String, Codable, Equatable {
        case working
        case degraded
        case error
        case unknown
    }

    struct Usage: Codable, Equatable {
        let available: Bool
        let source: UsageSource?
        let sourceVersion: String?
        let fiveHourRemainingPercent: Int?
        let fiveHourResetAt: Date?
        let weeklyRemainingPercent: Int?
        let weeklyResetAt: Date?
        let reason: UsageUnavailableReason?
    }

    enum UsageSource: String, Codable, Equatable {
        case codexAppServer = "codex_app_server"
        case codexbar
        case claudeCodeTty = "claude_code_tty"
    }

    enum UsageUnavailableReason: String, Codable, Equatable {
        case noStableSource = "no_stable_source"
        case thirdPartyNoQuota = "third_party_no_quota"
        case notLoggedIn = "not_logged_in"
        case collectorError = "collector_error"
    }

    struct SnapshotError: Codable, Equatable {
        let code: String
        let message: String
    }

}

extension JSONDecoder {
    static var aiUsageSnapshotDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

extension JSONEncoder {
    static var aiUsageSnapshotEncoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

enum SnapshotValidationError: LocalizedError {
    case unsupportedSchema
    case invalidProviderSet
    case invalidProvider(String)
    case availableUsageMissingSource
    case availableUsageMissingReset
    case availableUsageHasReason
    case unavailableUsageMissingReason
    case unavailableUsageHasMeterFields
    case invalidPercent
    case invalidPlatform(String)
    case invalidStringLength(String)
    case unsafeText
    case unknownField(String)

    var errorDescription: String? {
        switch self {
        case .unsupportedSchema:
            return "快照版本不认识"
        case .invalidProviderSet:
            return "快照必须刚好有 Claude 和 Codex"
        case .invalidProvider(let provider):
            return "工具名不认识：\(provider)"
        case .availableUsageMissingSource:
            return "有用量但没来源，想糊弄谁😒"
        case .availableUsageMissingReset:
            return "有用量但没恢复时间"
        case .availableUsageHasReason:
            return "有用量还塞 fallback 理由，别演😒"
        case .unavailableUsageMissingReason:
            return "没用量但也没理由"
        case .unavailableUsageHasMeterFields:
            return "没证明用量却塞了表，想糊弄谁😒"
        case .invalidPercent:
            return "百分比离谱了"
        case .invalidPlatform(let platform):
            return "设备平台不认识：\(platform)"
        case .invalidStringLength(let field):
            return "字段长度离谱了：\(field)"
        case .unsafeText:
            return "快照里混进了不该出现的东西"
        case .unknownField(let field):
            return "快照字段不认识：\(field)"
        }
    }
}

enum SnapshotSafety {
    static func validateRawData(_ data: Data) throws {
        let object = try JSONSerialization.jsonObject(with: data)
        try inspect(object, context: .snapshot)
    }

    static func validateModel(_ snapshot: AIUsageSnapshot) throws {
        let data = try JSONEncoder.aiUsageSnapshotEncoder.encode(snapshot)
        try validateRawData(data)
    }

    private static func inspect(_ value: Any, context: Context, path: String = "$") throws {
        if let text = value as? String {
            if !PrivacySafeText.isSafeDisplayText(text, max: 200, allowEmpty: true) {
                throw SnapshotValidationError.unsafeText
            }
            return
        }

        if let array = value as? [Any] {
            for item in array {
                try inspect(item, context: context.arrayElementContext, path: path)
            }
            return
        }

        guard let dictionary = value as? [String: Any] else {
            return
        }

        if context == .usage,
           let available = dictionary["available"] as? Bool {
            if available == false {
                let allowedUnavailableKeys: Set<String> = ["available", "reason"]
                for key in dictionary.keys where !allowedUnavailableKeys.contains(key) {
                    throw SnapshotValidationError.unavailableUsageHasMeterFields
                }
            } else if dictionary.keys.contains("reason") {
                throw SnapshotValidationError.availableUsageHasReason
            }
        }

        for (key, nested) in dictionary {
            if key.range(of: #"token|cookie|secret|key|credential"#, options: [.regularExpression, .caseInsensitive]) != nil {
                throw SnapshotValidationError.unsafeText
            }
            guard context.allowedKeys.contains(key) else {
                throw SnapshotValidationError.unknownField("\(path).\(key)")
            }
            try inspect(nested, context: context.childContext(for: key), path: "\(path).\(key)")
        }
    }
}

private extension AIUsageSnapshot {
    func validateNoUnsafeText() throws {
        try SnapshotSafety.validateModel(self)
    }
}

private extension SnapshotSafety {
    enum Context {
        case snapshot
        case device
        case providers
        case provider
        case usage
        case error
        case scalar

        var allowedKeys: Set<String> {
            switch self {
            case .snapshot:
                return ["schemaVersion", "device", "providers"]
            case .device:
                return ["id", "name", "platform", "connectorVersion", "online", "updatedAt"]
            case .provider:
                return ["id", "displayName", "connected", "health", "version", "capturedAt", "usage", "error"]
            case .usage:
                return ["available", "source", "sourceVersion", "fiveHourRemainingPercent", "fiveHourResetAt", "weeklyRemainingPercent", "weeklyResetAt", "reason"]
            case .error:
                return ["code", "message"]
            case .providers, .scalar:
                return []
            }
        }

        var arrayElementContext: Context {
            self == .providers ? .provider : .scalar
        }

        func childContext(for key: String) -> Context {
            switch (self, key) {
            case (.snapshot, "device"):
                return .device
            case (.snapshot, "providers"):
                return .providers
            case (.provider, "usage"):
                return .usage
            case (.provider, "error"):
                return .error
            default:
                return .scalar
            }
        }
    }
}
