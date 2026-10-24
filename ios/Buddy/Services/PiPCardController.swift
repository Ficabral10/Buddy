import AVKit
import SwiftUI
import UIKit

/// What the floating card shows. The label never appears alone as a text line (it is always
/// inside the instruction), so our own card can't be mistaken for a screen title if it shows
/// up in captured frames (spike experiment e).
struct CardContent: Equatable {
    var instruction: String
    var stepText: String
    var referenceImage: String?
    var speaking: Bool
    var showPicture: Bool
}

/// Renders the card into a Picture-in-Picture window using AVSampleBufferDisplayLayer.
/// Assumptions to verify on a device (docs/SPIKE_PLAN.md, experiments d to f):
/// the window is opaque and user-positioned, custom drawn buttons don't receive taps, and the
/// system skip-back / skip-forward buttons reach us (mapped to Repeat / Next).
@Observable
final class PiPCardController: NSObject, AVPictureInPictureSampleBufferPlaybackDelegate, AVPictureInPictureControllerDelegate {
    let displayLayer = AVSampleBufferDisplayLayer()
    private var controller: AVPictureInPictureController?
    private var possibleObservation: NSKeyValueObservation?

    private(set) var isSupported = AVPictureInPictureController.isPictureInPictureSupported()
    private(set) var isPossible = false
    private(set) var isActive = false
    /// Recent events for the spike screen.
    private(set) var eventLog: [String] = []

    /// Live content usually hides skip buttons; a finite range may show them. Spike f tries both.
    var useFiniteTimeRange = true

    var onSkipBack: (() -> Void)?
    var onSkipForward: (() -> Void)?

    static let renderSize = CGSize(width: 360, height: 210)

    func setUpIfNeeded() {
        guard controller == nil, isSupported else { return }
        displayLayer.videoGravity = .resizeAspect
        let source = AVPictureInPictureController.ContentSource(sampleBufferDisplayLayer: displayLayer, playbackDelegate: self)
        let c = AVPictureInPictureController(contentSource: source)
        c.delegate = self
        c.canStartPictureInPictureAutomaticallyFromInline = true
        c.requiresLinearPlayback = false
        possibleObservation = c.observe(\.isPictureInPicturePossible, options: [.initial, .new]) { [weak self] c, _ in
            DispatchQueue.main.async { self?.isPossible = c.isPictureInPicturePossible }
        }
        controller = c
    }

    func start() {
        setUpIfNeeded()
        controller?.startPictureInPicture()
    }

    func stop() {
        controller?.stopPictureInPicture()
    }

    @MainActor
    func show(_ content: CardContent) {
        let renderer = ImageRenderer(content: PiPCardView(content: content).frame(width: Self.renderSize.width, height: Self.renderSize.height))
        renderer.scale = 2
        guard let image = renderer.cgImage, let pixelBuffer = Self.pixelBuffer(from: image),
              let sample = Self.sampleBuffer(from: pixelBuffer) else {
            note("render failed")
            return
        }
        if displayLayer.status == .failed { displayLayer.flush() }
        displayLayer.enqueue(sample)
    }

    private func note(_ s: String) {
        eventLog = Array(([Date().formatted(date: .omitted, time: .standard) + " " + s] + eventLog).prefix(20))
    }

    // MARK: - AVPictureInPictureSampleBufferPlaybackDelegate

    func pictureInPictureController(_ c: AVPictureInPictureController, setPlaying playing: Bool) {
        note("play/pause tapped (playing=\(playing))")
    }

    func pictureInPictureControllerTimeRangeForPlayback(_ c: AVPictureInPictureController) -> CMTimeRange {
        useFiniteTimeRange
            ? CMTimeRange(start: .zero, duration: CMTime(seconds: 3600, preferredTimescale: 1))
            : CMTimeRange(start: .negativeInfinity, duration: .positiveInfinity)
    }

    func pictureInPictureControllerIsPlaybackPaused(_ c: AVPictureInPictureController) -> Bool { false }

    func pictureInPictureController(_ c: AVPictureInPictureController, didTransitionToRenderSize newRenderSize: CMVideoDimensions) {
        note("render size \(newRenderSize.width)x\(newRenderSize.height)")
    }

    func pictureInPictureController(_ c: AVPictureInPictureController, skipByInterval skipInterval: CMTime,
                                    completion completionHandler: @escaping () -> Void) {
        if skipInterval.seconds < 0 {
            note("skip back -> Repeat")
            DispatchQueue.main.async { self.onSkipBack?() }
        } else {
            note("skip forward -> Next")
            DispatchQueue.main.async { self.onSkipForward?() }
        }
        completionHandler()
    }

    // MARK: - AVPictureInPictureControllerDelegate

    func pictureInPictureControllerDidStartPictureInPicture(_ c: AVPictureInPictureController) {
        isActive = true; note("PiP started")
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ c: AVPictureInPictureController) {
        isActive = false; note("PiP stopped")
    }

    func pictureInPictureController(_ c: AVPictureInPictureController, failedToStartPictureInPictureWithError error: Error) {
        note("PiP failed: \(error.localizedDescription)")
    }

    // MARK: - Image plumbing

    private static func pixelBuffer(from image: CGImage) -> CVPixelBuffer? {
        let attrs: [CFString: Any] = [
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true,
            kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary,
        ]
        var pb: CVPixelBuffer?
        guard CVPixelBufferCreate(kCFAllocatorDefault, image.width, image.height, kCVPixelFormatType_32BGRA,
                                  attrs as CFDictionary, &pb) == kCVReturnSuccess, let pb else { return nil }
        CVPixelBufferLockBaseAddress(pb, [])
        defer { CVPixelBufferUnlockBaseAddress(pb, []) }
        guard let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: image.width, height: image.height,
                                  bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb),
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        else { return nil }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return pb
    }

    private static func sampleBuffer(from pb: CVPixelBuffer) -> CMSampleBuffer? {
        var format: CMVideoFormatDescription?
        CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: pb, formatDescriptionOut: &format)
        guard let format else { return nil }
        var timing = CMSampleTimingInfo(duration: .invalid,
                                        presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
                                        decodeTimeStamp: .invalid)
        var sb: CMSampleBuffer?
        CMSampleBufferCreateReadyWithImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: pb, formatDescription: format,
                                                 sampleTiming: &timing, sampleBufferOut: &sb)
        guard let sb, let attachments = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: true) else { return nil }
        let dict = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
        CFDictionarySetValue(dict,
                             Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
                             Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
        return sb
    }
}

/// Hosts the display layer in the app. PiP can only start from a layer that is on screen,
/// so the session screen shows this as the in-app card preview.
struct PiPHostView: UIViewRepresentable {
    let controller: PiPCardController

    final class HostView: UIView {
        var hosted: CALayer?
        override func layoutSubviews() {
            super.layoutSubviews()
            hosted?.frame = bounds
        }
    }

    func makeUIView(context: Context) -> HostView {
        let v = HostView()
        v.layer.addSublayer(controller.displayLayer)
        v.hosted = controller.displayLayer
        controller.setUpIfNeeded()
        return v
    }

    func updateUIView(_ uiView: HostView, context: Context) {}
}

/// The card's look: mascot face, instruction in large type, step counter, optional target picture.
struct PiPCardView: View {
    let content: CardContent

    var body: some View {
        HStack(spacing: 14) {
            MascotFace(speaking: content.speaking)
                .frame(width: 64, height: 64)
            VStack(alignment: .leading, spacing: 6) {
                if content.showPicture, let name = content.referenceImage, UIImage(named: name) != nil {
                    Image(name).resizable().scaledToFit().frame(maxHeight: 60)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                Text(content.instruction)
                    .font(.system(size: 24, weight: .semibold))
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(.white)
                Text(content.stepText)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(.white.opacity(0.8))
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(Color(red: 0.11, green: 0.16, blue: 0.27))
    }
}
