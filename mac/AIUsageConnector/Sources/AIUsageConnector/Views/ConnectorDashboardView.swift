import AppKit
import SwiftUI

private enum ConnectorDashboardTheme {
    static let pageBackground = Color(red: 0.055, green: 0.058, blue: 0.066)
    static let panelBackground = Color(red: 0.105, green: 0.105, blue: 0.115)
    static let insetBackground = Color(red: 0.145, green: 0.145, blue: 0.155)
    static let border = Color.white.opacity(0.10)
}

struct ConnectorDashboardView: View {
    @ObservedObject var store: ConnectorStore
    let openDesktopWidget: () -> Void
    @State private var pairingPayload: PairingPayload?
    @State private var showingPairing = false
    @State private var showingInlinePairing = false
    @State private var didOfferInitialPairing = false
    @AppStorage(UsageDisplayMode.storageKey) private var displayModeRaw = UsageDisplayMode.both.rawValue
    @AppStorage("hasConfirmedIPhonePairing") private var hasConfirmedIPhonePairing = false
    @AppStorage(AppLanguageOption.storageKey) private var selectedLanguage = AppLanguageOption.systemPreferredOption().rawValue

    init(store: ConnectorStore, openDesktopWidget: @escaping () -> Void = {}) {
        self.store = store
        self.openDesktopWidget = openDesktopWidget
    }

    private var displayMode: UsageDisplayMode {
        UsageDisplayMode(rawValue: displayModeRaw) ?? .both
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                if let error = store.lastError {
                    errorView(error)
                }

                if !hasConfirmedIPhonePairing {
                    if shouldShowFirstRunHelperGuide {
                        firstRunHelperCard
                    } else if showingInlinePairing, let pairingPayload {
                        firstRunPairingCard(pairingPayload)
                    } else {
                        firstRunLoadingCard
                    }
                } else {
                    pairedOverview
                    usageSection
                    settingsSection
                }

                Spacer(minLength: 0)
            }
            .padding(24)
        }
        .background(ConnectorDashboardTheme.pageBackground)
        .environment(\.colorScheme, .dark)
        .sheet(isPresented: $showingPairing) {
            if let pairingPayload {
                PairingSheetView(payload: pairingPayload)
            }
        }
        .task(id: store.doctor?.pairing.present ?? true) {
            await prepareFirstRunPairingIfNeeded()
        }
        .id(selectedLanguage)
    }

    private var shouldShowFirstRunHelperGuide: Bool {
        !hasConfirmedIPhonePairing && store.doctor != nil && !store.helperIsReady
    }

    private var helperActionTitle: String {
        if store.helperNeedsWake {
            return AppText.wakeBackgroundHelper
        }
        if store.helperNeedsRepair {
            return AppText.repairBackgroundHelper
        }
        return AppText.installService
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                Text(AppText.appName)
                    .font(.largeTitle.bold())
                Text(AppText.subtitle)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 8) {
                StatusBadge(
                    title: store.statusTitle,
                    systemImage: store.menuBarSystemImage,
                    tint: store.isReady ? .green : (store.isRunning ? .orange : .secondary)
                )
            }
        }
    }

    private var statusGrid: some View {
        Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 16) {
            GridRow {
                statusCard(AppText.service, systemImage: "gearshape.2") {
                    if let service = store.doctor?.service {
                        LabeledContent(AppText.launchAgent, value: service.plistInstalled ? AppText.installed : AppText.missing)
                        LabeledContent(AppText.running, value: service.running ? AppText.yes : AppText.no)
                        LabeledContent(AppText.program, value: service.program.detail)
                    } else {
                        Text(AppText.noStatusYet).foregroundStyle(.secondary)
                    }
                }

                statusCard(AppText.pairing, systemImage: "qrcode") {
                    if let pairing = store.doctor?.pairing {
                        LabeledContent(AppText.config, value: pairing.present ? AppText.present : AppText.missing)
                        LabeledContent(AppText.port, value: String(pairing.port ?? 8787))
                        LabeledContent(AppText.addresses, value: String(pairing.addressCount ?? 0))
                    } else {
                        Text(AppText.noStatusYet).foregroundStyle(.secondary)
                    }
                }
            }

            GridRow {
                statusCard(AppText.liveCheck, systemImage: "wave.3.right.circle") {
                    if let live = store.doctor?.liveCheck {
                        LabeledContent(AppText.ping, value: live.serverLooksRunning ? AppText.ok : AppText.no)
                        LabeledContent(AppText.snapshot, value: live.snapshotLooksValid ? AppText.valid : AppText.invalid)
                        LabeledContent(AppText.reachable, value: String(live.reachableAddressCount))
                    } else {
                        Text(AppText.runRefreshHint).foregroundStyle(.secondary)
                    }
                }

                statusCard(AppText.repo, systemImage: "folder") {
                    Text(store.repoRoot?.path ?? AppText.notFound)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                        .textSelection(.enabled)
                }
            }
        }
    }

    private var firstRunHelperCard: some View {
        HStack(alignment: .center, spacing: 18) {
            Image(systemName: "powerplug.fill")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(Color.green)
                .frame(width: 54, height: 54)
                .background(Color.green.opacity(0.14), in: Circle())

            VStack(alignment: .leading, spacing: 6) {
                Text(AppText.backgroundHelperSetupTitle)
                    .font(.title.bold())
                Text(AppText.backgroundHelperSetupBody)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 16)

            VStack(alignment: .trailing, spacing: 10) {
                Button {
                    Task { await setUpHelperThenOfferPairing() }
                } label: {
                    Label(helperActionTitle, systemImage: "bolt.horizontal.circle.fill")
                }
                .buttonStyle(.borderedProminent)
                .disabled(store.isBusy)

                Button {
                    Task { await showPairingSheet() }
                } label: {
                    Label(AppText.peekAtPairingQR, systemImage: "qrcode.viewfinder")
                }
                .buttonStyle(.bordered)
                .disabled(store.isBusy)
            }
        }
        .padding(20)
        .background(ConnectorDashboardTheme.panelBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(ConnectorDashboardTheme.border)
        )
    }

    private func firstRunPairingCard(_ payload: PairingPayload) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(AppText.firstRunTitle)
                        .font(.title.bold())
                    Text(AppText.firstRunBody)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button(AppText.hidePairingQR) {
                    hasConfirmedIPhonePairing = true
                    showingInlinePairing = false
                }
            }

            HStack(alignment: .top, spacing: 20) {
                qrCode(payload)

                VStack(alignment: .leading, spacing: 12) {
                    Label(AppText.scanFromIPhone, systemImage: "iphone")
                        .font(.title3.weight(.semibold))
                    Text(AppText.qrWarning)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    Button {
                        copy(serializedPayload(payload))
                    } label: {
                        Label(AppText.copyManualPairingCode, systemImage: "doc.on.doc")
                    }

                    Button {
                        hasConfirmedIPhonePairing = true
                        showingInlinePairing = false
                        Task { await store.refreshUsage() }
                    } label: {
                        Label(AppText.markIPhonePaired, systemImage: "checkmark.circle")
                    }
                    .buttonStyle(.borderedProminent)
                }
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
        .padding(20)
        .background(ConnectorDashboardTheme.panelBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(ConnectorDashboardTheme.border)
        )
    }

    private var firstRunLoadingCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(AppText.firstRunTitle)
                .font(.title.bold())
            Text(AppText.generatingPairingQR)
                .foregroundStyle(.secondary)
            ProgressView()
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ConnectorDashboardTheme.panelBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(ConnectorDashboardTheme.border)
        )
    }

    private var pairedOverview: some View {
        HStack(alignment: .center, spacing: 14) {
            Image(systemName: store.isReady ? "link.circle.fill" : "link.circle")
                .font(.system(size: 32, weight: .semibold))
                .foregroundStyle(store.isReady ? Color.green : Color.orange)

            VStack(alignment: .leading, spacing: 4) {
                Text(store.statusTitle)
                    .font(.title2.bold())
                Text(store.isReady ? AppText.pairedBody : AppText.runRefreshHint)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
                Task { await store.refresh() }
            } label: {
                Label {
                    Text(AppText.refresh)
                } icon: {
                    ConnectorRefreshActivityIcon(isRefreshing: store.isBusy && store.lastAction == .refresh)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(store.isBusy)
        }
        .padding(18)
        .background(ConnectorDashboardTheme.panelBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(ConnectorDashboardTheme.border)
        )
    }

    private var usageSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(AppText.usage)
                    .font(.title2.bold())
                Spacer()
                Button {
                    Task { await store.refreshUsage() }
                } label: {
                    Label {
                        Text(AppText.refresh)
                    } icon: {
                        ConnectorRefreshActivityIcon(isRefreshing: store.isBusy && store.lastAction == .refresh)
                    }
                }
                .disabled(store.isBusy)
            }

            UsageSnapshotPanel(
                snapshot: store.snapshot,
                usageError: store.usageError,
                displayMode: displayMode
            )
        }
        .padding(18)
        .background(ConnectorDashboardTheme.panelBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(ConnectorDashboardTheme.border)
        )
    }

    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(AppText.settings)
                .font(.title2.bold())

            HStack(spacing: 12) {
                Label(AppText.language, systemImage: "globe")
                LanguageMenuView()
                    .frame(width: 160)
                Spacer()
            }

            Toggle(isOn: launchAtLoginBinding) {
                Label(AppText.launchAtLogin, systemImage: "power")
            }
            .toggleStyle(.switch)
            .disabled(store.isBusy)

            Text(AppText.serviceWillStart)
                .font(.callout)
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                Label(AppText.displayMode, systemImage: "rectangle.grid.1x2")
                Picker(AppText.displayMode, selection: $displayModeRaw) {
                    ForEach(UsageDisplayMode.allCases) { mode in
                        Text(mode.title).tag(mode.rawValue)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 300)
                Spacer()
            }

            Text(AppText.providerModeHint)
                .foregroundStyle(.secondary)

            HStack(spacing: 10) {
                Button {
                    Task {
                        await showPairingSheet()
                    }
                } label: {
                    Label(AppText.showPairingQR, systemImage: "qrcode.viewfinder")
                }

                Button {
                    openDesktopWidget()
                } label: {
                    Label(AppText.openDesktopWidget, systemImage: "macwindow")
                }

                Spacer()
            }
            .buttonStyle(.bordered)
            .disabled(store.isBusy)

            DisclosureGroup(AppText.networkDiagnostics) {
                VStack(alignment: .leading, spacing: 14) {
                    Text(networkSummary)
                        .font(.callout.monospacedDigit())
                        .foregroundStyle(.secondary)
                    statusGrid
                    serviceActions
                    Divider()
                    privacyNote
                }
                .padding(.top, 12)
            }
        }
        .padding(18)
        .background(ConnectorDashboardTheme.panelBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(ConnectorDashboardTheme.border)
        )
    }

    private var launchAtLoginBinding: Binding<Bool> {
        Binding(
            get: {
                store.isRunning
            },
            set: { enabled in
                Task {
                    if enabled {
                        await store.installService()
                        await store.loadService()
                    } else {
                        await store.unloadService()
                    }
                }
            }
        )
    }

    private var networkSummary: String {
        let port = store.doctor?.pairing.port ?? 8787
        let addresses = store.doctor?.pairing.addressCount ?? 0
        let live = store.doctor?.liveCheck
        let ping = live?.serverLooksRunning == true ? AppText.ok : AppText.no
        let snapshot = live?.snapshotLooksValid == true ? AppText.valid : AppText.invalid
        return "\(AppText.port) \(port) · \(AppText.addresses) \(addresses) · Ping \(ping) · Snapshot \(snapshot)"
    }

    private func statusCard<Content: View>(
        _ title: String,
        systemImage: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: systemImage)
                .font(.headline)
            content()
                .font(.callout)
        }
        .frame(maxWidth: .infinity, minHeight: 132, alignment: .topLeading)
        .padding(16)
        .background(ConnectorDashboardTheme.insetBackground, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(ConnectorDashboardTheme.border)
        )
    }

    private var serviceActions: some View {
        HStack(spacing: 10) {
            Button {
                Task { await store.refresh() }
            } label: {
                Label {
                    Text(AppText.refresh)
                } icon: {
                    ConnectorRefreshActivityIcon(isRefreshing: store.isBusy && store.lastAction == .refresh)
                }
            }
            .disabled(store.isBusy)

            if store.helperIsReady {
                Label(AppText.backgroundHelperReadyTitle, systemImage: "checkmark.circle.fill")
                    .foregroundStyle(Color.green)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color.green.opacity(0.12), in: Capsule())
            } else {
                Button {
                    Task { await store.setUpHelper() }
                } label: {
                    Label(helperActionTitle, systemImage: "bolt.horizontal.circle.fill")
                }
                .disabled(!store.canInstallService)
            }

            Button {
                Task { await store.loadService() }
            } label: {
                Label(AppText.start, systemImage: "play.fill")
            }
            .disabled(!store.canStartService)

            Button {
                Task { await store.unloadService() }
            } label: {
                Label(AppText.stop, systemImage: "stop.fill")
            }
            .disabled(!store.canStopService)

            Button {
                Task { await store.reloadService() }
            } label: {
                Label(AppText.reload, systemImage: "arrow.triangle.2.circlepath")
            }
            .disabled(store.isBusy)

            Spacer()

        }
    }

    private var privacyNote: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(AppText.privacyTitle)
                .font(.headline)
            Text(AppText.privacyBody)
                .foregroundStyle(.secondary)
        }
        .font(.callout)
    }

    private func errorView(_ error: String) -> some View {
        Label(error, systemImage: "exclamationmark.triangle.fill")
            .foregroundStyle(.orange)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func setUpHelperThenOfferPairing() async {
        await store.setUpHelper()
        guard !hasConfirmedIPhonePairing,
              store.helperIsReady,
              let payload = await store.currentPairingPayload() else {
            return
        }
        pairingPayload = payload
        showingInlinePairing = true
    }

    private func showPairingSheet() async {
        if let payload = await store.currentPairingPayload() {
            pairingPayload = payload
            showingInlinePairing = false
            showingPairing = true
        }
    }

    private func prepareFirstRunPairingIfNeeded() async {
        guard !didOfferInitialPairing,
              !hasConfirmedIPhonePairing else {
            return
        }

        didOfferInitialPairing = true
        if let payload = await store.currentPairingPayload() {
            pairingPayload = payload
            showingInlinePairing = true
        }
    }

    private func qrCode(_ payload: PairingPayload) -> some View {
        Group {
            if let image = QRCodeGenerator.image(for: serializedPayload(payload)) {
                Image(nsImage: image)
                    .interpolation(.none)
                    .resizable()
                    .frame(width: 280, height: 280)
                    .padding(14)
                    .background(.white, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "qrcode")
                        .font(.system(size: 44, weight: .semibold))
                    Text(AppText.qrFailed)
                        .font(.headline)
                }
                .foregroundStyle(.secondary)
                .frame(width: 268, height: 268)
            }
        }
    }

    private func serializedPayload(_ payload: PairingPayload) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(payload),
              let text = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return text
    }

    private func copy(_ text: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
    }
}
