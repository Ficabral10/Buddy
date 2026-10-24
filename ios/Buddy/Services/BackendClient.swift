import Foundation

/// Talks to our small backend. API keys for Claude and Cartesia live there, never in the app.
struct AgentRequest: Encodable {
    var userLanguage: String
    var phoneLanguage: String
    var iosVersion: String
    var event: String          // "request" | "lost" | "question"
    var text: String?
    var taskId: String?
    var stepId: String?
    /// Only the screen's title line, never the full screen text.
    var screenTitle: String?
}

struct AgentReply: Decodable {
    let action: String         // start_task | clarify | not_supported | reexplain | answer | safety
    let taskId: String?
    let say: String
    let source: String         // claude | library | guardrail
    let guardrail: String?
}

enum BackendError: Error { case notConfigured, http(Int) }

final class BackendClient {
    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 8
        return URLSession(configuration: config)
    }()

    var isConfigured: Bool { AppConfig.backendURL != nil }

    private func request(_ path: String, body: Data) throws -> URLRequest {
        guard let base = AppConfig.backendURL else { throw BackendError.notConfigured }
        var req = URLRequest(url: base.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = AppConfig.clientToken { req.setValue(token, forHTTPHeaderField: "X-Buddy-Client") }
        req.httpBody = body
        return req
    }

    func agent(_ body: AgentRequest) async throws -> AgentReply {
        let (data, resp) = try await session.data(for: request("agent", body: JSONEncoder().encode(body)))
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw BackendError.http(status) }
        return try JSONDecoder().decode(AgentReply.self, from: data)
    }

    /// Cartesia audio (mp3) for one sentence.
    func tts(text: String, language: String, timeout: TimeInterval = 4) async throws -> Data {
        var req = try request("tts", body: JSONSerialization.data(withJSONObject: ["text": text, "language": language]))
        req.timeoutInterval = timeout
        let (data, resp) = try await session.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw BackendError.http(status) }
        return data
    }
}
