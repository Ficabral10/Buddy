import BuddyCore

/// Fixed things the mascot says, per spoken language (the user's chosen language, which can
/// differ from the phone's). Task instructions come from the library, not from here.
/// Keep in sync with PHRASES in backend/scripts/cache-demo-audio.js so they can be pre-rendered.
enum Phrase: String, CaseIterable {
    case done, confirmScreen, confirmCheck, finished, offerFamily, startSharing, lookAtPicture, paused, stopped

    private static let table: [String: [Phrase: String]] = [
        "en": [
            .done: "Done.",
            .confirmScreen: "Are you on this screen?",
            .confirmCheck: "Do you see a check mark next to it?",
            .finished: "That's it. It's done.",
            .offerFamily: "Would you like to send a message to your family?",
            .startSharing: "Tap the big button. On the next screen, tap the button to start.",
            .lookAtPicture: "Look for the row in the picture.",
            .paused: "Paused.",
            .stopped: "Okay, I'll stop here.",
        ],
        "es": [
            .done: "Listo.",
            .confirmScreen: "¿Estás en esta pantalla?",
            .confirmCheck: "¿Ves una marca al lado?",
            .finished: "Eso es todo. Ya está.",
            .offerFamily: "¿Quieres mandarle un mensaje a tu familia?",
            .startSharing: "Toca el botón grande. En la siguiente pantalla, toca el botón para iniciar.",
            .lookAtPicture: "Busca la fila que ves en la imagen.",
            .paused: "En pausa.",
            .stopped: "Está bien, aquí me detengo.",
        ],
    ]

    func text(_ language: String) -> String {
        let lang = TextNorm.baseLanguage(language)
        return Phrase.table[lang]?[self] ?? Phrase.table["en"]![self]!
    }
}
