# Backend

The iOS app talks to one `BackendClient` (BuddyCore/Backend.swift):

| Implementation | When | Where it lives |
|---|---|---|
| `ConvexBackend` | Primary, when `CONVEX_URL` is set and reachable | `ios/Buddy/Services/ConvexBackend.swift` (ConvexMobile, main app target only) |
| `LocalBackend` | No URL, no network, Convex errors or takes over 4 s | BuddyCore: bundled `library/` + bundled audio (`Resources/DemoAudio`) |
| `FallbackBackend` | Always: tries Convex, silently uses Local, retries Convex after 60 s | BuddyCore |

The app works end to end on `LocalBackend`. The "Offline" badge on the home screen shows when
it is in use.

The **web app** (`web/`) still uses the Node server in `backend/`, which also remains the
development fallback. It is not wired to Convex.

## Convex: tables (`convex/schema.ts`)

| Table | What it holds | What it never holds |
|---|---|---|
| `tasks` | The curated library: per-language instructions, exact on-screen labels, arrival signatures, wrong-turn recovery | |
| `sessions` | Anonymous UUID, phone locale, user language, task, step, status, counters (hints, lost, wrong turns), timestamps | Names, phone numbers, screen text, transcripts, audio |
| `events` | Type (start, advance, hint, lost, wrong_turn, family_call, end), step id, timestamp | What was said or seen |
| `stepAudio` | Hash key → file-storage id for Cartesia audio of **library lines only** | User or model text |
| `rateLimits` | Per-session, per-function counters for the current minute | |

Retention: an hourly cron (`convex/crons.ts`) deletes sessions, events and rate-limit rows older
than 7 days. Nothing logs user text (`ai.ts` sends it to Anthropic for one call and drops it).

## Convex: functions

| Function | Type | What it does |
|---|---|---|
| `tasks:list`, `tasks:get` | query | Catalog and full task |
| `tasks:seed` | internal mutation | Validates (`convex/lib/taskValidation.js`) and upserts a task. Run via `npm run convex:seed` |
| `sessions:start / advance / hint / lost / wrongTurn / familyCall / end` | mutation | Counters and events; rate limited (120/min/session) |
| `sessions:live` | query | Live counters; the app subscribes to it |
| `sessions:cleanup` | internal mutation | 7-day deletion, run by the cron |
| `ai:chooseTask` | action | Claude may only **select** a `taskId` (enum of library ids or "none") and phrase one short reply. The id is checked server-side; invalid → "I'm not sure" + offer to call family. Scam / out-of-scope phrases are caught before the model. No key → keyword matching. 20/min/session, text ≤ 500 chars |
| `speech:stepAudio` | action | Builds the line from the library, returns a file-storage URL, generating with Cartesia Sonic only on a cache miss. 60/min/session |
| `speech:speak` | action | Any other short line (≤ 400 chars). Returns MP3 as base64; never stored |

Why audio goes through file storage: function arguments and return values are capped at
16 MiB and default-runtime actions have 64 MB of memory. A cached step returns only a URL; the
app downloads the MP3 directly.

## Setup

```bash
npm install                       # repo root: installs convex
npx convex dev                    # interactive: log in (or anonymous local), create a project.
                                  # Writes CONVEX_DEPLOYMENT and CONVEX_URL to .env.local,
                                  # generates convex/_generated, and keeps syncing. Leave it running.
npx convex env set ANTHROPIC_API_KEY 'sk-ant-...'
npx convex env set CARTESIA_API_KEY 'sk_car_...'
npx convex env set CARTESIA_VOICE_ID_EN '<voice id>'
npx convex env set CARTESIA_VOICE_ID_ES '<voice id>'
npm run convex:seed               # validates and seeds whatsapp-photos (add -- --all for every task)
npm run test:convex               # validator and guard tests (no deployment needed)
```

iOS: put `CONVEX_URL` (from `.env.local`) in `ios/Buddy/Config/Secrets.xcconfig`, then
`cd ios && xcodegen generate`.

## Not production-ready (on purpose, for the hackathon)

- **No login.** Sessions are keyed by a random UUID made on the phone. Anyone holding that UUID can
  read its counters, which contain nothing personal. Production needs real auth
  (`ConvexClientWithAuth` with an OpenID Connect provider) and per-user authorization.
- Rate limits are a simple fixed window per session id; a client can rotate ids. Production needs
  per-user or per-device limits behind auth.
- `stepAudio` cache keys include model, voice, language and text, so changing a voice or a line
  re-renders it; old files are not garbage-collected yet.
