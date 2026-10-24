import SwiftUI
import PhotosUI
import BuddyCore

struct SessionView: View {
    @Bindable var model: SessionModel
    let onClose: () -> Void

    @Environment(AppSettings.self) private var settings
    @Environment(Services.self) private var services
    @Environment(\.openURL) private var openURL
    @State private var pickerHolder = BroadcastPickerHolder()
    @State private var consentShown = false
    @State private var screenshotItem: PhotosPickerItem?
    @State private var composing = false

    private var lang: String { model.userLanguage }

    var body: some View {
        VStack(spacing: 16) {
            header

            // The in-app card. It is also the source layer for the Picture-in-Picture window.
            PiPHostView(controller: services.pip)
                .aspectRatio(PiPCardController.renderSize.width / PiPCardController.renderSize.height, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .accessibilityElement()
                .accessibilityLabel(Text(model.spokenLine))

            if settings.outputMode != .voice {
                Text(model.spokenLine)
                    .font(.title2.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
            if model.labelUncertain {
                Text("Your phone's language isn't in my list yet, so the button may be named differently.")
                    .font(.body).foregroundStyle(.secondary)
            }
            if model.showPicture, let name = model.step?.referenceImage, UIImage(named: name) != nil {
                Image(name).resizable().scaledToFit().frame(maxHeight: 120)
                    .accessibilityLabel(Text(model.instruction))
            }

            Spacer(minLength: 0)
            controls
        }
        .padding(20)
        .background(BroadcastPickerRepresentable(holder: pickerHolder).frame(width: 1, height: 1).opacity(0.02))
        .onAppear { services.pip.setUpIfNeeded(); model.updateCard() }
        .onChange(of: services.speaker.isSpeaking) { model.updateCard() }
        .onChange(of: screenshotItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) {
                    model.handleScreenshot(img)
                }
                screenshotItem = nil
            }
        }
        .sheet(isPresented: $consentShown) { consentSheet }
        .sheet(isPresented: $composing) {
            MessageComposer(recipient: settings.familyPhone, body: Family.messageText(userLanguage: lang)) { composing = false }
        }
    }

    private var header: some View {
        HStack {
            MascotFace(speaking: services.speaker.isSpeaking, listening: services.listener.state == .listening)
                .frame(width: 56, height: 56)
            VStack(alignment: .leading) {
                Text(model.task.titleText(userLanguage: lang)).font(.headline)
                if model.phase == .guiding || model.phase == .askScreen || model.phase == .askCheck {
                    Text(model.stepText).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button(role: .destructive) { model.stop(); onClose() } label: {
                Text("Stop").font(.title3.bold()).frame(minWidth: 64, minHeight: 48)
            }
            .buttonStyle(.bordered)
        }
    }

    @ViewBuilder private var controls: some View {
        switch model.phase {
        case .confirmTask:
            yesNo(yes: { model.confirmTask(true) }, no: { model.confirmTask(false) })
        case .askScreen, .askCheck:
            yesNo(yes: { model.answer(true) }, no: { model.answer(false) })
        case .guiding:
            guidingControls
        case .finished:
            finishedControls
        case .stopped:
            BigButton(title: String(localized: "Close"), systemImage: "xmark") { onClose() }
        }
    }

    private var guidingControls: some View {
        VStack(spacing: 12) {
            if !services.broadcast.isBroadcasting {
                BigButton(title: String(localized: "Show me your screen"), systemImage: "rectangle.on.rectangle", prominent: true) {
                    consentShown = true
                }
            } else {
                Label("I can see your screen. You can go to Settings now.", systemImage: "eye")
                    .font(.body.weight(.medium))
            }
            HStack(spacing: 12) {
                BigButton(title: String(localized: "Repeat"), systemImage: "arrow.counterclockwise") { model.repeatStep() }
                BigButton(title: String(localized: "Next"), systemImage: "arrow.right") { model.manualNext() }
            }
            HStack(spacing: 12) {
                BigButton(title: String(localized: "I'm lost"), systemImage: "questionmark.circle") { model.lost() }
                BigButton(title: model.paused ? String(localized: "Continue") : String(localized: "Pause"),
                          systemImage: model.paused ? "play.fill" : "pause.fill") { model.togglePause() }
            }
            TalkButton(language: lang) { model.handleUtterance($0) }
            HStack(spacing: 12) {
                PhotosPicker(selection: $screenshotItem, matching: .screenshots) {
                    Label("Send a screenshot", systemImage: "photo").frame(maxWidth: .infinity, minHeight: 48)
                }
                .buttonStyle(.bordered)
                if !settings.familyPhone.isEmpty, let url = Family.faceTimeURL(phone: settings.familyPhone) {
                    Button {
                        model.noteFamilyCall()
                        openURL(url)
                    } label: {
                        Label("Call \(settings.familyName)", systemImage: "video").frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    private var finishedControls: some View {
        VStack(spacing: 12) {
            if model.task.finishAction == "tell-family", !settings.familyPhone.isEmpty {
                // Opens a pre-filled chat. The user taps Send; the app never sends anything.
                BigButton(title: String(localized: "Message \(settings.familyName) on WhatsApp"), systemImage: "message", prominent: true) {
                    if let url = Family.whatsAppURL(phone: settings.familyPhone, message: Family.messageText(userLanguage: lang)) {
                        openURL(url) { accepted in if !accepted && MessageComposer.canSend { composing = true } }
                    }
                }
            }
            BigButton(title: String(localized: "Done"), systemImage: "checkmark") { onClose() }
        }
    }

    private func yesNo(yes: @escaping () -> Void, no: @escaping () -> Void) -> some View {
        HStack(spacing: 12) {
            BigButton(title: lang == "es" ? "Sí" : String(localized: "Yes"), systemImage: "checkmark", prominent: true, action: yes)
            BigButton(title: "No", systemImage: "xmark", action: no)
        }
    }

    /// Shown before every capture: what the helper will see, and how to stop.
    private var consentSheet: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Before you share your screen").font(.title.bold())
            Label("I read the words on your screen, on this phone, about once a second.", systemImage: "text.viewfinder")
            Label("Each picture is thrown away right away. Nothing is saved or sent.", systemImage: "trash")
            Label("I pause on screens with passwords, codes, or card numbers.", systemImage: "lock")
            Label("Stop anytime: tap Stop here, or the red indicator at the top of the screen.", systemImage: "stop.circle")
            Spacer()
            BigButton(title: String(localized: "Continue"), systemImage: "arrow.right", prominent: true) {
                consentShown = false
                model.useDetection(.broadcast)
                services.speaker.say(Phrase.startSharing.text(lang), language: lang)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                    if !pickerHolder.present() { model.useDetection(.manual) }
                    services.pip.start()
                }
            }
            BigButton(title: String(localized: "Not now"), systemImage: "xmark") { consentShown = false }
        }
        .font(.title3)
        .padding(24)
        .presentationDetents([.large])
    }
}

struct BigButton: View {
    let title: String
    let systemImage: String
    var prominent = false
    let action: () -> Void

    var body: some View {
        if prominent {
            Button(action: action) { label }.buttonStyle(.borderedProminent)
        } else {
            Button(action: action) { label }.buttonStyle(.bordered)
        }
    }

    private var label: some View {
        Label(title, systemImage: systemImage)
            .font(.title3.bold())
            .frame(maxWidth: .infinity, minHeight: 56)
    }
}
