# Track write-ups

Entering: **Anthropic**, **Best Use of Cartesia**, **Best People-First Hack**, **Microsoft (Built for
the Real World + Customer Impact Award)**, **Best Use of Notability**. General prizes (Overall, Most
Creative, Most Technically Complex, Hacker's Choice) are judged automatically.

Before submitting: remove any claim the live demo doesn't show, and paste real numbers from
docs/IMPACT.md and real notes from docs/CUSTOMER.md. Never invent interviews or results.

## Anthropic (named community, real problem, it works, thoughtful use of Claude)
**Community:** Spanish-speaking older adults in the US who rely on relatives for iPhone help.
**Problem:** settings are buried and in English, help can't see their screen, and they are prime
scam targets. **It works:** the full WhatsApp-photos task runs end to end in Spanish on a real
iPhone. **Claude does the parts that need judgment:** it understands a messy spoken request and picks
the right flow with tool calls (`lookup_task`, `get_step`, `respond`); when she's lost it explains
the step in new words; when a screenshot shows a screen our reader doesn't know, and only if she says
yes, Claude looks at that one image and tells her what to tap; and it explains in plain Spanish why a
message she received looks like a scam. **Where it could go wrong, and what we did:** wrong steps
(Claude can only point at labels from our curated library; code rejects invented tasks, invented
labels, and any explanation missing the exact on-screen label); scams (rule-based red flags set a
floor Claude can't lower, advice to tap links or pay is stripped, "someone called me from the bank"
pauses the session); privacy (screenshots are read on the phone; private screens are never read or
sent; the image goes to Claude only after she agrees). 44 automated tests cover these guardrails.

## Best Use of Cartesia (voice core, works, accessibility, privacy)
Voice is the product: many of our users read English poorly or not at all, so every instruction,
hint, wrong-turn warning, and scam verdict is spoken by Cartesia Sonic 3.6 in Spanish or English,
slightly slower (`generation_config.speed 0.9`) for older listeners. Calls go through our server so
keys never reach the phone, and audio is cached so repeated lines play instantly. The flow is fully
usable by voice: say the problem, say "otra vez", "estoy perdida", "siguiente", "para". Accessibility:
large type, 60px buttons, typed input for every spoken action, an "only text" mode, and the
browser's voice as a fallback if the network drops. Known limits are listed in the README.

## Best People-First Hack
Lola is for people shut out of their own phones. Its rule is that she does every tap; Lola explains
one step at a time, in her language, naming the exact label her phone shows, and when she sends a
screenshot it circles the exact button. It waits before helping, catches wrong turns, checks
suspicious messages for scams, and ends by opening a chat with family that she sends herself. Success
is measured by independence (finished without calling someone), not time in the app.

## Microsoft: Built for the Real World / Customer Impact
**Customer understanding:** (summarize docs/CUSTOMER.md: who you talked to, what they said, what
changed). **Measurable usefulness:** (from docs/IMPACT.md: n people, finished unaided with vs without
Lola, median time, "I'm lost" count; real numbers only). **Path to production:** a versioned task
library with a validator, per-language labels, an update path for new iOS versions, privacy-safe
metrics, and a "not sure" fallback (docs/PRODUCTION_PATH.md). **Responsible design:** the user does
every tap, instructions are curated, screens are processed on the device, scam guardrails are code.
**End-to-end:** spoken Spanish request to finished task, live.

## Best Use of Notability
See docs/NOTABILITY.md. Link the shared Notability notebook here and describe, honestly, where it
changed the build (for example: the interview notes that made us add the scam check; the sketch of
the "Toca aquí" ring; the pivot from the native app to the web app when Xcode wouldn't install).
