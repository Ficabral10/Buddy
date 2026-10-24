import Foundation
import Vision
import CoreVideo
import BuddyCore

/// On-device text recognition with Apple Vision. Compiled into both the app (screenshot
/// fallback) and the broadcast extension (live frames). Nothing here touches the network.
enum TextRecognizer {
    /// Recognition languages, most likely first. Check support at runtime with
    /// `supportedLanguages()` (spike experiment b reports it).
    static func languages(phoneLanguage: String) -> [String] {
        switch TextNorm.baseLanguage(phoneLanguage) {
        case "es": return ["es-ES", "en-US"]
        case "zh": return ["zh-Hans", "en-US"]
        default: return ["en-US", "es-ES"]
        }
    }

    static func supportedLanguages() -> [String] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        return (try? request.supportedRecognitionLanguages()) ?? []
    }

    private static func makeRequest(phoneLanguage: String, fast: Bool) -> VNRecognizeTextRequest {
        let request = VNRecognizeTextRequest()
        // .fast uses less memory, which matters in the broadcast extension. The spike compares both.
        request.recognitionLevel = fast ? .fast : .accurate
        request.usesLanguageCorrection = false // labels are exact UI strings, not prose
        request.recognitionLanguages = languages(phoneLanguage: phoneLanguage)
        return request
    }

    private static func lines(from request: VNRecognizeTextRequest, maxLines: Int) -> [RecognizedLine] {
        let observations = request.results ?? []
        return observations.prefix(maxLines).compactMap { obs in
            guard let text = obs.topCandidates(1).first?.string else { return nil }
            let b = obs.boundingBox
            return RecognizedLine.fromVision(text: text, x: b.minX, y: b.minY, w: b.width, h: b.height)
        }
    }

    static func recognize(pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation = .up,
                          phoneLanguage: String, fast: Bool = true, maxLines: Int = 40) throws -> [RecognizedLine] {
        let request = makeRequest(phoneLanguage: phoneLanguage, fast: fast)
        try VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation, options: [:]).perform([request])
        return lines(from: request, maxLines: maxLines)
    }

    static func recognize(cgImage: CGImage, phoneLanguage: String, maxLines: Int = 60) throws -> [RecognizedLine] {
        let request = makeRequest(phoneLanguage: phoneLanguage, fast: false)
        try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
        return lines(from: request, maxLines: maxLines)
    }
}
