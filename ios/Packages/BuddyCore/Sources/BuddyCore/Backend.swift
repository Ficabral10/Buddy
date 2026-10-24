import Foundation

// The app talks to one BackendClient. ConvexBackend (app target, uses ConvexMobile) is tried
// first; LocalBackend (bundled library + bundled audio) always works with no network.
// FallbackBackend switches silently and reports the mode for the small offline indicator.

public enum BackendMode: String, Sendable { case convex, local }

public enum LineKind: String, Sendable { case instruction, whereToLook }

public enum AudioSource: Equatable, Sendable {
    case url(URL)
    case data(Data)
}

public struct TaskChoice: Equatable, Sendable {
    public let taskId: String?
    public let reply: String
    public let offerFamily: Bool
    public let source: String
    public init(taskId: String?, reply: String, offerFamily: Bool, source: String) {
        self.taskId = taskId; self.reply = reply; self.offerFamily = offerFamily; self.source = source
    }
}

/// Counts only. Never screen text, transcripts or audio.
public enum SessionEvent: Equatable, Sendable {
    case advance(toStep: Int, stepId: String)
    case hint(stepId: String)
    case lost(stepId: String)
    case wrongTurn(stepId: String)
    case familyCall
    case end(completed: Bool)
}

public struct LiveSession: Decodable, Equatable, Sendable {
    public let taskId: String?
    public let step: Double
    public let status: String
    public let hints: Double
    public let lost: Double
    public let wrongTurns: Double
}

public protocol BackendClient: AnyObject {
    var mode: BackendMode { get }
    func chooseTask(sessionId: String, text: String, userLanguage: String) async throws -> TaskChoice
    func startSession(sessionId: String, locale: String, userLanguage: String, taskId: String) async throws
    func record(_ event: SessionEvent, sessionId: String) async throws
    /// Audio for a library line; cached on the server. nil = speak it with the on-device voice.
    func stepAudio(taskId: String, stepId: String, kind: LineKind, userLanguage: String, phoneLanguage: String, sessionId: String) async throws -> AudioSource?
    /// Audio for any other short line; never stored. nil = on-device voice.
    func speech(text: String, language: String, sessionId: String) async throws -> AudioSource?
    /// Live updates for a session, if the backend supports them.
    func observeSession(sessionId: String) -> AsyncStream<LiveSession>?
}

// MARK: - Local

/// Works with no network: bundled library, keyword matching, bundled (pre-rendered) audio.
public final class LocalBackend: BackendClient {
    public let mode = BackendMode.local
    private let library: TaskLibrary
    private let audioLookup: (_ language: String, _ text: String) -> URL?

    public init(library: TaskLibrary, audioLookup: @escaping (String, String) -> URL? = { _, _ in nil }) {
        self.library = library
        self.audioLookup = audioLookup
    }

    static let notSure = [
        "en": "I'm not sure I can help with that one yet. Would you like to call a family member?",
        "es": "Todavía no estoy seguro de poder ayudarte con eso. ¿Quieres llamar a un familiar?",
    ]

    public func chooseTask(sessionId: String, text: String, userLanguage: String) async throws -> TaskChoice {
        let lang = TextNorm.baseLanguage(userLanguage) == "es" ? "es" : "en"
        guard let task = LocalBackend.match(text, in: Array(library.tasks.values)) else {
            return TaskChoice(taskId: nil, reply: LocalBackend.notSure[lang]!, offerFamily: true, source: "library")
        }
        return TaskChoice(taskId: task.id, reply: LocalBackend.confirmLine(task.titleText(userLanguage: lang), lang),
                          offerFamily: false, source: "library")
    }

    public func startSession(sessionId: String, locale: String, userLanguage: String, taskId: String) async throws {}
    public func record(_ event: SessionEvent, sessionId: String) async throws {}

    public func stepAudio(taskId: String, stepId: String, kind: LineKind, userLanguage: String, phoneLanguage: String, sessionId: String) async throws -> AudioSource? {
        guard let step = library.tasks[taskId]?.steps.first(where: { $0.id == stepId }) else { return nil }
        let text = kind == .instruction
            ? step.instructionText(userLanguage: userLanguage, phoneLanguage: phoneLanguage)
            : step.whereToLookText(userLanguage: userLanguage)
        return audioLookup(TextNorm.baseLanguage(userLanguage), text).map(AudioSource.url)
    }

    public func speech(text: String, language: String, sessionId: String) async throws -> AudioSource? {
        audioLookup(TextNorm.baseLanguage(language), text).map(AudioSource.url)
    }

    public func observeSession(sessionId: String) -> AsyncStream<LiveSession>? { nil }

    /// Same rule as the server: at least two meaningful words shared with a task's examples.
    public static func match(_ text: String, in tasks: [HelperTask]) -> HelperTask? {
        let t = TextNorm.normalize(text)
        var best: (HelperTask, Int)?
        for task in tasks.sorted(by: { $0.id < $1.id }) {
            let words = Set(task.exampleRequests.values.flatMap { $0 }
                .flatMap { TextNorm.normalize($0).split(separator: " ").map(String.init) }
                .filter { $0.count > 3 })
            let score = words.filter { t.contains($0) }.count
            if score >= 2, score > (best?.1 ?? 0) { best = (task, score) }
        }
        return best?.0
    }

    public static func confirmLine(_ title: String, _ lang: String) -> String {
        lang == "es"
            ? "Quieres: \(title.prefix(1).lowercased() + title.dropFirst()). ¿Es así?"
            : "You want to: \(title). Is that right?"
    }
}

// MARK: - Fallback

/// Tries the primary (Convex) and silently uses LocalBackend when it fails or is slow.
/// After a failure it stays local for `retryAfter` seconds, then tries the primary again.
public final class FallbackBackend: BackendClient {
    private let primary: BackendClient?
    private let local: BackendClient
    private let timeout: TimeInterval
    private let retryAfter: TimeInterval
    private let now: () -> Date
    private var failedAt: Date?
    private let lock = NSLock()

    /// Called on the main queue whenever the mode changes (drives the offline indicator).
    public var onModeChange: ((BackendMode) -> Void)?

    public init(primary: BackendClient?, local: BackendClient, timeout: TimeInterval = 4, retryAfter: TimeInterval = 60, now: @escaping () -> Date = Date.init) {
        self.primary = primary
        self.local = local
        self.timeout = timeout
        self.retryAfter = retryAfter
        self.now = now
    }

    public var mode: BackendMode {
        lock.lock(); defer { lock.unlock() }
        guard primary != nil else { return .local }
        if let failedAt, now().timeIntervalSince(failedAt) < retryAfter { return .local }
        return .convex
    }

    private func setFailed(_ failed: Bool) {
        let before = mode
        lock.lock()
        failedAt = failed ? now() : nil
        lock.unlock()
        let after = mode
        if before != after, let cb = onModeChange { DispatchQueue.main.async { cb(after) } }
    }

    private func run<T>(_ primaryCall: @escaping (BackendClient) async throws -> T,
                        _ localCall: (BackendClient) async throws -> T) async throws -> T {
        if mode == .convex, let primary {
            do {
                let value = try await withTimeout(timeout) { try await primaryCall(primary) }
                if failedAt != nil { setFailed(false) }
                return value
            } catch {
                setFailed(true)
            }
        }
        return try await localCall(local)
    }

    public func chooseTask(sessionId: String, text: String, userLanguage: String) async throws -> TaskChoice {
        try await run({ try await $0.chooseTask(sessionId: sessionId, text: text, userLanguage: userLanguage) },
                      { try await $0.chooseTask(sessionId: sessionId, text: text, userLanguage: userLanguage) })
    }

    public func startSession(sessionId: String, locale: String, userLanguage: String, taskId: String) async throws {
        try await run({ try await $0.startSession(sessionId: sessionId, locale: locale, userLanguage: userLanguage, taskId: taskId) },
                      { try await $0.startSession(sessionId: sessionId, locale: locale, userLanguage: userLanguage, taskId: taskId) })
    }

    public func record(_ event: SessionEvent, sessionId: String) async throws {
        try await run({ try await $0.record(event, sessionId: sessionId) }, { try await $0.record(event, sessionId: sessionId) })
    }

    public func stepAudio(taskId: String, stepId: String, kind: LineKind, userLanguage: String, phoneLanguage: String, sessionId: String) async throws -> AudioSource? {
        // Bundled audio first: instant and offline.
        if let local = try? await local.stepAudio(taskId: taskId, stepId: stepId, kind: kind, userLanguage: userLanguage, phoneLanguage: phoneLanguage, sessionId: sessionId) {
            return local
        }
        return try await run({ try await $0.stepAudio(taskId: taskId, stepId: stepId, kind: kind, userLanguage: userLanguage, phoneLanguage: phoneLanguage, sessionId: sessionId) },
                             { _ in nil })
    }

    public func speech(text: String, language: String, sessionId: String) async throws -> AudioSource? {
        if let local = try? await local.speech(text: text, language: language, sessionId: sessionId) { return local }
        return try await run({ try await $0.speech(text: text, language: language, sessionId: sessionId) }, { _ in nil })
    }

    public func observeSession(sessionId: String) -> AsyncStream<LiveSession>? {
        mode == .convex ? primary?.observeSession(sessionId: sessionId) : nil
    }
}

public struct TimeoutError: Error {}

/// Runs `work`, throwing TimeoutError if it takes longer than `seconds`.
public func withTimeout<T>(_ seconds: TimeInterval, _ work: @escaping () async throws -> T) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask { try await work() }
        group.addTask {
            try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            throw TimeoutError()
        }
        guard let first = try await group.next() else { throw TimeoutError() }
        group.cancelAll()
        return first
    }
}
