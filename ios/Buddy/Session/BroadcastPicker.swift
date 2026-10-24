import ReplayKit
import SwiftUI

/// Apple's system broadcast picker with our extension preselected. iOS always shows its own
/// sheet and the user always confirms; we can't start sharing silently.
///
/// The picker only draws a small icon. To give older users one big, labeled button, we keep the
/// picker in the view tree and forward our button's tap to its internal button. That uses only
/// public API but relies on the picker's view hierarchy: spike experiment (a) checks it works.
/// If it ever breaks, show `BroadcastPickerRepresentable` directly at a large size instead.
final class BroadcastPickerHolder {
    static let extensionBundleID = "com.buddyhelper.app.broadcast"

    let picker: RPSystemBroadcastPickerView = {
        let p = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 44, height: 44))
        p.preferredExtension = BroadcastPickerHolder.extensionBundleID
        p.showsMicrophoneButton = false
        return p
    }()

    /// Returns false if the internal button wasn't found (report this in the spike).
    @discardableResult
    func present() -> Bool {
        for case let button as UIButton in picker.subviews {
            button.sendActions(for: .touchUpInside)
            return true
        }
        return false
    }
}

struct BroadcastPickerRepresentable: UIViewRepresentable {
    let holder: BroadcastPickerHolder
    func makeUIView(context: Context) -> RPSystemBroadcastPickerView { holder.picker }
    func updateUIView(_ uiView: RPSystemBroadcastPickerView, context: Context) {}
}
