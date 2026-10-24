import SwiftUI

/// Placeholder mascot: a calm round face. States: listening, thinking, speaking.
/// Swap in final art later; keep it friendly, not cartoonish or childish.
struct MascotFace: View {
    var speaking: Bool = false
    var listening: Bool = false

    var body: some View {
        GeometryReader { geo in
            let s = min(geo.size.width, geo.size.height)
            ZStack {
                Circle().fill(Color(red: 0.98, green: 0.72, blue: 0.36))
                if listening {
                    Circle().stroke(Color.white, lineWidth: s * 0.05).padding(-s * 0.06)
                }
                HStack(spacing: s * 0.22) {
                    Capsule().fill(Color.black.opacity(0.8)).frame(width: s * 0.09, height: s * 0.16)
                    Capsule().fill(Color.black.opacity(0.8)).frame(width: s * 0.09, height: s * 0.16)
                }
                .offset(y: -s * 0.08)
                Capsule()
                    .fill(Color.black.opacity(0.75))
                    .frame(width: s * (speaking ? 0.26 : 0.3), height: s * (speaking ? 0.14 : 0.05))
                    .offset(y: s * 0.2)
            }
            .frame(width: s, height: s)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityHidden(true)
    }
}
