# CLAUDE.md: standing rules for this repo

Buddy (shipping name set by `APP_DISPLAY_NAME` in `ios/project.yml`, currently "Lola") is an iOS
app with a friendly mascot that talks a person through tasks on their own iPhone, in their
language. Target users: older adults and non-English speakers. Built for Cal Hacks 13.0.

## Product rules (requirements)
1. The user does every tap. Never build tap injection, automation, or anything that acts for them.
2. One action per step. Name the exact on-screen label as the phone shows it in its UI language.
3. Not an education app: no lessons, quizzes, streaks, recaps, "say it back". Calm friend, not teacher or cheerleader. Acknowledge success in a word ("Listo.").
4. Don't hover: wait before hints, then escalate (repeat, where to look, picture). See `HintEscalation`.
5. The user is in charge: one tap or word (repeat, next, I'm lost, pause, stop) controls the helper.
6. Private by default: on-device text recognition, frames discarded, no screen text in logs, nothing leaves the device without saying so.
7. Accuracy over cleverness: instructions come from `library/`, never from the model's memory. No match means "not sure" plus the family option.

## Platform limits (do not work around)
- No overlays, pointing, UI-tree reading, or tap injection in other apps. No private APIs or `App-Prefs:` links; only `UIApplication.openSettingsURLString`.
- Screen capture only via the ReplayKit broadcast extension the user starts from the system picker. The extension is memory-limited (about 50 MB per developer reports; unconfirmed by Apple).
- PiP is opaque, user-positioned; custom drawn buttons probably get no taps. Skip back/forward map to Repeat/Next.
- When a requirement conflicts with a platform limit, stop and say so. Never claim device behavior that hasn't been tested on a device.

## Privacy and safety
- Consent sheet before every capture; Stop always visible; system indicator stays.
- Never ask for passwords, codes, or card numbers (`backend/src/safety.js` enforces on replies). Warn if someone else seems to direct the session.
- Pause detection on sensitive screens (`SharedChannel.looksSensitive`). Account recovery, banking, security go to official channels.
- API keys live only on the backend (`.env`, git-ignored). Never in the app or the repo.
- Usage log: counts only, opt-in, exported by the user. Never invent results or interview quotes.

## Layout
- `library/` task flows (source of truth) + `SCHEMA.md`; `fixtures/screens/` detector fixtures.
- `convex/` primary backend for the iOS app (schema, sessions, `ai:chooseTask`, `speech:*`, 7-day cron). See docs/BACKEND.md. Tests: `npm run test:convex`.
- `backend/` Node 20+, no dependencies (serves the web app; dev fallback): `/library`, `/agent` (Claude + guardrails), `/tts` (Cartesia). `src/detector.js` is the reference detector.
- `ios/` XcodeGen project: `Buddy/` app, `BroadcastExtension/`, `Shared/` (Vision OCR), `Packages/BuddyCore/` (pure Swift logic + tests).
- `docs/` spike plan, demo script, Devpost, tracks, production path, checklists.

## Commands
- Backend tests: `cd backend && npm test` · validate library: `npm run validate` · run: `npm start`
- Pre-render demo audio: `cd backend && npm run cache-audio` (needs Cartesia key and voices)
- Impact report: `cd backend && npm run impact -- path/to/usage-log.jsonl`
- iOS: `cd ios && xcodegen generate && open Buddy.xcodeproj`; logic tests: `cd ios/Packages/BuddyCore && swift test`
- When changing detector thresholds or phrases, change both Swift and JS; `test/drift.test.js` checks.

## Working agreement
Small commits, no pushes or PRs unless asked. Tests alongside code. Prefer simple, boring solutions.
