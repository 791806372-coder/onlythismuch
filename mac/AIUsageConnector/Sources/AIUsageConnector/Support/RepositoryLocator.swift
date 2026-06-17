import Foundation

struct RepositoryLocator {
    static func locate() throws -> URL {
        if let envRoot = ProcessInfo.processInfo.environment["AIUW_REPO_ROOT"] {
            let url = URL(fileURLWithPath: envRoot)
            if isRepoRoot(url) {
                return url
            }
        }

        let candidates = [
            URL(fileURLWithPath: FileManager.default.currentDirectoryPath),
            Bundle.main.bundleURL
        ]

        for candidate in candidates {
            if let root = firstRepoRoot(from: candidate) {
                return root
            }
        }

        throw ConnectorError.repositoryNotFound
    }

    private static func firstRepoRoot(from start: URL) -> URL? {
        var current = start.standardizedFileURL
        for _ in 0..<12 {
            if isRepoRoot(current) {
                return current
            }
            let parent = current.deletingLastPathComponent()
            if parent.path == current.path {
                return nil
            }
            current = parent
        }
        return nil
    }

    private static func isRepoRoot(_ url: URL) -> Bool {
        let packageJson = url.appendingPathComponent("package.json").path
        let connectorPackage = url.appendingPathComponent("connector/package.json").path
        return FileManager.default.fileExists(atPath: packageJson) &&
            FileManager.default.fileExists(atPath: connectorPackage)
    }
}
