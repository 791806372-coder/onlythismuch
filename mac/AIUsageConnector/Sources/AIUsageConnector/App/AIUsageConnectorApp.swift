import AppKit
import SwiftUI

@main
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private static var retainedDelegate: AppDelegate?
    private let store = ConnectorStore()
    private var mainWindow: NSWindow?
    private var desktopWidgetWindow: NSWindow?
    private var statusItem: NSStatusItem?
    private var didFinishStartup = false

    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        retainedDelegate = delegate
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.finishLaunching()
        delegate.applicationDidFinishLaunching(
            Notification(name: NSApplication.didFinishLaunchingNotification, object: app)
        )
        app.run()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard !didFinishStartup else {
            return
        }
        didFinishStartup = true
        configureStatusItem()
        showMainWindow()
        Task {
            await store.refresh()
            updateStatusItem()
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showMainWindow()
        return true
    }

    func showMainWindow() {
        let window = mainWindow ?? makeMainWindow()
        mainWindow = window
        window.title = AppText.appName
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)
    }

    func showDesktopWidget() {
        let window = desktopWidgetWindow ?? makeDesktopWidgetWindow()
        desktopWidgetWindow = window
        window.title = AppText.desktopWidget
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)
    }

    private func makeMainWindow() -> NSWindow {
        let content = ConnectorDashboardView(
            store: store,
            openDesktopWidget: { [weak self] in
                self?.showDesktopWidget()
            }
        )
        .frame(minWidth: 760, minHeight: 560)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 920, height: 680),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.isReleasedWhenClosed = false
        window.contentView = NSHostingView(rootView: content)
        return window
    }

    private func makeDesktopWidgetWindow() -> NSWindow {
        let content = DesktopUsageWidgetView(store: store)
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 420, height: 260),
            styleMask: [.titled, .closable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.isReleasedWhenClosed = false
        window.contentView = NSHostingView(rootView: content)
        return window
    }

    private func configureStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem = item
        updateStatusItem()
    }

    private func updateStatusItem() {
        guard let item = statusItem else {
            return
        }
        item.button?.image = NSImage(
            systemSymbolName: store.menuBarSystemImage,
            accessibilityDescription: AppText.menuBarName
        )
        item.button?.title = " \(AppText.menuBarName)"
        item.menu = makeStatusMenu()
    }

    private func makeStatusMenu() -> NSMenu {
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: store.statusTitle, action: nil, keyEquivalent: ""))
        if let live = store.doctor?.liveCheck {
            menu.addItem(NSMenuItem(
                title: live.snapshotLooksValid ? AppText.snapshotValid : AppText.snapshotNeedsCheck,
                action: nil,
                keyEquivalent: ""
            ))
        }
        menu.addItem(.separator())

        menu.addActionItem(title: AppText.openDashboard, target: self, action: #selector(openDashboardFromMenu))
        menu.addActionItem(title: AppText.openDesktopWidget, target: self, action: #selector(openDesktopWidgetFromMenu))
        menu.addActionItem(title: AppText.refresh, target: self, action: #selector(refreshFromMenu))
        menu.addActionItem(
            title: store.isRunning ? AppText.stopConnector : AppText.startConnector,
            target: self,
            action: #selector(toggleConnectorFromMenu)
        )
        menu.addActionItem(title: AppText.reloadService, target: self, action: #selector(reloadServiceFromMenu))
        menu.addItem(.separator())
        menu.addActionItem(title: AppText.quit, target: self, action: #selector(quitFromMenu))
        return menu
    }

    @objc private func openDashboardFromMenu() {
        showMainWindow()
    }

    @objc private func openDesktopWidgetFromMenu() {
        showDesktopWidget()
    }

    @objc private func refreshFromMenu() {
        Task {
            await store.refresh()
            updateStatusItem()
        }
    }

    @objc private func toggleConnectorFromMenu() {
        Task {
            if store.isRunning {
                await store.unloadService()
            } else {
                await store.loadService()
            }
            updateStatusItem()
        }
    }

    @objc private func reloadServiceFromMenu() {
        Task {
            await store.reloadService()
            updateStatusItem()
        }
    }

    @objc private func quitFromMenu() {
        NSApplication.shared.terminate(nil)
    }
}

private extension NSMenu {
    func addActionItem(title: String, target: AnyObject, action: Selector) {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = target
        addItem(item)
    }
}
