import Foundation

enum PrivacySafeText {
    private static let unsafePattern = #"""
    (?ix)
    [A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}
    | https?://
    | [a-z][a-z0-9+.-]*://
    | \b(?:localhost|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.local)\b
    | \b(?:\d{1,3}\.){3}\d{1,3}\b
    | \b(?:api[_-]?token|authorization|bearer|cookie|secret|credential|keychain|transcript|raw\s+(?:stdout|stderr|log|output)|provider\s+output|token)\b
    """#

    static func isSafeDisplayText(_ value: String, max: Int, allowEmpty: Bool = false) -> Bool {
        if !allowEmpty && value.isEmpty {
            return false
        }
        guard value.count <= max else {
            return false
        }
        return value.range(of: unsafePattern, options: [.regularExpression, .caseInsensitive]) == nil
    }
}
