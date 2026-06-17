import Foundation

struct ConnectorCommandClient {
    let repoRoot: URL

    init(repoRoot: URL) {
        self.repoRoot = repoRoot
    }

    func doctorLive() async throws -> ConnectorDoctor {
        let result = try await runNpmScript("connector:doctor:live")
        try requireSuccess(result, action: AppText.refreshFailed)
        return try decodeJSON(ConnectorDoctor.self, from: result.stdout)
    }

    func snapshot() async throws -> ConnectorSnapshot {
        let result = try await runNpmScript("connector:snapshot")
        try requireSuccess(result, action: AppText.snapshotFailed)
        return try decodeJSON(ConnectorSnapshot.self, from: result.stdout)
    }

    func installService() async throws {
        let result = try await runNpmScript("connector:service:install")
        try requireSuccess(result, action: AppText.installFailed)
    }

    func loadService() async throws {
        let result = try await runNpmScript("connector:service:load")
        try requireSuccess(result, action: AppText.startFailed)
    }

    func unloadService() async throws {
        let result = try await runNpmScript("connector:service:unload")
        try requireSuccess(result, action: AppText.stopFailed)
    }

    func rotatePairingPayload() async throws -> PairingPayload {
        let result = try await runNpmScript("pair:manual")
        try requireSuccess(result, action: AppText.pairingFailed)
        return try decodeJSON(PairingPayload.self, from: result.stdout)
    }

    func currentPairingPayload() async throws -> PairingPayload {
        let result = try await runNpmScript("pair:current:manual")
        try requireSuccess(result, action: AppText.pairingFailed)
        return try decodeJSON(PairingPayload.self, from: result.stdout)
    }

    private func runNpmScript(_ script: String) async throws -> CommandResult {
        try await runProcess(
            executable: URL(fileURLWithPath: "/usr/bin/env"),
            arguments: ["npm", "run", script],
            timeout: 20
        )
    }

    private func runProcess(
        executable: URL,
        arguments: [String],
        timeout: TimeInterval
    ) async throws -> CommandResult {
        return try await Task.detached(priority: .userInitiated) {
            let process = Process()
            process.executableURL = executable
            process.arguments = arguments
            process.currentDirectoryURL = repoRoot
            process.environment = environment()

            let stdoutPipe = Pipe()
            let stderrPipe = Pipe()
            process.standardOutput = stdoutPipe
            process.standardError = stderrPipe

            try process.run()

            let deadline = Date().addingTimeInterval(timeout)
            while process.isRunning && Date() < deadline {
                try await Task.sleep(nanoseconds: 50_000_000)
            }

            var timedOut = false
            if process.isRunning {
                timedOut = true
                process.terminate()
                try await Task.sleep(nanoseconds: 200_000_000)
                if process.isRunning {
                    process.interrupt()
                }
            } else {
                process.waitUntilExit()
            }

            let stdout = String(data: stdoutPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            var stderr = String(data: stderrPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            if timedOut {
                stderr = [stderr, "connector command timed out"].filter { !$0.isEmpty }.joined(separator: "\n")
            }

            return CommandResult(exitCode: timedOut ? 124 : process.terminationStatus, stdout: stdout, stderr: stderr)
        }.value
    }

    private func environment() -> [String: String] {
        var values = ProcessInfo.processInfo.environment
        let defaultPath = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        if let existingPath = values["PATH"], !existingPath.isEmpty {
            values["PATH"] = "\(defaultPath):\(existingPath)"
        } else {
            values["PATH"] = defaultPath
        }
        return values
    }

    private func requireSuccess(_ result: CommandResult, action: String) throws {
        guard result.exitCode == 0 else {
            let message = firstUsefulLine(result.combinedOutput) ?? "exit \(result.exitCode)"
            throw ConnectorError.commandFailed("\(action): \(message)")
        }
    }

    private func decodeJSON<T: Decodable>(_ type: T.Type, from text: String) throws -> T {
        guard let json = extractJSONObject(from: text) else {
            throw ConnectorError.jsonMissing(AppText.jsonMissing)
        }
        return try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    private func extractJSONObject(from text: String) -> String? {
        guard let start = text.firstIndex(of: "{"),
              let end = text.lastIndex(of: "}"),
              start <= end else {
            return nil
        }
        return String(text[start...end])
    }

    private func firstUsefulLine(_ text: String) -> String? {
        text
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { line in
                !line.isEmpty &&
                    !line.hasPrefix("> ") &&
                    !line.hasPrefix("npm ") &&
                    !line.hasPrefix("added ") &&
                    !line.hasPrefix("up to date")
            }
    }
}
