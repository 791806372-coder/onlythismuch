import AppKit
import SwiftUI

struct MenuBarContentView: View {
    @ObservedObject var store: ConnectorStore
    let openDashboard: () -> Void
    let openDesktopWidget: () -> Void
    @AppStorage(AppLanguageOption.storageKey) private var selectedLanguage = AppLanguageOption.systemPreferredOption().rawValue

    init(
        store: ConnectorStore,
        openDashboard: @escaping () -> Void,
        openDesktopWidget: @escaping () -> Void
    ) {
        self.store = store
        self.openDashboard = openDashboard
        self.openDesktopWidget = openDesktopWidget
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(store.statusTitle, systemImage: store.menuBarSystemImage)
                .font(.headline)

            if let live = store.doctor?.liveCheck {
                Text(live.snapshotLooksValid ? AppText.snapshotValid : AppText.snapshotNeedsCheck)
                    .foregroundStyle(.secondary)
            }

            Divider()

            Button(AppText.openDashboard) {
                openDashboard()
            }

            Button(AppText.openDesktopWidget) {
                openDesktopWidget()
            }

            Button(AppText.refresh) {
                Task { await store.refresh() }
            }

            Button(store.isRunning ? AppText.stopConnector : AppText.startConnector) {
                Task {
                    if store.isRunning {
                        await store.unloadService()
                    } else {
                        await store.loadService()
                    }
                }
            }
            .disabled(store.isBusy)

            Button(AppText.reloadService) {
                Task { await store.reloadService() }
            }
            .disabled(store.isBusy)

            Divider()

            Button(AppText.quit) {
                NSApplication.shared.terminate(nil)
            }
        }
        .padding(8)
        .id(selectedLanguage)
        .task {
            await store.refresh()
        }
    }
}
