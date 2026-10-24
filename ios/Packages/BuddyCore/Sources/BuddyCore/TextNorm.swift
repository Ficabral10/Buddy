import Foundation

public enum TextNorm {
    /// Lowercase, strip accents, unify quotes, collapse spaces. Mirrors backend/src/text.js.
    public static func normalize(_ s: String) -> String {
        var t = s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
        for (from, to) in [("‘", "'"), ("’", "'"), ("´", "'"), ("`", "'"), ("“", "\""), ("”", "\""), ("«", "\""), ("»", "\"")] {
            t = t.replacingOccurrences(of: from, with: to)
        }
        t = t.lowercased()
        return t.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    /// Normalized, with leading/trailing punctuation removed ("< Settings" -> "settings").
    public static func clean(_ s: String) -> String {
        let n = normalize(s)
        let keep: (Character) -> Bool = { $0.isLetter || $0.isNumber }
        guard let first = n.firstIndex(where: keep), let last = n.lastIndex(where: keep) else { return "" }
        return String(n[first...last])
    }

    /// "es-US" -> "es"
    public static func baseLanguage(_ code: String) -> String {
        let lower = code.lowercased()
        return String(lower.split(whereSeparator: { $0 == "-" || $0 == "_" }).first ?? "en")
    }
}
