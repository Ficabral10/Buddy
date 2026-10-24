import XCTest
@testable import BuddyCore

private let repoRoot = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

/// A pretend Convex: fails, hangs, or answers, as the test needs.
private final class FakePrimary: BackendClient {
    enum Behavior { case fail, hang, answer(TaskChoice) }
    var behavior: Behavior
    var calls = 0
    let mode = BackendMode.convex
    init(_ behavior: Behavior) { self.behavior = behavior }

    func chooseTask(sessionId: String, text: String, userLanguage: String) async throws -> TaskChoice {
        calls += 1
        switch behavior {
        case .fail: throw URLError(.notConnectedToInternet)
        case .hang: try await Task.sleep(nanoseconds: 5_000_000_000); throw URLError(.timedOut)
        case .answer(let c): return c
        }
    }
    func startSession(sessionId: String, locale: String, userLanguage: String, taskId: String) async throws {
        if case .fail = behavior { throw URLError(.notConnectedToInternet) }
    }
    func record(_ event: SessionEvent, sessionId: String) async throws {}
    func stepAudio(taskId: String, stepId: String, kind: LineKind, userLanguage: String, phoneLanguage: String, sessionId: String) async throws -> AudioSource? {
        .url(URL(string: "https://example.invalid/\(stepId).mp3")!)
    }
    func speech(text: String, language: String, sessionId: String) async throws -> AudioSource? { nil }
    func observeSession(sessionId: String) -> AsyncStream<LiveSession>? { nil }
}

final class BackendTests: XCTestCase {
    var library: TaskLibrary!
    let sid = UUID().uuidString

    override func setUpWithError() throws {
        library = try TaskLibrary.load(from: repoRoot.appendingPathComponent("library"))
    }

    func testLocalBackendChoosesFromTheLibraryOffline() async throws {
        let local = LocalBackend(library: library)
        let choice = try await local.chooseTask(sessionId: sid, text: "WhatsApp no ve mis fotos", userLanguage: "es")
        XCTAssertEqual(choice.taskId, "whatsapp-photos")
        XCTAssertTrue(choice.reply.hasPrefix("Quieres:"))
        let none = try await local.chooseTask(sessionId: sid, text: "my car radio is broken", userLanguage: "en")
        XCTAssertNil(none.taskId)
        XCTAssertTrue(none.offerFamily)
    }

    func testFallsBackSilentlyWhenConvexFails() async throws {
        let primary = FakePrimary(.fail)
        let backend = FallbackBackend(primary: primary, local: LocalBackend(library: library))
        var modes: [BackendMode] = []
        backend.onModeChange = { modes.append($0) }
        let choice = try await backend.chooseTask(sessionId: sid, text: "WhatsApp no ve mis fotos", userLanguage: "es")
        XCTAssertEqual(choice.taskId, "whatsapp-photos")
        XCTAssertEqual(choice.source, "library")
        XCTAssertEqual(backend.mode, .local)
        // While offline it doesn't keep hammering the primary.
        _ = try await backend.chooseTask(sessionId: sid, text: "WhatsApp no ve mis fotos", userLanguage: "es")
        XCTAssertEqual(primary.calls, 1)
        try await backend.startSession(sessionId: sid, locale: "es-US", userLanguage: "es", taskId: "whatsapp-photos") // no throw
        await Task.yield()
    }

    func testTimesOutASlowPrimary() async throws {
        let backend = FallbackBackend(primary: FakePrimary(.hang), local: LocalBackend(library: library), timeout: 0.2)
        let started = Date()
        let choice = try await backend.chooseTask(sessionId: sid, text: "las letras están muy chiquitas, no puedo leer", userLanguage: "es")
        XCTAssertLessThan(Date().timeIntervalSince(started), 2)
        XCTAssertEqual(choice.taskId, "text-size")
    }

    func testRetriesPrimaryAfterTheWindow() async throws {
        var clock = Date()
        let primary = FakePrimary(.fail)
        let backend = FallbackBackend(primary: primary, local: LocalBackend(library: library), retryAfter: 60, now: { clock })
        _ = try await backend.chooseTask(sessionId: sid, text: "x y", userLanguage: "en")
        XCTAssertEqual(backend.mode, .local)
        clock = clock.addingTimeInterval(61)
        XCTAssertEqual(backend.mode, .convex)
        primary.behavior = .answer(TaskChoice(taskId: "whatsapp-photos", reply: "ok", offerFamily: false, source: "claude"))
        let choice = try await backend.chooseTask(sessionId: sid, text: "x y", userLanguage: "en")
        XCTAssertEqual(choice.source, "claude")
    }

    func testNoPrimaryConfiguredIsLocal() {
        XCTAssertEqual(FallbackBackend(primary: nil, local: LocalBackend(library: library)).mode, .local)
    }

    func testBundledAudioIsPreferredForLibraryLines() async throws {
        let bundled = URL(fileURLWithPath: "/tmp/bundled.mp3")
        let local = LocalBackend(library: library) { lang, text in
            lang == "es" && text == "Toca Fotos." ? bundled : nil
        }
        let backend = FallbackBackend(primary: FakePrimary(.fail), local: local)
        let a = try await backend.stepAudio(taskId: "whatsapp-photos", stepId: "photos", kind: .instruction, userLanguage: "es", phoneLanguage: "es", sessionId: sid)
        XCTAssertEqual(a, .url(bundled))
    }
}
