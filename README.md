# Lola: a calm voice that helps you use your own iPhone

Lola is an iPhone app with a friendly mascot that talks you through phone tasks in your own
language. **You do every tap.** Lola watches your screen (only when you choose to share it),
notices when you reach the next step, and tells you what to do next, out loud and in a small
floating card.

Built at Cal Hacks 13.0 for **Spanish-speaking older adults who rely on relatives for iPhone help**.

> The demo task: a grandmother wants to send photos to her grandchildren on WhatsApp, but
> WhatsApp can't see her photos. Lola talks her through turning on photo access in Spanish.
> She does every tap. Then she sends the message herself.

## Two versions

| | Web app (`web/`) | Native iOS app (`ios/`) |
|---|---|---|
| Needs Xcode | No | Yes (macOS 26.6+ for the current Xcode) |
| Runs on | Safari on the iPhone, added to the Home Screen | Installed from Xcode |
| Voice, Claude, Cartesia, guided steps, hints, scam pause, WhatsApp finish | Yes | Yes |
| Screenshot reading on the phone | Yes (Tesseract.js, on device) | Yes (Apple Vision) |
| Notices the next screen live | No: asks "¿Ya lo hiciste?" when she comes back, or reads a screenshot | Yes (ReplayKit broadcast) |
| Floating card over Settings | Experimental (Picture in Picture from a canvas) | Yes (PiP), to verify |

Both use the same backend, task library, and step detector.

## Run it on your iPhone (web version, no Xcode)

1. Install Node 20+ (nodejs.org, or `brew install node`).
2. In Terminal:
   ```bash
   cd ~/Downloads/buddy
   cp .env.example .env && open -e .env    # paste ANTHROPIC_API_KEY, CARTESIA_API_KEY, voice IDs
   cd backend && npm start                 # leave this running
   ```
   Open http://localhost:8787 on the Mac to check it works.
3. The iPhone needs HTTPS for the microphone. In a second Terminal tab:
   ```bash
   npx cloudflared tunnel --url http://localhost:8787
   ```
   (or `brew install cloudflared` then `cloudflared tunnel --url http://localhost:8787`). It prints a `https://….trycloudflare.com` address.
4. Open that address in Safari on the iPhone, then Share → Add to Home Screen. The address changes each time you restart the tunnel.
5. Speech recognition in Safari uses Apple's dictation: if the mic button does nothing, check Settings → General → Keyboard → Enable Dictation. Typing always works.

Before the demo, run the whole flow once: Cartesia audio is cached on the Mac, so the second run speaks instantly.

## What it does

1. **Ask.** Say or type the problem in Spanish or English: "WhatsApp no ve mis fotos." Claude matches it to a task in our curated library (WhatsApp photos, WhatsApp camera, bigger text) and restates it.
2. **Guided steps.** One instruction at a time, naming the exact label her phone shows ("Toca Privacidad y seguridad"), spoken by a Cartesia voice and shown in large type.
3. **"Toca aquí."** iPhones don't let any app point at buttons in Settings. When she sends a screenshot, Lola reads it on the phone, works out which screen she's on, and draws a red ring around the exact row to tap. Wrong screen? It circles the back button and says so.
4. **"Let Lola look."** If the screen isn't one Lola knows, she can choose to send that one screenshot to Claude, which may only point at labels from our library.
5. **Help without hovering.** Lola waits, then repeats, then says where to look. "Estoy perdida" gets a fresh explanation from Claude. When she returns from Settings, Lola asks "¿Ya lo hiciste?"
6. **"¿Es una estafa?"** She screenshots a strange text. Lola reads it on the phone, checks it for red flags, and Claude explains in plain Spanish whether it looks like a scam and what to do. One tap asks Ana.
7. **Family, without dependence.** "Pedirle ayuda a Ana" opens WhatsApp with a message saying exactly where she's stuck; at the end, Lola opens a chat to send her grandkids the photos. She always taps Send.

## How we built it

| Part | What it does |
|---|---|
| iOS app (SwiftUI, iOS 17+) | Onboarding, tap-to-talk, session, Picture-in-Picture card, family contact |
| ReplayKit broadcast extension | Samples a frame about once per second, runs Apple Vision text recognition on the device, passes only text lines to the app through an App Group |
| Step detector (`BuddyCore`) | Matches recognized text against each step's "arrival signature" (screen title plus expected rows), recognizes wrong turns and going back, asks when unsure |
| Task library (`library/`) | Curated, versioned steps with exact labels per phone language, hints, wrong-turn screens; validated by a schema checker |
| Backend (Node, no dependencies) | Holds API keys, serves the library, runs the Claude agent with guardrails, proxies Cartesia |
| Claude (Haiku 5.5 by default) | Picks the task via tool calls (`lookup_task`, `get_step`, `respond`), rewords steps, handles "I'm lost"; with consent reads an unknown screenshot (`screen_help`); explains scam verdicts (`verdict`) |
| Screenshot reader (web) | Tesseract.js on the phone finds text lines and positions; the detector places the screen and the app draws the ring |
| Scam check | Rule-based red flags (links, urgency, payment, codes, impersonation, "new number") set a minimum risk; Claude explains; unsafe advice is stripped |
| Cartesia Sonic 3.6 | The mascot's voice in Spanish and English, slightly slower for older listeners; demo lines pre-rendered so it works on bad Wi-Fi |

### How we use Claude

Claude does the parts where judgment matters: understanding a messy spoken request ("no me salen las fotos en el WhatsApp"), choosing the right flow from the library, and re-explaining a step in different words when someone is lost. It does **not** invent iPhone steps. It can only see tasks returned by `lookup_task`, and every reply passes through code checks before anyone hears it.

### Where this could go wrong, and what we did about it

| Risk for the people using it | What we did |
|---|---|
| **Wrong or outdated steps.** A wrong instruction to an older user is worse than none. | Steps come from the curated library, never the model's memory. A task ID Claude invents is rejected. A re-explanation that doesn't contain the step's exact on-screen label is replaced with the library text. Labels are flagged `labelsVerified: false` until checked on a real phone; unknown phone languages are flagged in the UI. No match means "I'm not sure" plus the family-call option. |
| **Scams.** Older adults are targeted by people who call and "guide" them through their phone. | Lola never asks for passwords, codes, or card numbers; any reply that mentions them is replaced. If the user says someone called and told them what to do, Lola pauses and suggests calling family first. Banking, account recovery, and security requests go to official channels. These checks are plain code that runs before and after Claude. |
| **Privacy.** A screen can show messages, photos, and bank apps. | Screenshots are read on the phone and never stored. Screens that look like password, code, or card fields are never read or sent. A screenshot goes to Claude only when she taps "Sí, mírala" for that one image; for the scam check, only the message text she confirms is sent. The usage log is opt-in, counts only, and stays on the phone. |
| **Speech fails** (accents, noise, tremor). | Typed input everywhere; a tappable task list; big buttons for Repeat, Next, I'm lost, Pause, Stop. |
| **Being talked into a scam.** | Rule-based red flags set a minimum risk the model can't lower; advice like "tap the link" or "pay" is stripped; high risk always ends with the same safe advice and a one-tap "ask Ana". |
| **Overload.** Clippy-style interruptions. | One instruction at a time, hints only after a pause the user can lengthen, a one-word acknowledgement and nothing more. |
| **Network down.** | Library-only replies and pre-rendered audio keep the demo flow working; Apple's on-device voice is the last fallback. |

### Cartesia features used

- `POST /tts/bytes` with model `sonic-3.6`, `language` set per user (`es`, `en`), MP3 output.
- `generation_config.speed = 0.9` for older listeners.
- One voice per language, chosen in the Cartesia playground (`CARTESIA_VOICE_ID_ES`, `CARTESIA_VOICE_ID_EN`).
- Server-side calls only, so the key never ships in the app; responses cached on disk; demo lines pre-rendered into the app.

Listening uses Apple's on-device speech recognition, not Cartesia: the Ink docs we checked listed English only, and our users speak Spanish.

## Known limitations

- **Not yet verified on a device**: the Picture-in-Picture card during a broadcast, extension memory, the big button that opens Apple's picker, and the Spanish labels. `docs/SPIKE_PLAN.md` lists every check.
- One task so far (WhatsApp photo access), in Spanish and English.
- iOS doesn't let any app draw over Settings or tap for you; Lola points with words and a picture instead.
- Voice commands work through tap-to-talk and the PiP skip buttons; Lola does not listen all the time.
- Step detection depends on screen titles; thresholds are first guesses until tested with real frames.

## Setup (native iOS version)

**Backend** (Node 20+):
```bash
cp .env.example .env          # add ANTHROPIC_API_KEY, CARTESIA_API_KEY, voice IDs
cd backend
npm test                      # 44 tests: library, agent + vision + scam guardrails, detector fixtures, server
npm start                     # http://localhost:8787
npm run cache-audio           # optional: pre-render the demo's voice lines into the app
```

**iOS** (Mac with Xcode 16+, a real iPhone for screen sharing and PiP):
```bash
brew install xcodegen
cd ios
cp Buddy/Config/Secrets.example.xcconfig Buddy/Config/Secrets.xcconfig   # team ID + backend URL
xcodegen generate && open Buddy.xcodeproj
(cd Packages/BuddyCore && swift test)
```
Then run the **Buddy** scheme on the iPhone. The App Group `group.com.buddyhelper.shared` must be enabled for both targets in your Apple developer account (Xcode's automatic signing usually does this).

No API keys or secrets are in this repo. `.env` and `Secrets.xcconfig` are git-ignored.

## Repo map

```
library/            task flows (source of truth) and schema
fixtures/screens/   recognized-text fixtures shared by the JS and Swift detector tests
backend/            Node server (also serves web/), Claude agent, Cartesia TTS, scripts, tests
web/                no-Xcode web app: same flow in Safari
ios/                XcodeGen project: app, broadcast extension, BuddyCore package
docs/               spike plan, demo script, Devpost draft, tracks, production path, checklists
```

## How this brings people closer

The point is independence, and it's connected to family: a grandmother who can't get photos into
WhatsApp is cut off from her grandchildren's lives, and calling a relative for every setting
wears on both sides. Lola ends the task by opening a chat with someone she picked; she presses
Send. "Call my family member" is always one tap away when she does want a person. We don't claim
the app replaces those people.

## Responsible design summary

The user does every tap; the app never sends a message or changes a setting. Instructions come
from a curated library. Screen text is processed on the phone and discarded. Never asks for
secrets; scam signals pause the session. Accessibility: Dynamic Type up to accessibility sizes,
VoiceOver labels, 44pt+ targets, no meaning carried by color alone.
