# Devpost submission (paste-ready)

**Project name:** Lola
**Tagline:** A calm voice that walks older adults through their own iPhone, in their language, and catches scams. They do every tap.
**Try it out:** https://github.com/Ficabral10/Buddy
**Built with:** claude, anthropic, cartesia, convex, javascript, node.js, swift, swiftui, tesseract.js, replaykit, vision

---

## Inspiration
Millions of older adults in the US who speak Spanish, Korean or Vietnamese depend on a son,
daughter or grandchild every time their iPhone needs a setting changed. Settings are buried and
usually in English, help videos can't see their screen, and asking again and again wears on both
sides. They are also the people scammers target most. We wanted a patient helper that sits next to
you, speaks your language, and lets you do it yourself.

## What it does
- **Ask out loud, in your language.** "WhatsApp no ve mis fotos." Claude matches the request to a task in our checked library and restates it: "Quieres que WhatsApp vea tus fotos. ¿Es así?"
- **One step at a time.** Lola names the exact words on *your* phone ("Toca Privacidad y seguridad"), spoken by a Cartesia voice in Spanish, Korean, Vietnamese or English, and shown in large type with a picture of the screen.
- **"Toca aquí."** iPhones don't let any app point at buttons in Settings, so when you send a screenshot, Lola reads it on the phone, works out where you are, and draws a red ring around the exact button. On a wrong screen it circles the back button and says so.
- **Help without hovering.** It waits, then repeats, then says where to look. Say "estoy perdida" and it explains another way. Come back from Settings and it asks "¿Ya lo hiciste?"
- **"¿Es una estafa?"** Screenshot a strange text. Lola reads it on the phone, flags the warning signs (a link, urgency, a payment, a "new number"), and explains in plain words what to do, with a one-tap "Ask Ana".
- **Family, without dependence.** "Ask Ana for help" opens WhatsApp with a message saying exactly which step you're stuck on. At the end, Lola opens a chat so you can send your grandkids the photos. You always tap Send.
- **Not in the library?** Claude searches the web and breaks the answer into simple steps, clearly marked "from the web" with sources, under the same safety rules.

## How we built it
- **Web app** (runs in Safari on the iPhone, added to the Home Screen): vanilla JS, large-type accessible UI, browser speech recognition, Tesseract.js for on-device screenshot reading.
- **Curated task library:** JSON flows with exact on-screen labels per phone language and per iOS version, wrong-turn screens, hint timing and "arrival signatures" that tell the step detector which screen you're on. A validator runs in CI-style tests.
- **Claude (Anthropic):** tool use for picking the task (`lookup_task`, `get_step`, `respond`), re-explaining a step when you're lost, reading an unknown screenshot only with consent (`screen_help`), scam verdicts, and web search for questions outside the library.
- **Cartesia Sonic 3.6:** every line is spoken in the user's language at 0.9x speed for older listeners; audio is cached so repeated lines are instant.
- **Convex:** the backend for the native iOS app: the task library, anonymous sessions with live counters, a Claude action that may only select a library task id, a Cartesia action with audio cached in file storage, rate limits and a cron that deletes everything after 7 days.
- **Native iOS app (SwiftUI + ReplayKit + Vision):** a broadcast extension that reads the screen on the device and advances steps automatically, plus a Picture-in-Picture card. Written and unit-tested, but not yet run on a device (see Challenges).
- **68 automated tests** cover the library, the step detector, every guardrail and the server.

## Responsible design (where it could go wrong, and what we did)
- **Wrong steps hurt more than no steps.** Instructions come from the checked library, not the model's memory. Code rejects any task id Claude invents, any button label not in the library, and any re-explanation missing the exact on-screen label. Web answers are labeled as such with sources.
- **Scams.** Lola never asks for passwords, codes or card numbers; any reply that mentions them is replaced. Rule-based red flags set a minimum risk the model can't lower, and advice like "tap the link" or "pay" is stripped. "Someone called me from the bank and told me to…" pauses the session and suggests calling family.
- **Privacy.** Screenshots are read on the phone and never stored. Screens with password, code or card fields are never read or sent. A screenshot reaches Claude only after the user taps "Yes, look at it." Sessions are anonymous and deleted after 7 days. No screen text or transcripts are logged.
- **The user stays in charge.** Lola never taps, sends or changes anything. Repeat, Next, I'm lost, Pause and Stop are always one tap or one word away.

## Challenges we ran into
- iOS doesn't let any app draw over Settings or tap for the user, so "a mascot that points at the button" became voice plus a red ring on the user's own screenshot.
- Our Mac couldn't install the current Xcode (it needs a newer macOS), so we couldn't run the native iOS app. We rebuilt the experience as a web app the same night, sharing the same library, detector and backend.
- A screen's back button shows the previous screen's title, which fooled our first step detector; we added position and size rules and test fixtures.
- Korean grammar changes with the button name (을/를), and Vietnamese "pin" means battery, not PIN. Multilingual safety rules needed language-aware matching.

## Accomplishments that we're proud of
- The full WhatsApp-photos task works end to end in Spanish, by voice, with the red "Toca aquí" ring on a real screenshot.
- The scam check catches a classic package-delivery scam without any model at all, and Claude can make it stricter but never looser.
- Four languages, three tasks, two platforms, one checked library.

## What we learned
Older users need less, not more: one instruction at a time, a pause before help, and a single word to say "I'm lost." And an AI helper for people who can't check its work has to be fenced in by code, not just by a prompt.

## What's next
Test with 8 to 10 people per language and publish the results; run the native iOS app on a device so steps advance automatically; more tasks (camera, microphone, Wi-Fi, notifications); a caregiver setup flow; real authentication before any public launch.

---

## Track paragraphs (select these tracks on Devpost)

**Anthropic.** *Named community:* Spanish-, Korean- and Vietnamese-speaking older adults in the US who rely on relatives for iPhone help. *Real problem:* buried, English-only settings and constant scam attempts. *It works:* the full task runs live in Spanish. *Thoughtful use of Claude:* Claude understands messy spoken requests, picks the flow with tool calls, re-explains when someone is lost, reads an unknown screenshot only with consent, and explains scam verdicts. We know where it could go wrong and fenced it with code: it can only choose library tasks and labels, can't lower a scam risk, and can't ask for secrets. 68 tests cover these guardrails.

**Cartesia.** Voice is the product: our users often can't read English, so every instruction, hint, wrong-turn warning and scam verdict is spoken by Cartesia Sonic 3.6 in Spanish, Korean, Vietnamese or English, at 0.9x speed for older listeners. The whole flow works by voice ("otra vez", "estoy perdida", "siguiente"). Keys stay on the server; audio is cached so repeated lines play instantly; the phone's built-in voice is a fallback if the network drops. Accessibility: large type, 60px buttons, typed input for every spoken action, an "only text" mode.

**Best People-First Hack.** Lola is for people shut out of their own phones. The person does every tap; Lola explains one step at a time in their language, circles the exact button on their screenshot, waits before helping, catches wrong turns and scams, and ends by opening a chat with family that they send themselves. Success means finishing without calling someone, not time in the app.

**Microsoft (Built for the Real World / Customer Impact).** *Customer:* older adults who don't speak English at home and their relatives. *Production path:* a versioned task library with a validator, labels per language and iOS version, a script to add real screenshots, privacy-safe metrics, a 7-day retention cron, and an "I'm not sure, call family" fallback (docs/PRODUCTION_PATH.md). *Responsible design:* user does every tap, curated instructions, on-device screen reading, scam guardrails in code. *Measurable usefulness:* the app logs opt-in, counts-only usage (completion, hints, "I'm lost", time) and a script turns it into a results table; we have not run the user study yet and will not claim numbers we don't have. *End to end:* spoken request to finished task, live.

**Notability.** (Only if the team has the shared notebook.) Link it here and describe honestly where it changed the build: the decision log (native app → web app when Xcode wouldn't install), the hand sketch of the red "Toca aquí" ring, and the notes behind the scam check.
