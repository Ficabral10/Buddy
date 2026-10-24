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
    let library: TaskLibrary?
    /// Convex first, LocalBackend (bundled library + audio) if it fails. Never blocks the user.
    let backend: FallbackBackend
    /// Drives the small "offline" indicator.
    private(set) var backendMode: BackendMode = .local
    /// Anonymous id for the current help session; a new one after each session ends.
    private(set) var sessionId = UUID().uuidString
    let speaker: Speaker
    let listener = Listener()
    let broadcast = BroadcastBridge()
    let usage = UsageLogger()
    let pip = PiPCardController()

    init() {
        let lib = AppConfig.loadBundledLibrary()
        let local = LocalBackend(library: lib ?? .empty, audioLookup: BundledAudio.shared.url(language:text:))
        let primary: BackendClient? = AppConfig.convexURL.map { ConvexBackend(deploymentUrl: $0) }
        let fallback = FallbackBackend(primary: primary, local: local)
        library = lib
        backend = fallback
        speaker = Speaker(backend: fallback)
        // Everything is initialized; now wire callbacks.
        backendMode = fallback.mode
        speaker.sessionId = { [weak self] in self?.sessionId ?? UUID().uuidString }
        fallback.onModeChange = { [weak self] mode in self?.backendMode = mode }
    }

    func newSessionId() { sessionId = UUID().uuidString }
}
