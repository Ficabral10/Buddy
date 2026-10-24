import SwiftUI
import BuddyCore

/// "What do you need?" The user says or types the problem; Claude (through our backend)
/// picks a task from the library and restates it for confirmation.
struct HomeView: View {
    let library: TaskLibrary
    @Environment(AppSettings.self) private var settings
    @Environment(Services.self) private var services
    @State private var typed = ""
    @State private var reply = ""
    @State private var thinking = false
    @State private var session: SessionModel?
    @State private var showSettings = false

    private var lang: String { settings.userLanguage }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    MascotFace(speaking: services.speaker.isSpeaking, listening: services.listener.state == .listening)
                        .frame(width: 140, height: 140)
                        .padding(.top, 16)

                    Text(reply.isEmpty ? String(localized: "What do you need help with?") : reply)
                        .font(.title2.weight(.semibold))
                        .multilineTextAlignment(.center)
                        .accessibilityAddTraits(.updatesFrequently)

                    TalkButton(language: lang) { heard in submit(heard) }

                    HStack {
                        TextField("Or type it here", text: $typed)
                            .font(.title3)
                            .textFieldStyle(.roundedBorder)
                            .submitLabel(.send)
                            .onSubmit { submit(typed) }
                        Button("Send") { submit(typed) }
                            .font(.title3.bold())
                            .frame(minWidth: 44, minHeight: 44)
                            .disabled(typed.trimmingCharacters(in: .whitespaces).isEmpty)
                    }

                    if thinking { ProgressView().controlSize(.large) }

                    // Always-available shortcut: the library's tasks, in case speech or the network fails.
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Things I can help with").font(.headline)
                        ForEach(Array(library.tasks.values), id: \.id) { task in
                            Button { begin(task, confirmLine: confirmLine(for: task)) } label: {
                                Text(task.titleText(userLanguage: lang)).font(.title3)
                                    .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                                    .padding(.horizontal, 16)
                                    .background(RoundedRectangle(cornerRadius: 14).fill(Color.secondary.opacity(0.12)))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.top, 12)
                }
                .padding(20)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: { Image(systemName: "gearshape").font(.title2) }
                        .accessibilityLabel(Text("Settings"))
                }
            }
            .sheet(isPresented: $showSettings) { SettingsView() }
            .fullScreenCover(item: $session) { s in
                SessionView(model: s) { session = nil; reply = "" }
            }
            .onAppear { Speaker.configureAudioSession() }
        }
    }

    private func confirmLine(for task: HelperTask) -> String {
        let title = task.titleText(userLanguage: lang)
        return lang == "es" ? "Quieres: \(title.prefix(1).lowercased() + title.dropFirst()). ¿Es así?" : "You want to: \(title). Is that right?"
    }

    private func begin(_ task: HelperTask, confirmLine: String) {
        session = SessionModel(task: task, confirmLine: confirmLine, services: services, settings: settings)
    }

    private func submit(_ text: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, !thinking else { return }
        typed = ""
        thinking = true
        Task {
            defer { thinking = false }
            let body = AgentRequest(userLanguage: lang, phoneLanguage: AppConfig.phoneLanguage,
                                    iosVersion: UIDevice.current.systemVersion, event: "request", text: t)
            guard let r = try? await services.backend.agent(body) else {
                reply = lang == "es" ? "No me pude conectar. Elige una opción de abajo." : "I couldn't connect. Choose an option below."
                services.speaker.say(reply, language: lang)
                return
            }
            if r.action == "start_task", let id = r.taskId, let task = library.tasks[id] {
                begin(task, confirmLine: r.say)
            } else {
                reply = r.say
                if settings.outputMode.speaks { services.speaker.say(r.say, language: lang) }
            }
        }
    }
}

extension SessionModel: Identifiable {
    nonisolated var id: String { sessionId }
}

/// Tap to start listening, tap again to send. One large target.
struct TalkButton: View {
    let language: String
    let onHeard: (String) -> Void
    @Environment(Services.self) private var services

    var body: some View {
        let listening = services.listener.state == .listening
        Button {
            if listening {
                onHeard(services.listener.stop())
            } else {
                Task {
                    services.speaker.stop()
                    guard await services.listener.requestPermissions() else { return }
                    try? services.listener.start(language: language)
                }
            }
        } label: {
            Label(listening ? "Tap when you're done" : "Tap and talk",
                  systemImage: listening ? "stop.circle.fill" : "mic.circle.fill")
                .font(.title2.bold())
                .frame(maxWidth: .infinity, minHeight: 72)
        }
        .buttonStyle(.borderedProminent)
        .tint(listening ? .red : .accentColor)
        if listening, !services.listener.transcript.isEmpty {
            Text(services.listener.transcript).font(.title3).foregroundStyle(.secondary)
                .accessibilityLabel(Text("I heard: \(services.listener.transcript)"))
        }
        if services.listener.state == .denied {
            Text("Microphone is off. You can type instead.").font(.body).foregroundStyle(.secondary)
        }
    }
}
