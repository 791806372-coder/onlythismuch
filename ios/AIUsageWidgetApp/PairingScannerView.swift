import SwiftUI

#if canImport(VisionKit)
import VisionKit

private enum PairingScannerText {
    static var selectedLanguage: AppLanguageOption {
        guard let rawValue = AppGroup.defaults?.string(forKey: AppGroup.appLanguageOptionKey),
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
        portuguese: String,
        japanese: String
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
            return portuguese
        case .japanese:
            return japanese
        }
    }

    static var scannerStartFailed: String {
        localized(
            english: "Scanner face-planted. Paste it manually.",
            simplified: "扫码启动失败，手动粘贴吧。",
            traditional: "掃碼啟動失敗，手動貼上吧。",
            spanish: "El escáner se estampó. Pégalo a mano.",
            portuguese: "O scanner tropeçou. Cola manualmente.",
            japanese: "スキャン起動に失敗。手で貼って。"
        )
    }

    static var unsupported: String {
        localized(
            english: "This device cannot scan. Paste it manually.",
            simplified: "这台设备不支持扫码，手动粘贴吧。",
            traditional: "這台裝置不支援掃碼，手動貼上吧。",
            spanish: "Este dispositivo no escanea. Pégalo a mano.",
            portuguese: "Este aparelho não escaneia. Cola manualmente.",
            japanese: "この端末はスキャン不可。手で貼って。"
        )
    }

    static var unavailable: String {
        localized(
            english: "Camera will not scan right now. Paste it manually.",
            simplified: "相机现在不给扫，手动粘贴吧。",
            traditional: "相機現在不給掃，手動貼上吧。",
            spanish: "La cámara no quiere escanear ahora. Pégalo a mano.",
            portuguese: "A câmera não quer escanear agora. Cola manualmente.",
            japanese: "カメラが今スキャンしてくれない。手で貼って。"
        )
    }
}

@available(iOS 16.0, *)
struct PairingScannerView: UIViewControllerRepresentable {
    let onText: (String) -> Void
    let onError: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        do {
            try scanner.startScanning()
        } catch {
            DispatchQueue.main.async {
                onError(PairingScannerText.scannerStartFailed)
            }
        }
        return scanner
    }

    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onText: onText)
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let onText: (String) -> Void

        init(onText: @escaping (String) -> Void) {
            self.onText = onText
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didAdd addedItems: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            guard let item = addedItems.first else {
                return
            }

            if case .barcode(let barcode) = item,
               let payload = barcode.payloadStringValue {
                DispatchQueue.main.async {
                    self.onText(payload)
                }
            }
        }
    }
}

@available(iOS 16.0, *)
@MainActor
enum PairingScannerAvailability {
    static var unavailableReason: String? {
        if !DataScannerViewController.isSupported {
            return PairingScannerText.unsupported
        }

        if !DataScannerViewController.isAvailable {
            return PairingScannerText.unavailable
        }

        return nil
    }
}
#endif
