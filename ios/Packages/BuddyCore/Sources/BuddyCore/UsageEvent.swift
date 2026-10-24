import Foundation

/// Privacy-safe usage events (no screen text, no personal data). One JSON object per line;
/// backend/scripts/summarize-usage.js turns exported logs into docs/IMPACT.md.
public struct UsageEvent: Codable, Sendable, Equatable {
    public enum Kind: String, Codable, Sendable {
        case sessionStart = "session_start"
        case stepShown = "step_shown"
        case stepDone = "step_done"
        case hint
        case lost
        case wrongTurn = "wrong_turn"
        case familyCall = "family_call"
        case sessionEnd = "session_end"
    }

    public let session: String
    public let type: Kind
    /// Milliseconds since 1970.
    public let t: Int64
    public var mode: String?
    public var taskId: String?
    public var step: String?
    public var level: Int?
    public var completed: Bool?

    public init(session: String, type: Kind, at date: Date = Date(), mode: String? = nil, taskId: String? = nil,
                step: String? = nil, level: Int? = nil, completed: Bool? = nil) {
        self.session = session; self.type = type; self.t = Int64(date.timeIntervalSince1970 * 1000)
        self.mode = mode; self.taskId = taskId; self.step = step; self.level = level; self.completed = completed
    }

    public func jsonLine() -> String {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        return String(decoding: (try? enc.encode(self)) ?? Data(), as: UTF8.self)
    }
}
