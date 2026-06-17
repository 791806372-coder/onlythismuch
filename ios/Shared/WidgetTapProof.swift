import Foundation

enum WidgetRefreshDeepLink {
    static let scheme = "aiusage"
    static let refreshHost = "refresh"

    static func isRefreshURL(_ url: URL) -> Bool {
        url.scheme?.lowercased() == scheme &&
            url.host?.lowercased() == refreshHost
    }
}

enum WidgetTapProofText {
    static let initial = "Proof 07 · 还没从 Widget 打开"

    static func openedWithoutPairing(at date: Date = Date()) -> String {
        "Proof 07 · \(timestamp(date)) Widget 打开了 App，未配 Mac"
    }

    static func openedRefreshing(at date: Date = Date()) -> String {
        "Proof 07 · \(timestamp(date)) Widget 打开了 App，正在刷新"
    }

    static func openedRefreshed(at date: Date = Date()) -> String {
        "Proof 07 · \(timestamp(date)) Widget 叫醒成功"
    }

    static func openedRefreshFailed(at date: Date = Date()) -> String {
        "Proof 07 · \(timestamp(date)) Widget 叫了，但 Mac 装睡"
    }

    private static func timestamp(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: date)
    }
}

enum LocalNetworkPermissionHint {
    static let message = "Proof 10 · 第一次 LAN 失败时，去 设置 > AI Usage 确认 Local Network 已开"

    static func text(for report: LocalHTTPReport) -> String {
        guard !report.attempts.isEmpty,
              report.attempts.allSatisfy({ !$0.succeeded && $0.httpStatus == nil }) else {
            return ""
        }

        return message
    }
}
