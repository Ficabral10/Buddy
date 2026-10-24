import SwiftUI
import BuddyCore

@main
struct BuddyApp: App {
    @State private var settings = AppSettings()
    @State private var services = Services()

    var body: some Scene {
        WindowGroup {
            Group {
                if let library = services.library {
                    if settings.onboarded {
                        HomeView(library: library)
                    } else {
                        OnboardingView()
                    }
                } else {
                    // Only possible if the library folder wasn't bundled; a build problem, not a user one.
                    ContentUnavailableView("Task library missing", systemImage: "exclamationmark.triangle",
                                           description: Text("Rebuild the app so the library folder is included."))
                }
            }
            .environment(settings)
            .environment(services)
            .dynamicTypeSize(.large ... .accessibility3)
        }
    }
}

/// Long-lived helpers shared by every screen.
@Observable
final class Services {
    let library = AppConfig.loadBundledLibrary()
    let backend = BackendClient()
    let speaker: Speaker
    let listener = Listener()
    let broadcast = BroadcastBridge()
    let usage = UsageLogger()
    let pip = PiPCardController()

    init() {
        speaker = Speaker(backend: backend)
    }
}
