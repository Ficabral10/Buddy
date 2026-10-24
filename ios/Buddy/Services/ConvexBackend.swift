import Foundation
import Combine
import ConvexMobile
import BuddyCore

/// The Convex implementation of BackendClient. ConvexMobile is linked into the main app target
/// only, never the ReplayKit extension (its memory budget is tiny and it doesn't need a backend).
///
/// Numbers: ConvexMobile sends Swift `Int` as a Convex int64, which our `v.number()` validators
/// reject, so every number goes out as `Double`.
final class ConvexBackend: BackendClient {
    let mode = BackendMode.convex
    private let client: ConvexClient

    init(deploymentUrl: String) {
        client = ConvexClient(deploymentUrl: deploymentUrl)
    }

    private struct ChoiceDTO: Decodable {
        let taskId: String?
        let reply: String
        let offerFamily: Bool
        let source: String
    }

    private struct StepAudioDTO: Decodable { let url: String; let cached: Bool }
    private struct SpeechDTO: Decodable { let audioBase64: String; let mimeType: String }

    func chooseTask(sessionId: String, text: String, userLanguage: String) async throws -> TaskChoice {
        let r: ChoiceDTO = try await client.action("ai:chooseTask", with: [
            "sessionId": sessionId, "userLanguage": userLanguage, "text": text,
        ])
        return TaskChoice(taskId: r.taskId, reply: r.reply, offerFamily: r.offerFamily, source: r.source)
    }

    func startSession(sessionId: String, locale: String, userLanguage: String, taskId: String) async throws {
        try await client.mutation("sessions:start", with: [
            "sessionId": sessionId, "locale": locale, "userLanguage": userLanguage, "taskId": taskId,
        ])
    }

    func record(_ event: SessionEvent, sessionId: String) async throws {
        switch event {
        case .advance(let toStep, let stepId):
            try await client.mutation("sessions:advance", with: ["sessionId": sessionId, "toStep": Double(toStep), "stepId": stepId])
        case .hint(let stepId):
            try await client.mutation("sessions:hint", with: ["sessionId": sessionId, "stepId": stepId])
        case .lost(let stepId):
            try await client.mutation("sessions:lost", with: ["sessionId": sessionId, "stepId": stepId])
        case .wrongTurn(let stepId):
            try await client.mutation("sessions:wrongTurn", with: ["sessionId": sessionId, "stepId": stepId])
        case .familyCall:
            try await client.mutation("sessions:familyCall", with: ["sessionId": sessionId])
        case .end(let completed):
            try await client.mutation("sessions:end", with: ["sessionId": sessionId, "status": completed ? "done" : "stopped"])
        }
    }

    func stepAudio(taskId: String, stepId: String, kind: LineKind, userLanguage: String, phoneLanguage: String, sessionId: String) async throws -> AudioSource? {
        let r: StepAudioDTO = try await client.action("speech:stepAudio", with: [
            "sessionId": sessionId, "taskId": taskId, "stepId": stepId, "kind": kind.rawValue,
            "userLanguage": userLanguage, "phoneLanguage": phoneLanguage,
        ])
        return URL(string: r.url).map(AudioSource.url)
    }

    func speech(text: String, language: String, sessionId: String) async throws -> AudioSource? {
        let r: SpeechDTO = try await client.action("speech:speak", with: [
            "sessionId": sessionId, "text": text, "language": language,
        ])
        return Data(base64Encoded: r.audioBase64).map(AudioSource.data)
    }

    func observeSession(sessionId: String) -> AsyncStream<LiveSession>? {
        let publisher = client.subscribe(to: "sessions:live", with: ["sessionId": sessionId], yielding: LiveSession?.self)
            .replaceError(with: nil)
            .compactMap { $0 }
        return AsyncStream { continuation in
            let cancellable = publisher.sink(receiveCompletion: { _ in continuation.finish() },
                                             receiveValue: { continuation.yield($0) })
            continuation.onTermination = { _ in cancellable.cancel() }
        }
    }
}
