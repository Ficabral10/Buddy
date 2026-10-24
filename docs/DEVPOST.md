# Devpost draft

**Name:** Lola
**Tagline:** A calm voice that helps you use your own iPhone, in your language. You do every tap.

## Inspiration
Many Spanish-speaking grandparents in the US depend on a son, daughter, or grandchild every time
their iPhone needs a setting changed. Settings are nested, full of jargon, and in English; help
videos can't see what's on your screen. The person who helps isn't always free, and asking again
and again is hard on both sides. We wanted something that sits next to you like a patient friend
and lets you do it yourself.

## What it does
Say the problem in Spanish or English ("WhatsApp no ve mis fotos"). Lola confirms the task, then
guides one step at a time, naming the exact label on your phone, by voice and in a small floating
card. If you share your screen, Lola notices when you reach the next screen and moves on; if you
take a wrong turn, it says so kindly and how to go back. Say "estoy perdida" and it explains
differently. At the end it offers to open a chat with a family member, and you press Send.
It never taps anything for you.

## How we built it
SwiftUI app and a ReplayKit broadcast extension. The extension samples about one frame per second
and runs Apple Vision text recognition on the phone; only text lines reach the app, and frames are
discarded. A step detector matches those lines against "arrival signatures" in a curated, versioned
task library (screen title plus expected rows, wrong-turn screens, per-language labels). A small
Node backend holds the API keys: Claude (Haiku 5.5, tool use with `lookup_task`, `get_step`,
`respond`) picks the task and rewords steps; Cartesia Sonic 3.6 speaks in Spanish and English at a
slightly slower pace. Code guardrails around Claude reject invented tasks, replies missing the exact
on-screen label, and any mention of passwords or codes.

## Challenges we ran into
iOS doesn't let any app draw over Settings or point at buttons. We switched from "a mascot that
points" to voice plus a Picture-in-Picture card. Screen sharing must be started by the user through
Apple's sheet, the extension has a tight memory budget, and a screen's back button shows the
previous title, which confused our first detector. *(Update with what actually happened on the device.)*

## Accomplishments that we're proud of
*(Fill in honestly after the demo works. Examples: the full flow in Spanish; wrong-turn recovery; real numbers from our small test.)*

## What we learned
*(Fill in.)*

## What's next
More tasks (camera, microphone, text size, Wi-Fi); Mandarin; label tables for each iOS version
checked on real devices; a caregiver setup flow; testing with 8 to 10 people per language.

## Built with
swift, swiftui, replaykit, vision, avkit, node.js, claude, anthropic, cartesia
