// swift-tools-version:5.9
// Platform-independent logic shared by the app and the broadcast extension.
// No UIKit, no Vision: everything here runs in `swift test` on a Mac.
import PackageDescription

let package = Package(
    name: "BuddyCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "BuddyCore", targets: ["BuddyCore"])],
    targets: [
        .target(name: "BuddyCore"),
        .testTarget(name: "BuddyCoreTests", dependencies: ["BuddyCore"]),
    ]
)
