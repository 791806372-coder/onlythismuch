import AppKit
import SwiftUI

private enum ConnectorUsageTheme {
    static let panelBackground = Color(red: 0.105, green: 0.105, blue: 0.115)
    static let insetBackground = Color(red: 0.145, green: 0.145, blue: 0.155)
    static let rail = Color(red: 0.25, green: 0.25, blue: 0.27)
    static let muted = Color(red: 0.58, green: 0.58, blue: 0.61)
    static let border = Color.white.opacity(0.10)
    static let claude = Color(red: 0.91, green: 0.58, blue: 0.42)
    static let codex = Color(red: 16.0 / 255.0, green: 163.0 / 255.0, blue: 127.0 / 255.0)

    static func providerColor(_ providerID: String) -> Color {
        providerID == "codex" ? codex : claude
    }

    static func meterColor(_ percent: Int) -> Color {
        switch percent {
        case 60...100:
            return .green
        case 30..<60:
            return .orange
        default:
            return .red
        }
    }
}

struct ConnectorRefreshActivityIcon: View {
    let isRefreshing: Bool
    var compact = false

    var body: some View {
        ZStack {
            if isRefreshing {
                ProgressView()
                    .controlSize(.small)
            } else {
                Image(systemName: "arrow.clockwise")
            }
        }
        .frame(width: compact ? 16 : 18, height: compact ? 16 : 18)
        .animation(.easeInOut(duration: 0.18), value: isRefreshing)
    }
}

private enum ConnectorDateParser {
    static func isoDate(_ rawValue: String?) -> Date? {
        guard let rawValue else {
            return nil
        }

        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: rawValue) {
            return date
        }
        return ISO8601DateFormatter().date(from: rawValue)
    }
}

struct UsageSnapshotPanel: View {
    let snapshot: ConnectorSnapshot?
    let usageError: String?
    var displayMode: UsageDisplayMode = .both
    var compact = false

    private var providers: [SnapshotProvider] {
        guard let snapshot else {
            return []
        }
        return displayMode.providerIds.compactMap { providerId in
            snapshot.providers.first(where: { $0.id == providerId })
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 10 : 14) {
            if snapshot != nil {
                if compact, providers.count > 1 {
                    HStack(alignment: .top, spacing: 10) {
                        ForEach(providers) { provider in
                            UsageProviderCard(provider: provider, compact: true)
                        }
                    }
                } else {
                    ForEach(providers) { provider in
                        UsageProviderCard(provider: provider, compact: compact)
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text(AppText.noUsageYet)
                        .font(compact ? .headline : .title3.bold())
                    if let usageError {
                        Text(usageError)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(compact ? 12 : 16)
                .background(ConnectorUsageTheme.insetBackground, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .foregroundStyle(.white)
            }
        }
    }
}

struct UsageProviderCard: View {
    let provider: SnapshotProvider
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 8 : 10) {
            HStack(spacing: 8) {
                Circle()
                    .fill(provider.connected ? Color.green : Color.secondary)
                    .frame(width: 8, height: 8)
                Text(provider.displayName)
                    .font(compact ? .headline : .title3.bold())
                    .foregroundStyle(ConnectorUsageTheme.providerColor(provider.id))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Spacer()
                Text(provider.connected ? providerHealthText : AppText.connectorOffline)
                    .font(.caption)
                    .foregroundStyle(ConnectorUsageTheme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }

            if provider.usage.available,
               let fiveHour = provider.usage.fiveHourRemainingPercent,
               let weekly = provider.usage.weeklyRemainingPercent {
                usageRow(title: "5h", percent: fiveHour, resetAt: provider.usage.fiveHourResetAt)
                usageRow(title: AppText.weekLabel, percent: weekly, resetAt: provider.usage.weeklyResetAt)
            } else {
                Text(unavailableText)
                    .font(compact ? .callout.bold() : .headline)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                if let version = provider.version {
                    Text("v\(version)")
                        .font(.caption)
                        .foregroundStyle(ConnectorUsageTheme.muted)
                }
            }
        }
        .padding(compact ? 12 : 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(compact ? Color.clear : ConnectorUsageTheme.insetBackground, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(compact ? Color.clear : ConnectorUsageTheme.border)
        )
    }

    private var unavailableText: String {
        switch provider.usage.reason {
        case "third_party_no_quota":
            return AppText.noAllowanceMeter
        default:
            return AppText.usageUnknown
        }
    }

    private var providerHealthText: String {
        switch provider.health.lowercased() {
        case "working":
            return AppText.providerWorking
        case "degraded":
            return AppText.providerDegraded
        default:
            return provider.health
        }
    }

    private func usageRow(title: String, percent: Int, resetAt: String?) -> some View {
        let clampedPercent = min(max(percent, 0), 100)

        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title)
                    .foregroundStyle(ConnectorUsageTheme.muted)
                Spacer()
                Text("\(clampedPercent)%")
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
            }
            .font(.callout.monospacedDigit())

            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(ConnectorUsageTheme.rail)
                    Capsule()
                        .fill(ConnectorUsageTheme.meterColor(clampedPercent))
                        .frame(width: proxy.size.width * CGFloat(clampedPercent) / 100)
                }
            }
            .frame(height: 8)

            if let caption = resetCaption(resetAt) {
                Text(caption)
                    .font(.caption)
                    .foregroundStyle(ConnectorUsageTheme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
        }
    }

    private func resetCaption(_ rawValue: String?) -> String? {
        guard let rawValue else {
            return nil
        }
        guard let date = ConnectorDateParser.isoDate(rawValue) else {
            return rawValue
        }
        return AppText.resetCaption(date)
    }
}

struct DesktopUsageWidgetView: View {
    @ObservedObject var store: ConnectorStore
    @AppStorage(UsageDisplayMode.storageKey) private var displayModeRaw = UsageDisplayMode.both.rawValue
    @AppStorage(AppLanguageOption.storageKey) private var selectedLanguage = AppLanguageOption.systemPreferredOption().rawValue

    private var displayMode: UsageDisplayMode {
        UsageDisplayMode(rawValue: displayModeRaw) ?? .both
    }

    private var providers: [SnapshotProvider] {
        guard let snapshot = store.snapshot else {
            return []
        }
        return displayMode.providerIds.compactMap { providerId in
            snapshot.providers.first(where: { $0.id == providerId })
        }
    }

    var body: some View {
        let isDualMode = providers.count > 1

        return VStack(alignment: .leading, spacing: isDualMode ? 8 : 10) {
            desktopHeader

            if let snapshot = store.snapshot, !providers.isEmpty {
                providerContent(snapshot: snapshot, isDualMode: isDualMode)
            } else {
                DesktopWidgetEmptyState(error: store.usageError)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, isDualMode ? 14 : 15)
        .padding(.bottom, isDualMode ? 13 : 12)
        .frame(width: 390, alignment: .topLeading)
        .foregroundStyle(.white)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color(red: 0.105, green: 0.105, blue: 0.115))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.white.opacity(0.10))
        )
        .padding(6)
        .environment(\.colorScheme, .dark)
        .background(FloatingWindowConfigurator())
        .id(selectedLanguage)
        .task {
            await store.refreshUsage()
        }
    }

    private var desktopHeader: some View {
        HStack(spacing: 8) {
            Text(AppText.widgetHeader)
                .font(.system(size: 16, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.70)
                .allowsTightening(true)
                .truncationMode(.tail)
                .layoutPriority(6)

            Spacer(minLength: 6)

            DesktopWidgetRefreshButton(
                isRefreshing: isRefreshing,
                isDisabled: store.isBusy
            ) {
                await store.refreshUsage()
            }
            .offset(y: 1)
        }
    }

    @ViewBuilder
    private func providerContent(snapshot: ConnectorSnapshot, isDualMode: Bool) -> some View {
        if isDualMode {
            HStack(alignment: .top, spacing: 14) {
                DesktopWidgetProviderColumn(
                    provider: providers[0],
                    snapshot: snapshot,
                    now: Date(),
                    statusLine: nil,
                    compact: true
                )

                Rectangle()
                    .fill(Color(red: 0.23, green: 0.23, blue: 0.24))
                    .frame(width: 1, height: 90)

                DesktopWidgetProviderColumn(
                    provider: providers[1],
                    snapshot: snapshot,
                    now: Date(),
                    statusLine: nil,
                    compact: true
                )
            }
        } else if let provider = providers.first {
            DesktopWidgetProviderColumn(
                provider: provider,
                snapshot: snapshot,
                now: Date(),
                statusLine: widgetStatusLine(for: snapshot),
                compact: false
            )
        }
    }

    private var isRefreshing: Bool {
        store.isBusy && store.lastAction == .refresh
    }

    private func widgetStatusLine(for snapshot: ConnectorSnapshot) -> String {
        if isRefreshing {
            return AppText.widgetRefreshLoading
        }

        guard snapshot.device.online else {
            return AppText.connectorOffline
        }

        guard let updatedAt = ConnectorDateParser.isoDate(snapshot.device.updatedAt) else {
            return AppText.providerWorking
        }

        return AppText.touchStatusCaption(from: updatedAt)
    }
}

private struct DesktopWidgetRefreshButton: View {
    let isRefreshing: Bool
    let isDisabled: Bool
    let action: () async -> Void

    var body: some View {
        Button {
            Task { await action() }
        } label: {
            ZStack {
                ConnectorRefreshActivityIcon(isRefreshing: isRefreshing, compact: true)
            }
            .frame(width: 44, height: 28)
            .background(
                Capsule()
                    .fill(Color(red: 0.30, green: 0.30, blue: 0.32).opacity(0.78))
            )
            .overlay(
                Capsule()
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .accessibilityLabel(AppText.refresh)
    }
}

private struct DesktopWidgetEmptyState: View {
    let error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(AppText.noUsageYet)
                .font(.system(size: 14, weight: .semibold))
            if let error {
                Text(error)
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(ConnectorUsageTheme.muted)
                    .lineLimit(2)
                    .minimumScaleFactor(0.75)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 112, alignment: .topLeading)
        .padding(12)
        .background(ConnectorUsageTheme.insetBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(ConnectorUsageTheme.border)
        )
    }
}

private struct DesktopWidgetProviderColumn: View {
    let provider: SnapshotProvider
    let snapshot: ConnectorSnapshot
    let now: Date
    let statusLine: String?
    let compact: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 5 : 7) {
            HStack(alignment: .center, spacing: 8) {
                DesktopWidgetProviderPill(provider: provider, compact: compact)

                if let statusLine {
                    Text(statusLine)
                        .font(.system(size: compact ? 10 : 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(ConnectorUsageTheme.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.62)
                        .allowsTightening(true)
                        .truncationMode(.tail)
                        .layoutPriority(1)
                }

                Spacer(minLength: 4)
            }

            if provider.usage.available,
               provider.usage.source != nil,
               provider.capturedAt != nil {
                DesktopWidgetUsageMeter(
                    title: "5h",
                    percent: provider.usage.fiveHourRemainingPercent,
                    resetAt: provider.usage.fiveHourResetAt,
                    snapshotUpdatedAt: snapshot.device.updatedAt,
                    providerCapturedAt: provider.capturedAt,
                    now: now,
                    compact: compact
                )
                DesktopWidgetUsageMeter(
                    title: AppText.weekLabel,
                    percent: provider.usage.weeklyRemainingPercent,
                    resetAt: provider.usage.weeklyResetAt,
                    snapshotUpdatedAt: snapshot.device.updatedAt,
                    providerCapturedAt: provider.capturedAt,
                    now: now,
                    compact: compact
                )
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Text(unavailableTitle)
                        .font(.system(size: compact ? 12 : 13, weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    Text(provider.connected ? AppText.providerDegraded : AppText.connectorOffline)
                        .font(.system(size: compact ? 10 : 11))
                        .foregroundStyle(ConnectorUsageTheme.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var unavailableTitle: String {
        switch provider.usage.reason {
        case "third_party_no_quota":
            return AppText.noAllowanceMeter
        default:
            return AppText.usageUnknown
        }
    }
}

private struct DesktopWidgetProviderPill: View {
    let provider: SnapshotProvider
    let compact: Bool

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(provider.connected ? providerColor : ConnectorUsageTheme.muted)
                .frame(width: compact ? 4 : 5, height: compact ? 4 : 5)
            Text(provider.displayName)
                .font(.system(size: compact ? 14 : 15, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
                .fixedSize(horizontal: true, vertical: false)
        }
        .foregroundStyle(providerColor)
        .padding(.horizontal, compact ? 7 : 8)
        .frame(height: compact ? 24 : 28)
        .background(Capsule().fill(providerColor.opacity(0.14)))
        .overlay(Capsule().stroke(providerColor.opacity(0.34), lineWidth: 1))
        .fixedSize(horizontal: true, vertical: false)
    }

    private var providerColor: Color {
        ConnectorUsageTheme.providerColor(provider.id)
    }
}

private struct DesktopWidgetUsageMeter: View {
    let title: String
    let percent: Int?
    let resetAt: String?
    let snapshotUpdatedAt: String
    let providerCapturedAt: String?
    let now: Date
    let compact: Bool

    private var clampedPercent: Int {
        min(max(percent ?? 0, 0), 100)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 2 : 3) {
            HStack(spacing: 6) {
                Text(title)
                    .foregroundStyle(ConnectorUsageTheme.muted)
                Spacer()
                Text(percent.map { "\($0)%" } ?? "--")
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
            }
            .font(.system(size: compact ? 12 : 13).monospacedDigit())

            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(ConnectorUsageTheme.rail)
                    Capsule()
                        .fill(ConnectorUsageTheme.meterColor(clampedPercent))
                        .frame(width: proxy.size.width * CGFloat(clampedPercent) / 100)
                }
            }
            .frame(height: compact ? 7 : 8)

            Text(caption)
                .font(.system(size: compact ? 9.5 : 10.5))
                .foregroundStyle(ConnectorUsageTheme.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.70)
        }
    }

    private var caption: String {
        if isStale {
            return AppText.oldRecordWarning
        }

        if isLastKnownFallback {
            return AppText.lastKnownFallback
        }

        guard let resetDate = ConnectorDateParser.isoDate(resetAt) else {
            return AppText.usageUnknown
        }

        return AppText.resetCaption(resetDate)
    }

    private var isStale: Bool {
        guard let snapshotDate = ConnectorDateParser.isoDate(snapshotUpdatedAt) else {
            return false
        }

        if now.timeIntervalSince(snapshotDate) > 3 * 60 * 60 {
            return true
        }

        guard let capturedDate = ConnectorDateParser.isoDate(providerCapturedAt) else {
            return false
        }

        return snapshotDate.timeIntervalSince(capturedDate) > 3 * 60 * 60 ||
            now.timeIntervalSince(capturedDate) > 3 * 60 * 60
    }

    private var isLastKnownFallback: Bool {
        guard let snapshotDate = ConnectorDateParser.isoDate(snapshotUpdatedAt),
              let capturedDate = ConnectorDateParser.isoDate(providerCapturedAt) else {
            return false
        }

        return snapshotDate.timeIntervalSince(capturedDate) > 5 * 60
    }
}

private struct FloatingWindowConfigurator: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            configure(view.window)
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async {
            configure(nsView.window)
        }
    }

    private func configure(_ window: NSWindow?) {
        guard let window else {
            return
        }
        window.level = .floating
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isOpaque = false
        window.backgroundColor = .clear
        window.isMovableByWindowBackground = true
        window.collectionBehavior.insert(.canJoinAllSpaces)
        window.collectionBehavior.insert(.fullScreenAuxiliary)
    }
}
