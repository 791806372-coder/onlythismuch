import Foundation

enum AppGroup {
    static var defaults: UserDefaults? {
        nil
    }
}

@main
struct ValidatePairingPayload {
    static func main() {
        do {
            let data = FileHandle.standardInput.readDataToEndOfFile()
            guard let text = String(data: data, encoding: .utf8) else {
                throw PairingError.invalidPayload
            }

            let payload = try PairedDeviceStore().parse(text)
            print("validated pairing payload: \(payload.hosts.count) hosts, port \(payload.port)")
        } catch {
            let message = (error as? LocalizedError)?.errorDescription ?? String(describing: error)
            FileHandle.standardError.write(Data("\(message)\n".utf8))
            exit(1)
        }
    }
}
