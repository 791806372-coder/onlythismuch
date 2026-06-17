import Foundation

enum ApprovalDecisionHandlingResult: Equatable {
    case recordedLocal(ApprovalDecision)
    case sentToMac(ApprovalDecision)
}

struct ApprovalDecisionHandler {
    private let loadPendingRequest: (Date) -> ApprovalRequest?
    private let recordDecision: (String, ApprovalDecision.Action, Date, Bool) throws -> ApprovalDecision
    private let loadPairedDevice: () -> PairingPayload?
    private let submitDecision: (ApprovalDecision, PairingPayload) async throws -> Void

    init(
        approvalStore: ApprovalStore = ApprovalStore(),
        pairingStore: PairedDeviceStore = PairedDeviceStore(),
        source: LocalHTTPSource = LocalHTTPSource(requestTimeout: 1.5, maxHostAttempts: PairedDeviceStore.maxHosts)
    ) {
        loadPendingRequest = { now in
            approvalStore.loadPendingRequest(now: now)
        }
        recordDecision = { requestId, action, decidedAt, requiresLocalFixture in
            try approvalStore.recordDecision(
                requestId: requestId,
                action: action,
                decidedAt: decidedAt,
                requiresLocalFixture: requiresLocalFixture
            )
        }
        loadPairedDevice = {
            pairingStore.load()
        }
        submitDecision = { decision, payload in
            _ = try await source.submitApprovalDecisionWithReport(decision, payload: payload)
        }
    }

    init(
        loadPendingRequest: @escaping (Date) -> ApprovalRequest?,
        recordDecision: @escaping (String, ApprovalDecision.Action, Date, Bool) throws -> ApprovalDecision,
        loadPairedDevice: @escaping () -> PairingPayload?,
        submitDecision: @escaping (ApprovalDecision, PairingPayload) async throws -> Void
    ) {
        self.loadPendingRequest = loadPendingRequest
        self.recordDecision = recordDecision
        self.loadPairedDevice = loadPairedDevice
        self.submitDecision = submitDecision
    }

    func decide(
        requestId: String,
        action: ApprovalDecision.Action,
        decidedAt: Date = Date()
    ) async throws -> ApprovalDecisionHandlingResult {
        let pendingRequest = loadPendingRequest(decidedAt)
        guard let pendingRequest, pendingRequest.id == requestId else {
            throw ApprovalStoreError.missingPendingRequest
        }

        let decision = try ApprovalDecision(
            schemaVersion: 1,
            requestId: requestId,
            action: action,
            decidedAt: decidedAt
        ).validated()

        if pendingRequest.isLocalUIFixture {
            let recorded = try recordDecision(requestId, action, decidedAt, true)
            return .recordedLocal(recorded)
        }

        guard let pairedDevice = loadPairedDevice() else {
            throw ApprovalStoreError.macRequestNeedsPairedMac
        }

        try await submitDecision(decision, pairedDevice)
        let recorded = try recordDecision(requestId, action, decidedAt, false)
        return .sentToMac(recorded)
    }
}
