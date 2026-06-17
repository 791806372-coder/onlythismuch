import AppKit
import SwiftUI

struct LanguageMenuView: NSViewRepresentable {
    @AppStorage(AppLanguageOption.storageKey) private var selectedLanguage = AppLanguageOption.systemPreferredOption().rawValue

    func makeCoordinator() -> Coordinator {
        Coordinator(selectedLanguage: $selectedLanguage)
    }

    func makeNSView(context: Context) -> NSPopUpButton {
        let button = NSPopUpButton(frame: .zero, pullsDown: false)
        button.bezelStyle = .rounded
        button.target = context.coordinator
        button.action = #selector(Coordinator.languageDidChange(_:))
        return button
    }

    func updateNSView(_ button: NSPopUpButton, context: Context) {
        context.coordinator.selectedLanguage = $selectedLanguage

        let safeSelection = AppLanguageOption(rawValue: selectedLanguage) ?? .systemPreferredOption()
        if safeSelection.rawValue != selectedLanguage {
            selectedLanguage = safeSelection.rawValue
        }

        let menuItems = AppLanguageOption.allCases.map { option in
            let item = NSMenuItem(title: option.title, action: nil, keyEquivalent: "")
            item.representedObject = option.rawValue
            item.state = option == safeSelection ? .on : .off
            return item
        }

        let desiredTitles = menuItems.map(\.title)
        if button.itemArray.map(\.title) != desiredTitles {
            button.removeAllItems()
            for item in menuItems {
                button.menu?.addItem(item)
            }
        } else {
            for (index, item) in button.itemArray.enumerated() {
                item.representedObject = menuItems[index].representedObject
                item.state = menuItems[index].state
            }
        }

        if let index = AppLanguageOption.allCases.firstIndex(of: safeSelection) {
            button.selectItem(at: index)
        }

        button.contentTintColor = .labelColor
        button.toolTip = AppText.language
    }

    final class Coordinator: NSObject {
        var selectedLanguage: Binding<String>

        init(selectedLanguage: Binding<String>) {
            self.selectedLanguage = selectedLanguage
        }

        @objc func languageDidChange(_ sender: NSPopUpButton) {
            guard let rawValue = sender.selectedItem?.representedObject as? String,
                  AppLanguageOption(rawValue: rawValue) != nil else {
                return
            }
            selectedLanguage.wrappedValue = rawValue
        }
    }
}
