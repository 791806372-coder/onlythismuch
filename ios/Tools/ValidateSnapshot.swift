import Foundation

@main
struct ValidateSnapshot {
    static func main() throws {
        let data = FileHandle.standardInput.readDataToEndOfFile()
        _ = try AIUsageSnapshot.decodeValidated(from: data)
        print("validated snapshot")
    }
}
