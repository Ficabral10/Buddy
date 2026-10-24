# Path to production (one page)

**Curated task library.** Every instruction lives in `library/`, keyed by task, iOS version
range, and phone language, with exact labels, hints, wrong-turn screens, and arrival signatures.
Claude never writes a step; it chooses and rewords. `npm run validate` enforces the schema, and
CI would run it plus the detector fixture tests on every change.

**New iOS releases.** Each task declares `iosVersions`. When Apple ships a beta, a person walks
every task on a device in each language, captures the screens as fixtures, updates labels, and
bumps `libraryVersion`. Labels stay `labelsVerified: false` until that walk is done. Today the
app uses the copy bundled at build time; the backend already serves the library (`GET /library`),
so the next step is for the app to fetch it and fall back to the bundled copy, letting fixes ship
without an App Store update.

**Unknown screens.** If the detector can't place the screen, the app keeps the current
instruction and escalates hints; if the title matches but nothing else does, it asks "Are you on
this screen?"; the user can always say "I'm lost" or tap Next. If no task fits a request, Lola
says it isn't sure and offers to call a family member. It never improvises steps.

**Monitoring (privacy-safe).** Opt-in counts per task and step: completion, hints, "I'm lost",
wrong turns, time. A step with many "I'm lost" or wrong turns flags a bad label or a changed
screen. Guardrail hits (`missing-exact-label`, `unknown-task`, `secrets`) are logged server-side
without user text. No screen content is ever collected.

**Scale and cost.** Claude Haiku 5.5 keeps latency and cost low; static instructions are
pre-rendered audio, so live TTS is only for Claude's re-explanations. Rate limiting per client.

**Before a public launch.** App Review check of PiP and ReplayKit use; App Store privacy labels;
accessibility audit (VoiceOver, Dynamic Type, contrast); usability tests with 8 to 10 people per
language; real authentication instead of the demo client token; a caregiver setup flow.

**Next tasks.** Camera, microphone, location, notifications, Wi-Fi, Bluetooth, text size, volume,
contacts access; then Mandarin.
