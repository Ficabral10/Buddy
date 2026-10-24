import AVFoundation
import BuddyCore

/// The mascot's voice. Order of preference:
///  1. pre-rendered Cartesia clips bundled for the demo (works offline),
///  2. Cartesia through our backend,
///  3. Apple's on-device voice, so the helper never goes silent.
@Observable
final class Speaker: NSObject, AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    private(set) var isSpeaking = false
    private(set) var lastSource = "none"   // shown in the spike screen

    private let backend: BackendClient
    private var player: AVAudioPlayer?
    private let synth = AVSpeechSynthesizer()
    private let manifest: [String: String]
    private var generation = 0

    init(backend: BackendClient) {
        self.backend = backend
        if let url = Bundle.main.url(forResource: "manifest", withExtension: "json", subdirectory: "DemoAudio"),
           let data = try? Data(contentsOf: url),
           let m = try? JSONDecoder().decode([String: String].self, from: data) {
            manifest = m
        } else {
            manifest = [:]
        }
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

    func say(_ text: String, language: String) {
        stop()
        let gen = generation
        isSpeaking = true
        let lang = TextNorm.baseLanguage(language)

        if let file = manifest["\(lang)|\(text)"],
           let url = Bundle.main.url(forResource: (file as NSString).deletingPathExtension, withExtension: "mp3", subdirectory: "DemoAudio"),
           play(contentsOf: url) {
            lastSource = "cartesia-cached"
            return
        }
        Task { @MainActor in
            if let data = try? await backend.tts(text: text, language: lang), gen == generation, play(data: data) {
                lastSource = "cartesia"
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
