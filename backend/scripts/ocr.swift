// Reads the text on a screenshot with Apple's Vision framework (on this Mac, offline).
// Usage: swift scripts/ocr.swift <image> [language, e.g. es-US]
// Prints JSON: {"width":W,"height":H,"lines":[{"text":"…","box":{"x":…,"y":…,"w":…,"h":…}}]}
// with boxes normalized 0..1 and a top-left origin, the same shape web/ocr.js returns.
import AppKit
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count >= 2, let image = NSImage(contentsOfFile: args[1]),
      let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("usage: swift ocr.swift <image> [language]\n".data(using: .utf8)!)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
if args.count >= 3 { request.recognitionLanguages = [args[2], "en-US"] }
try VNImageRequestHandler(cgImage: cg).perform([request])

struct Box: Encodable { let x, y, w, h: Double }
struct Line: Encodable { let text: String; let box: Box }
struct Out: Encodable { let width, height: Int; let lines: [Line] }

let lines = (request.results ?? []).compactMap { obs -> Line? in
    guard let text = obs.topCandidates(1).first?.string else { return nil }
    let b = obs.boundingBox // bottom-left origin
    return Line(text: text, box: Box(x: b.minX, y: 1 - b.maxY, w: b.width, h: b.height))
}
let data = try JSONEncoder().encode(Out(width: cg.width, height: cg.height, lines: lines))
print(String(data: data, encoding: .utf8)!)
