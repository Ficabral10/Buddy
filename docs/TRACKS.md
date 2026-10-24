# Track write-ups (about 150 words each)

Each paragraph maps the track's criteria to evidence. Before submitting, replace any claim that
the demo doesn't actually show, and add real numbers from docs/IMPACT.md.

## Best People-First Hack
Lola is for people who are cut off from their own phones: older adults, especially
Spanish-speaking grandparents who rely on relatives for every settings change. Its core rule is
that the person does every tap; Lola only explains, one step at a time, naming the exact label
their phone shows, in their language. It waits before helping, notices wrong turns, and accepts
"estoy perdida" at any time. Privacy is built in: screen text is read on the phone and discarded,
and Lola never asks for passwords or codes. Success is measured by independence (finished
without calling someone), not engagement. The live demo shows a grandmother's real task end to end:
letting WhatsApp see her photos so she can send them to her grandchildren herself.

## Anthropic
Community: Spanish-speaking older adults who rely on relatives for iPhone help. Problem: settings
are nested and in English, and help can't see their screen. It works: one task end to end, in
Spanish. Claude does the parts that need judgment: understanding a messy spoken request, choosing
the right flow via tool calls (`lookup_task`, `get_step`, `respond`), and re-explaining a step in
new words when someone is lost. Where it could go wrong, and our answer: wrong steps (Claude can
only use our curated library; code rejects invented tasks and any re-explanation missing the exact
on-screen label), scams (replies mentioning passwords or codes are replaced; "someone called me
and told me to" pauses the session), privacy (screen text never leaves the phone; only the title
line is sent when the user says they're lost). 36 automated tests cover these guardrails.

## Cartesia
Voice is the product: every instruction is spoken, and many of our users read English poorly or
not at all. Lola uses Cartesia Sonic 3.6 through `/tts/bytes` with a Spanish and an English voice,
`generation_config.speed` 0.9 for older listeners, and server-side calls so keys stay off the
phone. Demo lines are pre-rendered into the app so it speaks even on bad Wi-Fi, with Apple's
voice as a last fallback. Accessibility: typed input, big buttons, Dynamic Type, VoiceOver
labels, and a "Only text" mode. Privacy: screen text processed on the device; usage logging is
opt-in and counts only. Known limits are in the README. The live demo is one complete Spanish
flow, from the spoken request to the grandmother sending her own message.

## Meta: Bringing People Closer Together with AI
A grandmother who can't get photos into WhatsApp is shut out of her grandchildren's lives. Lola's
demo task is exactly that: Claude understands "WhatsApp no ve mis fotos", Lola talks her through
turning on photo access in Spanish, and the last step opens a WhatsApp chat with the family member
she chose, pre-filled. She taps Send; the app never sends anything. A "call my family" FaceTime
button is always there when she wants a person. We're careful not to overclaim: Lola's core idea
is independence, and the connection comes from removing the barrier, not from replacing family.
The AI is essential, not decorative: without it there is no understanding of her spoken
request and no re-explanation when she's lost.

## Microsoft: Built for the Real World / Customer Impact
Customer understanding: *(summarize docs/CUSTOMER.md: who we talked to and what we learned).*
Measurable usefulness: *(from docs/IMPACT.md: n people, finished unaided with and without Lola,
median time, "I'm lost" count. Real numbers only.)* Path to production: a versioned task library
with per-iOS-version label tables, a validator, an update process, and a "not sure" fallback
(docs/PRODUCTION_PATH.md). Responsible design: the user does every tap; curated instructions;
on-device screen processing; scam guardrails. End-to-end: the live demo goes from a spoken Spanish
request to the finished task.
