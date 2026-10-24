import Foundation
import UIKit
import BuddyCore

/// One help session: confirm the task, guide step by step, finish. The user does every tap;
/// this only decides what to say and when.
@MainActor
@Observable
final class SessionModel {
    enum Phase: Equatable {
        case confirmTask       // "You want to ... Is that right?"
        case guiding           // showing the current step
        case askScreen         // "Are you on this screen?" (detector unsure)
        case askCheck          // "Do you see a check mark?" (confirmWithUser step)
        case finished
        case stopped
    }

    /// Fallback ladder: C manual Next, B screenshot, A live screen sharing.
    enum DetectionMode: String { case manual, screenshot, broadcast }

    let task: HelperTask
    let userLanguage: String
    let phoneLanguage: String
    private let services: Services
    private let settings: AppSettings
    let sessionId = UUID().uuidString

    private(set) var phase: Phase = .confirmTask
    private(set) var stepIndex = 0
    private(set) var hintLevel: HintLevel = .none
    private(set) var spokenLine = ""
    private(set) var paused = false
    private(set) var detectionMode: DetectionMode = .manual
    private(set) var lostCount = 0
    private(set) var busy = false
    /// Last detector result, for the spike and debug overlay.
    private(set) var lastDetection: BuddyCore.Detection = .none

    private var stepShownAt = Date()
    private var timer: Timer?
    private var pending: (result: BuddyCore.Detection, count: Int)?
    private var lastWrongTurnAt: [String: Date] = [:]

    init(task: HelperTask, confirmLine: String, services: Services, settings: AppSettings) {
        self.task = task
        self.services = services
        self.settings = settings
        self.userLanguage = settings.userLanguage
        self.phoneLanguage = AppConfig.phoneLanguage
        services.usage.enabled = settings.usageLogging
        services.usage.log(UsageEvent(session: sessionId, type: .sessionStart, mode: "helper", taskId: task.id))
        say(confirmLine)

        services.broadcast.onFrame = { [weak self] frame in Task { @MainActor in self?.handleFrame(frame) } }
        services.pip.onSkipBack = { [weak self] in Task { @MainActor in self?.repeatStep() } }
        services.pip.onSkipForward = { [weak self] in Task { @MainActor in self?.manualNext() } }
    }

    var step: Step? { stepIndex < task.steps.count ? task.steps[stepIndex] : nil }
    var stepText: String {
        let n = min(stepIndex + 1, task.steps.count), total = task.steps.count
        return userLanguage == "es" ? "Paso \(n) de \(total)" : "Step \(n) of \(total)"
    }
    var instruction: String { step?.instructionText(userLanguage: userLanguage, phoneLanguage: phoneLanguage) ?? "" }
    var labelUncertain: Bool { step?.displayLabel(phoneLanguage: phoneLanguage).uncertain ?? false }
    var showPicture: Bool { hintLevel >= .picture }

    // MARK: - Flow

    func confirmTask(_ yes: Bool) {
        guard phase == .confirmTask else { return }
        if yes {
            phase = .guiding
            showStep()
            startTimer()
        } else {
            end(completed: false, line: Phrase.stopped.text(userLanguage))
        }
    }

    private func showStep() {
        guard let step else { return finish() }
        hintLevel = .none
        stepShownAt = Date()
        pending = nil
        say(instruction)
        services.usage.log(UsageEvent(session: sessionId, type: .stepShown, taskId: task.id, step: step.id))
    }

    private func completeStep(moveTo next: Int) {
        if let step { services.usage.log(UsageEvent(session: sessionId, type: .stepDone, taskId: task.id, step: step.id)) }
        stepIndex = next
        if stepIndex >= task.steps.count { return finish() }
        // A quick acknowledgement, nothing more, then the next instruction.
        phase = .guiding
        hintLevel = .none
        stepShownAt = Date()
        pending = nil
        say("\(Phrase.done.text(userLanguage)) \(instruction)")
        services.usage.log(UsageEvent(session: sessionId, type: .stepShown, taskId: task.id, step: step?.id))
    }

    private func finish() {
        phase = .finished
        timer?.invalidate()
        let offer = task.finishAction == "tell-family" ? " \(Phrase.offerFamily.text(userLanguage))" : ""
        say(Phrase.finished.text(userLanguage) + offer)
        services.usage.log(UsageEvent(session: sessionId, type: .sessionEnd, taskId: task.id, completed: true))
        stopSharing()
    }

    func stop() {
        guard phase != .finished && phase != .stopped else { return }
        end(completed: false, line: Phrase.stopped.text(userLanguage))
    }

    private func end(completed: Bool, line: String) {
        phase = .stopped
        timer?.invalidate()
        say(line)
        services.usage.log(UsageEvent(session: sessionId, type: .sessionEnd, taskId: task.id, completed: completed))
        stopSharing()
    }

    private func stopSharing() {
        if services.broadcast.isBroadcasting { services.broadcast.requestStop() }
        services.pip.stop()
    }

    // MARK: - User controls (buttons, PiP skip buttons, and voice all land here)

    func manualNext() {
        guard phase == .guiding || phase == .askScreen || phase == .askCheck else { return }
        completeStep(moveTo: stepIndex + 1)
    }

    func repeatStep() {
        guard phase == .guiding else { return }
        say(instruction)
    }

    func togglePause() {
        paused.toggle()
        if paused { services.speaker.stop(); say(Phrase.paused.text(userLanguage)) }
        else { stepShownAt = Date(); say(instruction) }
    }

    /// "I'm lost": go straight to describing, and let Claude re-explain using the library step.
    func lost() {
        guard phase == .guiding || phase == .askScreen, let step else { return }
        lostCount += 1
        services.usage.log(UsageEvent(session: sessionId, type: .lost, taskId: task.id, step: step.id))
        hintLevel = HintEscalation(timing: step.hintTimingSec).levelWhenLost(current: hintLevel)
        let fallback = "\(instruction) \(step.whereToLookText(userLanguage: userLanguage))"
        let screenTitle = services.broadcast.latest?.lines.first(where: { $0.y < 0.15 && $0.h >= 0.018 })?.text
        askAgent(event: "lost", text: nil, screenTitle: screenTitle, fallback: fallback)
    }

    /// Answers to "Are you on this screen?" / "Do you see a check mark?"
    func answer(_ yes: Bool) {
        switch phase {
        case .askScreen, .askCheck:
            if yes { completeStep(moveTo: stepIndex + 1) }
            else { phase = .guiding; say("\(instruction) \(step?.whereToLookText(userLanguage: userLanguage) ?? "")") }
        default: break
        }
    }

    /// Anything the user says during a session.
    func handleUtterance(_ text: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        if phase == .confirmTask || phase == .askScreen || phase == .askCheck {
            let n = TextNorm.clean(t)
            if ["si", "sí", "yes", "yeah", "claro", "correcto", "eso"].contains(n) { return phase == .confirmTask ? confirmTask(true) : answer(true) }
            if ["no", "nope"].contains(n) { return phase == .confirmTask ? confirmTask(false) : answer(false) }
        }
        switch VoiceCommand.parse(t) {
        case .repeat: repeatStep()
        case .next: manualNext()
        case .lost: lost()
        case .pause: togglePause()
        case .stop: stop()
        case nil:
            askAgent(event: "question", text: t, screenTitle: nil, fallback: instruction)
        }
    }

    private func askAgent(event: String, text: String?, screenTitle: String?, fallback: String) {
        busy = true
        let body = AgentRequest(userLanguage: userLanguage, phoneLanguage: phoneLanguage,
                                iosVersion: UIDevice.current.systemVersion, event: event, text: text,
                                taskId: task.id, stepId: step?.id, screenTitle: screenTitle)
        Task {
            defer { busy = false }
            if let reply = try? await services.backend.agent(body) {
                say(reply.say)
                if reply.action == "safety" { paused = true }
            } else {
                say(fallback) // offline: the library text is always available
            }
        }
    }

    // MARK: - Hints ("don't hover")

    private func startTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    private func tick() {
        guard phase == .guiding, !paused, let step, !services.speaker.isSpeaking else { return }
        let escalation = HintEscalation(timing: step.hintTimingSec, patience: settings.patience)
        let level = escalation.level(after: Date().timeIntervalSince(stepShownAt))
        guard level > hintLevel else { return }
        hintLevel = level
        services.usage.log(UsageEvent(session: sessionId, type: .hint, taskId: task.id, step: step.id, level: level.rawValue))
        switch level {
        case .repeat: say(instruction)
        case .describe: say(step.whereToLookText(userLanguage: userLanguage))
        case .picture: say(Phrase.lookAtPicture.text(userLanguage))
        case .none: break
        }
    }

    // MARK: - Detection (fallback B and A)

    func useDetection(_ mode: DetectionMode) { detectionMode = mode }

    /// Fallback B: the user shared a screenshot. Read it on the device and say where to look.
    func handleScreenshot(_ image: UIImage) {
        guard let cg = image.cgImage,
              let lines = try? TextRecognizer.recognize(cgImage: cg, phoneLanguage: phoneLanguage) else { return }
        if SharedChannel.looksSensitive(lines.map(\.text)) { return } // never read sensitive screens
        detectionMode = .screenshot
        let result = StepDetector.detect(task: task, currentStep: stepIndex, lines: lines, phoneLanguage: phoneLanguage)
        if case .none = result, let step {
            // Not on a screen we know: say where to look for the current step.
            lastDetection = result
            say("\(instruction) \(step.whereToLookText(userLanguage: userLanguage))")
            return
        }
        apply(result, confirmed: true)
    }

    /// Fallback A: a frame from the broadcast extension.
    private func handleFrame(_ frame: FrameText) {
        guard phase == .guiding || phase == .askScreen, !paused, !frame.paused else { return }
        detectionMode = .broadcast
        let result = StepDetector.detect(task: task, currentStep: stepIndex, lines: frame.lines, phoneLanguage: phoneLanguage)
        // Screens animate between steps, so act only when two frames in a row agree.
        if let p = pending, p.result == result { pending = (result, p.count + 1) } else { pending = (result, 1) }
        apply(result, confirmed: (pending?.count ?? 0) >= 2)
    }

    private func apply(_ result: BuddyCore.Detection, confirmed: Bool) {
        lastDetection = result
        guard confirmed else { return }
        switch result {
        case .advance(_, let next):
            completeStep(moveTo: next)
        case .confirm:
            guard phase == .guiding else { return }
            phase = .askCheck
            say(Phrase.confirmCheck.text(userLanguage))
        case .behind(let next):
            stepIndex = next
            phase = .guiding
            showStep()
        case .wrongTurn(let id):
            guard let step, Date().timeIntervalSince(lastWrongTurnAt[id] ?? .distantPast) > 12,
                  let hint = step.wrongTurnHint(id, userLanguage: userLanguage, phoneLanguage: phoneLanguage) else { return }
            lastWrongTurnAt[id] = Date()
            services.usage.log(UsageEvent(session: sessionId, type: .wrongTurn, taskId: task.id, step: step.id))
            say(hint)
        case .unsure:
            guard phase == .guiding, Date().timeIntervalSince(stepShownAt) > 4 else { return }
            phase = .askScreen
            say(Phrase.confirmScreen.text(userLanguage))
        case .none:
            break
        }
        pending = nil
    }

    // MARK: - Output

    func noteFamilyCall() {
        services.usage.log(UsageEvent(session: sessionId, type: .familyCall, taskId: task.id))
    }

    private func say(_ line: String) {
        spokenLine = line
        if settings.outputMode.speaks { services.speaker.say(line, language: userLanguage) }
        updateCard()
    }

    func updateCard() {
        services.pip.show(CardContent(
            instruction: phase == .guiding ? instruction : spokenLine,
            stepText: phase == .finished ? "" : stepText,
            referenceImage: step?.referenceImage,
            speaking: services.speaker.isSpeaking,
            showPicture: showPicture
        ))
    }
}
