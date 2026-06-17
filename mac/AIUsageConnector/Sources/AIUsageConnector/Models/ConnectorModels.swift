import Foundation

struct ConnectorDoctor: Decodable {
    let ok: Bool
    let statusKind: String?
    let checkedAt: String?
    let readyForIPhonePairing: Bool?
    let pairing: PairingSummary
    let service: ServiceSummary
    let liveCheck: LiveCheckSummary?
    let nextActions: [String]?
    let note: String?
}

struct PairingSummary: Decodable {
    let present: Bool
    let deviceConfigured: Bool?
    let nameConfigured: Bool?
    let updatedAt: String?
    let port: Int?
    let addressCount: Int?
    let manualPairCommand: String?
    let cliManualPairCommand: String?
}

struct ServiceSummary: Decodable {
    let label: String
    let plistInstalled: Bool
    let plistMode: String?
    let logsConfigured: Bool
    let loaded: Bool
    let running: Bool
    let detail: String
    let program: ProgramSummary
}

struct ProgramSummary: Decodable {
    let argumentsFound: Bool
    let nodePathExists: Bool
    let cliPathExists: Bool
    let startCommandLooksValid: Bool
    let detail: String
}

struct LiveCheckSummary: Decodable {
    let attempted: Bool
    let endpoint: String
    let checkedAt: String
    let serverLooksRunning: Bool
    let snapshotLooksValid: Bool
    let reachableAddressCount: Int
    let failedAddressCount: Int
    let failedAddressErrors: [CountedError]
    let snapshotReadyAddressCount: Int
    let snapshotFailedAddressCount: Int
    let snapshotFailedAddressErrors: [CountedError]
}

struct CountedError: Decodable, Identifiable {
    let error: String
    let count: Int

    var id: String { "\(error)-\(count)" }
}

struct PairingPayload: Codable {
    let v: Int
    let deviceId: String
    let name: String
    let hosts: [String]
    let port: Int
    let token: String
}

struct ConnectorSnapshot: Decodable {
    let schemaVersion: Int
    let device: SnapshotDevice
    let providers: [SnapshotProvider]
}

struct SnapshotDevice: Decodable {
    let id: String
    let name: String
    let platform: String
    let connectorVersion: String
    let online: Bool
    let updatedAt: String
}

struct SnapshotProvider: Decodable, Identifiable {
    let id: String
    let displayName: String
    let connected: Bool
    let health: String
    let version: String?
    let capturedAt: String?
    let usage: SnapshotUsage
}

struct SnapshotUsage: Decodable {
    let available: Bool
    let reason: String?
    let source: String?
    let sourceVersion: String?
    let fiveHourRemainingPercent: Int?
    let fiveHourResetAt: String?
    let weeklyRemainingPercent: Int?
    let weeklyResetAt: String?
}

struct CommandResult {
    let exitCode: Int32
    let stdout: String
    let stderr: String

    var combinedOutput: String {
        [stdout, stderr].filter { !$0.isEmpty }.joined(separator: "\n")
    }
}

enum ConnectorAction: String {
    case install
    case load
    case unload
    case reload
    case pair
    case refresh
}

enum ConnectorError: Error, LocalizedError {
    case repositoryNotFound
    case commandFailed(String)
    case jsonMissing(String)

    var errorDescription: String? {
        switch self {
        case .repositoryNotFound:
            return AppText.repoNotFound
        case .commandFailed(let message):
            return message
        case .jsonMissing(let message):
            return message
        }
    }
}
