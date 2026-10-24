import SwiftUI
import ContactsUI
import MessageUI

/// Reaching a family member. The app only opens things; the user always taps Send or Call.
enum Family {
    static func digits(_ phone: String) -> String { phone.filter(\.isNumber) }

    /// WhatsApp "click to chat" link with a pre-filled message. WhatsApp opens the chat;
    /// the user taps Send (and can attach the photos there).
    static func whatsAppURL(phone: String, message: String) -> URL? {
        var c = URLComponents(string: "https://wa.me/\(digits(phone))")
        c?.queryItems = [URLQueryItem(name: "text", value: message)]
        return c?.url
    }

    /// FaceTime call. iOS shows its own confirmation before calling.
    static func faceTimeURL(phone: String) -> URL? {
        URL(string: "facetime://\(digits(phone))")
    }

    static func messageText(userLanguage: String) -> String {
        userLanguage == "es"
            ? "¡Hola! Ya puedo mandarte fotos por WhatsApp. Te mando unas ahora."
            : "Hi! I can send you photos on WhatsApp now. Sending some your way."
    }
}

/// System contact picker. Choosing a contact needs no Contacts permission; we keep only the
/// name and one phone number, on this phone.
struct ContactPicker: UIViewControllerRepresentable {
    var onPick: (_ name: String, _ phone: String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    func makeUIViewController(context: Context) -> CNContactPickerViewController {
        let vc = CNContactPickerViewController()
        vc.delegate = context.coordinator
        vc.displayedPropertyKeys = [CNContactPhoneNumbersKey]
        return vc
    }

    func updateUIViewController(_ vc: CNContactPickerViewController, context: Context) {}

    final class Coordinator: NSObject, CNContactPickerDelegate {
        let onPick: (String, String) -> Void
        init(onPick: @escaping (String, String) -> Void) { self.onPick = onPick }

        func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
            guard let phone = contact.phoneNumbers.first?.value.stringValue else { return }
            onPick(CNContactFormatter.string(from: contact, style: .fullName) ?? "", phone)
        }
    }
}

/// Messages composer as a fallback when WhatsApp isn't installed. The user taps Send.
struct MessageComposer: UIViewControllerRepresentable {
    let recipient: String
    let body: String
    var onDone: () -> Void

    static var canSend: Bool { MFMessageComposeViewController.canSendText() }

    func makeCoordinator() -> Coordinator { Coordinator(onDone: onDone) }

    func makeUIViewController(context: Context) -> MFMessageComposeViewController {
        let vc = MFMessageComposeViewController()
        vc.recipients = [recipient]
        vc.body = body
        vc.messageComposeDelegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: MFMessageComposeViewController, context: Context) {}

    final class Coordinator: NSObject, MFMessageComposeViewControllerDelegate {
        let onDone: () -> Void
        init(onDone: @escaping () -> Void) { self.onDone = onDone }
        func messageComposeViewController(_ c: MFMessageComposeViewController, didFinishWith result: MessageComposeResult) {
            onDone()
        }
    }
}
