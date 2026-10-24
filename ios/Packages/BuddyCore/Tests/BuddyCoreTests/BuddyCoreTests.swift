import XCTest
@testable import BuddyCore

/// Repo root, found from this file's path, so tests read the same /library and /fixtures
/// the backend tests use.
private let repoRoot = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent() // BuddyCoreTests
    .deletingLastPathComponent() // Tests
    .deletingLastPathComponent() // BuddyCore
    .deletingLastPathComponent() // Packages
    .deletingLastPathComponent() // ios
    .deletingLastPathComponent() // repo root

private struct FixtureFile: Decodable {
    struct Case: Decodable {
        let name: String
        let phoneLanguage: String
        let currentStep: Int
        let lines: [[LineValue]]
        let expect: [String: LineValue]
    }
    let task: String
    let cases: [Case]
}

/// Fixture lines mix strings and numbers: ["Ajustes", 0.04, 0.09, 0.3, 0.045].
private enum LineValue: Decodable {
    case s(String), n(Double)
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let d = try? c.decode(Double.self) { self = .n(d) } else { self = .s(try c.decode(String.self)) }
    }
    var string: String? { if case .s(let v) = self { return v }; return nil }
    var number: Double? { if case .n(let v) = self { return v }; return nil }
}

final class BuddyCoreTests: XCTestCase {
    var library: TaskLibrary!
    var task: HelperTask { library.tasks["whatsapp-photos"]! }

    override func setUpWithError() throws {
        library = try TaskLibrary.load(from: repoRoot.appendingPathComponent("library"))
    }

    func testLibraryLoads() {
        XCTAssertEqual(task.steps.count, 5)
        XCTAssertEqual(task.steps.last?.confirmWithUser, true)
    }

    func testLabelFollowsPhoneLanguageInstructionFollowsUser() {
        let privacy = task.steps[1]
        XCTAssertEqual(privacy.displayLabel(phoneLanguage: "es-US"), LabelChoice(label: "Privacidad y seguridad", uncertain: false))
        XCTAssertEqual(privacy.instructionText(userLanguage: "es", phoneLanguage: "en"), "Baja un poco y toca Privacy & Security.")
        XCTAssertEqual(privacy.displayLabel(phoneLanguage: "fr").uncertain, true)
    }

    func testDetectorFixturesMatchBackend() throws {
        let data = try Data(contentsOf: repoRoot.appendingPathComponent("fixtures/screens/whatsapp-photos.json"))
        let file = try JSONDecoder().decode(FixtureFile.self, from: data)
        for c in file.cases {
            let lines = c.lines.map {
                RecognizedLine(text: $0[0].string!, x: $0[1].number!, y: $0[2].number!, w: $0[3].number!, h: $0[4].number!)
            }
            let got = StepDetector.detect(task: task, currentStep: c.currentStep, lines: lines, phoneLanguage: c.phoneLanguage)
            XCTAssertEqual(got, expected(c.expect), c.name)
        }
    }

    private func expected(_ e: [String: LineValue]) -> Detection {
        let int = { (k: String) in Int(e[k]?.number ?? -1) }
        switch e["kind"]?.string {
        case "advance": return .advance(matchedStep: int("matchedStep"), nextStep: int("nextStep"))
        case "confirm": return .confirm(stepIndex: int("stepIndex"))
        case "behind": return .behind(nextStep: int("nextStep"))
        case "wrongTurn": return .wrongTurn(id: e["wrongTurnId"]?.string ?? "")
        case "unsure": return .unsure(stepIndex: int("stepIndex"))
        default: return .none
        }
    }

    func testVisionBoxConversion() {
        let l = RecognizedLine.fromVision(text: "Fotos", x: 0.4, y: 0.9, w: 0.2, h: 0.03)
        XCTAssertEqual(l.y, 0.07, accuracy: 1e-9)
    }

    func testHintEscalationTiming() {
        let h = HintEscalation(timing: HintTiming(repeatAfter: 8, describeAfter: 16, pictureAfter: 25))
        XCTAssertEqual(h.level(after: 3), .none)
        XCTAssertEqual(h.level(after: 8), .repeat)
        XCTAssertEqual(h.level(after: 20), .describe)
        XCTAssertEqual(h.level(after: 40), .picture)
        XCTAssertEqual(h.levelWhenLost(current: .none), .describe)
        XCTAssertEqual(h.levelWhenLost(current: .picture), .picture)
        let patient = HintEscalation(timing: h.timing, patience: 2)
        XCTAssertEqual(patient.level(after: 10), .none)
    }

    func testVoiceCommands() {
        XCTAssertEqual(VoiceCommand.parse("Otra vez"), .repeat)
        XCTAssertEqual(VoiceCommand.parse("estoy perdida"), .lost)
        XCTAssertEqual(VoiceCommand.parse("Siguiente."), .next)
        XCTAssertEqual(VoiceCommand.parse("para"), .stop)
        XCTAssertNil(VoiceCommand.parse("no puedo mandar fotos por WhatsApp"))
    }

    func testSensitiveScreens() {
        XCTAssertTrue(SharedChannel.looksSensitive(["Ingresa tu contraseña"]))
        XCTAssertFalse(SharedChannel.looksSensitive(["Privacidad y seguridad", "Fotos", "Face ID y código"]))
    }

    func testUsageEventHasNoScreenText() throws {
        let line = UsageEvent(session: "s1", type: .hint, at: Date(timeIntervalSince1970: 1), step: "photos", level: 2).jsonLine()
        XCTAssertEqual(line, #"{"level":2,"session":"s1","step":"photos","t":1000,"type":"hint"}"#)
    }
}
