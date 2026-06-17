// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "AIUsageConnector",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "AIUsageConnector", targets: ["AIUsageConnector"])
    ],
    targets: [
        .executableTarget(
            name: "AIUsageConnector",
            path: "Sources/AIUsageConnector"
        )
    ]
)
