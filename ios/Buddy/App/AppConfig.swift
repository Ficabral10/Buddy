import Foundation
import BuddyCore

enum AppConfig {
    /// Set once in project.yml (APP_DISPLAY_NAME). Never hard-code the name elsewhere.
    static var appName: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "Buddy"
    }

    static var backendURL: URL? {
        guard let s = Bundle.main.object(forInfoDictionaryKey: "BuddyBackendURL") as? String, !s.isEmpty else { return nil }
        return URL(string: s)
    }

    /// Not a secret (anything in an app can be extracted); it only keeps casual traffic off a demo server.
    static var clientToken: String? {
        let s = Bundle.main.object(forInfoDictionaryKey: "BuddyClientToken") as? String
        return (s?.isEmpty ?? true) ? nil : s
    }

    static var phoneLanguage: String { Locale.preferredLanguages.first ?? "en" }

    static let supportedLanguages = ["es", "en"]

    static func loadBundledLibrary() -> TaskLibrary? {
        guard let url = Bundle.main.url(forResource: "library", withExtension: nil) else { return nil }
        return try? TaskLibrary.load(from: url)
    }
}

enum OutputMode: String, CaseIterable, Identifiable {
    case voiceAndText, voice, text
    var id: String { rawValue }
    var speaks: Bool { self != .text }
}

/// User choices, kept on this phone only.
@Observable
final class AppSettings {
    private let defaults = UserDefaults.standard

    var onboarded: Bool { didSet { defaults.set(onboarded, forKey: "onboarded") } }
    var userLanguage: String { didSet { defaults.set(userLanguage, forKey: "userLanguage") } }
    var outputMode: OutputMode { didSet { defaults.set(outputMode.rawValue, forKey: "outputMode") } }
    /// Multiplies hint timings. Higher = more time to try before the helper adds a hint.
    var patience: Double { didSet { defaults.set(patience, forKey: "patience") } }
    var familyName: String { didSet { defaults.set(familyName, forKey: "familyName") } }
    var familyPhone: String { didSet { defaults.set(familyPhone, forKey: "familyPhone") } }
    /// Opt-in. Counts only (see BuddyCore.UsageEvent); off by default.
    var usageLogging: Bool { didSet { defaults.set(usageLogging, forKey: "usageLogging") } }

    init() {
        onboarded = defaults.bool(forKey: "onboarded")
        let phone = TextNorm.baseLanguage(AppConfig.phoneLanguage)
        userLanguage = defaults.string(forKey: "userLanguage") ?? (AppConfig.supportedLanguages.contains(phone) ? phone : "en")
        outputMode = OutputMode(rawValue: defaults.string(forKey: "outputMode") ?? "") ?? .voiceAndText
        patience = defaults.object(forKey: "patience") as? Double ?? 1.0
        familyName = defaults.string(forKey: "familyName") ?? ""
        familyPhone = defaults.string(forKey: "familyPhone") ?? ""
        usageLogging = defaults.bool(forKey: "usageLogging")
    }
}
