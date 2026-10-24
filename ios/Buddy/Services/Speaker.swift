import AVFoundation
import BuddyCore

/// The mascot's voice. Order of preference:
///  1. pre-rendered Cartesia clips bundled in the app (works offline),
///  2. Cartesia through Convex: library lines come from cached file storage, other lines are
///     generated on the fly and never stored,
///  3. Apple's on-device voice, so the helper never goes silent.
@Observable
final class Speaker: NSObject, AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    private(set) var isSpeaking = false
    private(set) var lastSource = "none"   // shown in the spike screen

    private let backend: BackendClient
    private var player: AVAudioPlayer?
    private let synth = AVSpeechSynthesizer()
    private var generation = 0
    /// The anonymous session id, for the backend's per-session rate limits.
    @ObservationIgnored var sessionId: () -> String = { UUID().uuidString }

    /// A line from the task library, so the backend can serve cached audio for it.
    struct LibraryLine {
        let taskId: String
        let stepId: String
        let kind: LineKind
        let phoneLanguage: String
    }

    init(backend: BackendClient) {
        self.backend = backend
        super.init()
        synth.delegate = self
    }

    /// Call once before speaking. Background audio keeps the voice going while the user is in Settings.
    static func configureAudioSession() {
        let s = AVAudioSession.sharedInstance()
        try? s.setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker, .duckOthers, .allowBluetoothA2DP])
        try? s.setActive(true)
    }

    func stop() {
        generation += 1
        player?.stop()
        synth.stopSpeaking(at: .immediate)
        isSpeaking = false
    }

    func say(_ text: String, language: String, line: LibraryLine? = nil) {
        stop()
        let gen = generation
        isSpeaking = true
        let lang = TextNorm.baseLanguage(language)
        Task { @MainActor in
            let source: AudioSource?
            if let line {
                source = try? await backend.stepAudio(taskId: line.taskId, stepId: line.stepId, kind: line.kind,
                                                       userLanguage: lang, phoneLanguage: line.phoneLanguage, sessionId: sessionId())
            } else {
                source = try? await backend.speech(text: text, language: lang, sessionId: sessionId())
            }
            guard gen == generation else { return }
            if let source, await play(source), gen == generation {
                lastSource = "\(backend.mode.rawValue)-audio"
                return
            }
            guard gen == generation else { return }
            lastSource = "on-device"
            let u = AVSpeechUtterance(string: text)
            u.voice = AVSpeechSynthesisVoice(language: lang == "es" ? "es-MX" : (lang == "zh" ? "zh-CN" : "en-US"))
            u.rate = AVSpeechUtteranceDefaultSpeechRate * 0.9
            synth.speak(u)
        }
    }

    @MainActor
    private func play(_ source: AudioSource) async -> Bool {
        switch source {
        case .data(let data):
            return play(data: data)
        case .url(let url) where url.isFileURL:
            return play(contentsOf: url)
        case .url(let url):
            // Cached step audio from Convex file storage.
            guard let (data, response) = try? await URLSession.shared.data(from: url),
                  (response as? HTTPURLResponse)?.statusCode == 200 else { return false }
            return play(data: data)
        }
    }

    private func play(contentsOf url: URL) -> Bool {
        guard let p = try? AVAudioPlayer(contentsOf: url) else { return false }
        return start(p)
    }

    private func play(data: Data) -> Bool {
        guard let p = try? AVAudioPlayer(data: data) else { return false }
        return start(p)
    }

    private func start(_ p: AVAudioPlayer) -> Bool {
        p.delegate = self
        player = p
        return p.play()
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) { isSpeaking = false }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) { isSpeaking = false }
}
