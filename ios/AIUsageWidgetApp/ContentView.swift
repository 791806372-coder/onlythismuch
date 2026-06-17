import SwiftUI
import WidgetKit

private enum UsageProviderMode: String, CaseIterable, Identifiable {
    case both
    case claude
    case codex

    var id: String { rawValue }

    var title: String {
        switch self {
        case .both:
            return "Claude + Codex"
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

private struct MobileAppText {
    let option: AppLanguageOption

    func localized(
        english: String,
        simplified: String,
        traditional: String,
        spanish: String,
        portuguese: String? = nil,
        japanese: String? = nil
    ) -> String {
        switch option {
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

    var appName: String { "AI Usage" }
    var firstRunTitle: String { "AI Usage" }
    var firstRunMessage: String {
        localized(
            english: "Scan the QR code on your computer first",
            simplified: "先扫电脑上的二维码配对",
            traditional: "先掃電腦上的 QR Code 配對",
            spanish: "Primero escanea el QR del ordenador",
            portuguese: "Primeiro escaneia o QR do computador",
            japanese: "まずパソコンのQRをスキャンして。迷子ごっこはそこまで😏"
        )
    }
    var qrGuidanceTitle: String {
        localized(
            english: "Open the Mac connector",
            simplified: "打开电脑连接器",
            traditional: "打開電腦連接器",
            spanish: "Abre el conector del ordenador",
            portuguese: "Abre o conector do Mac",
            japanese: "Macコネクタを開く"
        )
    }
    var macConnectorInstallTitle: String {
        localized(
            english: "Install the Mac connector first",
            simplified: "先装 Mac 连接器",
            traditional: "先裝 Mac 連接器",
            spanish: "Instala primero el conector del Mac",
            portuguese: "Instale primeiro o conector do Mac",
            japanese: "まずMacコネクタを入れる"
        )
    }
    var macConnectorInstallBody: String {
        localized(
            english: "AI Usage on iPhone only shows what your Mac connector sends. Install it on the Mac, open it, enable the helper, then come back to scan the QR.",
            simplified: "iPhone 上的 AI Usage 只显示 Mac 连接器送来的用量。先在 Mac 上安装并打开它，启用后台助手，再回来扫码。",
            traditional: "iPhone 上的 AI Usage 只顯示 Mac 連接器送來的用量。先在 Mac 上安裝並打開它，啟用背景助手，再回來掃碼。",
            spanish: "AI Usage en iPhone solo muestra lo que envía el conector del Mac. Instálalo en el Mac, ábrelo, activa el ayudante y vuelve para escanear el QR.",
            portuguese: "O AI Usage no iPhone só mostra o que o conector do Mac envia. Instale no Mac, abra, ative o ajudante e volte para escanear o QR.",
            japanese: "iPhoneのAI Usageは、Macコネクタが送る使用状況だけ表示します。Macに入れて開き、ヘルパーを有効にしてからQRをスキャン。"
        )
    }
    var qrGuidanceBody: String {
        localized(
            english: "Show the pairing QR there, then scan it here. No GPT or Claude login happens in this app.",
            simplified: "在电脑上显示配对二维码，然后用这里扫。这里不登录 GPT 或 Claude。",
            traditional: "在電腦上顯示配對 QR Code，然後用這裡掃。這裡不登入 GPT 或 Claude。",
            spanish: "Muestra allí el QR de vinculación y escanéalo aquí. Esta app no inicia sesión en GPT ni Claude.",
            portuguese: "Mostra lá o QR de pareamento e escaneia aqui. Este app não faz login no GPT nem no Claude.",
            japanese: "Mac側でペアリングQRを出して、ここでスキャン。このアプリではGPTやClaudeにログインしない。覗き趣味はありません。"
        )
    }
    var scanQRCode: String {
        localized(english: "Scan QR Code", simplified: "扫描二维码", traditional: "掃描 QR Code", spanish: "Escanear QR", portuguese: "Escanear QR", japanese: "QRをスキャン")
    }
    var manualInput: String {
        localized(english: "Manual Input", simplified: "手动输入", traditional: "手動輸入", spanish: "Entrada manual", portuguese: "Entrada manual", japanese: "手動入力")
    }
    var savePairingJSON: String {
        localized(english: "Save pairing JSON", simplified: "保存配对 JSON", traditional: "儲存配對 JSON", spanish: "Guardar JSON de vinculación", portuguese: "Salvar JSON de pareamento", japanese: "ペアリングJSONを保存")
    }
    var manualPairingHint: String {
        localized(
            english: "Only the full connector pairing code. Sanitized summaries cannot sneak in.",
            simplified: "只接受连接器生成的完整配对码，脱敏摘要别想混进来。",
            traditional: "只接受連接器產生的完整配對碼，脫敏摘要別想混進來。",
            spanish: "Solo el código completo del conector. Los resúmenes censurados no se cuelan.",
            portuguese: "Só o código completo do conector. Resumo censurado não entra de penetra.",
            japanese: "コネクタが出した完全なコードだけ。伏せ字サマリーは入れません。"
        )
    }
    var usage: String {
        localized(
            english: "Fine, here's only this much 🤏",
            simplified: "别问了 还剩这么点 🤏",
            traditional: "別問了 還剩這麼點 🤏",
            spanish: "Vale, solo queda esto 🤏",
            portuguese: "Tá, só sobrou isso 🤏",
            japanese: "はいはい、残りはこれっぽっち🤏"
        )
    }
    var refresh: String {
        localized(
            english: "Touch Mac🫳",
            simplified: "抚摸 Mac🫳",
            traditional: "撫摸 Mac🫳",
            spanish: "Toca el Mac🫳",
            portuguese: "Toca no Mac🫳",
            japanese: "Macをなでる🫳"
        )
    }
    var language: String {
        localized(english: "Language", simplified: "语言", traditional: "語言", spanish: "Idioma", portuguese: "Idioma", japanese: "言語")
    }
    var settings: String {
        localized(english: "Settings", simplified: "设置", traditional: "設定", spanish: "Ajustes", portuguese: "Ajustes", japanese: "設定")
    }
    var display: String {
        localized(english: "Display", simplified: "显示", traditional: "顯示", spanish: "Vista", portuguese: "Exibição", japanese: "表示")
    }
    var computerStatus: String {
        localized(english: "Computer Status", simplified: "电脑状态", traditional: "電腦狀態", spanish: "Estado del ordenador", portuguese: "Estado do Mac", japanese: "Macの状態")
    }
    var offlinePolicy: String {
        localized(english: "Offline Policy", simplified: "离线策略", traditional: "離線策略", spanish: "Modo sin conexión", portuguese: "Modo offline", japanese: "オフライン方針")
    }
    var keepLastKnown: String {
        localized(english: "Keep last known", simplified: "保留旧账", traditional: "保留舊帳", spanish: "Guardar último dato", portuguese: "Guardar último registro", japanese: "古い記録は残す")
    }
    var paired: String {
        localized(english: "Paired", simplified: "已配对", traditional: "已配對", spanish: "Vinculado", portuguese: "Pareado", japanese: "ペアリング済み")
    }
    var unpaired: String {
        localized(english: "Unpaired", simplified: "未配对", traditional: "未配對", spanish: "Sin vincular", portuguese: "Sem parear", japanese: "未ペアリング")
    }
    var diagnostics: String {
        localized(english: "Diagnostics", simplified: "诊断", traditional: "診斷", spanish: "Diagnóstico", portuguese: "Diagnóstico", japanese: "診断")
    }
    var unpair: String {
        localized(english: "Unpair", simplified: "取消配对", traditional: "取消配對", spanish: "Desvincular", portuguese: "Desparear", japanese: "ペアリング解除")
    }
    var refreshLoading: String {
        localized(
            english: "Poking your Mac...🫳",
            simplified: "正在抚摸你的 Mac...🫳",
            traditional: "正在撫摸你的 Mac...🫳",
            spanish: "Tocando tu Mac...🫳",
            portuguese: "Tocando seu Mac...🫳",
            japanese: "君のMacをなでてます...🫳"
        )
    }
    var refreshSuccess: String {
        localized(
            english: "Touched Mac · hot😏",
            simplified: "刚摸完，很润😏",
            traditional: "剛摸完，很潤😏",
            spanish: "Mac tocado · caliente😏",
            portuguese: "Mac tocado · quente😏",
            japanese: "なでたて、しっとり😏"
        )
    }
    var refreshFailure: String {
        localized(
            english: "Mac is pretending to sleep💤",
            simplified: "Mac 装睡了💤",
            traditional: "Mac 裝睡了💤",
            spanish: "El Mac finge dormir💤",
            portuguese: "O Mac está fingindo que dorme💤",
            japanese: "Macが寝たふりしてる💤"
        )
    }
    var refreshTimeout: String {
        localized(
            english: "My hand got tired🫠",
            simplified: "手都伸酸了🫠",
            traditional: "手都伸酸了🫠",
            spanish: "Ya se cansó la mano🫠",
            portuguese: "A mão já cansou🫠",
            japanese: "手がもう限界🫠"
        )
    }
    var scannerTitle: String {
        localized(
            english: "Scan the aiuw pair QR",
            simplified: "扫描 aiuw pair 二维码",
            traditional: "掃描 aiuw pair QR Code",
            spanish: "Escanea el QR de aiuw pair",
            portuguese: "Escaneia o QR do aiuw pair",
            japanese: "aiuw pair のQRをスキャン"
        )
    }
    var scannerHint: String {
        localized(
            english: "Do not scan sanitized JSON. Manual mode wants npm run pair:manual.",
            simplified: "别扫脱敏 JSON；手动请用 npm run pair:manual。",
            traditional: "別掃脫敏 JSON；手動請用 npm run pair:manual。",
            spanish: "No escanees JSON censurado; en manual usa npm run pair:manual.",
            portuguese: "Não escaneia JSON censurado; no manual usa npm run pair:manual.",
            japanese: "伏せ字JSONはスキャンしない。手動なら npm run pair:manual。"
        )
    }
    var manualPaste: String {
        localized(english: "Manual paste", simplified: "改手动粘贴", traditional: "改手動貼上", spanish: "Pegar manual", portuguese: "Colar manualmente", japanese: "手動貼り付け")
    }
    var cancel: String {
        localized(english: "Cancel", simplified: "取消", traditional: "取消", spanish: "Cancelar", portuguese: "Cancelar", japanese: "キャンセル")
    }
    var scannerUnsupported: String {
        localized(
            english: "This system cannot scan. Manual paste it.",
            simplified: "这台系统扫不了，手动粘贴吧。",
            traditional: "這台系統掃不了，手動貼上吧。",
            spanish: "Este sistema no escanea. Pégalo a mano.",
            portuguese: "Este sistema não escaneia. Cola manualmente.",
            japanese: "このシステムはスキャン不可。手で貼って。"
        )
    }
    var scannerFallbackHint: String {
        localized(
            english: "Run `npm run pair:manual` on the Mac, then paste the full JSON or terminal block into the box.",
            simplified: "用 Mac 上的 `npm run pair:manual`，把完整 JSON 或终端块粘到上面那个框。",
            traditional: "用 Mac 上的 `npm run pair:manual`，把完整 JSON 或終端區塊貼到上面的框。",
            spanish: "Ejecuta `npm run pair:manual` en el Mac y pega el JSON completo o el bloque del terminal en la caja.",
            portuguese: "Roda `npm run pair:manual` no Mac e cola o JSON completo ou o bloco do terminal na caixa.",
            japanese: "Macで `npm run pair:manual` を実行して、完全なJSONかターミナルのブロックを上の箱に貼って。"
        )
    }
    var widgetLANFresh: String {
        localized(english: "Widget LAN", simplified: "Widget LAN", traditional: "Widget LAN", spanish: "Widget LAN", portuguese: "Widget LAN", japanese: "Widget LAN")
    }
    var noCache: String {
        localized(english: "Cache: none", simplified: "缓存：无", traditional: "快取：無", spanish: "Caché: nada", portuguese: "Cache: nada", japanese: "キャッシュ：なし")
    }
    var weekLabel: String {
        localized(english: "wk", simplified: "周", traditional: "週", spanish: "sem", portuguese: "sem", japanese: "週")
    }
    var noMeter: String {
        localized(english: "No meter😏", simplified: "无表可看😏", traditional: "無表可看😏", spanish: "Sin medidor😏", portuguese: "Sem medidor😏", japanese: "メーターなし😏")
    }
    var notLoggedIn: String {
        localized(english: "Not logged in and still asking?😒", simplified: "没登录还想看？😒", traditional: "沒登入還想看？😒", spanish: "¿Ni iniciaste sesión y preguntas?😒", portuguese: "Nem logou e ainda pergunta?😒", japanese: "ログインもせずに見たいの？😒")
    }
    var collectorError: String {
        localized(english: "Probe face-planted🤡", simplified: "探测翻车了🤡", traditional: "探測翻車了🤡", spanish: "La sonda se estampó🤡", portuguese: "A sonda caiu de cara🤡", japanese: "探測が転んだ🤡")
    }
    var usageMystery: String {
        localized(english: "Usage is playing mystery🙄", simplified: "用量装神秘🙄", traditional: "用量裝神秘🙄", spanish: "El uso se hace el misterioso🙄", portuguese: "O uso está se fazendo de mistério🙄", japanese: "使用状況が謎ぶってる🙄")
    }
    var officialHidingSubtitle: String {
        localized(english: "officially hidden again", simplified: "官方又藏了", traditional: "官方又藏了", spanish: "oficialmente escondido otra vez", portuguese: "oficialmente escondido de novo", japanese: "公式がまた隠した")
    }
    var loginOnComputerSubtitle: String {
        localized(english: "log in on the Mac", simplified: "去电脑上登录", traditional: "去電腦上登入", spanish: "inicia sesión en el Mac", portuguese: "faz login no Mac", japanese: "Macでログインして")
    }
    var refreshDiagnostics: String {
        localized(english: "Refresh diagnostics", simplified: "刷新诊断", traditional: "重新整理診斷", spanish: "Actualizar diagnóstico", portuguese: "Atualizar diagnóstico", japanese: "診断を更新")
    }
    var oldRecordWarning: String {
        localized(english: "Old record, don't trust it too much🧊", simplified: "旧账别太信🧊", traditional: "舊帳別太信🧊", spanish: "Cuenta vieja, no te fíes tanto🧊", portuguese: "Registro velho, não confia demais🧊", japanese: "古い記録、信じすぎ注意🧊")
    }
    var lastKnownFallback: String {
        localized(english: "Missed it, showing old record🧊", simplified: "刚没抓到，先看旧账🧊", traditional: "剛沒抓到，先看舊帳🧊", spanish: "No lo pilló, va la cuenta vieja🧊", portuguese: "Não pegou, vai o registro velho🧊", japanese: "捕まえ損ねたから古い記録🧊")
    }
    var resetUnknown: String { usageMystery }
    var localeIdentifier: String {
        switch option {
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
        switch option {
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
        switch option {
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

private enum UsageAppTheme {
    static let pageBackground = Color(red: 0.055, green: 0.058, blue: 0.066)
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

struct ContentView: View {
    private let store = SnapshotStore()
    private let pairingStore = PairedDeviceStore()
    private let approvalStore = ApprovalStore()
    private let source = LocalHTTPSource()

    @State private var proofText = "尚未写入 App Group"
    @State private var saveStatus = "使用内置 fixture"
    @State private var pairingText = ""
    @State private var pairingSaveStatus = ""
    @State private var pairedDevice: PairingPayload?
    @State private var previewSnapshot = PreviewSnapshots.noCacheFallback
    @State private var cacheStatusText = "缓存：无"
    @State private var connectionStatus = "还没配 Mac"
    @State private var connectionDetails = ""
    @State private var widgetLANDiagnosticText = "Widget 还没留下 LAN 小纸条"
    @State private var widgetOpenProofText = WidgetTapProofText.initial
    @State private var showingScanner = false
    @State private var scannerErrorText = ""
    @State private var isHandlingScan = false
    @State private var isProofModeEnabled = false
    @State private var pendingApproval: ApprovalRequest?
    @State private var lastApprovalDecision: ApprovalDecision?
    @State private var lastApprovalAttemptDiagnostic: ApprovalAttemptDiagnostic?
    @State private var approvalStatusText = "没有待批请求"
    @State private var showingManualPairing = false
    @State private var didAutoRefreshOnAppear = false
    @State private var previewCacheSavedAt: Date?
    @State private var previewCacheSource: String?
    @State private var isRefreshingUsage = false
    @State private var selectedLanguageRaw = AppLanguageOption.systemPreferredOption().rawValue
    @AppStorage(AppGroup.usageProviderModeKey, store: AppGroup.defaults) private var usageProviderModeRaw = UsageProviderMode.both.rawValue

    private var selectedLanguage: AppLanguageOption {
        AppLanguageOption(rawValue: selectedLanguageRaw) ?? .systemPreferredOption()
    }

    private var text: MobileAppText {
        MobileAppText(option: selectedLanguage)
    }

    private var usageProviderMode: UsageProviderMode {
        UsageProviderMode(rawValue: usageProviderModeRaw) ?? .both
    }

    private var visibleProviders: [AIUsageSnapshot.Provider] {
        let orderedIds = usageProviderMode.providerIds
        return orderedIds.compactMap { id in
            previewSnapshot.providers.first(where: { $0.id == id })
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if pairedDevice == nil {
                        firstRunPairingView
                    } else {
                        pairedHeaderView
                        pairedDashboardView
                        settingsView
                    }
                }
                .padding(20)
            }
            .background(pairedDevice == nil ? Color(.systemGroupedBackground) : UsageAppTheme.pageBackground)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(pairedDevice == nil ? .light : .dark, for: .navigationBar)
            .toolbarBackground(pairedDevice == nil ? Color(.systemGroupedBackground) : UsageAppTheme.pageBackground, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .onAppear {
                selectedLanguageRaw = store.loadAppLanguage().rawValue
                migrateUsageProviderModeIfNeeded()
                proofText = store.readAppGroupProof()
                isProofModeEnabled = store.isProofModeEnabled()
                pairedDevice = pairingStore.load()
                reloadPreviewFromStore()
                refreshWidgetLANDiagnostic()
                refreshApprovalState()
                if let pairedDevice {
                    pairingSaveStatus = "已保存配对。token 不回显，别给别人看。"
                    connectionStatus = "已配 Mac · \(pairedDevice.displaySummary)"
                    if !didAutoRefreshOnAppear {
                        didAutoRefreshOnAppear = true
                        Task { await testConnection() }
                    }
                }
            }
            .onChange(of: selectedLanguageRaw) { _, newValue in
                guard let language = AppLanguageOption(rawValue: newValue) else {
                    selectedLanguageRaw = AppLanguageOption.systemPreferredOption().rawValue
                    return
                }
                store.saveAppLanguage(language)
                WidgetCenter.shared.reloadAllTimelines()
            }
            .onChange(of: usageProviderModeRaw) { _, newValue in
                guard UsageProviderMode(rawValue: newValue) != nil else {
                    usageProviderModeRaw = UsageProviderMode.both.rawValue
                    return
                }
                store.saveUsageProviderModeRaw(newValue)
                WidgetCenter.shared.reloadAllTimelines()
            }
            .sheet(isPresented: $showingScanner) {
                scannerSheet
            }
            .onOpenURL { url in
                handleOpenURL(url)
            }
        }
    }

    private func migrateUsageProviderModeIfNeeded() {
        if let sharedRawValue = store.loadUsageProviderModeRaw(),
           UsageProviderMode(rawValue: sharedRawValue) != nil {
            usageProviderModeRaw = sharedRawValue
            return
        }

        if let legacyRawValue = UserDefaults.standard.string(forKey: AppGroup.usageProviderModeKey),
           UsageProviderMode(rawValue: legacyRawValue) != nil {
            usageProviderModeRaw = legacyRawValue
            store.saveUsageProviderModeRaw(legacyRawValue)
            WidgetCenter.shared.reloadAllTimelines()
            return
        }

        store.saveUsageProviderModeRaw(usageProviderModeRaw)
    }

    private var pairedHeaderView: some View {
        Text(text.appName)
            .font(.system(size: 42, weight: .bold))
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.72)
            .padding(.top, 18)
            .accessibilityAddTraits(.isHeader)
    }

    private var firstRunPairingView: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                Text(text.firstRunTitle)
                    .font(.largeTitle.bold())
                Text(text.firstRunMessage)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(alignment: .top, spacing: 14) {
                Image(systemName: "desktopcomputer")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(.orange)
                    .frame(width: 52, height: 52)
                    .background(.orange.opacity(0.14), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                VStack(alignment: .leading, spacing: 6) {
                    Text(text.macConnectorInstallTitle)
                        .font(.headline)
                    Text(text.macConnectorInstallBody)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(14)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

            HStack(alignment: .top, spacing: 14) {
                Image(systemName: "qrcode.viewfinder")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(.blue)
                    .frame(width: 52, height: 52)
                    .background(.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                VStack(alignment: .leading, spacing: 6) {
                    Text(text.qrGuidanceTitle)
                        .font(.headline)
                    Text(text.qrGuidanceBody)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(14)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

            HStack(spacing: 12) {
                scanPairingButton
                    .buttonStyle(.borderedProminent)
                Button(text.manualInput) {
                    showingManualPairing.toggle()
                }
                .buttonStyle(.bordered)
            }

            if showingManualPairing {
                manualPairingBox
            }

            if !pairingSaveStatus.isEmpty || connectionStatus != "还没配 Mac" {
                Text(pairingSaveStatus.isEmpty ? connectionStatus : pairingSaveStatus)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var pairedDashboardView: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 12) {
                Text(text.usage)
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.76)
                    .fixedSize(horizontal: false, vertical: true)
                    .layoutPriority(2)

                HStack(alignment: .center, spacing: 12) {
                    Text(headerStatusText)
                        .font(.caption.monospaced())
                        .foregroundStyle(UsageAppTheme.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                        .layoutPriority(1)

                    Spacer(minLength: 10)
                    usageRefreshButton
                }
            }

            if visibleProviders.count > 1 {
                HStack(alignment: .top, spacing: 16) {
                    ForEach(Array(visibleProviders.enumerated()), id: \.element.id) { index, provider in
                        if index > 0 {
                            Rectangle()
                                .fill(Color.white.opacity(0.16))
                                .frame(width: 1)
                                .padding(.vertical, 4)
                        }
                        usageCard(for: provider)
                    }
                }
            } else {
                ForEach(visibleProviders) { provider in
                    usageCard(for: provider, framed: true)
                }
            }

        }
        .padding(20)
        .background(UsageAppTheme.panelBackground, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(UsageAppTheme.border)
        )
    }

    private var usageRefreshButton: some View {
        Button {
            Task { await testConnection() }
        } label: {
            HStack(spacing: 8) {
                RefreshActivityGlyph(isRefreshing: isRefreshingUsage, size: 23, showsBackground: false)
                Text(text.refresh)
                    .font(.subheadline.weight(.bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.74)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 15)
            .frame(minWidth: 128, minHeight: 42)
            .background(
                LinearGradient(
                    colors: [
                        Color.white.opacity(isRefreshingUsage ? 0.24 : 0.18),
                        Color.white.opacity(isRefreshingUsage ? 0.13 : 0.09),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: Capsule()
            )
            .overlay(
                Capsule()
                    .stroke(Color.white.opacity(isRefreshingUsage ? 0.26 : 0.12), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.22), radius: 10, x: 0, y: 6)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isRefreshingUsage)
        .accessibilityLabel(text.refresh)
    }

    private var headerStatusText: String {
        if isRefreshingUsage {
            return text.refreshLoading
        }

        if connectionStatus == text.refreshSuccess {
            return text.refreshSuccess
        }

        if previewSnapshot.device.online {
            return CacheStatusFormatter.caption(
                source: previewCacheSource ?? "widget-lan",
                savedAt: previewCacheSavedAt,
                fallbackDate: previewSnapshot.device.updatedAt,
                language: text.option
            )
        }

        return text.refreshFailure
    }

    private func usageCard(for provider: AIUsageSnapshot.Provider, framed: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(provider.displayName)
                    .font(.title3.bold())
                    .foregroundStyle(UsageAppTheme.providerColor(provider.id))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Spacer()
                Circle()
                    .fill(provider.connected ? Color.green : UsageAppTheme.muted)
                    .frame(width: 7, height: 7)
            }

            if provider.usage.available,
               let fiveHour = provider.usage.fiveHourRemainingPercent,
               let weekly = provider.usage.weeklyRemainingPercent {
                usageRow(title: "5h", percent: fiveHour, resetAt: provider.usage.fiveHourResetAt, provider: provider)
                usageRow(title: text.weekLabel, percent: weekly, resetAt: provider.usage.weeklyResetAt, provider: provider)
            } else {
                Text(previewUsageCaption(for: provider))
                    .font(.headline.bold())
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text(provider.connected ? text.officialHidingSubtitle : text.loginOnComputerSubtitle)
                    .font(.caption)
                    .foregroundStyle(UsageAppTheme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
        }
        .padding(framed ? 14 : 0)
        .frame(maxWidth: .infinity, minHeight: 126, alignment: .topLeading)
        .background(framed ? UsageAppTheme.insetBackground : Color.clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func usageRow(
        title: String,
        percent: Int,
        resetAt: Date?,
        provider: AIUsageSnapshot.Provider
    ) -> some View {
        let clampedPercent = min(max(percent, 0), 100)

        return VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(title)
                    .foregroundStyle(UsageAppTheme.muted)
                Spacer()
                Text("\(clampedPercent)%")
                    .font(.title3.bold())
                    .foregroundStyle(.white)
            }

            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(UsageAppTheme.rail)
                    Capsule()
                        .fill(UsageAppTheme.meterColor(clampedPercent))
                        .frame(width: proxy.size.width * CGFloat(clampedPercent) / 100)
                }
            }
            .frame(height: 8)

            Text(usageResetCaption(resetAt: resetAt, provider: provider))
                .font(.caption)
                .foregroundStyle(UsageAppTheme.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .font(.callout.monospacedDigit())
    }

    private var settingsView: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(text.settings)
                .font(.title2.bold())
                .foregroundStyle(.white)

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label(text.language, systemImage: "globe")
                    Spacer()
                    Picker(text.language, selection: $selectedLanguageRaw) {
                        ForEach(AppLanguageOption.allCases) { option in
                            Text(option.title).tag(option.rawValue)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(.white)
                }

                Picker(text.display, selection: $usageProviderModeRaw) {
                    ForEach(UsageProviderMode.allCases) { mode in
                        Text(mode.title).tag(mode.rawValue)
                    }
                }
                .pickerStyle(.segmented)

                HStack {
                    Label(text.display, systemImage: "rectangle.on.rectangle")
                    Spacer()
                    Text(usageProviderMode.title)
                }
                HStack {
                    Label(text.computerStatus, systemImage: pairedDevice == nil ? "link.slash" : "link")
                    Spacer()
                    Text(pairedDevice == nil ? text.unpaired : text.paired)
                }
                HStack {
                    Label(text.offlinePolicy, systemImage: "clock.arrow.circlepath")
                    Spacer()
                    Text(text.keepLastKnown)
                }
            }
            .foregroundStyle(UsageAppTheme.muted)

            if pairedDevice != nil {
                Button(role: .destructive) {
                    pairingStore.clear()
                    pairedDevice = nil
                    connectionStatus = "还没配 Mac"
                    pairingSaveStatus = ""
                    WidgetCenter.shared.reloadAllTimelines()
                } label: {
                    Label(text.unpair, systemImage: "xmark.circle")
                }
                .buttonStyle(.bordered)
            }

            diagnosticsDisclosure
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(UsageAppTheme.panelBackground, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(UsageAppTheme.border)
        )
    }

    private var diagnosticsDisclosure: some View {
        DisclosureGroup(text.diagnostics) {
            VStack(alignment: .leading, spacing: 12) {
                Text(connectionStatus)
                    .foregroundStyle(UsageAppTheme.muted)

                if !connectionDetails.isEmpty {
                    Text(connectionDetails)
                        .font(.caption.monospaced())
                        .foregroundStyle(UsageAppTheme.muted)
                        .lineLimit(8)
                        .textSelection(.enabled)
                }

                Divider()
                    .background(UsageAppTheme.border)

                Text(widgetLANDiagnosticText)
                    .font(.caption)
                    .foregroundStyle(UsageAppTheme.muted)

                Button(text.refreshDiagnostics) {
                    refreshWidgetLANDiagnostic()
                }
                .buttonStyle(.bordered)

                if isProofModeEnabled {
                    debugToolsView
                }
            }
            .padding(.top, 10)
        }
        .foregroundStyle(UsageAppTheme.muted)
    }

    private var debugToolsView: some View {
        DisclosureGroup("开发与调试") {
            VStack(alignment: .leading, spacing: 16) {
                debugPairingSection
                debugWidgetSection
                debugApprovalSection
                debugAppGroupSection
                debugFixtureSection
            }
            .padding(.top, 12)
        }
        .padding(20)
        .background(UsageAppTheme.insetBackground, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var manualPairingBox: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextEditor(text: $pairingText)
                .frame(minHeight: 82)
                .font(.caption.monospaced())
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.asciiCapable)
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(Color.secondary.opacity(0.22))
                )

            HStack {
                Button(text.savePairingJSON) {
                    savePairingFromText()
                }
                .buttonStyle(.bordered)

                Text(text.manualPairingHint)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var debugPairingSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            proofCaption("Proof 02/03/07 · 配对、LAN 缓存、Widget 回 App")
            Text(pairedDevice.map { "已配 Mac · \($0.displaySummary)" } ?? "还没配")
                .foregroundStyle(.secondary)
            pairingControlGroup
            Button("刷新 Usage") {
                Task { await testConnection() }
            }
            Text(connectionStatus)
                .foregroundStyle(.secondary)
            if !connectionDetails.isEmpty {
                Text(connectionDetails)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
            }
            Text(widgetOpenProofText)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var debugWidgetSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider()
            proofCaption("Proof 04 · Widget LAN")
            Text(widgetLANDiagnosticText)
                .font(.caption)
                .foregroundStyle(.secondary)
            Button("刷新诊断") {
                refreshWidgetLANDiagnostic()
            }
            .buttonStyle(.bordered)
        }
    }

    private var debugApprovalSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider()
            proofCaption("Proof 08/09/11/12 · Mac 请求，不是本地测试")
            if let pendingApproval {
                Text(pendingApproval.title)
                    .font(.headline)
                Text(approvalCaption(for: pendingApproval))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                approvalDecisionButtons
            } else {
                Text("没有待批请求，先别装忙😏")
                    .foregroundStyle(.secondary)
            }
            if let lastApprovalDecision {
                Text("\(lastApprovalDecision.action.displayName) · \(approvalTime(lastApprovalDecision.decidedAt))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let lastApprovalAttemptDiagnostic {
                Text(approvalAttemptCaption(for: lastApprovalAttemptDiagnostic))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            approvalControlGroup
            Text(approvalStatusText)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var debugAppGroupSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider()
            proofCaption("Proof 01 · App Group")
            Text(AppGroup.statusText)
                .font(.caption)
                .foregroundStyle(AppGroup.isAvailable ? Color.secondary : Color.red)
            Text(AppGroup.statusDetailText)
                .font(.caption)
                .foregroundStyle(AppGroup.identifierSource.usesFallback ? Color.orange : Color.secondary)
            Text("证明模式：\(isProofModeEnabled ? "开启" : "关闭")")
                .font(.caption)
                .foregroundStyle(isProofModeEnabled ? Color.orange : Color.secondary)
            Text(proofText)
            HStack {
                Button("写入测试字符串") {
                    let value = "Proof \(proofTimestamp())"
                    do {
                        try store.writeAppGroupProof(value)
                        proofText = store.readAppGroupProof()
                        isProofModeEnabled = store.isProofModeEnabled()
                        store.clearWidgetLANDiagnostic()
                        widgetLANDiagnosticText = "证明模式已开启，Widget LAN 暂停"
                        WidgetCenter.shared.reloadAllTimelines()
                    } catch {
                        proofText = error.localizedDescription
                    }
                }
                Button("关闭证明模式") {
                    do {
                        try store.disableProofMode()
                        proofText = store.readAppGroupProof()
                        isProofModeEnabled = store.isProofModeEnabled()
                        store.clearWidgetLANDiagnostic()
                        widgetLANDiagnosticText = "证明模式已关闭，可以测试 Widget LAN"
                        WidgetCenter.shared.reloadAllTimelines()
                    } catch {
                        proofText = error.localizedDescription
                    }
                }
            }
            .buttonStyle(.bordered)
        }
    }

    private var debugFixtureSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider()
            proofCaption("Proof 05/06 · 离线/最终 Widget")
            Text(cacheStatusText)
                .font(.caption)
                .foregroundStyle(.secondary)
            ForEach(previewSnapshot.providers) { provider in
                HStack {
                    Text(provider.displayName)
                    Spacer()
                    Text(previewUsageCaption(for: provider))
                        .foregroundStyle(.secondary)
                }
            }
            Text(saveStatus)
                .font(.caption)
                .foregroundStyle(.secondary)
            ForEach(PreviewSnapshots.allFixtures) { fixture in
                Button("缓存 \(fixture.title)") {
                    cacheFixture(fixture)
                }
            }
            Button("清除 widget 缓存", role: .destructive) {
                store.clearCachedSnapshot()
                store.clearWidgetLANDiagnostic()
                reloadPreviewFromStore()
                WidgetCenter.shared.reloadAllTimelines()
                saveStatus = "已清除缓存"
                refreshWidgetLANDiagnostic()
            }
        }
        .buttonStyle(.bordered)
    }

    @ViewBuilder
    private var pairingControlGroup: some View {
        ViewThatFits(in: .horizontal) {
            HStack {
                savePairingButton
                scanPairingButton
            }

            VStack(alignment: .leading, spacing: 8) {
                savePairingButton
                scanPairingButton
            }
        }
        .buttonStyle(.bordered)
    }

    private var savePairingButton: some View {
        Button(text.savePairingJSON) {
            savePairingFromText()
        }
    }

    private var scanPairingButton: some View {
        Button(text.scanQRCode) {
            scannerErrorText = ""
            isHandlingScan = false
            showingScanner = true
        }
    }

    @ViewBuilder
    private var approvalDecisionButtons: some View {
        ViewThatFits(in: .horizontal) {
            HStack {
                approveButton
                denyButton
            }

            VStack(alignment: .leading, spacing: 8) {
                approveButton
                denyButton
            }
        }
    }

    private var approveButton: some View {
        Button("放行") {
            Task {
                await decideApproval(.approve)
            }
        }
        .buttonStyle(.borderedProminent)
    }

    private var denyButton: some View {
        Button("驳回", role: .destructive) {
            Task {
                await decideApproval(.deny)
            }
        }
        .buttonStyle(.bordered)
    }

    @ViewBuilder
    private var approvalControlGroup: some View {
        ViewThatFits(in: .horizontal) {
            HStack {
                refreshApprovalButton
                seedApprovalButton
                clearApprovalButton
            }

            VStack(alignment: .leading, spacing: 8) {
                refreshApprovalButton
                seedApprovalButton
                clearApprovalButton
            }
        }
        .buttonStyle(.bordered)
    }

    private var refreshApprovalButton: some View {
        Button("从 Mac 拉请求") {
            Task {
                await refreshApprovalFromMac()
            }
        }
    }

    private var seedApprovalButton: some View {
        Button("本地 UI 测试请求") {
            seedApprovalFixture()
        }
    }

    private var clearApprovalButton: some View {
        Button("清掉本地测试", role: .destructive) {
            clearApprovalFixture()
        }
    }

    @ViewBuilder
    private var scannerSheet: some View {
        #if canImport(VisionKit)
        if #available(iOS 16.0, *) {
            if !scannerErrorText.isEmpty {
                scannerFallback(scannerErrorText)
            } else if let reason = PairingScannerAvailability.unavailableReason {
                scannerFallback(reason)
            } else {
                VStack(spacing: 0) {
                    HStack(alignment: .center, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(text.scannerTitle)
                                .font(.headline)
                            Text(text.scannerHint)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button(text.manualPaste) {
                            scannerErrorText = ""
                            showingScanner = false
                            isHandlingScan = false
                        }
                        Button(text.cancel) {
                            scannerErrorText = ""
                            showingScanner = false
                            isHandlingScan = false
                        }
                    }
                    .padding()

                    Divider()

                    PairingScannerView(
                        onText: { text in
                            guard !isHandlingScan else {
                                return
                            }
                            isHandlingScan = true
                            pairingText = text
                            if savePairingFromText() {
                                scannerErrorText = ""
                                showingScanner = false
                            } else {
                                scannerErrorText = connectionStatus
                                isHandlingScan = false
                            }
                        },
                        onError: { message in
                            connectionStatus = message
                            scannerErrorText = message
                            isHandlingScan = false
                        }
                    )
                    .ignoresSafeArea(edges: .bottom)
                }
            }
        } else {
            scannerFallback(text.scannerUnsupported)
        }
        #else
        scannerFallback(text.scannerUnsupported)
        #endif
    }

    private func scannerFallback(_ message: String) -> some View {
        VStack(spacing: 16) {
            Text(message)
                .font(.headline)
            Text(text.scannerFallbackHint)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button(text.manualPaste) {
                connectionStatus = message
                scannerErrorText = ""
                isHandlingScan = false
                showingScanner = false
            }
        }
        .padding()
    }

    private func proofTimestamp(date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: date)
    }

    private func approvalTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    private func approvalCaption(for request: ApprovalRequest) -> String {
        var parts = [request.source, "创建 \(approvalTime(request.createdAt))"]
        if let expiresAt = request.expiresAt {
            parts.append("\(approvalTime(expiresAt)) 前不点就过期")
        }
        return parts.joined(separator: " · ")
    }

    private func approvalAttemptCaption(for diagnostic: ApprovalAttemptDiagnostic) -> String {
        var parts = [
            "\(diagnostic.origin.displayName) 上次",
            diagnostic.outcome.displayName,
            approvalTime(diagnostic.attemptedAt),
            diagnostic.detail
        ]
        if let httpStatus = diagnostic.httpStatus {
            parts.append("HTTP \(httpStatus)")
        }
        if let attemptedHostCount = diagnostic.attemptedHostCount {
            parts.append("试了 \(attemptedHostCount) 个地址")
        }
        return parts.joined(separator: " · ")
    }

    private func proofCaption(_ text: String) -> some View {
        Text(text)
            .font(.caption2.monospaced())
            .foregroundStyle(.secondary)
    }

    @discardableResult
    private func savePairingFromText() -> Bool {
        do {
            let payload = try pairingStore.parse(pairingText)
            try pairingStore.save(payload)
            guard let savedPayload = pairingStore.load(), savedPayload == payload else {
                throw PairingError.persistenceFailed
            }
            pairedDevice = savedPayload
            connectionStatus = "已配 Mac · \(savedPayload.displaySummary)"
            connectionDetails = ""
            pairingText = ""
            showingManualPairing = false
            pairingSaveStatus = "已保存配对。token 不回显，别给别人看。"
            store.clearWidgetLANDiagnostic()
            widgetLANDiagnosticText = "配对已更新，Widget 还没重新试"
            WidgetCenter.shared.reloadAllTimelines()
            return true
        } catch {
            connectionStatus = error.localizedDescription
            pairingSaveStatus = error.localizedDescription
            connectionDetails = ""
            store.clearWidgetLANDiagnostic()
            widgetLANDiagnosticText = "配对没存成，旧 Widget LAN 诊断已清"
            WidgetCenter.shared.reloadAllTimelines()
            return false
        }
    }

    private func handleOpenURL(_ url: URL) {
        guard WidgetRefreshDeepLink.isRefreshURL(url) else {
            return
        }

        Task {
            await refreshFromWidgetTap()
        }
    }

    private func cacheFixture(_ fixture: PreviewSnapshotFixture) {
        do {
            try store.saveCachedSnapshot(fixture.snapshot, source: "fixture:\(fixture.id)")
            reloadPreviewFromStore()
            WidgetCenter.shared.reloadAllTimelines()
            saveStatus = "已缓存 \(fixture.title)"
        } catch {
            saveStatus = "缓存失败"
        }
    }

    @MainActor
    private func testConnection() async {
        guard !isRefreshingUsage else {
            return
        }

        guard let payload = pairedDevice ?? pairingStore.load() else {
            connectionStatus = "先配 Mac，别空手套用量😒"
            connectionDetails = ""
            return
        }

        isRefreshingUsage = true
        defer { isRefreshingUsage = false }

        _ = await refreshFromLAN(
            payload: payload,
            startStatus: text.refreshLoading,
            successStatus: { _ in text.refreshSuccess }
        )
    }

    @MainActor
    private func refreshFromWidgetTap() async {
        guard !isRefreshingUsage else {
            return
        }

        isRefreshingUsage = true
        defer { isRefreshingUsage = false }

        pairedDevice = pairingStore.load()
        reloadPreviewFromStore()
        refreshWidgetLANDiagnostic()
        refreshApprovalState()

        guard let payload = pairedDevice else {
            connectionStatus = "Widget 喊你先配 Mac"
            connectionDetails = ""
            widgetOpenProofText = WidgetTapProofText.openedWithoutPairing()
            return
        }

        widgetOpenProofText = WidgetTapProofText.openedRefreshing()
        let refreshed = await refreshFromLAN(
            payload: payload,
            startStatus: text.refreshLoading,
            successStatus: { _ in text.refreshSuccess }
        )
        widgetOpenProofText = refreshed
            ? WidgetTapProofText.openedRefreshed()
            : WidgetTapProofText.openedRefreshFailed()
    }

    @MainActor
    private func refreshFromLAN(
        payload: PairingPayload,
        startStatus: String,
        successStatus: (String) -> String
    ) async -> Bool {
        connectionStatus = startStatus
        connectionDetails = ""

        do {
            let pingResult = try await source.pingWithReport(payload)
            connectionDetails = LocalHTTPReportFormatter.diagnosticText(report: pingResult.report, label: "ping")

            let snapshotResult = try await source.snapshotWithReport(payload)
            connectionDetails = [
                LocalHTTPReportFormatter.diagnosticText(report: pingResult.report, label: "ping"),
                LocalHTTPReportFormatter.diagnosticText(report: snapshotResult.report, label: "snapshot")
            ].joined(separator: "\n")
            try store.saveCachedSnapshot(snapshotResult.value, source: "lan")
            try? await refreshApprovalFromMac(payload: payload, updateStatus: false)
            reloadPreviewFromStore()
            refreshApprovalState()
            WidgetCenter.shared.reloadAllTimelines()
            connectionStatus = successStatus(pingResult.value)
            return true
        } catch {
            connectionStatus = refreshFailureStatus(for: error)
            if let failure = error as? LocalHTTPFailure {
                connectionDetails = [
                    LocalHTTPReportFormatter.diagnosticText(report: failure.report, label: failure.report.path),
                    LocalNetworkPermissionHint.text(for: failure.report)
                ]
                .filter { !$0.isEmpty }
                .joined(separator: "\n")
            } else {
                connectionDetails = ""
            }
            return false
        }
    }

    private func refreshFailureStatus(for error: Error) -> String {
        let message = error.localizedDescription
        if message.localizedCaseInsensitiveContains("timeout") || message.contains("超时") || message.contains("超時") {
            return text.refreshTimeout
        }

        return text.refreshFailure
    }

    private func reloadPreviewFromStore(now: Date = Date()) {
        guard let record = store.loadCachedSnapshotRecord() else {
            previewSnapshot = PreviewSnapshots.noCacheFallback
        previewCacheSavedAt = nil
        previewCacheSource = nil
            cacheStatusText = text.noCache
            return
        }

        previewSnapshot = record.snapshot
        previewCacheSavedAt = record.savedAt
        previewCacheSource = record.source
        cacheStatusText = CacheStatusFormatter.caption(
            source: record.source,
            savedAt: record.savedAt,
            fallbackDate: record.snapshot.device.updatedAt,
            now: now,
            language: text.option
        )
    }

    private func refreshWidgetLANDiagnostic() {
        guard let diagnostic = store.loadWidgetLANDiagnostic() else {
            widgetLANDiagnosticText = isProofModeEnabled
                ? "证明模式开着，Widget LAN 暂停"
                : "Widget 还没留下 LAN 小纸条"
            return
        }

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "HH:mm:ss"

        var lines = [
            "\(formatter.string(from: diagnostic.attemptedAt)) · \(diagnostic.outcome.displayName)",
            diagnostic.detail
        ]

        let metadata = widgetLANDiagnosticMetadata(diagnostic)
        if !metadata.isEmpty {
            lines.append(metadata)
        }
        if let approvalSync = diagnostic.approvalSync {
            lines.append(widgetApprovalSyncMetadata(approvalSync))
        }

        widgetLANDiagnosticText = lines.joined(separator: "\n")
    }

    private func widgetLANDiagnosticMetadata(_ diagnostic: WidgetLANDiagnostic) -> String {
        var parts: [String] = []
        if let path = diagnostic.path {
            parts.append(path)
        }
        if let httpStatus = diagnostic.httpStatus {
            parts.append("HTTP \(httpStatus)")
        }
        if let attemptedHostCount = diagnostic.attemptedHostCount {
            parts.append("试了 \(attemptedHostCount) 个地址")
        }
        return parts.joined(separator: " · ")
    }

    private func widgetApprovalSyncMetadata(_ diagnostic: WidgetApprovalSyncDiagnostic) -> String {
        var parts = [
            "审批 \(diagnostic.outcome.displayName)",
            diagnostic.detail
        ]
        if let httpStatus = diagnostic.httpStatus {
            parts.append("HTTP \(httpStatus)")
        }
        if let attemptedHostCount = diagnostic.attemptedHostCount {
            parts.append("试了 \(attemptedHostCount) 个地址")
        }
        return parts.joined(separator: " · ")
    }

    private func refreshApprovalState(now: Date = Date()) {
        pendingApproval = approvalStore.loadPendingRequest(now: now)
        lastApprovalDecision = approvalStore.loadLastDecision()
        lastApprovalAttemptDiagnostic = approvalStore.loadLastAttemptDiagnostic()

        if pendingApproval?.isLocalUIFixture == true {
            approvalStatusText = "本地测试，别拿去验收😏"
        } else if pendingApproval != nil {
            approvalStatusText = "Widget 上也能点，别拖了🙃"
        } else if lastApprovalDecision != nil {
            approvalStatusText = "上一票已经记下"
        } else {
            approvalStatusText = "没有待批请求"
        }
    }

    @MainActor
    private func refreshApprovalFromMac() async {
        guard let payload = pairedDevice ?? pairingStore.load() else {
            approvalStatusText = "先配 Mac，别隔空批奏折😏"
            return
        }

        do {
            try await refreshApprovalFromMac(payload: payload, updateStatus: true)
            refreshApprovalState()
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            approvalStatusText = error.localizedDescription
        }
    }

    private func refreshApprovalFromMac(payload: PairingPayload, updateStatus: Bool) async throws {
        let result = try await source.approvalRequestWithReport(payload)
        if let request = result.value {
            try approvalStore.savePendingRequest(request)
            if updateStatus {
                approvalStatusText = "Mac 丢来一条待批🙃"
            }
        } else {
            if updateStatus {
                approvalStatusText = "Mac 暂时没新请求，本地待批先留着"
            }
        }
    }

    @MainActor
    private func decideApproval(_ action: ApprovalDecision.Action) async {
        guard let pendingApproval else {
            approvalStatusText = "请求已经没了，别补刀😏"
            refreshApprovalState()
            return
        }

        do {
            let handler = ApprovalDecisionHandler(
                approvalStore: approvalStore,
                pairingStore: pairingStore,
                source: source
            )
            switch try await handler.decide(requestId: pendingApproval.id, action: action) {
            case .recordedLocal(let decision):
                try? approvalStore.saveApprovalAttemptDiagnostic(.success(
                    result: .recordedLocal(decision),
                    origin: .app
                ))
                approvalStatusText = "\(decision.action.displayName)，本地 UI 记下了🙃"
            case .sentToMac(let decision):
                try? approvalStore.saveApprovalAttemptDiagnostic(.success(
                    result: .sentToMac(decision),
                    origin: .app
                ))
                approvalStatusText = "\(decision.action.displayName)，Mac 收到了🙃"
            }
            refreshApprovalState()
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            try? approvalStore.saveApprovalAttemptDiagnostic(.failure(
                requestId: pendingApproval.id,
                action: action,
                origin: .app,
                error: error
            ))
            approvalStatusText = error.localizedDescription
            refreshApprovalState()
        }
    }

    private func seedApprovalFixture() {
        do {
            _ = try approvalStore.seedFixtureRequest()
            refreshApprovalState()
            WidgetCenter.shared.reloadAllTimelines()
            approvalStatusText = "本地测试请求已丢给 Widget"
        } catch {
            approvalStatusText = error.localizedDescription
        }
    }

    private func clearApprovalFixture() {
        guard let pending = approvalStore.loadPendingRequest() else {
            pendingApproval = nil
            approvalStatusText = "没有测试请求可清"
            return
        }
        guard pending.isLocalUIFixture else {
            pendingApproval = pending
            approvalStatusText = "这是 Mac 请求，得等 Mac 收到决定"
            return
        }
        approvalStore.clearPendingRequest()
        refreshApprovalState()
        WidgetCenter.shared.reloadAllTimelines()
        approvalStatusText = "清掉了，别说没给机会😏"
    }

    private func previewUsageCaption(for provider: AIUsageSnapshot.Provider) -> String {
        if provider.usage.available,
           provider.usage.source != nil,
           provider.capturedAt != nil,
           let percent = provider.usage.fiveHourRemainingPercent {
            return "\(percent)%"
        }

        switch provider.usage.reason {
        case .thirdPartyNoQuota:
            return text.noMeter
        case .notLoggedIn:
            return text.notLoggedIn
        case .collectorError:
            return text.collectorError
        case .noStableSource, .none:
            return provider.connected ? text.usageMystery : text.notLoggedIn
        }
    }

    private func usageResetCaption(resetAt: Date?, provider: AIUsageSnapshot.Provider) -> String {
        if UsageFreshness.isStale(
            snapshotUpdatedAt: previewSnapshot.device.updatedAt,
            providerCapturedAt: provider.capturedAt,
            cacheSavedAt: previewCacheSavedAt,
            now: Date()
        ) {
            return text.oldRecordWarning
        }

        if UsageFreshness.isLastKnownFallback(
            snapshotUpdatedAt: previewSnapshot.device.updatedAt,
            providerCapturedAt: provider.capturedAt,
            cacheSource: previewCacheSource,
            providerId: provider.id
        ) {
            return text.lastKnownFallback
        }

        guard let resetAt else {
            return text.resetUnknown
        }

        return text.resetCaption(resetAt, referenceDate: previewSnapshot.device.updatedAt)
    }
}

private struct RefreshActivityGlyph: View {
    let isRefreshing: Bool
    var size: CGFloat = 36
    var tint: Color = .white
    var showsBackground = true

    var body: some View {
        ZStack {
            if showsBackground {
                Circle()
                    .fill(Color.white.opacity(0.10))
            }
            Circle()
                .stroke(tint.opacity(isRefreshing ? 0.30 : 0.00), lineWidth: 2)

            if isRefreshing {
                ProgressView()
                    .controlSize(.small)
                    .tint(tint)
            } else {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: size * 0.42, weight: .bold))
                    .foregroundStyle(tint)
            }
        }
        .frame(width: size, height: size)
        .animation(.easeInOut(duration: 0.18), value: isRefreshing)
    }
}

private extension WidgetLANDiagnostic.Outcome {
    var displayName: String {
        switch self {
        case .success:
            return "Widget 摸到了"
        case .failure:
            return "Widget 翻车了"
        case .skipped:
            return "Widget 没出手"
        }
    }
}

private extension WidgetApprovalSyncDiagnostic.Outcome {
    var displayName: String {
        switch self {
        case .savedRequest:
            return "摸到新活"
        case .noRequest:
            return "没新活"
        case .failure:
            return "翻车了"
        case .timedOut:
            return "超时了"
        }
    }
}

private extension ApprovalAttemptDiagnostic.Origin {
    var displayName: String {
        switch self {
        case .app:
            return "App"
        case .widget:
            return "Widget"
        }
    }
}

private extension ApprovalAttemptDiagnostic.Outcome {
    var displayName: String {
        switch self {
        case .sentToMac:
            return "Mac 已收"
        case .recordedLocalFixture:
            return "本地已记"
        case .missingPendingRequest:
            return "请求没了"
        case .missingPairing:
            return "还没配 Mac"
        case .expiredRequest:
            return "过期了"
        case .rejectedByMac:
            return "Mac 不收"
        case .transportFailure:
            return "摸不到 Mac"
        case .writeFailed:
            return "写入翻车"
        case .invalidAction:
            return "动作离谱"
        }
    }
}
