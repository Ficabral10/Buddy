import AVFoundation
import Speech

/// Tap-to-talk speech recognition with SFSpeechRecognizer, on device when the phone supports it.
///
/// iOS 26 added SpeechAnalyzer / SpeechTranscriber (on device, more locales). It is the better
/// choice on new phones, but its API is not wired here yet: confirm the exact API in Apple's
/// docs, then add it behind `if #available(iOS 26, *)` and keep this path for older phones.
@Observable
final class Listener {
    enum State: Equatable { case idle, listening, denied, unavailable }

    private(set) var state: State = .idle
    private(set) var transcript = ""
    private(set) var onDevice = false

    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    func requestPermissions() async -> Bool {
        let speech = await withCheckedContinuation { c in
            SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0 == .authorized) }
        }
        let mic = await AVAudioApplication.requestRecordPermission()
        if !(speech && mic) { state = .denied }
        return speech && mic
    }

    func start(language: String) throws {
        stopEngine()
        transcript = ""
        let locale = Locale(identifier: language == "es" ? "es-MX" : (language == "zh" ? "zh-CN" : "en-US"))
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            state = .unavailable
            return
        }
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        onDevice = recognizer.supportsOnDeviceRecognition
        req.requiresOnDeviceRecognition = onDevice
        request = req

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak req] buffer, _ in
            req?.append(buffer)
        }
        engine.prepare()
        try engine.start()
        state = .listening

        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            guard let self else { return }
            if let result {
                Task { @MainActor in self.transcript = result.bestTranscription.formattedString }
            }
            if error != nil || (result?.isFinal ?? false) {
                Task { @MainActor in self.stopEngine() }
            }
        }
    }

    /// Stops listening and returns what was heard.
    @discardableResult
    func stop() -> String {
        request?.endAudio()
        stopEngine()
        return transcript
    }

    private func stopEngine() {
        if engine.isRunning {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        task?.cancel()
        task = nil
        request = nil
        if state == .listening { state = .idle }
    }
}
