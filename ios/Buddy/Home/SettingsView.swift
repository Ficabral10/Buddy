import SwiftUI

struct SettingsView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(Services.self) private var services
    @Environment(\.dismiss) private var dismiss
    @State private var pickingContact = false

    var body: some View {
        @Bindable var settings = settings
        NavigationStack {
            Form {
                Section("Language") {
                    Picker("I speak", selection: $settings.userLanguage) {
                        Text("Español").tag("es")
                        Text("English").tag("en")
                    }
                }
                Section("How I help") {
                    Picker("Output", selection: $settings.outputMode) {
                        Text("Talk and show text").tag(OutputMode.voiceAndText)
                        Text("Only talk").tag(OutputMode.voice)
                        Text("Only text").tag(OutputMode.text)
                    }
                    VStack(alignment: .leading) {
                        Text("Time before I add a hint")
                        Slider(value: $settings.patience, in: 0.5...3, step: 0.5) {
                            Text("Time before I add a hint")
                        } minimumValueLabel: { Text("Less") } maximumValueLabel: { Text("More") }
                    }
                }
                Section("Family member") {
                    Button(settings.familyName.isEmpty ? String(localized: "Choose a family member") : settings.familyName) {
                        pickingContact = true
                    }
                }
                Section {
                    Toggle("Save anonymous usage counts on this phone", isOn: $settings.usageLogging)
                    if services.usage.hasData {
                        ShareLink("Export usage log", item: services.usage.fileURL)
                        Button("Delete usage log", role: .destructive) { services.usage.clear() }
                    }
                } header: { Text("Testing") } footer: {
                    Text("Counts only: steps, hints, and time. Never what's on your screen. Nothing is uploaded.")
                }
                Section("Privacy") {
                    Text("When you share your screen, I read the text on it on this phone, about once a second, and throw each picture away right away. Nothing from your screen is saved or sent. What you say to me is sent through our server to Anthropic (Claude) to understand it, and the helper's sentences go to Cartesia to make the voice.")
                        .font(.body)
                }
                Section {
                    NavigationLink("Developer lab (spike tests)") { SpikeView() }
                }
            }
            .navigationTitle("Settings")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .sheet(isPresented: $pickingContact) {
                ContactPicker { name, phone in
                    settings.familyName = name
                    settings.familyPhone = phone
                }
            }
        }
    }
}
