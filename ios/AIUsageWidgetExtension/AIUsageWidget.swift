import WidgetKit
import SwiftUI
import AppIntents

enum WidgetProviderSelection: String, AppEnum {
    case both
    case claude
    case codex

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "intent.provider.type")
    static var caseDisplayRepresentations: [WidgetProviderSelection: DisplayRepresentation] = [
        .both: DisplayRepresentation(title: "intent.provider.both"),
        .claude: "Claude",
        .codex: "Codex"
    ]

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

enum WidgetProviderOrder: String {
    case claudeFirst
    case codexFirst

    var providerIds: [String] {
        switch self {
        case .claudeFirst:
            return ["claude", "codex"]
        case .codexFirst:
            return ["codex", "claude"]
        }
    }

    var toggled: WidgetProviderOrder {
        self == .claudeFirst ? .codexFirst : .claudeFirst
    }
}

struct AIUsageWidgetConfigurationIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "AI Usage"
    static var description = IntentDescription("intent.configuration.description")

    @Parameter(title: "intent.provider.parameter")
    var provider: WidgetProviderSelection?

    init() {
        provider = .both
    }

    init(provider: WidgetProviderSelection) {
        self.provider = provider
    }
}

struct AIUsageEntry: TimelineEntry {
    let date: Date
    let snapshot: AIUsageSnapshot
    let appGroupProof: String
    let appGroupProofMode: Bool
    let isPreviewFallback: Bool
    let cacheSavedAt: Date?
    let cacheSource: String?
    let approvalRequest: ApprovalRequest?
    let selectedProvider: WidgetProviderSelection
    let providerOrder: WidgetProviderOrder
    let isRefreshInProgress: Bool
    let isRefreshJustCompleted: Bool
    let refreshStatus: WidgetRefreshStatus
    let language: AppLanguageOption
}

enum WidgetRefreshStatus {
    case none
    case success
    case failure
    case timeout
}

private struct WidgetText {
    let language: AppLanguageOption

    func localized(
        english: String,
        simplified: String,
        traditional: String,
        spanish: String,
        portuguese: String? = nil,
        japanese: String? = nil
    ) -> String {
        switch language {
        case .english:
            return english
        case .simplifiedChinese:
            return simplified
        case .traditionalChinese:
            return traditional
        case .spanish:
            return spanish
        case .portuguese:
            return portuguese ?? english
        case .japanese:
            return japanese ?? english
        }
    }

    var loading: String {
        localized(
            english: "Poking your Mac...🫳",
            simplified: "正在抚摸你的 Mac...🫳",
            traditional: "正在撫摸你的 Mac...🫳",
            spanish: "Tocando tu Mac...🫳",
            portuguese: "Tocando seu Mac...🫳",
            japanese: "君のMacをなでてます...🫳"
        )
    }
    var success: String {
        localized(
            english: "Touched Mac · hot😏",
            simplified: "刚摸完，很润😏",
            traditional: "剛摸完，很潤😏",
            spanish: "Mac tocado · caliente😏",
            portuguese: "Mac tocado · quente😏",
            japanese: "なでたて、しっとり😏"
        )
    }
    var failure: String {
        localized(
            english: "Mac is pretending to sleep💤",
            simplified: "Mac 装睡了💤",
            traditional: "Mac 裝睡了💤",
            spanish: "Mac finge dormir💤",
            portuguese: "Mac fingindo sono💤",
            japanese: "Macが寝たふりしてる💤"
        )
    }
    var timeout: String {
        localized(
            english: "My hand got tired🫠",
            simplified: "手都伸酸了🫠",
            traditional: "手都伸酸了🫠",
            spanish: "Ya se cansó la mano🫠",
            portuguese: "A mão já cansou🫠",
            japanese: "手がもう限界🫠"
        )
    }
    var header: String {
        localized(
            english: "Fine, here's only this much 🤏",
            simplified: "别问了 还剩这么点 🤏",
            traditional: "別問了 還剩這麼點 🤏",
            spanish: "Vale, solo queda esto 🤏",
            portuguese: "Tá, só sobrou isso 🤏",
            japanese: "はいはい、残りはこれっぽっち🤏"
        )
    }
    var headerCore: String {
        localized(
            english: "Fine, here's only this much",
            simplified: "别问了 还剩这么点",
            traditional: "別問了 還剩這麼點",
            spanish: "Vale, solo queda esto",
            portuguese: "Tá, só sobrou isso",
            japanese: "はいはい、残りはこれっぽっち"
        )
    }
    var headerEmoji: String {
        "🤏"
    }
    var compactHeader: String {
        localized(
            english: "Only this much 🤏",
            simplified: "还剩这么点 🤏",
            traditional: "還剩這麼點 🤏",
            spanish: "Solo queda esto 🤏",
            portuguese: "Só sobrou isso 🤏",
            japanese: "残りはこれっぽっち🤏"
        )
    }
    var compactHeaderCore: String {
        localized(
            english: "Only this much",
            simplified: "还剩这么点",
            traditional: "還剩這麼點",
            spanish: "Solo queda esto",
            portuguese: "Só sobrou isso",
            japanese: "残りはこれっぽっち"
        )
    }
    var noCache: String {
        localized(english: "No cache😏", simplified: "没缓存😏", traditional: "沒快取😏", spanish: "Sin caché😏", portuguese: "Sem cache😏", japanese: "キャッシュなし😏")
    }
    var preview: String {
        localized(english: "Preview fixture", simplified: "预览 fixture", traditional: "預覽 fixture", spanish: "Fixture preview", portuguese: "Fixture preview", japanese: "プレビュー fixture")
    }
    var appGroupFailed: String {
        localized(english: "App Group failed", simplified: "App Group 翻车", traditional: "App Group 翻車", spanish: "App Group falló", portuguese: "App Group tropeçou", japanese: "App Group が転んだ")
    }
    var lastPrefix: String {
        localized(english: "last", simplified: "最后", traditional: "最後", spanish: "último", portuguese: "último", japanese: "最後")
    }
    var weekLabel: String {
        localized(english: "wk", simplified: "周", traditional: "週", spanish: "sem", portuguese: "sem", japanese: "週")
    }
    var noMeterTitle: String {
        localized(english: "No meter😏", simplified: "无表可看😏", traditional: "無表可看😏", spanish: "Sin medidor😏", portuguese: "Sem medidor😏", japanese: "メーターなし😏")
    }
    var noMeterSubtitle: String {
        localized(english: "wild route😏", simplified: "走的野路子😏", traditional: "走野路子😏", spanish: "ruta silvestre😏", portuguese: "rota selvagem😏", japanese: "野良ルート😏")
    }
    var noLedgerSubtitle: String {
        localized(english: "no usage ledger", simplified: "没用量账本", traditional: "沒用量帳本", spanish: "sin libreta de uso", portuguese: "sem livro de uso", japanese: "使用帳なし")
    }
    var notLoggedInTitle: String {
        localized(english: "Not logged in and still asking?😒", simplified: "没登录还想看？😒", traditional: "沒登入還想看？😒", spanish: "¿Ni iniciaste sesión y preguntas?😒", portuguese: "Nem logou e ainda pergunta?😒", japanese: "ログインもせずに見たいの？😒")
    }
    var loginOnMacSubtitle: String {
        localized(english: "log in on the Mac", simplified: "去 Mac 上登录", traditional: "去 Mac 上登入", spanish: "inicia sesión en el Mac", portuguese: "faz login no Mac", japanese: "Macでログインして")
    }
    var collectorErrorTitle: String {
        localized(english: "Probe face-planted🤡", simplified: "探测翻车了🤡", traditional: "探測翻車了🤡", spanish: "La sonda se estampó🤡", portuguese: "A sonda caiu de cara🤡", japanese: "探測が転んだ🤡")
    }
    var apiActingSubtitle: String {
        localized(english: "API is acting again", simplified: "接口又演了", traditional: "接口又演了", spanish: "la API anda actuando", portuguese: "a API tá atuando de novo", japanese: "APIがまた芝居中")
    }
    var probeBlameSubtitle: String {
        localized(english: "blame the probe", simplified: "又是探测的锅", traditional: "又是探測的鍋", spanish: "culpa de la sonda", portuguese: "culpa da sonda", japanese: "また探測のせい")
    }
    var usageMysteryTitle: String {
        localized(english: "Usage is playing mystery🙄", simplified: "用量装神秘🙄", traditional: "用量裝神秘🙄", spanish: "El uso se hace el misterioso🙄", portuguese: "O uso está se fazendo de mistério🙄", japanese: "使用状況が謎ぶってる🙄")
    }
    var officialHidingSubtitle: String {
        localized(english: "officially hidden again", simplified: "官方又藏了", traditional: "官方又藏了", spanish: "oficialmente escondido otra vez", portuguese: "oficialmente escondido de novo", japanese: "公式がまた隠した")
    }
    var wontShowSubtitle: String {
        localized(english: "not showing it", simplified: "就不给看", traditional: "就是不給看", spanish: "no lo suelta", portuguese: "não solta nada", japanese: "見せる気なし")
    }
    var oldRecordWarning: String {
        localized(english: "Old record, don't trust it too much🧊", simplified: "旧账别太信🧊", traditional: "舊帳別太信🧊", spanish: "Cuenta vieja, no te fíes tanto🧊", portuguese: "Registro velho, não confia demais🧊", japanese: "古い記録、信じすぎ注意🧊")
    }
    var lastKnownFallback: String {
        localized(english: "Missed it, showing old record🧊", simplified: "刚没抓到，先看旧账🧊", traditional: "剛沒抓到，先看舊帳🧊", spanish: "No lo pilló, va la cuenta vieja🧊", portuguese: "Não pegou, vai o registro velho🧊", japanese: "捕まえ損ねたから古い記録🧊")
    }
    var localeIdentifier: String {
        switch language {
        case .english:
            return "en_US"
        case .simplifiedChinese:
            return "zh_CN"
        case .traditionalChinese:
            return "zh_Hant"
        case .spanish:
            return "es_ES"
        case .portuguese:
            return "pt_BR"
        case .japanese:
            return "ja_JP"
        }
    }
    func resetCaption(_ resetAt: Date, referenceDate: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: localeIdentifier)
        formatter.dateFormat = Calendar.current.isDate(resetAt, inSameDayAs: referenceDate) ? "HH:mm" : monthDayFormat
        let dateText = formatter.string(from: resetAt)
        switch language {
        case .english:
            return "resets \(dateText)"
        case .simplifiedChinese:
            return "\(dateText) 恢复"
        case .traditionalChinese:
            return "\(dateText) 恢復"
        case .spanish:
            return "reinicia \(dateText)"
        case .portuguese:
            return "reinicia \(dateText)"
        case .japanese:
            return "\(dateText) リセット"
        }
    }
    private var monthDayFormat: String {
        switch language {
        case .english:
            return "MMM d"
        case .simplifiedChinese, .traditionalChinese:
            return "M月d日"
        case .spanish, .portuguese:
            return "d MMM"
        case .japanese:
            return "M/d"
        }
    }
}

private extension AIUsageEntry {
    func withRefreshState(
        date: Date,
        inProgress: Bool,
        justCompleted: Bool,
        refreshStatus: WidgetRefreshStatus
    ) -> AIUsageEntry {
        AIUsageEntry(
            date: date,
            snapshot: snapshot,
            appGroupProof: appGroupProof,
            appGroupProofMode: appGroupProofMode,
            isPreviewFallback: isPreviewFallback,
            cacheSavedAt: cacheSavedAt,
            cacheSource: cacheSource,
            approvalRequest: approvalRequest,
            selectedProvider: selectedProvider,
            providerOrder: providerOrder,
            isRefreshInProgress: inProgress,
            isRefreshJustCompleted: justCompleted,
            refreshStatus: refreshStatus,
            language: language
        )
    }
}

struct AIUsageTimelineProvider: AppIntentTimelineProvider {
    private let store = SnapshotStore()
    private let approvalStore = ApprovalStore()
    private let refreshCoordinator = WidgetRefreshCoordinator()

    func placeholder(in context: Context) -> AIUsageEntry {
        AIUsageEntry(
            date: Date(),
            snapshot: PreviewSnapshots.noCacheFallback,
            appGroupProof: "Proof --:--:--",
            appGroupProofMode: true,
            isPreviewFallback: true,
            cacheSavedAt: nil,
            cacheSource: "preview",
            approvalRequest: nil,
            selectedProvider: .both,
            providerOrder: .claudeFirst,
            isRefreshInProgress: false,
            isRefreshJustCompleted: false,
            refreshStatus: .none,
            language: .simplifiedChinese
        )
    }

    func snapshot(for configuration: AIUsageWidgetConfigurationIntent, in context: Context) async -> AIUsageEntry {
        let selection = resolvedSelection(from: configuration.provider)
        if context.isPreview {
            return entry(selection: selection)
        }

        return await entryWithBestEffortRefresh(selection: selection)
    }

    func timeline(for configuration: AIUsageWidgetConfigurationIntent, in context: Context) async -> Timeline<AIUsageEntry> {
        let now = Date()
        let currentEntry = await entryWithBestEffortRefresh(selection: resolvedSelection(from: configuration.provider))
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: now) ?? now

        if currentEntry.isRefreshInProgress || currentEntry.isRefreshJustCompleted {
            let clearDelay: TimeInterval = currentEntry.isRefreshInProgress ? 12 : 8
            let clearEntry = currentEntry.withRefreshState(
                date: now.addingTimeInterval(clearDelay),
                inProgress: false,
                justCompleted: false,
                refreshStatus: .none
            )
            return Timeline(entries: [currentEntry, clearEntry], policy: .after(nextRefresh))
        }

        return Timeline(
            entries: [currentEntry],
            policy: .after(nextRefresh)
        )
    }

    private func entry(selection: WidgetProviderSelection) -> AIUsageEntry {
        let cachedSnapshotRecord = store.loadCachedSnapshotRecord()
        let diagnostic = store.loadWidgetLANDiagnostic()

        return AIUsageEntry(
            date: Date(),
            snapshot: cachedSnapshotRecord?.snapshot ?? PreviewSnapshots.noCacheFallback,
            appGroupProof: store.readAppGroupProof(),
            appGroupProofMode: store.isProofModeEnabled(),
            isPreviewFallback: cachedSnapshotRecord == nil,
            cacheSavedAt: cachedSnapshotRecord?.savedAt,
            cacheSource: cachedSnapshotRecord?.source,
            approvalRequest: approvalStore.loadPendingRequest(),
            selectedProvider: selection,
            providerOrder: providerOrder(),
            isRefreshInProgress: store.isWidgetRefreshInProgress(),
            isRefreshJustCompleted: store.isWidgetRefreshJustCompleted(),
            refreshStatus: Self.refreshStatus(from: diagnostic),
            language: store.loadAppLanguage()
        )
    }

    private static func refreshStatus(from diagnostic: WidgetLANDiagnostic?) -> WidgetRefreshStatus {
        guard let diagnostic else {
            return .none
        }

        switch diagnostic.outcome {
        case .success:
            return .success
        case .failure:
            return diagnostic.detail.contains("超时") || diagnostic.detail.contains("超時") || diagnostic.detail.localizedCaseInsensitiveContains("timeout")
                ? .timeout
                : .failure
        case .skipped:
            return .failure
        }
    }

    private func entryWithBestEffortRefresh(selection: WidgetProviderSelection) async -> AIUsageEntry {
        if store.isWidgetRefreshInProgress() {
            return entry(selection: selection)
        }

        await refreshCoordinator.refresh()
        return entry(selection: selection)
    }

    private func providerOrder() -> WidgetProviderOrder {
        guard let rawValue = store.loadWidgetProviderOrderRaw(),
              let order = WidgetProviderOrder(rawValue: rawValue) else {
            return .claudeFirst
        }
        return order
    }

    private func resolvedSelection(from configuredSelection: WidgetProviderSelection?) -> WidgetProviderSelection {
        guard let rawValue = store.loadUsageProviderModeRaw(),
              let savedSelection = WidgetProviderSelection(rawValue: rawValue) else {
            return configuredSelection ?? .both
        }

        if savedSelection != .both {
            return savedSelection
        }
        return configuredSelection ?? .both
    }
}

struct AIUsageWidget: Widget {
    let kind = "AIUsageWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: AIUsageWidgetConfigurationIntent.self,
            provider: AIUsageTimelineProvider()
        ) { entry in
            AIUsageWidgetView(entry: entry)
        }
        .configurationDisplayName("widget.configuration.name")
        .description("widget.configuration.description")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct AIUsageWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: AIUsageEntry

    private var providers: [AIUsageSnapshot.Provider] {
        let orderedIds = effectiveProviderSelection == .both
            ? entry.providerOrder.providerIds
            : effectiveProviderSelection.providerIds
        return orderedIds.compactMap { id in
            entry.snapshot.providers.first { $0.id == id }
        }
    }

    private var effectiveProviderSelection: WidgetProviderSelection {
        guard family == .systemSmall, entry.selectedProvider == .both else {
            return entry.selectedProvider
        }
        return .claude
    }

    var body: some View {
        Group {
            if family == .systemSmall {
                smallBody
            } else {
                mediumBody
            }
        }
        .containerBackground(Color(red: 0.105, green: 0.105, blue: 0.115), for: .widget)
        .foregroundStyle(.white)
        .widgetURL(URL(string: "aiusage://refresh"))
    }

    private var mediumBody: some View {
        let providerTitleAction: ProviderTitleAction = providers.count > 1 ? .swapColumns : .switchProvider
        let isDualMode = providers.count > 1
        let providerStatusLine: String? = providers.count == 1 ? headerStatus : nil

        return VStack(alignment: .leading, spacing: isDualMode ? 5 : 8) {
            header

            HStack(alignment: .top, spacing: 14) {
                if let first = providers.first {
                    ProviderUsageColumn(
                        provider: first,
                        snapshot: entry.snapshot,
                        seedDate: entry.date,
                        cacheSavedAt: entry.cacheSavedAt,
                        cacheSource: entry.cacheSource,
                        text: WidgetText(language: entry.language),
                        providerTitleAction: providerTitleAction,
                        providerStatusLine: providerStatusLine,
                        isCompact: isDualMode
                    )
                }

                if providers.count > 1 {
                    Rectangle()
                        .fill(Color(red: 0.23, green: 0.23, blue: 0.24))
                        .frame(width: 1, height: 88)
                }

                if providers.count > 1 {
                    ProviderUsageColumn(
                        provider: providers[1],
                        snapshot: entry.snapshot,
                        seedDate: entry.date,
                        cacheSavedAt: entry.cacheSavedAt,
                        cacheSource: entry.cacheSource,
                        text: WidgetText(language: entry.language),
                        providerTitleAction: providerTitleAction,
                        providerStatusLine: providerStatusLine,
                        isCompact: isDualMode
                    )
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, isDualMode ? 10 : 15)
        .padding(.bottom, isDualMode ? 12 : 8)
    }

    private var smallBody: some View {
        VStack(alignment: .leading, spacing: 9) {
            header

            if let provider = providers.first {
                ProviderUsageColumn(
                    provider: provider,
                    snapshot: entry.snapshot,
                    seedDate: entry.date,
                    cacheSavedAt: entry.cacheSavedAt,
                    cacheSource: entry.cacheSource,
                    text: WidgetText(language: entry.language),
                    providerTitleAction: .switchProvider,
                    showsInlineRefreshButton: true,
                    isRefreshing: entry.isRefreshInProgress,
                    isRefreshJustCompleted: entry.isRefreshJustCompleted
                )
            }
        }
        .padding(.leading, 20)
        .padding(.trailing, 12)
        .padding(.top, 20)
        .padding(.bottom, 9)
    }

    private var header: some View {
        let text = WidgetText(language: entry.language)
        return HStack(spacing: 8) {
            WidgetHeaderTitle(text: text, family: family)
            Spacer(minLength: 6)
            if let approvalRequest = entry.approvalRequest, family != .systemSmall {
                ApprovalHeaderActions(request: approvalRequest)
            } else {
                if family != .systemSmall {
                    HeaderRefreshButton(
                        isRefreshing: entry.isRefreshInProgress,
                        isJustCompleted: entry.isRefreshJustCompleted
                    )
                    .offset(y: 3)
                }
            }
        }
        .accessibilityLabel("\(family == .systemSmall ? text.compactHeader : text.header), \(headerStatus)")
    }

    private var headerStatus: String {
        let text = WidgetText(language: entry.language)

        if entry.appGroupProofMode {
            return proofStatus
        }

        if entry.isRefreshInProgress {
            return text.loading
        }

        if entry.isRefreshJustCompleted {
            switch entry.refreshStatus {
            case .success:
                return text.success
            case .timeout:
                return text.timeout
            case .failure:
                return text.failure
            case .none:
                return text.success
            }
        }

        if entry.isPreviewFallback {
            return entry.cacheSource == "preview" ? text.preview : text.noCache
        }

        if !entry.snapshot.device.online {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: text.localeIdentifier)
            formatter.dateFormat = "HH:mm"
            return "\(text.failure) · \(text.lastPrefix) \(formatter.string(from: entry.snapshot.device.updatedAt))"
        }

        return CacheStatusFormatter.caption(
            source: entry.cacheSource,
            savedAt: entry.cacheSavedAt,
            fallbackDate: entry.snapshot.device.updatedAt,
            now: entry.date,
            language: entry.language
        )
    }

    private var proofStatus: String {
        let text = WidgetText(language: entry.language)

        if entry.appGroupProof == "未读到 App Group" || entry.appGroupProof == "App Group 不可用" {
            return text.appGroupFailed
        }

        return "✓ \(entry.appGroupProof)"
    }

}

struct RefreshUsageIntent: AppIntent {
    static var title: LocalizedStringResource = "intent.refreshUsage.title"
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult {
        let store = SnapshotStore()
        store.markWidgetRefreshStarted()
        WidgetCenter.shared.reloadTimelines(ofKind: "AIUsageWidget")
        try? await Task.sleep(nanoseconds: 900_000_000)

        await WidgetRefreshCoordinator().refresh()
        store.clearWidgetRefreshStarted()
        store.markWidgetRefreshCompleted()
        WidgetCenter.shared.reloadTimelines(ofKind: "AIUsageWidget")
        return .result()
    }
}

struct ToggleWidgetProviderIntent: AppIntent {
    static var title: LocalizedStringResource = "intent.toggleProvider.title"
    static var openAppWhenRun = false

    @Parameter(title: "intent.provider.parameter")
    var providerId: String

    init() {
        providerId = WidgetProviderSelection.codex.rawValue
    }

    init(providerId: String) {
        self.providerId = providerId
    }

    func perform() async throws -> some IntentResult {
        let nextProvider: WidgetProviderSelection = providerId == WidgetProviderSelection.codex.rawValue
            ? .claude
            : .codex
        SnapshotStore().saveUsageProviderModeRaw(nextProvider.rawValue)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

struct SwapWidgetProvidersIntent: AppIntent {
    static var title: LocalizedStringResource = "intent.swapProviders.title"
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult {
        let store = SnapshotStore()
        let current = store.loadWidgetProviderOrderRaw()
            .flatMap(WidgetProviderOrder.init(rawValue:)) ?? .claudeFirst
        let next = current.toggled
        store.saveWidgetProviderOrderRaw(next.rawValue)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

struct ApprovalDecisionIntent: AppIntent {
    static var title: LocalizedStringResource = "intent.approvalDecision.title"
    static var openAppWhenRun = false

    @Parameter(title: "intent.approvalDecision.requestId")
    var requestId: String

    @Parameter(title: "intent.approvalDecision.action")
    var actionRawValue: String

    init() {
        requestId = ""
        actionRawValue = ApprovalDecision.Action.deny.rawValue
    }

    init(requestId: String, action: ApprovalDecision.Action) {
        self.requestId = requestId
        actionRawValue = action.rawValue
    }

    func perform() async throws -> some IntentResult {
        let approvalStore = ApprovalStore()
        let attemptedAt = Date()
        let storedRequest = approvalStore.loadPendingRequestForDiagnostics()
        guard let action = ApprovalDecision.Action(rawValue: actionRawValue) else {
            try? approvalStore.saveApprovalAttemptDiagnostic(.invalidAction(
                requestId: requestId,
                origin: .widget,
                attemptedAt: attemptedAt
            ))
            WidgetCenter.shared.reloadTimelines(ofKind: "AIUsageWidget")
            return .result()
        }

        do {
            let result = try await ApprovalDecisionHandler().decide(requestId: requestId, action: action)
            try? approvalStore.saveApprovalAttemptDiagnostic(.success(
                result: result,
                origin: .widget,
                attemptedAt: attemptedAt
            ))
        } catch {
            try? approvalStore.saveApprovalAttemptDiagnostic(.failure(
                requestId: requestId,
                action: action,
                origin: .widget,
                error: storedRequest?.id == requestId && storedRequest?.isExpired(now: attemptedAt) == true
                    ? ApprovalStoreError.expiredRequest
                    : error,
                attemptedAt: attemptedAt
            ))
            WidgetCenter.shared.reloadTimelines(ofKind: "AIUsageWidget")
            return .result()
        }

        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

private struct WidgetHeaderTitle: View {
    let text: WidgetText
    let family: WidgetFamily

    var body: some View {
        Group {
            if family == .systemSmall {
                Text(text.compactHeader)
                    .lineLimit(1)
                    .minimumScaleFactor(0.62)
                    .allowsTightening(true)
                    .truncationMode(.tail)
                    .layoutPriority(10)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(text.headerCore)
                        .lineLimit(1)
                        .minimumScaleFactor(0.66)
                        .truncationMode(.tail)
                        .layoutPriority(8)

                    Text(text.headerEmoji)
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                        .layoutPriority(10)
                }
                .layoutPriority(10)
            }
        }
        .font(.system(size: family == .systemSmall ? 12 : 16, weight: .bold))
        .layoutPriority(10)
    }
}

private enum WidgetPillMetrics {
    static let providerHeight: CGFloat = 28
    static let compactProviderHeight: CGFloat = 24
    static let refreshHeight: CGFloat = 28
    static let refreshWidth: CGFloat = 44
}

private struct HeaderRefreshButton: View {
    let isRefreshing: Bool
    let isJustCompleted: Bool

    var body: some View {
        Button(intent: RefreshUsageIntent()) {
            ZStack {
                if isRefreshing {
                    Circle()
                        .stroke(Color.white.opacity(0.24), lineWidth: 2)
                        .frame(width: 16, height: 16)
                    Circle()
                        .trim(from: 0.10, to: 0.74)
                        .stroke(Color.white, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                        .frame(width: 16, height: 16)
                    Text("...")
                        .font(.system(size: 9, weight: .black))
                        .offset(y: -1)
                } else if isJustCompleted {
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .bold))
                } else {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 10, weight: .bold))
                }
            }
            .frame(width: WidgetPillMetrics.refreshWidth, height: WidgetPillMetrics.refreshHeight)
            .background(Capsule().fill(refreshFill))
            .overlay(Capsule().stroke(Color.white.opacity(0.08), lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("刷新 Usage")
    }

    private var refreshFill: Color {
        isJustCompleted
            ? Color(red: 16.0 / 255.0, green: 163.0 / 255.0, blue: 127.0 / 255.0).opacity(0.50)
            : Color(red: 0.30, green: 0.30, blue: 0.32).opacity(0.78)
    }
}

private struct ApprovalHeaderActions: View {
    let request: ApprovalRequest

    var body: some View {
        HStack(spacing: 5) {
            Text(request.isLocalUIFixture ? "本地测😏" : "Mac待批🙃")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(request.isLocalUIFixture
                    ? Color(red: 0.56, green: 0.56, blue: 0.58)
                    : Color(red: 0.96, green: 0.64, blue: 0.22))
                .lineLimit(1)
                .minimumScaleFactor(0.72)

            Button(intent: ApprovalDecisionIntent(requestId: request.id, action: .approve)) {
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .bold))
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.bordered)
            .tint(Color(red: 16.0 / 255.0, green: 163.0 / 255.0, blue: 127.0 / 255.0))
            .accessibilityLabel("批准 \(request.title)")

            Button(intent: ApprovalDecisionIntent(requestId: request.id, action: .deny)) {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.bordered)
            .tint(Color(red: 0.95, green: 0.30, blue: 0.32))
            .accessibilityLabel("驳回 \(request.title)")

            HeaderRefreshButton(isRefreshing: false, isJustCompleted: false)
        }
    }
}

private enum ProviderTitleAction {
    case none
    case switchProvider
    case swapColumns
}

private struct ProviderUsageColumn: View {
    let provider: AIUsageSnapshot.Provider
    let snapshot: AIUsageSnapshot
    let seedDate: Date
    let cacheSavedAt: Date?
    let cacheSource: String?
    let text: WidgetText
    let providerTitleAction: ProviderTitleAction
    let providerStatusLine: String?
    let showsInlineRefreshButton: Bool
    let isRefreshing: Bool
    let isRefreshJustCompleted: Bool
    let isCompact: Bool

    init(
        provider: AIUsageSnapshot.Provider,
        snapshot: AIUsageSnapshot,
        seedDate: Date,
        cacheSavedAt: Date?,
        cacheSource: String?,
        text: WidgetText,
        providerTitleAction: ProviderTitleAction = .none,
        providerStatusLine: String? = nil,
        showsInlineRefreshButton: Bool = false,
        isRefreshing: Bool = false,
        isRefreshJustCompleted: Bool = false,
        isCompact: Bool = false
    ) {
        self.provider = provider
        self.snapshot = snapshot
        self.seedDate = seedDate
        self.cacheSavedAt = cacheSavedAt
        self.cacheSource = cacheSource
        self.text = text
        self.providerTitleAction = providerTitleAction
        self.providerStatusLine = providerStatusLine
        self.showsInlineRefreshButton = showsInlineRefreshButton
        self.isRefreshing = isRefreshing
        self.isRefreshJustCompleted = isRefreshJustCompleted
        self.isCompact = isCompact
    }

    var body: some View {
        VStack(alignment: .leading, spacing: isCompact ? 4 : 6) {
            HStack(alignment: .center, spacing: 8) {
                providerTitle

                if let providerStatusLine {
                    Text(providerStatusLine)
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Color(red: 0.58, green: 0.58, blue: 0.61))
                        .lineLimit(1)
                        .minimumScaleFactor(0.68)
                        .allowsTightening(true)
                        .truncationMode(.tail)
                        .layoutPriority(1)
                }

                Spacer(minLength: 4)

                if showsInlineRefreshButton {
                    HeaderRefreshButton(
                        isRefreshing: isRefreshing,
                        isJustCompleted: isRefreshJustCompleted
                    )
                }
            }

            if provider.usage.available, provider.usage.source != nil, provider.capturedAt != nil {
                UsageMeter(
                    title: "5h",
                    percent: provider.usage.fiveHourRemainingPercent,
                    resetAt: provider.usage.fiveHourResetAt,
                    snapshotDate: snapshot.device.updatedAt,
                    isStale: isProviderStale,
                    isLastKnownFallback: isLastKnownFallback,
                    text: text,
                    isCompact: isCompact
                )
                UsageMeter(
                    title: text.weekLabel,
                    percent: provider.usage.weeklyRemainingPercent,
                    resetAt: provider.usage.weeklyResetAt,
                    snapshotDate: snapshot.device.updatedAt,
                    isStale: isProviderStale,
                    isLastKnownFallback: isLastKnownFallback,
                    text: text,
                    isCompact: isCompact
                )
            } else {
                let copy = fallbackCopy(for: provider)
                Text(copy.title)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text(copy.subtitle)
                    .font(.system(size: 11))
                    .foregroundStyle(Color(red: 0.56, green: 0.56, blue: 0.58))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary)
    }

    @ViewBuilder
    private var providerTitle: some View {
        switch providerTitleAction {
        case .switchProvider:
            Button(intent: ToggleWidgetProviderIntent(providerId: provider.id)) {
                providerTitlePill
            }
            .buttonStyle(.plain)
            .contentShape(Capsule())
            .layoutPriority(3)
            .accessibilityLabel("切换到 \(provider.id == "codex" ? "Claude" : "Codex")")
        case .swapColumns:
            Button(intent: SwapWidgetProvidersIntent()) {
                providerTitlePill
            }
            .buttonStyle(.plain)
            .contentShape(Capsule())
            .layoutPriority(3)
            .accessibilityLabel("交换 Claude 和 Codex 位置")
        case .none:
            providerTitlePill
                .layoutPriority(3)
        }
    }

    private var providerTitlePill: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(providerColor)
                .frame(width: isCompact ? 4 : 5, height: isCompact ? 4 : 5)
            Text(provider.displayName)
                .font(.system(size: isCompact ? 14 : 15, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .fixedSize(horizontal: true, vertical: false)
        }
        .foregroundStyle(providerColor)
        .padding(.horizontal, isCompact ? 6 : 7)
        .frame(height: isCompact ? WidgetPillMetrics.compactProviderHeight : WidgetPillMetrics.providerHeight)
        .background(Capsule().fill(providerColor.opacity(0.14)))
        .overlay(Capsule().stroke(providerColor.opacity(0.34), lineWidth: 1))
        .fixedSize(horizontal: true, vertical: false)
    }

    private var providerColor: Color {
        provider.id == "codex"
            ? Color(red: 16.0 / 255.0, green: 163.0 / 255.0, blue: 127.0 / 255.0)
            : Color(red: 0.91, green: 0.58, blue: 0.42)
    }

    private var isProviderStale: Bool {
        UsageFreshness.isStale(
            snapshotUpdatedAt: snapshot.device.updatedAt,
            providerCapturedAt: provider.capturedAt,
            cacheSavedAt: cacheSavedAt,
            now: seedDate
        )
    }

    private var isLastKnownFallback: Bool {
        UsageFreshness.isLastKnownFallback(
            snapshotUpdatedAt: snapshot.device.updatedAt,
            providerCapturedAt: provider.capturedAt,
            cacheSource: cacheSource,
            providerId: provider.id
        )
    }

    private func fallbackCopy(for provider: AIUsageSnapshot.Provider) -> (title: String, subtitle: String) {
        switch provider.usage.reason {
        case .thirdPartyNoQuota:
            return (text.noMeterTitle, rotating([text.noMeterSubtitle, text.noLedgerSubtitle]))
        case .notLoggedIn:
            return (text.notLoggedInTitle, text.loginOnMacSubtitle)
        case .collectorError:
            return (text.collectorErrorTitle, rotating([text.apiActingSubtitle, text.probeBlameSubtitle]))
        case .noStableSource, .none:
            if !provider.connected {
                return (text.notLoggedInTitle, text.loginOnMacSubtitle)
            }
            return (text.usageMysteryTitle, rotating([text.officialHidingSubtitle, text.wontShowSubtitle]))
        }
    }

    private func rotating(_ variants: [String]) -> String {
        let day = Calendar.current.ordinality(of: .day, in: .era, for: seedDate) ?? 0
        return variants[day % variants.count]
    }

    private var accessibilitySummary: String {
        if provider.usage.available,
           provider.usage.source != nil,
           provider.capturedAt != nil,
           let fiveHour = provider.usage.fiveHourRemainingPercent,
           let weekly = provider.usage.weeklyRemainingPercent {
            return "\(provider.displayName)，5小时剩余 \(fiveHour)%，本周剩余 \(weekly)%"
        }

        let copy = fallbackCopy(for: provider)
        return "\(provider.displayName)，\(copy.title)，\(copy.subtitle)"
    }
}

private struct UsageMeter: View {
    let title: String
    let percent: Int?
    let resetAt: Date?
    let snapshotDate: Date
    let isStale: Bool
    let isLastKnownFallback: Bool
    let text: WidgetText
    let isCompact: Bool

    private var clampedPercent: Int {
        min(max(percent ?? 0, 0), 100)
    }

    private var barColor: Color {
        switch clampedPercent {
        case 60...100:
            return .green
        case 30..<60:
            return .orange
        default:
            return .red
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: isCompact ? 2 : 4) {
            HStack(spacing: 6) {
                Text(title)
                    .foregroundStyle(Color(red: 0.56, green: 0.56, blue: 0.58))
                Spacer()
                Text(percent.map { "\($0)%" } ?? "--")
                    .fontWeight(.bold)
            }
            .font(.system(size: isCompact ? 12 : 13).monospacedDigit())

            HStack(spacing: 8) {
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color(red: 0.23, green: 0.23, blue: 0.24))
                        Capsule()
                            .fill(barColor)
                            .frame(width: proxy.size.width * CGFloat(clampedPercent) / 100)
                    }
                }
                .frame(height: isCompact ? 7 : 8)
            }

            Text(resetCaption)
                .font(.system(size: isCompact ? 9.5 : 11))
                .foregroundStyle(Color(red: 0.56, green: 0.56, blue: 0.58))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title) 剩余 \(clampedPercent)%，\(resetCaption)")
    }

    private var resetCaption: String {
        if isStale {
            return text.oldRecordWarning
        }

        if isLastKnownFallback {
            return text.lastKnownFallback
        }

        guard let resetAt else {
            return text.usageMysteryTitle
        }

        return text.resetCaption(resetAt, referenceDate: snapshotDate)
    }
}

#if DEBUG
struct AIUsageWidgetViewPreviews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 12) {
            ForEach(PreviewSnapshots.allFixtures) { fixture in
                AIUsageWidgetView(
                    entry: Self.entry(
                        snapshot: fixture.snapshot,
                        cacheSource: "fixture:\(fixture.id)"
                    )
                )
                .previewDisplayName(fixture.title)
            }

            AIUsageWidgetView(
                entry: Self.entry(
                    snapshot: PreviewSnapshots.noCacheFallback,
                    isPreviewFallback: true,
                    cacheSavedAt: nil,
                    cacheSource: "preview"
                )
            )
            .previewDisplayName("No Cache")

            AIUsageWidgetView(
                entry: Self.entry(
                    snapshot: PreviewSnapshots.normal,
                    appGroupProof: "Proof 12:34:56",
                    appGroupProofMode: true,
                    cacheSource: "fixture:normal"
                )
            )
            .previewDisplayName("Proof Mode")

            AIUsageWidgetView(
                entry: Self.entry(
                    snapshot: PreviewSnapshots.normal,
                    cacheSource: "lan"
                )
            )
            .previewDisplayName("LAN Header")

            AIUsageWidgetView(
                entry: Self.entry(
                    snapshot: PreviewSnapshots.normal,
                    cacheSource: "widget-lan"
                )
            )
            .previewDisplayName("Widget LAN Header")

            AIUsageWidgetView(
                entry: Self.entry(
                    snapshot: PreviewSnapshots.normal,
                    cacheSavedAt: Calendar.current.date(
                        byAdding: .day,
                        value: -2,
                        to: PreviewSnapshots.normal.device.updatedAt
                    ),
                    cacheSource: "fixture:stale"
                )
            )
            .previewDisplayName("Cache Old")

            AIUsageWidgetView(
                entry: Self.entry(
                    snapshot: PreviewSnapshots.meterLayout,
                    cacheSource: "internal:meter_layout"
                )
            )
            .previewDisplayName("Internal Meter Layout")

            AIUsageWidgetView(
                entry: Self.entry(
                    snapshot: PreviewSnapshots.staleMeterLayout,
                    cacheSource: "internal:stale_meter_layout"
                )
            )
            .previewDisplayName("Internal Stale Meter Layout")

            AIUsageWidgetView(
                entry: Self.entry(
                    snapshot: PreviewSnapshots.normal,
                    cacheSource: "fixture:approval",
                    approvalRequest: ApprovalRequest(
                        schemaVersion: 1,
                        id: "preview-approval",
                        source: "Mac 请求",
                        title: "允许这一步继续？",
                        createdAt: PreviewSnapshots.normal.device.updatedAt,
                        expiresAt: nil
                    ),
                    selectedProvider: .claude
                )
            )
            .previewDisplayName("Approval Header")

            AIUsageWidgetView(
                entry: Self.entry(
                    snapshot: PreviewSnapshots.meterLayout,
                    cacheSource: "internal:meter_layout",
                    selectedProvider: .codex
                )
            )
            .previewDisplayName("Small Codex")
            .previewContext(WidgetPreviewContext(family: .systemSmall))
        }
        .previewContext(WidgetPreviewContext(family: .systemMedium))
    }

    private static func entry(
        snapshot: AIUsageSnapshot,
        appGroupProof: String = "未读到 App Group",
        appGroupProofMode: Bool = false,
        isPreviewFallback: Bool = false,
        cacheSavedAt: Date? = nil,
        cacheSource: String?,
        approvalRequest: ApprovalRequest? = nil,
        selectedProvider: WidgetProviderSelection = .both
    ) -> AIUsageEntry {
        AIUsageEntry(
            date: snapshot.device.updatedAt,
            snapshot: snapshot,
            appGroupProof: appGroupProof,
            appGroupProofMode: appGroupProofMode,
            isPreviewFallback: isPreviewFallback,
            cacheSavedAt: cacheSavedAt ?? snapshot.device.updatedAt,
            cacheSource: cacheSource,
            approvalRequest: approvalRequest,
            selectedProvider: selectedProvider,
            providerOrder: .claudeFirst,
            isRefreshInProgress: false,
            isRefreshJustCompleted: false,
            refreshStatus: .none,
            language: .simplifiedChinese
        )
    }
}
#endif
