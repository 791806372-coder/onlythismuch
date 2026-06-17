import Foundation

enum UsageDisplayMode: String, CaseIterable, Identifiable {
    case both
    case claude
    case codex

    static let storageKey = "usageDisplayMode"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .both:
            return AppText.bothProviders
        case .claude:
            return "Claude"
        case .codex:
            return "Codex"
        }
    }

    var providerIds: [String] {
        switch self {
        case .both:
            return ["claude", "codex"]
        case .claude:
            return ["claude"]
        case .codex:
            return ["codex"]
        }
    }
}
