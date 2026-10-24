import Foundation

/// Pre-rendered Cartesia clips shipped in the app (Resources/DemoAudio, made by
/// `npm run cache-audio`). Keyed by "lang|exact text". Works with no network.
final class BundledAudio {
    static let shared = BundledAudio()
    private let manifest: [String: String]

    private init() {
        if let url = Bundle.main.url(forResource: "manifest", withExtension: "json", subdirectory: "DemoAudio"),
           let data = try? Data(contentsOf: url),
           let m = try? JSONDecoder().decode([String: String].self, from: data) {
            manifest = m
        } else {
            manifest = [:]
        }
    }

    func url(language: String, text: String) -> URL? {
        guard let file = manifest["\(language)|\(text)"] else { return nil }
        return Bundle.main.url(forResource: (file as NSString).deletingPathExtension, withExtension: "mp3", subdirectory: "DemoAudio")
    }
}
