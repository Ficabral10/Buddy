import ReplayKit
import CoreMedia
import Foundation
import BuddyCore

/// ReplayKit broadcast upload extension. Runs only while the user has chosen to share.
/// About once per second it reads text from one frame on the device and hands a few lines
/// to the app through the App Group. Frames are never stored or sent anywhere.
final class SampleHandler: RPBroadcastSampleHandler {
    private let queue = DispatchQueue(label: "buddy.ocr")
    private var busy = false
    private var lastFrameAt = Date.distantPast
    private var seq = 0
    private let interval: TimeInterval = 1.0
    private let phoneLanguage = Locale.preferredLanguages.first ?? "en"

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        try? FileManager.default.removeItem(at: stopFlagURL())
        post(SharedChannel.broadcastStarted)
    }

    override func broadcastFinished() {
        try? FileManager.default.removeItem(at: frameURL())
        post(SharedChannel.broadcastFinished)
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video else { return } // we never touch audio
        if FileManager.default.fileExists(atPath: stopFlagURL().path) {
            try? FileManager.default.removeItem(at: stopFlagURL())
            let error = NSError(domain: "Buddy", code: 0, userInfo: [
                NSLocalizedDescriptionKey: NSLocalizedString("The helper stopped watching your screen.", comment: "Shown by iOS when the helper ends screen sharing"),
            ])
            finishBroadcastWithError(error)
            return
        }
        let now = Date()
        guard now.timeIntervalSince(lastFrameAt) >= interval, !busy,
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lastFrameAt = now
        busy = true
        let orientation = Self.orientation(of: sampleBuffer)

        // Retain the pixel buffer only for this one recognition, then let it go.
        queue.async { [weak self] in
            guard let self else { return }
            defer { self.busy = false }
            let started = Date()
            let lines = (try? TextRecognizer.recognize(pixelBuffer: pixelBuffer, orientation: orientation,
                                                       phoneLanguage: self.phoneLanguage, fast: true)) ?? []
            let sensitive = SharedChannel.looksSensitive(lines.map(\.text))
            self.seq += 1
            let message = FrameText(
                seq: self.seq,
                capturedAt: now,
                lines: sensitive ? [] : lines,
                paused: sensitive,
                ocrMillis: Int(Date().timeIntervalSince(started) * 1000),
                memoryMB: Self.memoryFootprintMB()
            )
            if let data = try? JSONEncoder().encode(message) {
                try? data.write(to: self.frameURL(), options: .atomic)
                self.post(SharedChannel.frameNotification)
            }
        }
    }

    // MARK: - Helpers

    private func containerURL() -> URL {
        SharedChannel.containerURL() ?? FileManager.default.temporaryDirectory
    }
    private func frameURL() -> URL { containerURL().appendingPathComponent(SharedChannel.fileName) }
    private func stopFlagURL() -> URL { containerURL().appendingPathComponent(SharedChannel.stopRequestKey) }

    private func post(_ name: String) {
        CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),
                                             CFNotificationName(name as CFString), nil, nil, true)
    }

    private static func orientation(of sampleBuffer: CMSampleBuffer) -> CGImagePropertyOrientation {
        guard let value = CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber,
              let o = CGImagePropertyOrientation(rawValue: value.uint32Value) else { return .up }
        return o
    }

    /// Physical memory footprint, the number the system's extension limit is enforced against.
    static func memoryFootprintMB() -> Double? {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
        let kr = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }
        guard kr == KERN_SUCCESS else { return nil }
        return Double(info.phys_footprint) / 1_048_576
    }
}
