import SwiftUI
import BuddyCore

/// Small, calm indicator shown only when the app is running on LocalBackend.
/// Everything still works offline; this just tells the person (and the demo judges) why the
/// voice may sound different.
struct OfflineBadge: View {
    @Environment(Services.self) private var services

    var body: some View {
        if services.backendMode == .local {
            Label("Offline", systemImage: "icloud.slash")
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Capsule().fill(Color.secondary.opacity(0.15)))
                .accessibilityLabel(Text("Offline. Lola still works on this phone."))
        }
    }
}
