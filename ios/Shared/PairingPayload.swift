import Foundation

struct PairingPayload: Codable, Equatable {
    let v: Int
    let deviceId: String
    let name: String
    let hosts: [String]
    let port: Int
    let token: String

    var displaySummary: String {
        let addressText = hosts.count == 1 ? "1 个地址" : "\(hosts.count) 个地址"
        return "\(addressText) · 端口 \(port)"
    }
}

struct PairedDeviceStore {
    static let maxHosts = 4
    private static let maxPairingTextBytes = 8_192
    private static let maxShortTextLength = 80
    private static let maxHostLength = 253
    private static let maxTokenLength = 256
    private static let allowedRawKeys: Set<String> = ["v", "deviceId", "name", "hosts", "port", "token"]
    private let defaults: UserDefaults?

    private enum Key {
        static let payload = "aiuw.pairingPayload"
    }

    init(defaults: UserDefaults? = AppGroup.defaults) {
        self.defaults = defaults
    }

    func load() -> PairingPayload? {
        guard let data = defaults?.data(forKey: Key.payload) else {
            return nil
        }

        guard (try? Self.validateRawData(data)) != nil,
              let payload = try? JSONDecoder().decode(PairingPayload.self, from: data),
              (try? Self.validatePayload(payload)) != nil else {
            defaults?.removeObject(forKey: Key.payload)
            return nil
        }

        return payload
    }

    func save(_ payload: PairingPayload) throws {
        try Self.validatePayload(payload)
        let data = try JSONEncoder().encode(payload)
        guard let defaults else {
            throw PairingError.appGroupUnavailable
        }

        defaults.set(data, forKey: Key.payload)
        guard let savedData = defaults.data(forKey: Key.payload),
              (try? JSONDecoder().decode(PairingPayload.self, from: savedData)) == payload else {
            throw PairingError.persistenceFailed
        }
    }

    func clear() {
        defaults?.removeObject(forKey: Key.payload)
    }

    func parse(_ text: String) throws -> PairingPayload {
        let data = try Self.extractPairingJSONData(from: text)
        try Self.validateRawData(data)
        let payload: PairingPayload
        do {
            payload = try JSONDecoder().decode(PairingPayload.self, from: data)
        } catch {
            throw PairingError.invalidPayload
        }

        try Self.validatePayload(payload)
        return payload
    }

    private static func validatePayload(_ payload: PairingPayload) throws {
        guard payload.v == 1 else {
            throw PairingError.unsupportedVersion
        }
        guard Self.isBoundedText(payload.deviceId),
              PrivacySafeText.isSafeDisplayText(payload.deviceId, max: Self.maxShortTextLength) else {
            throw PairingError.invalidDeviceId
        }
        guard Self.isBoundedText(payload.name),
              PrivacySafeText.isSafeDisplayText(payload.name, max: Self.maxShortTextLength) else {
            throw PairingError.invalidName
        }
        guard !payload.hosts.isEmpty else {
            throw PairingError.missingHost
        }
        guard payload.hosts.count <= Self.maxHosts else {
            throw PairingError.tooManyHosts
        }
        guard payload.hosts.allSatisfy({ !$0.isEmpty && $0.count <= Self.maxHostLength }) else {
            throw PairingError.nonLocalHost
        }
        guard payload.hosts.allSatisfy({ !Self.isLoopbackHost($0) }) else {
            throw PairingError.loopbackHost
        }
        guard payload.hosts.allSatisfy(Self.isLocalHost) else {
            throw PairingError.nonLocalHost
        }
        guard (1...65535).contains(payload.port) else {
            throw PairingError.invalidPort
        }
        guard !payload.token.isEmpty else {
            throw PairingError.missingToken
        }
        guard payload.token.count <= Self.maxTokenLength,
              !payload.token.contains(where: \.isWhitespace) else {
            throw PairingError.invalidToken
        }
    }

    private static func extractPairingJSONData(from text: String) throws -> Data {
        guard text.utf8.count <= maxPairingTextBytes else {
            throw PairingError.invalidPayload
        }
        guard let start = text.firstIndex(of: "{") else {
            throw PairingError.invalidPayload
        }

        var index = start
        var depth = 0
        var insideString = false
        var escaped = false

        while index < text.endIndex {
            let character = text[index]

            if insideString {
                if escaped {
                    escaped = false
                } else if character == "\\" {
                    escaped = true
                } else if character == "\"" {
                    insideString = false
                }
            } else if character == "\"" {
                insideString = true
            } else if character == "{" {
                depth += 1
            } else if character == "}" {
                depth -= 1
                if depth == 0 {
                    let end = text.index(after: index)
                    return Data(text[start..<end].utf8)
                }
                if depth < 0 {
                    throw PairingError.invalidPayload
                }
            }

            index = text.index(after: index)
        }

        throw PairingError.invalidPayload
    }

    private static func validateRawData(_ data: Data) throws {
        let object: Any
        do {
            object = try JSONSerialization.jsonObject(with: data)
        } catch {
            throw PairingError.invalidPayload
        }

        guard let dictionary = object as? [String: Any] else {
            throw PairingError.invalidPayload
        }

        if dictionary["tokenRedacted"] != nil ||
            dictionary["pairingPayloadRedacted"] != nil ||
            dictionary["statusKind"] != nil {
            throw PairingError.redactedPayload
        }

        for key in dictionary.keys where !allowedRawKeys.contains(key) {
            throw PairingError.unknownField(key)
        }
    }

    private static func isBoundedText(_ value: String) -> Bool {
        !value.isEmpty && value.count <= maxShortTextLength
    }

    private static func isLocalHost(_ host: String) -> Bool {
        let lowercased = host.lowercased()
        if lowercased.hasSuffix(".local") {
            return isBonjourLocalHost(host)
        }

        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else {
            return false
        }

        let octets = parts.compactMap { part -> Int? in
            guard !part.isEmpty,
                  part.allSatisfy({ $0.isNumber }),
                  let value = Int(part),
                  (0...255).contains(value) else {
                return nil
            }

            return value
        }
        guard octets.count == 4 else {
            return false
        }

        let first = octets[0]
        let second = octets[1]

        if first == 10 {
            return true
        }
        if first == 172 && (16...31).contains(second) {
            return true
        }
        if first == 192 && second == 168 {
            return true
        }
        if first == 169 && second == 254 {
            return true
        }

        return false
    }

    private static func isBonjourLocalHost(_ host: String) -> Bool {
        let suffix = ".local"
        let lowercased = host.lowercased()
        guard host.count <= maxHostLength,
              lowercased.hasSuffix(suffix) else {
            return false
        }

        let baseName = String(host.dropLast(suffix.count))
        guard !baseName.isEmpty else {
            return false
        }

        let labels = baseName.split(separator: ".", omittingEmptySubsequences: false)
        return labels.allSatisfy { label in
            let value = String(label)
            let lowercasedValue = value.lowercased()
            guard !value.isEmpty,
                  value.count <= 63,
                  lowercasedValue != "local",
                  lowercasedValue != "localhost",
                  !value.hasPrefix("-"),
                  !value.hasSuffix("-") else {
                return false
            }

            return value.unicodeScalars.allSatisfy { scalar in
                let ascii = scalar.value
                return (48...57).contains(ascii) ||
                    (65...90).contains(ascii) ||
                    (97...122).contains(ascii) ||
                    ascii == 45
            }
        }
    }

    private static func isLoopbackHost(_ host: String) -> Bool {
        let lowercased = host.lowercased()
        if lowercased == "localhost" {
            return true
        }

        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else {
            return false
        }

        let octets = parts.compactMap { part -> Int? in
            guard !part.isEmpty,
                  part.allSatisfy({ $0.isNumber }),
                  let value = Int(part),
                  (0...255).contains(value) else {
                return nil
            }

            return value
        }

        return octets.count == 4 && octets[0] == 127
    }
}

enum PairingError: LocalizedError, Equatable {
    case invalidPayload
    case unsupportedVersion
    case invalidDeviceId
    case invalidName
    case missingHost
    case tooManyHosts
    case loopbackHost
    case nonLocalHost
    case invalidPort
    case missingToken
    case invalidToken
    case redactedPayload
    case unknownField(String)
    case appGroupUnavailable
    case persistenceFailed

    var errorDescription: String? {
        switch self {
        case .invalidPayload:
            return "配对码不像 JSON"
        case .unsupportedVersion:
            return "配对码版本不支持"
        case .invalidDeviceId:
            return "配对码设备名不对"
        case .invalidName:
            return "配对码名字太怪"
        case .missingHost:
            return "配对码里没有 Mac 地址"
        case .tooManyHosts:
            return "Mac 地址太多，widget 会被拖慢"
        case .loopbackHost:
            return "localhost 是手机自己，不是 Mac"
        case .nonLocalHost:
            return "这地址不像同 Wi-Fi 的 Mac"
        case .invalidPort:
            return "配对码端口不对"
        case .missingToken:
            return "缺 token，请粘贴 --manual 输出"
        case .invalidToken:
            return "token 格式不对，请重新配对"
        case .redactedPayload:
            return "这是脱敏摘要，不能粘贴；请用 npm run pair:manual"
        case .unknownField:
            return "配对码多了不认识的字段"
        case .appGroupUnavailable:
            return "App Group 不可用，Widget 读不到配对"
        case .persistenceFailed:
            return "配对没写稳，Widget 可能读不到"
        }
    }
}
