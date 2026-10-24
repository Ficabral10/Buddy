import Foundation
import BuddyCore

/// Appends privacy-safe events (see BuddyCore.UsageEvent) to a file on this phone.
/// Off unless the user turns it on. The user exports it with the share sheet; nothing is uploaded.
final class UsageLogger {
    var enabled = false

    let fileURL: URL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("usage-log.jsonl")

    func log(_ event: UsageEvent) {
        guard enabled else { return }
        let line = Data((event.jsonLine() + "\n").utf8)
        if let h = try? FileHandle(forWritingTo: fileURL) {
            defer { try? h.close() }
            _ = try? h.seekToEnd()
            try? h.write(contentsOf: line)
        } else {
            try? line.write(to: fileURL)
        }
    }

    var hasData: Bool { FileManager.default.fileExists(atPath: fileURL.path) }

    func clear() { try? FileManager.default.removeItem(at: fileURL) }
}
