import AppKit
import SwiftUI

struct PairingSheetView: View {
    let payload: PairingPayload
    @Environment(\.dismiss) private var dismiss

    private var serializedPayload: String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(payload),
              let text = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return text
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(AppText.pairIPhone)
                        .font(.title.bold())
                    Text(AppText.scanFromIPhone)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button(AppText.done) {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)
            }

            HStack(alignment: .top, spacing: 18) {
                qrCode

                VStack(alignment: .leading, spacing: 12) {
                    warning

                    LabeledContent(AppText.device, value: payload.name)
                    LabeledContent(AppText.port, value: String(payload.port))
                    LabeledContent(AppText.addresses, value: String(payload.hosts.count))

                    Button {
                        copy(serializedPayload)
                    } label: {
                        Label(AppText.copyManualPairingCode, systemImage: "doc.on.doc")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }

            DisclosureGroup(AppText.manualPayload) {
                ScrollView {
                    Text(serializedPayload)
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                }
                .frame(height: 180)
                .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
        .padding(24)
        .frame(width: 680)
    }

    private var qrCode: some View {
        Group {
            if let image = QRCodeGenerator.image(for: serializedPayload) {
                Image(nsImage: image)
                    .interpolation(.none)
                    .resizable()
                    .frame(width: 260, height: 260)
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
                    .frame(width: 288, height: 288)
            }
        }
    }

    private var warning: some View {
        Label(AppText.qrWarning, systemImage: "lock.shield")
            .foregroundStyle(.orange)
            .font(.callout.weight(.semibold))
    }

    private func copy(_ text: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
    }
}
