import Foundation

struct WidgetRefreshCoordinator {
    typealias SnapshotLoader = (PairingPayload) async throws -> LocalHTTPResult<AIUsageSnapshot>
    typealias ApprovalRequestLoader = (PairingPayload) async throws -> LocalHTTPResult<ApprovalRequest?>

    private let isProofModeEnabled: () -> Bool
    private let loadPairedDevice: () -> PairingPayload?
    private let saveWidgetLANDiagnostic: (WidgetLANDiagnostic) -> Void
    private let snapshotWithReport: SnapshotLoader
    private let saveCachedSnapshot: (AIUsageSnapshot, String) throws -> Void
    private let approvalRequestWithReport: ApprovalRequestLoader
    private let savePendingRequest: (ApprovalRequest) throws -> Void
    private let refreshBudget: TimeInterval
    private let approvalSyncBudget: TimeInterval
    private let now: () -> Date

    init(
        store: SnapshotStore = SnapshotStore(),
        pairingStore: PairedDeviceStore = PairedDeviceStore(),
        approvalStore: ApprovalStore = ApprovalStore(),
        source: LocalHTTPSource = LocalHTTPSource(
            requestTimeout: 1.5,
            maxHostAttempts: PairedDeviceStore.maxHosts
        )
    ) {
        self.init(
            isProofModeEnabled: store.isProofModeEnabled,
            loadPairedDevice: pairingStore.load,
            saveWidgetLANDiagnostic: store.saveWidgetLANDiagnostic,
            snapshotWithReport: source.snapshotWithReport,
            saveCachedSnapshot: { snapshot, source in
                try store.saveCachedSnapshot(snapshot, source: source)
            },
            approvalRequestWithReport: source.approvalRequestWithReport,
            savePendingRequest: { request in
                try approvalStore.savePendingRequest(request)
            },
            refreshBudget: 3.5,
            approvalSyncBudget: 0.75
        )
    }

    init(
        isProofModeEnabled: @escaping () -> Bool,
        loadPairedDevice: @escaping () -> PairingPayload?,
        saveWidgetLANDiagnostic: @escaping (WidgetLANDiagnostic) -> Void,
        snapshotWithReport: @escaping SnapshotLoader,
        saveCachedSnapshot: @escaping (AIUsageSnapshot, String) throws -> Void,
        approvalRequestWithReport: @escaping ApprovalRequestLoader,
        savePendingRequest: @escaping (ApprovalRequest) throws -> Void,
        refreshBudget: TimeInterval = 3.5,
        approvalSyncBudget: TimeInterval = 0.75,
        now: @escaping () -> Date = Date.init
    ) {
        self.isProofModeEnabled = isProofModeEnabled
        self.loadPairedDevice = loadPairedDevice
        self.saveWidgetLANDiagnostic = saveWidgetLANDiagnostic
        self.snapshotWithReport = snapshotWithReport
        self.saveCachedSnapshot = saveCachedSnapshot
        self.approvalRequestWithReport = approvalRequestWithReport
        self.savePendingRequest = savePendingRequest
        self.refreshBudget = refreshBudget
        self.approvalSyncBudget = approvalSyncBudget
        self.now = now
    }

    func refresh() async {
        let startedAt = now()

        guard !isProofModeEnabled() else {
            saveWidgetLANDiagnostic(.skipped("证明模式开着，Widget LAN 先别闹"))
            return
        }

        guard let pairedDevice = loadPairedDevice() else {
            saveWidgetLANDiagnostic(.skipped("还没配 Mac，Widget 没法摸"))
            return
        }

        let approvalSync = await syncApprovalRequest(
            from: pairedDevice,
            budget: min(approvalSyncBudget, remainingBudget(startedAt: startedAt))
        )

        let snapshotBudget = remainingBudget(startedAt: startedAt)
        guard snapshotBudget > 0 else {
            saveWidgetLANDiagnostic(.failure("Widget LAN 超时，先看旧账", report: nil, approvalSync: approvalSync))
            return
        }

        do {
            let result = try await runWithTimeout(seconds: snapshotBudget) {
                try await snapshotWithReport(pairedDevice)
            }
            try saveCachedSnapshot(result.value, "widget-lan")
            saveWidgetLANDiagnostic(.success(report: result.report, approvalSync: approvalSync))
        } catch let error as LocalHTTPFailure {
            saveWidgetLANDiagnostic(.failure(error.localizedDescription, report: error.report, approvalSync: approvalSync))
        } catch {
            saveWidgetLANDiagnostic(.failure(error.localizedDescription, report: nil, approvalSync: approvalSync))
        }
    }

    private func syncApprovalRequest(
        from pairedDevice: PairingPayload,
        budget: TimeInterval
    ) async -> WidgetApprovalSyncDiagnostic {
        guard budget > 0 else {
            return .timedOut()
        }

        do {
            let approvalResult = try await runWithTimeout(seconds: budget, {
                  try await approvalRequestWithReport(pairedDevice)
            })

            if let request = approvalResult.value {
                do {
                    try savePendingRequest(request)
                    return .savedRequest(report: approvalResult.report)
                } catch {
                    return .failure("审批请求没存上", report: approvalResult.report)
                }
            }

            return .noRequest(report: approvalResult.report)
        } catch WidgetRefreshCoordinatorError.timedOut {
            return .timedOut()
        } catch let error as LocalHTTPFailure {
            return .failure(error.localizedDescription, report: error.report)
        } catch {
            return .failure("审批同步翻车", report: nil)
        }
    }

    private func remainingBudget(startedAt: Date) -> TimeInterval {
        max(0, refreshBudget - now().timeIntervalSince(startedAt))
    }

    private func runWithTimeout<Value>(
        seconds: TimeInterval,
        _ operation: @escaping () async throws -> Value
    ) async throws -> Value {
        let nanoseconds = UInt64(max(0, seconds) * 1_000_000_000)
        guard nanoseconds > 0 else {
            throw WidgetRefreshCoordinatorError.timedOut
        }

        return try await withThrowingTaskGroup(of: Value.self) { group in
            group.addTask {
                try await operation()
            }
            group.addTask {
                try await Task.sleep(nanoseconds: nanoseconds)
                throw WidgetRefreshCoordinatorError.timedOut
            }

            guard let result = try await group.next() else {
                throw WidgetRefreshCoordinatorError.timedOut
            }
            group.cancelAll()
            return result
        }
    }
}

private enum WidgetRefreshCoordinatorError: LocalizedError {
    case timedOut

    var errorDescription: String? {
        switch self {
        case .timedOut:
            return "Widget LAN 超时，先看旧账"
        }
    }
}
