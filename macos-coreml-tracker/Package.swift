// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "uxfd-coreml-tracker",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "uxfd-coreml-tracker", targets: ["uxfd-coreml-tracker"])
    ],
    targets: [
        .executableTarget(
            name: "uxfd-coreml-tracker",
            path: "Sources/uxfd-coreml-tracker"
        )
    ]
)
