import Foundation

enum AppLanguageOption: String, CaseIterable, Identifiable {
    case english
    case simplifiedChinese
    case traditionalChinese
    case spanish
    case portuguese
    case japanese

    static let storageKey = "appLanguageOption"

    var id: String { rawValue }

    static func systemPreferredOption(preferredLanguages: [String] = Locale.preferredLanguages) -> AppLanguageOption {
        for language in preferredLanguages {
            let normalized = language.replacingOccurrences(of: "_", with: "-").lowercased()
            if normalized.hasPrefix("zh-hant") ||
                normalized.contains("-tw") ||
                normalized.contains("-hk") ||
                normalized.contains("-mo") {
                return .traditionalChinese
            }
            if normalized.hasPrefix("zh") {
                return .simplifiedChinese
            }
            if normalized.hasPrefix("es") {
                return .spanish
            }
            if normalized.hasPrefix("pt") {
                return .portuguese
            }
            if normalized.hasPrefix("ja") {
                return .japanese
            }
            if normalized.hasPrefix("en") {
                return .english
            }
        }
        return .english
    }

    var title: String {
        switch self {
        case .english:
            return "English"
        case .simplifiedChinese:
            return "简体中文"
        case .traditionalChinese:
            return "繁體中文"
        case .spanish:
            return "Español"
        case .portuguese:
            return "Português"
        case .japanese:
            return "日本語"
        }
    }
}
