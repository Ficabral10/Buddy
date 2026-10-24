import Foundation

/// What the broadcast extension hands to the app: a few recognized text lines from one frame.
/// Raw frames never leave the extension, and this message lives only in the App Group
/// container until the next frame overwrites it.
public struct FrameText: Codable, Sendable {
    public let seq: Int
    public let capturedAt: Date
    public let lines: [RecognizedLine]
    /// True when the frame looked sensitive (passwords, payments); lines are then empty.
    public let paused: Bool
    public let ocrMillis: Int
    public let memoryMB: Double?

    public init(seq: Int, capturedAt: Date, lines: [RecognizedLine], paused: Bool, ocrMillis: Int, memoryMB: Double?) {
        self.seq = seq; self.capturedAt = capturedAt; self.lines = lines
        self.paused = paused; self.ocrMillis = ocrMillis; self.memoryMB = memoryMB
    }
}

public enum SharedChannel {
    /// Must match the App Group in project.yml and both entitlements files.
    public static let appGroup = "group.com.buddyhelper.shared"
    public static let fileName = "frame-text.json"
    /// Darwin notification names carry no payload; the app reads the file when notified.
    public static let frameNotification = "com.buddyhelper.frame-text"
    public static let broadcastStarted = "com.buddyhelper.broadcast-started"
    public static let broadcastFinished = "com.buddyhelper.broadcast-finished"
    /// The app writes this to ask the extension to finish the broadcast.
    public static let stopRequestKey = "stopRequested"

    public static func containerURL() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    }

    /// Phrases that suggest a sensitive screen (a password, code, or card field). Detection
    /// pauses and nothing is read aloud. Deliberately phrases, not words: the Settings home
    /// screen itself shows "Face ID & Passcode" / "Face ID y código".
    public static let sensitiveWords = [
        "enter password", "enter passcode", "enter your password", "card number", "cvv", "security code", "verification code",
        "introduce la contraseña", "ingresa tu contraseña", "ingresa la contraseña", "ingresa el código",
        "número de tarjeta", "código de seguridad", "código de verificación", "输入密码", "验证码",
    ]

    public static func looksSensitive(_ lines: [String]) -> Bool {
        let all = lines.map(TextNorm.normalize).joined(separator: " ")
        return sensitiveWords.contains { all.contains(TextNorm.normalize($0)) }
    }
}
