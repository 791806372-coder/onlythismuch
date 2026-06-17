import Foundation
import SwiftUI

@MainActor
final class ConnectorStore: ObservableObject {
    @Published private(set) var doctor: ConnectorDoctor?
    @Published private(set) var isBusy = false
    @Published private(set) var lastError: String?
    @Published private(set) var repoRoot: URL?
    @Published private(set) var lastAction: ConnectorAction?
    @Published private(set) var snapshot: ConnectorSnapshot?
    @Published private(set) var usageError: String?

    private let client: ConnectorCommandClient

    init() {
        do {
            let root = try RepositoryLocator.locate()
            self.repoRoot = root
            self.client = ConnectorCommandClient(repoRoot: root)
        } catch {
            self.repoRoot = nil
            self.client = ConnectorCommandClient(repoRoot: URL(fileURLWithPath: FileManager.default.currentDirectoryPath))
            self.lastError = error.localizedDescription
        }
    }

    var isRunning: Bool {
        doctor?.service.running == true
    }

    var isInstalled: Bool {
        doctor?.service.plistInstalled == true
    }

    var helperIsReady: Bool {
        guard let service = doctor?.service else {
            return false
        }
        return service.plistInstalled && service.running && service.program.startCommandLooksValid
    }

    var helperNeedsRepair: Bool {
        guard let service = doctor?.service else {
            return false
        }
        return !service.plistInstalled || !service.program.startCommandLooksValid
    }

    var helperNeedsWake: Bool {
        guard let service = doctor?.service else {
            return false
        }
        return service.plistInstalled && service.program.startCommandLooksValid && !service.running
    }

    var canInstallService: Bool {
        !isBusy
    }

    var canStartService: Bool {
        !isBusy && !isRunning
    }

    var canStopService: Bool {
        !isBusy && isRunning
    }

    var isReady: Bool {
        doctor?.readyForIPhonePairing == true
    }

    var menuBarSystemImage: String {
        if isBusy { return "arrow.triangle.2.circlepath.circle" }
        if isReady { return "link.circle.fill" }
        if isRunning { return "link.circle" }
        return "link.badge.plus"
    }

    var statusTitle: String {
        if isReady { return AppText.readyForIPhone }
        if isRunning { return AppText.runningNeedsCheck }
        if doctor?.service.plistInstalled == true { return AppText.installedStopped }
        return AppText.setupNeeded
    }

    func refresh() async {
        await perform(.refresh) {
            doctor = try await client.doctorLive()
            await refreshSnapshotIfAvailable()
        }
    }

    func installService() async {
        await perform(.install) {
            try await client.installService()
            doctor = try await client.doctorLive()
            await refreshSnapshotIfAvailable()
        }
    }

    func setUpHelper() async {
        await perform(.install) {
            try await client.installService()
            var latestDoctor = try await client.doctorLive()
            if !latestDoctor.service.running {
                try await client.loadService()
                latestDoctor = try await client.doctorLive()
            }
            doctor = latestDoctor
            await refreshSnapshotIfAvailable()
        }
    }

    func loadService() async {
        if isRunning {
            await refresh()
            return
        }

        await perform(.load) {
            try await client.loadService()
            doctor = try await client.doctorLive()
            await refreshSnapshotIfAvailable()
        }
    }

    func unloadService() async {
        if !isRunning, doctor != nil {
            await refresh()
            return
        }

        await perform(.unload) {
            try await client.unloadService()
            doctor = try await client.doctorLive()
            snapshot = nil
            usageError = AppText.connectorOffline
        }
    }

    func reloadService() async {
        await perform(.reload) {
            try await client.unloadService()
            try await client.loadService()
            doctor = try await client.doctorLive()
            await refreshSnapshotIfAvailable()
        }
    }

    func rotatePairingPayload() async -> PairingPayload? {
        var payload: PairingPayload?
        await perform(.pair) {
            payload = try await client.rotatePairingPayload()
        }
        return payload
    }

    func currentPairingPayload() async -> PairingPayload? {
        var payload: PairingPayload?
        await perform(.pair) {
            payload = try await client.currentPairingPayload()
        }
        return payload
    }

    func refreshUsage() async {
        await perform(.refresh) {
            await refreshSnapshotIfAvailable()
        }
    }

    private func refreshSnapshotIfAvailable() async {
        do {
            snapshot = try await client.snapshot()
            usageError = nil
        } catch {
            snapshot = nil
            usageError = error.localizedDescription
        }
    }

    private func perform(_ action: ConnectorAction, operation: () async throws -> Void) async {
        guard repoRoot != nil else {
            lastError = ConnectorError.repositoryNotFound.localizedDescription
            return
        }

        isBusy = true
        lastAction = action
        lastError = nil
        defer {
            isBusy = false
            lastAction = nil
        }

        do {
            try await operation()
        } catch {
            lastError = error.localizedDescription
        }
    }
}
