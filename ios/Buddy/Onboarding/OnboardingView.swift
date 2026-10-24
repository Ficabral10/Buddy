import SwiftUI

/// Three short screens: language, how the helper talks, and (optional) one family contact.
struct OnboardingView: View {
    @Environment(AppSettings.self) private var settings
    @State private var page = 0
    @State private var pickingContact = false

    var body: some View {
        @Bindable var settings = settings
        VStack(spacing: 28) {
            MascotFace().frame(width: 120, height: 120).padding(.top, 40)

            switch page {
            case 0:
                Text("Which language should I speak?").font(.title.bold()).multilineTextAlignment(.center)
                VStack(spacing: 14) {
                    BigChoice(title: "Español", selected: settings.userLanguage == "es") { settings.userLanguage = "es" }
                    BigChoice(title: "English", selected: settings.userLanguage == "en") { settings.userLanguage = "en" }
                }
            case 1:
                Text("How should I help you?").font(.title.bold()).multilineTextAlignment(.center)
                VStack(spacing: 14) {
                    BigChoice(title: String(localized: "Talk and show text"), selected: settings.outputMode == .voiceAndText) { settings.outputMode = .voiceAndText }
                    BigChoice(title: String(localized: "Only talk"), selected: settings.outputMode == .voice) { settings.outputMode = .voice }
                    BigChoice(title: String(localized: "Only text"), selected: settings.outputMode == .text) { settings.outputMode = .text }
                }
                Text("You can change this anytime.").font(.body).foregroundStyle(.secondary)
            default:
                Text("Who can help if you get stuck?").font(.title.bold()).multilineTextAlignment(.center)
                Text("Optional. I only keep their name and number on this phone.")
                    .font(.body).foregroundStyle(.secondary).multilineTextAlignment(.center)
                BigChoice(title: settings.familyName.isEmpty ? String(localized: "Choose a family member") : settings.familyName,
                          selected: !settings.familyName.isEmpty) { pickingContact = true }
            }

            Spacer()

            Button {
                if page < 2 { page += 1 } else { settings.onboarded = true }
            } label: {
                Text(page < 2 ? "Next" : "Start").font(.title2.bold()).frame(maxWidth: .infinity, minHeight: 60)
            }
            .buttonStyle(.borderedProminent)
            .padding(.bottom, 24)
        }
        .padding(.horizontal, 24)
        .sheet(isPresented: $pickingContact) {
            ContactPicker { name, phone in
                settings.familyName = name
                settings.familyPhone = phone
            }
        }
    }
}

struct BigChoice: View {
    let title: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Text(title).font(.title2.weight(.semibold))
                Spacer()
                Image(systemName: selected ? "checkmark.circle.fill" : "circle").font(.title2)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 20)
            .frame(maxWidth: .infinity, minHeight: 64)
            .background(RoundedRectangle(cornerRadius: 16).strokeBorder(selected ? Color.accentColor : .secondary, lineWidth: selected ? 3 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
