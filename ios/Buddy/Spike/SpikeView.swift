import SwiftUI
import UIKit
import BuddyCore

/// Phase 0 feasibility spike. Each experiment shows what it measured; results that need a human
/// (e.g. "did PiP stay up while you were in Settings?") are recorded with the toggles.
/// "Copy results" puts a table on the clipboard for docs/SPIKE_REPORT_TEMPLATE.md.
struct SpikeView: View {
    @Environment(Services.self) private var services
    @State private var holder = BroadcastPickerHolder()
    @State private var pickerFound: Bool?
    @State private var cardStep = 2
    @State private var observed: [String: Bool] = [:]
    @State private var maxMemory: Double = 0
    @State private var maxOCR = 0
    @State private var signatureSeen: String?

    private let marker = "SPIKE-CARD-7"

    var body: some View {
        let bridge = services.broadcast
        let pip = services.pip
        List {
            Section("a. Broadcast picker") {
                Button("Show me your screen") { pickerFound = holder.present() }
                    .font(.title3.bold())
                row("Internal picker button found", pickerFound.map { $0 ? "yes" : "NO: show the picker directly" } ?? "not tried")
                row("Broadcasting", bridge.isBroadcasting ? "yes" : "no")
                check("Picker opened with our extension preselected", "a.preselected")
                check("User needed 2 taps or fewer", "a.twoTaps")
            }
            Section("b. Frame sampling and text recognition") {
                row("Frames received", "\(bridge.framesReceived)")
                row("Lines in last frame", "\(bridge.latest?.lines.count ?? 0)")
                row("OCR time (last / max)", "\(bridge.latest?.ocrMillis ?? 0) ms / \(maxOCR) ms")
                row("Extension memory (last / max)", String(format: "%.1f MB / %.1f MB", bridge.latest?.memoryMB ?? 0, maxMemory))
                row("Photos/Fotos title seen", signatureSeen ?? "not yet: open Settings > Privacy > Photos")
                row("Vision languages", TextRecognizer.supportedLanguages().prefix(8).joined(separator: ", "))
            }
            Section("c. Extension to app messaging") {
                row("Capture to app delay", bridge.lastDeliveryMillis.map { "\($0) ms" } ?? "-")
                row("Sensitive-screen pause seen", bridge.latest?.paused == true ? "yes" : "no")
            }
            Section("d. PiP card") {
                row("PiP supported / possible / active", "\(pip.isSupported) / \(pip.isPossible) / \(pip.isActive)")
                PiPHostView(controller: pip).frame(height: 120)
                Button("Render step \(cardStep)") { render() }
                Button("Start PiP") { pip.start() }
                Text("When the Photos title is detected, the card should change from step 2 to step 3 by itself.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("e. Coexistence") {
                check("PiP stayed visible while broadcasting in Settings", "e.pipDuringBroadcast")
                check("Voice kept playing while in Settings", "e.audioInBackground")
                row("Card text found in captured frames", cardLeak ? "YES: detector must ignore it" : "not seen")
            }
            Section("f. PiP input") {
                Toggle("Finite time range (may show skip buttons)", isOn: Binding(get: { pip.useFiniteTimeRange }, set: { pip.useFiniteTimeRange = $0 }))
                check("Skip back/forward buttons visible", "f.skipVisible")
                check("Custom content in the card received taps", "f.customTaps")
                ForEach(pip.eventLog, id: \.self) { Text($0).font(.footnote.monospaced()) }
            }
            Section("g. Lock, notifications, calls") {
                check("Locking the phone ended the broadcast", "g.lockEnds")
                check("Notification banners appeared in frames", "g.bannersInFrames")
                check("Incoming call ended or paused the broadcast", "g.callEnds")
            }
            Section {
                Button("Copy results") { UIPasteboard.general.string = report() }.font(.title3.bold())
            }
        }
        .navigationTitle("Spike")
        .onAppear {
            pip.onSkipBack = { }
            pip.onSkipForward = { }
            bridge.onFrame = { frame in Task { @MainActor in onFrame(frame) } }
            render()
        }
        .background(BroadcastPickerRepresentable(holder: holder).frame(width: 1, height: 1).opacity(0.02))
    }

    private var cardLeak: Bool {
        services.broadcast.latest?.lines.contains { $0.text.contains(marker) } ?? false
    }

    @MainActor private func onFrame(_ f: FrameText) {
        maxMemory = max(maxMemory, f.memoryMB ?? 0)
        maxOCR = max(maxOCR, f.ocrMillis)
        let titles = ["Photos", "Fotos"].map(TextNorm.clean)
        if let hit = f.lines.first(where: { $0.y < 0.3 && titles.contains(TextNorm.clean($0.text)) }) {
            signatureSeen = "yes: \"\(hit.text)\" at y=\(String(format: "%.2f", hit.y)), h=\(String(format: "%.3f", hit.h))"
            if cardStep == 2 { cardStep = 3; render() }
        }
    }

    @MainActor private func render() {
        services.pip.show(CardContent(instruction: "Toca «Fotos» \(marker)", stepText: "Paso \(cardStep) de 5",
                                      referenceImage: nil, speaking: false, showPicture: false))
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack(alignment: .top) { Text(k); Spacer(); Text(v).foregroundStyle(.secondary).multilineTextAlignment(.trailing) }
    }

    private func check(_ label: String, _ key: String) -> some View {
        Toggle(label, isOn: Binding(get: { observed[key] ?? false }, set: { observed[key] = $0 }))
    }

    private func report() -> String {
        let b = services.broadcast, p = services.pip
        var lines = [
            "| Item | Result |", "|---|---|",
            "| Device / iOS | \(UIDevice.current.model) / iOS \(UIDevice.current.systemVersion) |",
            "| a. picker button found | \(pickerFound.map { "\($0)" } ?? "not tried") |",
            "| b. frames received | \(b.framesReceived) |",
            "| b. OCR max ms | \(maxOCR) |",
            "| b. extension memory max MB | \(String(format: "%.1f", maxMemory)) |",
            "| b. title signature | \(signatureSeen ?? "not seen") |",
            "| c. capture-to-app ms (last) | \(b.lastDeliveryMillis.map { "\($0)" } ?? "-") |",
            "| d. PiP supported/possible/active | \(p.isSupported)/\(p.isPossible)/\(p.isActive) |",
            "| e. card text in frames | \(cardLeak) |",
            "| f. finite time range | \(p.useFiniteTimeRange) |",
        ]
        for (k, v) in observed.sorted(by: { $0.key < $1.key }) { lines.append("| \(k) | \(v) |") }
        lines.append("| PiP events | \(p.eventLog.joined(separator: "; ")) |")
        return lines.joined(separator: "\n")
    }
}
