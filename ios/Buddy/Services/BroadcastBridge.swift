import Foundation
import BuddyCore

/// Receives recognized-text results from the broadcast extension through the App Group.
/// The extension writes one small JSON file and posts a Darwin notification; we read it here.
@Observable
final class BroadcastBridge {
    private(set) var isBroadcasting = false
    private(set) var latest: FrameText?
    private(set) var framesReceived = 0
    /// Milliseconds from frame capture to the app reading it (spike experiment c).
    private(set) var lastDeliveryMillis: Int?

    var onFrame: ((FrameText) -> Void)?

    init() {
        observe(SharedChannel.frameNotification) { $0.readFrame() }
        observe(SharedChannel.broadcastStarted) { $0.isBroadcasting = true }
        observe(SharedChannel.broadcastFinished) { $0.isBroadcasting = false; $0.latest = nil }
    }

    /// Asks the extension to end the broadcast at its next frame.
    func requestStop() {
        guard let dir = SharedChannel.containerURL() else { return }
        try? Data().write(to: dir.appendingPathComponent(SharedChannel.stopRequestKey))
    }

    private func readFrame() {
        guard let url = SharedChannel.containerURL()?.appendingPathComponent(SharedChannel.fileName),
              let data = try? Data(contentsOf: url) else { return }
        let decoder = JSONDecoder()
        guard let frame = try? decoder.decode(FrameText.self, from: data), frame.seq != latest?.seq else { return }
        isBroadcasting = true
        latest = frame
        framesReceived += 1
        lastDeliveryMillis = Int(Date().timeIntervalSince(frame.capturedAt) * 1000)
        onFrame?(frame)
    }

    // Darwin notifications need a C callback; route them back to this object by name.
    private static var handlers: [String: (BroadcastBridge) -> Void] = [:]
    private static weak var shared: BroadcastBridge?

    private func observe(_ name: String, _ handler: @escaping (BroadcastBridge) -> Void) {
        BroadcastBridge.shared = self
        BroadcastBridge.handlers[name] = handler
        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            nil,
            { _, _, cfName, _, _ in
                guard let cfName else { return }
                let key = cfName.rawValue as String
                DispatchQueue.main.async {
                    guard let bridge = BroadcastBridge.shared, let h = BroadcastBridge.handlers[key] else { return }
                    h(bridge)
                }
            },
            name as CFString,
            nil,
            .deliverImmediately
        )
    }
}
