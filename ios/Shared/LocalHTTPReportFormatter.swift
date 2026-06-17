import Foundation

struct LocalHTTPReportFormatter {
    static func diagnosticText(report: LocalHTTPReport, label: String) -> String {
        var lines = ["\(label): \(summary(for: report))"]
        lines.append(contentsOf: report.attempts.enumerated().map { index, attempt in
            let status = attempt.httpStatus.map { "HTTP \($0)" } ?? safeMessage(attempt.message)
            return "\(attempt.succeeded ? "✓" : "×") 地址 \(index + 1) \(status)"
        })
        return lines.joined(separator: "\n")
    }

    private static func summary(for report: LocalHTTPReport) -> String {
        guard let winningHost = report.winningHost,
              let index = report.attempts.firstIndex(where: { $0.host == winningHost && $0.succeeded }) else {
            return "没摸到"
        }

        return "摸到第 \(index + 1) 个地址"
    }

    private static func safeMessage(_ message: String) -> String {
        let truncated = String(message.prefix(80))
        return containsUnsafeNetworkText(truncated) ? "诊断已脱敏" : truncated
    }

    private static func containsUnsafeNetworkText(_ text: String) -> Bool {
        let lowercased = text.lowercased()
        let forbiddenFragments = [
            "http://",
            "https://",
            "authorization",
            "bearer",
            "api_token",
            "apitoken",
            "cookie",
            "secret",
            "credential",
            "keychain",
            "transcript",
            "raw stdout",
            "raw stderr",
            "raw log",
            "raw output",
            "provider output"
        ]
        if forbiddenFragments.contains(where: { lowercased.contains($0) }) {
            return true
        }

        let forbiddenPatterns = [
            #"\b(?:\d{1,3}\.){3}\d{1,3}\b"#,
            #"(?i)\b(?:localhost|[a-z0-9][a-z0-9-]{0,62}(?:\.[a-z0-9][a-z0-9-]{0,62})+)\b"#
        ]
        return forbiddenPatterns.contains { pattern in
            text.range(of: pattern, options: .regularExpression) != nil
        }
    }
}
