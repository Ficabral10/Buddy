import Foundation

/// "Don't hover": give the person time to try, then help a little more each time.
public enum HintLevel: Int, Comparable, Sendable, CaseIterable {
    case none = 0     // just the instruction
    case `repeat`     // say the instruction again
    case describe     // say where to look
    case picture      // show the larger target picture

    public static func < (a: HintLevel, b: HintLevel) -> Bool { a.rawValue < b.rawValue }
}

public struct HintEscalation: Sendable {
    public let timing: HintTiming
    /// Multiplies every timing, set by the user ("give me more time"). 1 = library default.
    public let patience: Double

    public init(timing: HintTiming, patience: Double = 1.0) {
        self.timing = timing
        self.patience = max(0.5, min(patience, 3.0))
    }

    /// Hint level after `elapsed` seconds without progress on the current step.
    public func level(after elapsed: TimeInterval) -> HintLevel {
        if elapsed >= timing.pictureAfter * patience { return .picture }
        if elapsed >= timing.describeAfter * patience { return .describe }
        if elapsed >= timing.repeatAfter * patience { return .repeat }
        return .none
    }

    /// "I'm lost" skips ahead: never repeat the same words, go straight to describing.
    public func levelWhenLost(current: HintLevel) -> HintLevel {
        max(current, .describe)
    }
}
