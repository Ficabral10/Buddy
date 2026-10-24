import Foundation

/// One line of recognized text. Box is normalized with a TOP-LEFT origin (y = 0 at the top).
/// Note: Vision returns bottom-left-origin boxes; convert with `RecognizedLine.fromVision`.
public struct RecognizedLine: Codable, Sendable, Equatable {
    public let text: String
    public let x: Double, y: Double, w: Double, h: Double

    public init(text: String, x: Double, y: Double, w: Double, h: Double) {
        self.text = text; self.x = x; self.y = y; self.w = w; self.h = h
    }

    /// Vision's boundingBox uses a bottom-left origin.
    public static func fromVision(text: String, x: Double, y: Double, w: Double, h: Double) -> RecognizedLine {
        RecognizedLine(text: text, x: x, y: 1 - y - h, w: w, h: h)
    }
}

public enum Detection: Equatable, Sendable {
    case advance(matchedStep: Int, nextStep: Int)
    case confirm(stepIndex: Int)
    case behind(nextStep: Int)
    case wrongTurn(id: String)
    case unsure(stepIndex: Int)
    case none
}

/// Port of backend/src/detector.js. Both are tested against /fixtures/screens.
public enum StepDetector {
    // Guesses until the spike measures real frames. Keep in sync with detector.js.
    public static let titleRegionMaxY = 0.3
    public static let centerTolerance = 0.15
    public static let largeTitleMinH = 0.03
    public static let titleMinH = 0.018

    enum Match { case full, titleOnly, no }

    static func isTitleLine(_ l: RecognizedLine) -> Bool {
        guard l.y < titleRegionMaxY, l.h >= titleMinH else { return false }
        let centered = abs(l.x + l.w / 2 - 0.5) < centerTolerance
        return centered || l.h >= largeTitleMinH
    }

    static func strings(_ map: PerLanguage<[String]>?, _ phoneLanguage: String) -> [String] {
        guard let map else { return [] }
        return map[TextNorm.baseLanguage(phoneLanguage)] ?? map["en"] ?? []
    }

    static func titleMatches(_ titles: [String], _ lines: [RecognizedLine]) -> Bool {
        let wanted = Set(titles.map(TextNorm.clean))
        return lines.contains { isTitleLine($0) && wanted.contains(TextNorm.clean($0.text)) }
    }

    static func match(_ sig: Signature, _ lines: [RecognizedLine], _ phoneLanguage: String) -> Match {
        guard titleMatches(strings(sig.title, phoneLanguage), lines) else { return .no }
        let all = lines.map { TextNorm.normalize($0.text) }.joined(separator: " \n ")
        let noneOf = strings(sig.noneOf, phoneLanguage)
        if noneOf.contains(where: { all.contains(TextNorm.normalize($0)) }) { return .no }
        let anyOf = strings(sig.anyOf, phoneLanguage)
        if !anyOf.isEmpty && !anyOf.contains(where: { all.contains(TextNorm.normalize($0)) }) { return .titleOnly }
        return .full
    }

    public static func detect(task: HelperTask, currentStep: Int, lines: [RecognizedLine], phoneLanguage: String) -> Detection {
        let steps = task.steps
        if currentStep < steps.count {
            // Forward: furthest completed step wins (the back button shows the previous title).
            for j in stride(from: steps.count - 1, through: currentStep, by: -1) {
                if steps[j].confirmWithUser && j != currentStep { continue }
                if match(steps[j].arrival, lines, phoneLanguage) == .full {
                    return steps[j].confirmWithUser ? .confirm(stepIndex: j) : .advance(matchedStep: j, nextStep: j + 1)
                }
            }
        }
        // Behind: the user is on an earlier screen.
        if currentStep > 0 {
            for j in stride(from: min(currentStep, steps.count) - 1, through: 0, by: -1) where !steps[j].confirmWithUser {
                if match(steps[j].arrival, lines, phoneLanguage) == .full {
                    return j + 1 == currentStep ? .none : .behind(nextStep: j + 1)
                }
            }
        }
        guard currentStep < steps.count else { return .none }
        let cur = steps[currentStep]
        for wt in cur.wrongTurns where titleMatches(strings(wt.title, phoneLanguage), lines) {
            return .wrongTurn(id: wt.id)
        }
        if match(cur.arrival, lines, phoneLanguage) == .titleOnly { return .unsure(stepIndex: currentStep) }
        return .none
    }
}
