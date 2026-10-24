import Foundation

/// Words that control the helper itself. One spoken word is enough (principle 5).
public enum VoiceCommand: String, Sendable, CaseIterable {
    case `repeat`, next, lost, pause, stop

    static let phrases: [VoiceCommand: [String]] = [
        .repeat: ["repeat", "again", "say it again", "otra vez", "repite", "repitelo", "de nuevo", "再说一遍", "重复"],
        .next: ["next", "done", "siguiente", "listo", "ya", "下一步"],
        .lost: ["i'm lost", "im lost", "lost", "help", "estoy perdido", "estoy perdida", "perdido", "perdida", "ayuda", "no entiendo", "我迷路了", "帮我"],
        .pause: ["pause", "wait", "pausa", "espera", "espérate", "等一下"],
        .stop: ["stop", "quit", "para", "parar", "detente", "basta", "停"],
    ]

    /// Recognizes a command only when the whole utterance is short and matches,
    /// so "no puedo mandar fotos" is never mistaken for a command.
    public static func parse(_ utterance: String) -> VoiceCommand? {
        let t = TextNorm.clean(utterance)
        guard !t.isEmpty, t.split(separator: " ").count <= 4 else { return nil }
        for cmd in [VoiceCommand.stop, .pause, .lost, .repeat, .next] {
            if phrases[cmd]!.contains(where: { TextNorm.clean($0) == t }) { return cmd }
        }
        return nil
    }
}
