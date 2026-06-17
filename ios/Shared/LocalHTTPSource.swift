import Foundation

struct LocalHTTPAttempt: Codable, Equatable, Identifiable {
    let host: String
    let path: String
    let succeeded: Bool
    let httpStatus: Int?
    let message: String

    var id: String {
        "\(path)|\(host)|\(httpStatus ?? -1)|\(succeeded)|\(message)"
    }
}

struct LocalHTTPReport: Codable, Equatable {
    let path: String
    let attemptedAt: Date
    let attempts: [LocalHTTPAttempt]
    let winningHost: String?

    var shortSummary: String {
        if let winningHost {
            let index = attempts.firstIndex { $0.host == winningHost }.map { $0 + 1 } ?? 1
            return "\(path) 摸到地址 \(index)"
        }

        return attempts.last?.message ?? "同 Wi-Fi 下没摸到 Mac"
    }
}

struct LocalHTTPResult<Value> {
    let value: Value
    let report: LocalHTTPReport
}

struct LocalHTTPFailure: LocalizedError {
    let report: LocalHTTPReport
    let message: String

    var errorDescription: String? {
        message
    }
}

struct LocalHTTPSource {
    private let session: URLSession
    private let requestTimeout: TimeInterval
    private let maxHostAttempts: Int?

    init(session: URLSession = .shared, requestTimeout: TimeInterval = 8, maxHostAttempts: Int? = nil) {
        self.session = session
        self.requestTimeout = requestTimeout
        self.maxHostAttempts = maxHostAttempts
    }

    func ping(_ payload: PairingPayload) async throws -> String {
        try await pingWithReport(payload).value
    }

    func snapshot(_ payload: PairingPayload) async throws -> AIUsageSnapshot {
        try await snapshotWithReport(payload).value
    }

    func approvalRequestWithReport(_ payload: PairingPayload) async throws -> LocalHTTPResult<ApprovalRequest?> {
        let result = try await request(path: "/v1/approval-request", payload: payload)
        do {
            let response = try JSONDecoder.aiUsageSnapshotDecoder.decode(ApprovalRequestResponse.self, from: result.value)
            guard response.ok else {
                throw LocalHTTPError.invalidResponse
            }
            return LocalHTTPResult(value: try response.request?.validated(), report: result.report)
        } catch {
            throw LocalHTTPFailure(report: result.report, message: "Mac 待批请求读不来")
        }
    }

    func submitApprovalDecisionWithReport(
        _ decision: ApprovalDecision,
        payload: PairingPayload
    ) async throws -> LocalHTTPResult<ApprovalDecisionResponse> {
        let body = try JSONEncoder.aiUsageSnapshotEncoder.encode(ApprovalDecisionSubmission(decision: decision))
        let result = try await request(
            path: "/v1/approval-decisions",
            payload: payload,
            method: "POST",
            body: body
        )
        do {
            let response = try JSONDecoder.aiUsageSnapshotDecoder.decode(ApprovalDecisionResponse.self, from: result.value)
            guard response.ok,
                  response.schemaVersion == 1,
                  response.requestId == decision.requestId,
                  response.action == decision.action else {
                throw LocalHTTPError.invalidResponse
            }
            return LocalHTTPResult(value: response, report: result.report)
        } catch {
            throw LocalHTTPFailure(report: result.report, message: "Mac 没收这票")
        }
    }

    func pingWithReport(_ payload: PairingPayload) async throws -> LocalHTTPResult<String> {
        let result = try await request(path: "/v1/ping", payload: payload)
        do {
            let response = try JSONDecoder().decode(PingResponse.self, from: result.value)
            guard response.ok else {
                throw LocalHTTPError.invalidResponse
            }
            guard response.deviceId == payload.deviceId else {
                throw LocalHTTPError.pairedDeviceMismatch
            }
            guard PrivacySafeText.isSafeDisplayText(response.name, max: 80) else {
                throw LocalHTTPError.invalidResponse
            }
            return LocalHTTPResult(value: response.name, report: result.report)
        } catch {
            throw LocalHTTPFailure(report: result.report, message: Self.validationFailureMessage(error, fallback: "Mac 回包解不开"))
        }
    }

    func snapshotWithReport(_ payload: PairingPayload) async throws -> LocalHTTPResult<AIUsageSnapshot> {
        let result = try await request(path: "/v1/snapshot", payload: payload)
        do {
            let snapshot = try AIUsageSnapshot.decodeValidated(from: result.value)
            guard snapshot.device.id == payload.deviceId else {
                throw LocalHTTPError.pairedDeviceMismatch
            }
            return LocalHTTPResult(value: snapshot, report: result.report)
        } catch {
            throw LocalHTTPFailure(report: result.report, message: Self.validationFailureMessage(error, fallback: "快照校验翻车了"))
        }
    }

    private func request(
        path: String,
        payload: PairingPayload,
        method: String = "GET",
        body: Data? = nil
    ) async throws -> LocalHTTPResult<Data> {
        var attempts: [LocalHTTPAttempt] = []
        let attemptedAt = Date()

        let hosts = maxHostAttempts.map { Array(payload.hosts.prefix(max(1, $0))) } ?? payload.hosts
        for host in hosts {
            var components = URLComponents()
            components.scheme = "http"
            components.host = host
            components.port = payload.port
            components.path = path

            guard let url = components.url else {
                attempts.append(LocalHTTPAttempt(
                    host: host,
                    path: path,
                    succeeded: false,
                    httpStatus: nil,
                    message: "地址拼不起来"
                ))
                continue
            }

            var request = URLRequest(url: url)
            request.httpMethod = method
            request.timeoutInterval = requestTimeout
            request.setValue("Bearer \(payload.token)", forHTTPHeaderField: "Authorization")
            if let body {
                request.httpBody = body
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            }

            do {
                let (data, response) = try await session.data(for: request)
                guard let http = response as? HTTPURLResponse else {
                    throw LocalHTTPError.invalidResponse
                }
                guard http.statusCode == 200 else {
                    throw LocalHTTPError.httpStatus(http.statusCode)
                }
                attempts.append(LocalHTTPAttempt(
                    host: host,
                    path: path,
                    succeeded: true,
                    httpStatus: http.statusCode,
                    message: "OK"
                ))
                return LocalHTTPResult(
                    value: data,
                    report: LocalHTTPReport(
                        path: path,
                        attemptedAt: attemptedAt,
                        attempts: attempts,
                        winningHost: host
                    )
                )
            } catch {
                attempts.append(LocalHTTPAttempt(
                    host: host,
                    path: path,
                    succeeded: false,
                    httpStatus: (error as? LocalHTTPError)?.statusCode,
                    message: Self.safeErrorDescription(error)
                ))
            }
        }

        let report = LocalHTTPReport(
            path: path,
            attemptedAt: attemptedAt,
            attempts: attempts,
            winningHost: nil
        )
        throw LocalHTTPFailure(
            report: report,
            message: attempts.last?.message ?? LocalHTTPError.noReachableHost.localizedDescription
        )
    }

    private static func safeErrorDescription(_ error: Error) -> String {
        if let localHTTPError = error as? LocalHTTPError {
            return localHTTPError.localizedDescription
        }

        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain {
            let code = URLError.Code(rawValue: nsError.code)
            switch code {
            case .timedOut:
                return "Mac 摸太久没回"
            case .cancelled:
                return "连接取消了"
            default:
                return "同 Wi-Fi 下没摸到 Mac"
            }
        }

        return "同 Wi-Fi 下没摸到 Mac"
    }

    private static func validationFailureMessage(_ error: Error, fallback: String) -> String {
        if let localHTTPError = error as? LocalHTTPError {
            switch localHTTPError {
            case .pairedDeviceMismatch:
                return localHTTPError.localizedDescription
            case .invalidResponse, .httpStatus, .noReachableHost:
                break
            }
        }

        return fallback
    }
}

private struct PingResponse: Codable {
    let ok: Bool
    let deviceId: String
    let name: String
}

struct ApprovalDecisionResponse: Codable, Equatable {
    let ok: Bool
    let schemaVersion: Int
    let requestId: String
    let action: ApprovalDecision.Action
    let decidedAt: Date
}

struct ApprovalRequestResponse: Codable, Equatable {
    let ok: Bool
    let request: ApprovalRequest?
}

enum LocalHTTPError: LocalizedError {
    case invalidResponse
    case httpStatus(Int)
    case noReachableHost
    case pairedDeviceMismatch

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Mac 回得不像人话"
        case .httpStatus(let code):
            return "Mac 接口又演了：\(code)"
        case .noReachableHost:
            return "同 Wi-Fi 下没摸到 Mac"
        case .pairedDeviceMismatch:
            return "配对 Mac 身份对不上"
        }
    }

    var statusCode: Int? {
        switch self {
        case .httpStatus(let code):
            return code
        case .invalidResponse, .noReachableHost, .pairedDeviceMismatch:
            return nil
        }
    }
}
