import Foundation

/// Per-language map, e.g. ["en": "Settings", "es": "Ajustes"].
public typealias PerLanguage<T: Codable & Sendable> = [String: T]

public struct LibraryIndex: Codable, Sendable {
    public let schemaVersion: Int
    public let libraryVersion: String
    public let languages: [String]
    public let tasks: [String]
}

public struct Signature: Codable, Sendable, Equatable {
    public let title: PerLanguage<[String]>
    public let anyOf: PerLanguage<[String]>?
    public let noneOf: PerLanguage<[String]>?
}

public struct WrongTurn: Codable, Sendable {
    public let id: String
    public let title: PerLanguage<[String]>
    public let hint: PerLanguage<String>
}

public struct HintTiming: Codable, Sendable {
    public let repeatAfter: Double
    public let describeAfter: Double
    public let pictureAfter: Double
    enum CodingKeys: String, CodingKey {
        case repeatAfter = "repeat", describeAfter = "describe", pictureAfter = "picture"
    }
    public init(repeatAfter: Double, describeAfter: Double, pictureAfter: Double) {
        self.repeatAfter = repeatAfter; self.describeAfter = describeAfter; self.pictureAfter = pictureAfter
    }
}

public struct Step: Codable, Sendable, Identifiable {
    public let id: String
    public let label: PerLanguage<String>
    public let instruction: PerLanguage<String>
    public let whereToLook: PerLanguage<String>
    public let referenceImage: String?
    public let arrival: Signature
    public let wrongTurns: [WrongTurn]
    public let hintTimingSec: HintTiming
    public let confirmWithUser: Bool
}

public struct HelperTask: Codable, Sendable, Identifiable {
    public let id: String
    public let taskVersion: Int
    public let title: PerLanguage<String>
    public let description: String
    public let exampleRequests: PerLanguage<[String]>
    public let finishAction: String
    public let steps: [Step]
}

public struct TaskLibrary: Sendable {
    public let index: LibraryIndex
    public let tasks: [String: HelperTask]

    public init(index: LibraryIndex, tasks: [String: HelperTask]) {
        self.index = index; self.tasks = tasks
    }

    /// Loads `index.json` and `tasks/<id>.json` from a folder (the app bundles /library).
    public static func load(from folder: URL) throws -> TaskLibrary {
        let decoder = JSONDecoder()
        let index = try decoder.decode(LibraryIndex.self, from: Data(contentsOf: folder.appendingPathComponent("index.json")))
        var tasks: [String: HelperTask] = [:]
        for id in index.tasks {
            let url = folder.appendingPathComponent("tasks").appendingPathComponent("\(id).json")
            tasks[id] = try decoder.decode(HelperTask.self, from: Data(contentsOf: url))
        }
        return TaskLibrary(index: index, tasks: tasks)
    }
}

// MARK: - Language selection

public struct LabelChoice: Equatable, Sendable {
    public let label: String
    /// True when the library has no labels for the phone's language and we fell back to English.
    public let uncertain: Bool
}

public extension Step {
    /// The control's text exactly as the phone shows it in its UI language.
    func displayLabel(phoneLanguage: String) -> LabelChoice {
        let lang = TextNorm.baseLanguage(phoneLanguage)
        if let l = label[lang] { return LabelChoice(label: l, uncertain: false) }
        return LabelChoice(label: label["en"] ?? id, uncertain: true)
    }

    /// Instruction in the user's language, naming the control in the phone's language.
    func instructionText(userLanguage: String, phoneLanguage: String) -> String {
        let template = instruction[TextNorm.baseLanguage(userLanguage)] ?? instruction["en"] ?? ""
        return template.replacingOccurrences(of: "{label}", with: displayLabel(phoneLanguage: phoneLanguage).label)
    }

    func whereToLookText(userLanguage: String) -> String {
        whereToLook[TextNorm.baseLanguage(userLanguage)] ?? whereToLook["en"] ?? ""
    }

    func wrongTurnHint(_ id: String, userLanguage: String, phoneLanguage: String) -> String? {
        guard let wt = wrongTurns.first(where: { $0.id == id }) else { return nil }
        let template = wt.hint[TextNorm.baseLanguage(userLanguage)] ?? wt.hint["en"] ?? ""
        return template.replacingOccurrences(of: "{label}", with: displayLabel(phoneLanguage: phoneLanguage).label)
    }
}

public extension HelperTask {
    func titleText(userLanguage: String) -> String {
        title[TextNorm.baseLanguage(userLanguage)] ?? title["en"] ?? id
    }
}
