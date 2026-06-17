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

enum AppText {
    private static var selectedLanguage: AppLanguageOption {
        guard let rawValue = UserDefaults.standard.string(forKey: AppLanguageOption.storageKey),
              let option = AppLanguageOption(rawValue: rawValue) else {
            return .systemPreferredOption()
        }
        return option
    }

    static func localized(
        english: String,
        simplified: String,
        traditional: String,
        spanish: String,
        portuguese: String? = nil,
        japanese: String? = nil
    ) -> String {
        switch selectedLanguage {
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

    static var language: String {
        localized(english: "Language", simplified: "语言", traditional: "語言", spanish: "Idioma", portuguese: "Idioma", japanese: "言語")
    }
    static var appName: String {
        localized(
            english: "AI Usage Connector",
            simplified: "AI Usage 连接器",
            traditional: "AI Usage 連接器",
            spanish: "Conector AI Usage",
            portuguese: "Conector AI Usage",
            japanese: "AI Usage コネクタ"
        )
    }
    static var menuBarName: String { "AI Usage" }

    static var commandMenu: String {
        localized(english: "Connector", simplified: "连接器", traditional: "連接器", spanish: "Conector", portuguese: "Conector", japanese: "コネクタ")
    }
    static var refreshStatus: String {
        localized(english: "Refresh Status", simplified: "刷新状态", traditional: "重新整理狀態", spanish: "Actualizar estado", portuguese: "Atualizar estado", japanese: "状態を更新")
    }
    static var reloadService: String {
        localized(english: "Reload Service", simplified: "重载服务", traditional: "重新載入服務", spanish: "Recargar servicio", portuguese: "Recarregar serviço", japanese: "サービスを再読み込み")
    }

    static var setupNeeded: String {
        localized(english: "Setup needed", simplified: "需要设置", traditional: "需要設定", spanish: "Falta configurar", portuguese: "Falta configurar", japanese: "設定が必要")
    }
    static var readyForIPhone: String {
        localized(
            english: "iPhone gets to tease your Mac again😏",
            simplified: "iPhone 又能来撩你的 Mac 了😏",
            traditional: "iPhone 又能來撩你的 Mac 了😏",
            spanish: "El iPhone ya puede coquetear con tu Mac otra vez😏",
            portuguese: "O iPhone já pode flertar com seu Mac de novo😏",
            japanese: "iPhone、また君のMacをからかえます😏"
        )
    }
    static var runningNeedsCheck: String {
        localized(english: "Running, needs check", simplified: "运行中，待检查", traditional: "執行中，待檢查", spanish: "En ejecución, revisar", portuguese: "Rodando, dá uma conferida", japanese: "動いてるけど要確認")
    }
    static var installedStopped: String {
        localized(english: "Installed, stopped", simplified: "已安装，未运行", traditional: "已安裝，未執行", spanish: "Instalado, detenido", portuguese: "Instalado, parado", japanese: "インストール済み、停止中")
    }

    static var refreshFailed: String {
        localized(english: "Refresh failed", simplified: "刷新失败", traditional: "重新整理失敗", spanish: "Error al actualizar", portuguese: "Falha ao atualizar", japanese: "更新失敗")
    }
    static var installFailed: String {
        localized(english: "Install failed", simplified: "安装失败", traditional: "安裝失敗", spanish: "Error al instalar", portuguese: "Falha ao instalar", japanese: "インストール失敗")
    }
    static var startFailed: String {
        localized(english: "Start failed", simplified: "启动失败", traditional: "啟動失敗", spanish: "Error al iniciar", portuguese: "Falha ao iniciar", japanese: "起動失敗")
    }
    static var stopFailed: String {
        localized(english: "Stop failed", simplified: "停止失败", traditional: "停止失敗", spanish: "Error al detener", portuguese: "Falha ao parar", japanese: "停止失敗")
    }
    static var pairingFailed: String {
        localized(english: "Pairing failed", simplified: "配对失败", traditional: "配對失敗", spanish: "Error al vincular", portuguese: "Falha ao parear", japanese: "ペアリング失敗")
    }
    static var jsonMissing: String {
        localized(
            english: "Could not find JSON in connector output.",
            simplified: "连接器输出里没有找到 JSON。",
            traditional: "連接器輸出裡沒有找到 JSON。",
            spanish: "No se encontró JSON en la salida del conector.",
            portuguese: "Não achei JSON na saída do conector.",
            japanese: "コネクタ出力にJSONが見つかりません。どこに隠した？"
        )
    }
    static var repoNotFound: String {
        localized(
            english: "Could not find the AI Usage project folder.",
            simplified: "找不到 AI Usage 项目目录。",
            traditional: "找不到 AI Usage 專案目錄。",
            spanish: "No se encontró la carpeta del proyecto AI Usage.",
            portuguese: "Não achei a pasta do projeto AI Usage.",
            japanese: "AI Usageのプロジェクトフォルダが見つかりません。どこに隠した？"
        )
    }

    static var subtitle: String {
        localized(
            english: "Keep this Mac and the iPhone widget on the same Wi-Fi so it cannot pretend to vanish.",
            simplified: "把这台 Mac 和 iPhone 小组件拴在同一个 Wi-Fi 里，别让它装失踪。",
            traditional: "把這台 Mac 和 iPhone 小工具拴在同一個 Wi-Fi 裡，別讓它裝失蹤。",
            spanish: "Mantén este Mac y el widget del iPhone en el mismo Wi-Fi para que no finja desaparecer.",
            portuguese: "Mantém este Mac e o widget do iPhone no mesmo Wi-Fi, sem deixar ele fingir sumiço.",
            japanese: "このMacとiPhoneウィジェットを同じWi-Fiにつないで、失踪ごっこをさせない。"
        )
    }

    static var service: String {
        localized(english: "Service", simplified: "服务", traditional: "服務", spanish: "Servicio", portuguese: "Serviço", japanese: "サービス")
    }
    static var pairing: String {
        localized(english: "Pairing", simplified: "配对", traditional: "配對", spanish: "Vinculación", portuguese: "Pareamento", japanese: "ペアリング")
    }
    static var liveCheck: String {
        localized(english: "Live Check", simplified: "实时检查", traditional: "即時檢查", spanish: "Prueba en vivo", portuguese: "Teste ao vivo", japanese: "ライブ確認")
    }
    static var repo: String {
        localized(english: "Project Folder", simplified: "项目目录", traditional: "專案目錄", spanish: "Carpeta del proyecto", portuguese: "Pasta do projeto", japanese: "プロジェクトフォルダ")
    }
    static var launchAgent: String { "LaunchAgent" }
    static var running: String {
        localized(english: "Running", simplified: "运行中", traditional: "執行中", spanish: "En ejecución", portuguese: "Rodando", japanese: "実行中")
    }
    static var program: String {
        localized(english: "Program", simplified: "程序", traditional: "程式", spanish: "Programa", portuguese: "Programa", japanese: "プログラム")
    }
    static var config: String {
        localized(english: "Config", simplified: "配置", traditional: "設定", spanish: "Config", portuguese: "Config.", japanese: "設定")
    }
    static var port: String {
        localized(english: "Port", simplified: "端口", traditional: "連接埠", spanish: "Puerto", portuguese: "Porta", japanese: "ポート")
    }
    static var addresses: String {
        localized(english: "Addresses", simplified: "地址数", traditional: "位址數", spanish: "Direcciones", portuguese: "Endereços", japanese: "アドレス数")
    }
    static var ping: String { "Ping" }
    static var snapshot: String { "Snapshot" }
    static var reachable: String {
        localized(english: "Reachable", simplified: "可达地址", traditional: "可連線位址", spanish: "Accesibles", portuguese: "Acessíveis", japanese: "到達可能")
    }
    static var installed: String {
        localized(english: "Installed", simplified: "已安装", traditional: "已安裝", spanish: "Instalado", portuguese: "Instalado", japanese: "インストール済み")
    }
    static var missing: String {
        localized(english: "Missing", simplified: "缺失", traditional: "缺少", spanish: "Falta", portuguese: "Faltando", japanese: "不足")
    }
    static var yes: String {
        localized(english: "Yes", simplified: "是", traditional: "是", spanish: "Sí", portuguese: "Sim", japanese: "はい")
    }
    static var no: String {
        localized(english: "No", simplified: "否", traditional: "否", spanish: "No", portuguese: "Não", japanese: "いいえ")
    }
    static var present: String {
        localized(english: "Present", simplified: "已保存", traditional: "已儲存", spanish: "Presente", portuguese: "Presente", japanese: "保存済み")
    }
    static var valid: String {
        localized(english: "Valid", simplified: "有效", traditional: "有效", spanish: "Válido", portuguese: "Válido", japanese: "有効")
    }
    static var invalid: String {
        localized(english: "Invalid", simplified: "无效", traditional: "無效", spanish: "No válido", portuguese: "Inválido", japanese: "無効")
    }
    static var ok: String { "OK" }
    static var noStatusYet: String {
        localized(english: "No status yet", simplified: "还没检查", traditional: "尚未檢查", spanish: "Sin estado todavía", portuguese: "Ainda sem status", japanese: "まだ確認なし")
    }
    static var runRefreshHint: String {
        localized(
            english: "Poke your Mac once and see if it is still awake.",
            simplified: "抚摸一下你的 Mac，看看它还醒不醒。",
            traditional: "撫摸一下你的 Mac，看看它還醒不醒。",
            spanish: "Toca tu Mac una vez y mira si sigue despierto.",
            portuguese: "Toca no seu Mac uma vez e vê se ele continua acordado.",
            japanese: "君のMacを一回なでて、まだ起きてるか見てみる。"
        )
    }
    static var notFound: String {
        localized(english: "Not found", simplified: "没找到", traditional: "找不到", spanish: "No encontrado", portuguese: "Não encontrado", japanese: "見つからない")
    }

    static var refresh: String {
        localized(
            english: "Touch Mac🫳",
            simplified: "抚摸 Mac🫳",
            traditional: "撫摸 Mac🫳",
            spanish: "Toca el Mac🫳",
            portuguese: "Toca no Mac🫳",
            japanese: "Macをなでる🫳"
        )
    }
    static var installService: String {
        localized(english: "Set Up Helper", simplified: "启用后台助手", traditional: "啟用背景助手", spanish: "Activar ayudante", portuguese: "Ativar assistente", japanese: "補助サービスを有効化")
    }
    static var wakeBackgroundHelper: String {
        localized(english: "Wake Helper", simplified: "唤醒后台助手", traditional: "喚醒背景助手", spanish: "Despertar ayudante", portuguese: "Acordar assistente", japanese: "補助サービスを起こす")
    }
    static var repairBackgroundHelper: String {
        localized(english: "Repair Helper", simplified: "修复后台助手", traditional: "修復背景助手", spanish: "Reparar ayudante", portuguese: "Reparar assistente", japanese: "補助サービスを直す")
    }
    static var backgroundHelperSetupTitle: String {
        localized(
            english: "Put the helper in place first😏",
            simplified: "先把后台助手放好😏",
            traditional: "先把背景助手放好😏",
            spanish: "Primero deja el ayudante en su sitio😏",
            portuguese: "Primeiro põe o assistente no lugar😏",
            japanese: "まず補助係を座らせる😏"
        )
    }
    static var backgroundHelperSetupBody: String {
        localized(
            english: "Otherwise, close this window and the widget cannot touch this Mac.",
            simplified: "不然你关掉窗口，小组件就摸不到这台 Mac。",
            traditional: "不然你關掉視窗，小工具就摸不到這台 Mac。",
            spanish: "Si cierras esta ventana sin eso, el widget ya no puede tocar este Mac.",
            portuguese: "Sem isso, fechou a janela e o widget já não toca neste Mac.",
            japanese: "これなしでウィンドウを閉じると、ウィジェットはこのMacをなでられない。"
        )
    }
    static var backgroundHelperReadyTitle: String {
        localized(
            english: "Helper is in place",
            simplified: "后台助手已就位",
            traditional: "背景助手已就位",
            spanish: "Ayudante en su sitio",
            portuguese: "Assistente no lugar",
            japanese: "補助係、配置済み"
        )
    }
    static var peekAtPairingQR: String {
        localized(
            english: "Peek at the QR",
            simplified: "先看看二维码",
            traditional: "先看看 QR Code",
            spanish: "Mirar el QR primero",
            portuguese: "Espiar o QR primeiro",
            japanese: "先にQRを見る"
        )
    }
    static var start: String {
        localized(english: "Start", simplified: "启动", traditional: "啟動", spanish: "Iniciar", portuguese: "Iniciar", japanese: "起動")
    }
    static var stop: String {
        localized(english: "Stop", simplified: "停止", traditional: "停止", spanish: "Detener", portuguese: "Parar", japanese: "停止")
    }
    static var reload: String {
        localized(english: "Reload", simplified: "重载", traditional: "重新載入", spanish: "Recargar", portuguese: "Recarregar", japanese: "再読み込み")
    }
    static var pairIPhone: String {
        localized(english: "Pair iPhone", simplified: "配对 iPhone", traditional: "配對 iPhone", spanish: "Vincular iPhone", portuguese: "Parear iPhone", japanese: "iPhoneをペアリング")
    }

    static var privacyTitle: String {
        localized(english: "Privacy Boundary", simplified: "隐私边界", traditional: "隱私邊界", spanish: "Límite de privacidad", portuguese: "Limite de privacidade", japanese: "プライバシー境界")
    }
    static var privacyBody: String {
        localized(
            english: "Routine status does not show tokens, raw LAN addresses, cookies, transcripts, provider output, or long logs. The QR/manual pairing code contains a local bearer token and is shown only when you intentionally pair a phone.",
            simplified: "日常状态不会显示 token、局域网原始地址、Cookie、对话、provider 输出或长日志。二维码/手动配对码包含本地 bearer token，只在你主动配对手机时显示。",
            traditional: "日常狀態不會顯示 token、區域網路原始位址、Cookie、對話、provider 輸出或長日誌。QR Code/手動配對碼包含本機 bearer token，只在你主動配對手機時顯示。",
            spanish: "El estado normal no muestra tokens, direcciones LAN sin filtrar, cookies, conversaciones, salida del proveedor ni registros largos. El QR/código manual contiene un bearer token local y solo aparece cuando vinculas un teléfono.",
            portuguese: "O status normal não mostra tokens, endereços LAN brutos, cookies, conversas, saída do provider nem logs longos. O QR/código manual contém um bearer token local e só aparece quando você pareia um telefone.",
            japanese: "通常画面にはtoken、生LANアドレス、Cookie、会話、provider出力、長いログは出しません。QR/手動コードはローカルbearer token入りなので、iPhoneをペアリングするときだけ見せます。"
        )
    }

    static var snapshotValid: String {
        localized(english: "Snapshot valid", simplified: "Snapshot 有效", traditional: "Snapshot 有效", spanish: "Snapshot válido", portuguese: "Snapshot válido", japanese: "Snapshot有効")
    }
    static var snapshotNeedsCheck: String {
        localized(english: "Snapshot needs check", simplified: "Snapshot 待检查", traditional: "Snapshot 待檢查", spanish: "Snapshot por revisar", portuguese: "Snapshot para conferir", japanese: "Snapshot要確認")
    }
    static var snapshotFailed: String {
        localized(english: "Usage bailed again🙄", simplified: "Usage 又藏起来了🙄", traditional: "Usage 又藏起來了🙄", spanish: "Usage volvió a esconderse🙄", portuguese: "Usage se escondeu de novo🙄", japanese: "Usage、また隠れた🙄")
    }
    static var usage: String {
        localized(
            english: "Fine, here's only this much 🤏",
            simplified: "别问了 还剩这么点 🤏",
            traditional: "別問了 還剩這麼點 🤏",
            spanish: "Vale, solo queda esto 🤏",
            portuguese: "Tá, só sobrou isso 🤏",
            japanese: "はいはい、残りはこれっぽっち🤏"
        )
    }
    static var widgetHeader: String {
        localized(
            english: "Fine, here's only this much 🤏",
            simplified: "别问了 还剩这么点 🤏",
            traditional: "別問了 還剩這麼點 🤏",
            spanish: "Vale, solo queda esto 🤏",
            portuguese: "Tá, só sobrou isso 🤏",
            japanese: "はいはい、残りはこれっぽっち🤏"
        )
    }
    static var displayMode: String {
        localized(english: "Display", simplified: "显示", traditional: "顯示", spanish: "Vista", portuguese: "Exibição", japanese: "表示")
    }
    static var launchAtLogin: String {
        localized(english: "Launch at login", simplified: "开机启动", traditional: "開機啟動", spanish: "Abrir al iniciar", portuguese: "Abrir ao iniciar", japanese: "ログイン時に起動")
    }
    static var networkDiagnostics: String {
        localized(english: "Port / Network Diagnostics", simplified: "端口 / 网络诊断", traditional: "連接埠 / 網路診斷", spanish: "Puerto / diagnóstico de red", portuguese: "Porta / diagnóstico de rede", japanese: "ポート / ネットワーク診断")
    }
    static var serviceWillStart: String {
        localized(
            english: "The local service feeds the iPhone widget. Do not let it starve.",
            simplified: "本地服务喂给 iPhone 小组件，别让它饿着。",
            traditional: "本機服務餵給 iPhone 小工具，別讓它餓著。",
            spanish: "El servicio local alimenta el widget del iPhone. Que no pase hambre.",
            portuguese: "O serviço local alimenta o widget do iPhone. Não deixa ele passar fome.",
            japanese: "ローカルサービスがiPhoneウィジェットに餌をやる。飢えさせないで。"
        )
    }
    static var bothProviders: String {
        localized(english: "Both", simplified: "两个都看", traditional: "兩個都看", spanish: "Ambos", portuguese: "Ambos", japanese: "両方")
    }
    static var settings: String {
        localized(english: "Settings", simplified: "设置", traditional: "設定", spanish: "Ajustes", portuguese: "Ajustes", japanese: "設定")
    }
    static var advanced: String {
        localized(english: "Advanced", simplified: "高级", traditional: "進階", spanish: "Avanzado", portuguese: "Avançado", japanese: "詳細")
    }
    static var firstRunTitle: String {
        localized(
            english: "Let the iPhone know the door first",
            simplified: "先让 iPhone 认门🚪",
            traditional: "先讓 iPhone 認門🚪",
            spanish: "Primero que el iPhone encuentre la puerta",
            portuguese: "Primeiro mostra a porta pro iPhone",
            japanese: "まずiPhoneに玄関を教える🚪"
        )
    }
    static var firstRunBody: String {
        localized(
            english: "Open AI Usage on iPhone and scan this QR. After pairing, usage cannot hide here.",
            simplified: "打开 iPhone 上的 AI Usage 扫这个码。配好以后，用量就别想藏了。",
            traditional: "打開 iPhone 上的 AI Usage 掃這個 QR Code。配好以後，用量就別想藏了。",
            spanish: "Abre AI Usage en el iPhone y escanea este QR. Después el uso ya no se esconde.",
            portuguese: "Abra o AI Usage no iPhone e escaneie este QR. Depois de parear, o uso não se esconde mais.",
            japanese: "iPhoneのAI UsageでこのQRをスキャン。つながったら用量はもう隠れられない。"
        )
    }
    static var generatingPairingQR: String {
        localized(
            english: "Digging out the pairing QR...",
            simplified: "正在掏配对二维码...",
            traditional: "正在掏配對 QR Code...",
            spanish: "Sacando el QR de vinculación...",
            portuguese: "Puxando o QR de pareamento...",
            japanese: "ペアリングQRを掘り出し中..."
        )
    }
    static var showPairingQR: String {
        localized(english: "Show pairing QR", simplified: "亮出配对码", traditional: "亮出配對碼", spanish: "Mostrar QR", portuguese: "Mostrar QR", japanese: "ペアリングQRを出す")
    }
    static var hidePairingQR: String {
        localized(english: "Hide it", simplified: "收起，别乱给", traditional: "收起，別亂給", spanish: "Ocultarlo", portuguese: "Esconder", japanese: "しまう、見せびらかさない")
    }
    static var markIPhonePaired: String {
        localized(
            english: "Done, stop asking",
            simplified: "扫完了，别问",
            traditional: "掃完了，別問",
            spanish: "Listo, no preguntes",
            portuguese: "Pronto, para de perguntar",
            japanese: "スキャン済み、もう聞かない"
        )
    }
    static var pairedBody: String {
        localized(
            english: "Mac is waiting nicely for your touch😳",
            simplified: "Mac 乖乖等待，等待你抚摸😳",
            traditional: "Mac 乖乖等待，等待你撫摸😳",
            spanish: "Mac espera quietito tu toque😳",
            portuguese: "Mac espera quietinho seu toque😳",
            japanese: "Mac、いい子に待ってる。なでて😳"
        )
    }
    static var noUsageYet: String {
        localized(english: "No usage found yet", simplified: "还没摸到用量", traditional: "還沒摸到用量", spanish: "Aún no se encontró uso", portuguese: "Ainda não achei uso", japanese: "まだ用量を捕まえてない")
    }
    static var usageUnknown: String {
        localized(english: "Playing mystery🙄", simplified: "用量装神秘🙄", traditional: "用量裝神秘🙄", spanish: "Misterio 🙄", portuguese: "Fazendo mistério🙄", japanese: "用量が謎ぶってる🙄")
    }
    static var noAllowanceMeter: String {
        localized(english: "No meter", simplified: "无表可看🍵", traditional: "無表可看🍵", spanish: "Sin medidor 🍵", portuguese: "Sem medidor🍵", japanese: "メーターなし🍵")
    }
    static var connectorOffline: String {
        localized(english: "Mac is pretending to sleep💤", simplified: "Mac 装睡了💤", traditional: "Mac 裝睡了💤", spanish: "El Mac finge dormir💤", portuguese: "O Mac está fingindo dormir💤", japanese: "Macが寝たふりしてる💤")
    }
    static var widgetRefreshLoading: String {
        localized(
            english: "Poking your Mac...🫳",
            simplified: "正在抚摸你的 Mac...🫳",
            traditional: "正在撫摸你的 Mac...🫳",
            spanish: "Tocando tu Mac...🫳",
            portuguese: "Tocando seu Mac...🫳",
            japanese: "君のMacをなでてます...🫳"
        )
    }
    static var oldRecordWarning: String {
        localized(
            english: "Old record, don't trust it too much🧊",
            simplified: "旧账别太信🧊",
            traditional: "舊帳別太信🧊",
            spanish: "Cuenta vieja, no te fíes tanto🧊",
            portuguese: "Registro velho, não confia demais🧊",
            japanese: "古い記録、信じすぎ注意🧊"
        )
    }
    static var lastKnownFallback: String {
        localized(
            english: "Missed it, showing old record🧊",
            simplified: "刚没抓到，先看旧账🧊",
            traditional: "剛沒抓到，先看舊帳🧊",
            spanish: "No lo pilló, va la cuenta vieja🧊",
            portuguese: "Não pegou, vai o registro velho🧊",
            japanese: "捕まえ損ねたから古い記録🧊"
        )
    }
    static var openDesktopWidget: String {
        localized(english: "Open Desktop Widget", simplified: "打开桌面小窗", traditional: "開啟桌面小窗", spanish: "Abrir widget de escritorio", portuguese: "Abrir widget desktop", japanese: "デスクトップ小窓を開く")
    }
    static var desktopWidget: String {
        localized(english: "Desktop Widget", simplified: "桌面小窗", traditional: "桌面小窗", spanish: "Widget de escritorio", portuguese: "Widget desktop", japanese: "デスクトップ小窓")
    }
    static var providerModeHint: String {
        localized(
            english: "One provider or both. Do not blame us for choice paralysis.",
            simplified: "只看一个也行，双栏也行，别说选择困难。",
            traditional: "只看一個也行，雙欄也行，別說選擇困難。",
            spanish: "Uno o ambos. No culpes a la app por tanta opción.",
            portuguese: "Um ou ambos. Não culpe o app pela indecisão.",
            japanese: "片方でも両方でもどうぞ。選べないのをアプリのせいにしない。"
        )
    }
    static var openDashboard: String {
        localized(english: "Open Dashboard", simplified: "打开主窗口", traditional: "開啟主視窗", spanish: "Abrir panel", portuguese: "Abrir painel", japanese: "ダッシュボードを開く")
    }
    static var startConnector: String {
        localized(english: "Start Connector", simplified: "启动连接器", traditional: "啟動連接器", spanish: "Iniciar conector", portuguese: "Iniciar conector", japanese: "コネクタを起動")
    }
    static var stopConnector: String {
        localized(english: "Stop Connector", simplified: "停止连接器", traditional: "停止連接器", spanish: "Detener conector", portuguese: "Parar conector", japanese: "コネクタを停止")
    }
    static var quit: String {
        localized(english: "Quit", simplified: "退出", traditional: "結束", spanish: "Salir", portuguese: "Sair", japanese: "終了")
    }

    static var scanFromIPhone: String {
        localized(
            english: "Scan this QR from the iPhone app.",
            simplified: "拿 iPhone App 扫它，别手抄。",
            traditional: "拿 iPhone App 掃它，別手抄。",
            spanish: "Escanea este QR desde la app del iPhone.",
            portuguese: "Escaneie este QR no app do iPhone. Sem copiar na mão, por favor.",
            japanese: "iPhoneアプリでこのQRをスキャン。手入力で修行しない。"
        )
    }
    static var providerWorking: String {
        localized(english: "still awake😏", simplified: "没装睡😏", traditional: "沒裝睡😏", spanish: "sigue despierto😏", portuguese: "segue acordado😏", japanese: "寝たふりなし😏")
    }
    static var providerDegraded: String {
        localized(english: "acting tired😒", simplified: "有点摆烂😒", traditional: "有點擺爛😒", spanish: "anda cansado😒", portuguese: "meio cansado😒", japanese: "ちょっとサボり気味😒")
    }
    static var done: String {
        localized(english: "Done", simplified: "完成", traditional: "完成", spanish: "Listo", portuguese: "Pronto", japanese: "完了")
    }
    static var device: String {
        localized(english: "Device", simplified: "设备", traditional: "裝置", spanish: "Dispositivo", portuguese: "Dispositivo", japanese: "デバイス")
    }
    static var copyManualPairingCode: String {
        localized(
            english: "Copy Manual Pairing Code",
            simplified: "复制手动配对码",
            traditional: "複製手動配對碼",
            spanish: "Copiar código manual",
            portuguese: "Copiar código manual",
            japanese: "手動ペアリングコードをコピー"
        )
    }
    static var manualPayload: String {
        localized(english: "Manual payload", simplified: "手动配对内容", traditional: "手動配對內容", spanish: "Código manual", portuguese: "Código manual", japanese: "手動ペアリング内容")
    }
    static var qrFailed: String {
        localized(english: "QR failed", simplified: "二维码生成失败", traditional: "QR Code 產生失敗", spanish: "Falló el QR", portuguese: "QR falhou", japanese: "QR生成失敗")
    }
    static var qrWarning: String {
        localized(
            english: "This QR contains the local bearer token. Only show it to your iPhone.",
            simplified: "这个二维码里有本地 bearer token，只给你的 iPhone 看。",
            traditional: "這個 QR Code 裡有本機 bearer token，只給你的 iPhone 看。",
            spanish: "Este QR contiene el bearer token local. Muéstralo solo a tu iPhone.",
            portuguese: "Este QR contém o bearer token local. Mostre só para o seu iPhone.",
            japanese: "このQRにはローカルbearer tokenが入っています。見せる相手はあなたのiPhoneだけ。"
        )
    }

    static var weekLabel: String {
        localized(english: "wk", simplified: "周", traditional: "週", spanish: "sem", portuguese: "sem", japanese: "週")
    }

    static var localeIdentifier: String {
        switch selectedLanguage {
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

    static func resetCaption(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: localeIdentifier)
        formatter.dateFormat = Calendar.current.isDateInToday(date) ? "HH:mm" : monthDayFormat
        let dateText = formatter.string(from: date)
        switch selectedLanguage {
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

    static func touchStatusCaption(from date: Date, now: Date = Date()) -> String {
        let seconds = max(0, Int(now.timeIntervalSince(date)))

        if seconds < 90 {
            return localized(
                english: "Touched Mac · hot😏",
                simplified: "刚摸完，很润😏",
                traditional: "剛摸完，很潤😏",
                spanish: "Mac tocado · caliente😏",
                portuguese: "Mac tocado · quente😏",
                japanese: "なでたて、しっとり😏"
            )
        }

        let minutes = seconds / 60
        if minutes < 60 {
            switch selectedLanguage {
            case .english:
                return "Touched Mac · warm \(minutes)m😏"
            case .simplifiedChinese:
                return "\(minutes)分钟前摸过😏"
            case .traditionalChinese:
                return "\(minutes)分鐘前摸過😏"
            case .spanish:
                return "Mac tocado · tibio \(minutes) min😏"
            case .portuguese:
                return "Mac tocado · morno \(minutes) min😏"
            case .japanese:
                return "\(minutes)分前になでた😏"
            }
        }

        let hours = minutes / 60
        if hours < 24 {
            switch selectedLanguage {
            case .english:
                return "Touched Mac · warm \(hours)h😏"
            case .simplifiedChinese:
                return "\(hours)小时前摸过😏"
            case .traditionalChinese:
                return "\(hours)小時前摸過😏"
            case .spanish:
                return "Mac tocado · tibio \(hours) h😏"
            case .portuguese:
                return "Mac tocado · morno \(hours) h😏"
            case .japanese:
                return "\(hours)時間前になでた😏"
            }
        }

        return localized(
            english: "not sure · need touching😏",
            simplified: "不确定了，得再摸😏",
            traditional: "不確定了，得再摸😏",
            spanish: "ni idea · necesita toque😏",
            portuguese: "sei lá · precisa de toque😏",
            japanese: "もう不明、またなでて😏"
        )
    }

    private static var monthDayFormat: String {
        switch selectedLanguage {
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
