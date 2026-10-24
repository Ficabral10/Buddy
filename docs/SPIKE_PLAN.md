# Phase 0: feasibility spike (time box: 90 minutes)

Goal: find out which rung of the fallback ladder the demo can stand on.

| Rung | What the user sees | Status in code | Needs a device to prove |
|---|---|---|---|
| **C** voice-guided steps, manual Next | Card + voice, big Next / Repeat / I'm lost | Built | Speech recognition, audio |
| **B** screenshot | "Send a screenshot" → Vision reads it on the phone → says where to look or advances | Built | Screenshot OCR on real Settings |
| **A** live screen sharing + PiP | Broadcast extension → OCR → step advances by itself; card floats over Settings | Built, unproven | Everything in experiments a to g |

Order on the day: confirm C works end to end on the phone first, then B, then try A. If A isn't
solid when the time box ends, stop and demo B or C. Don't debug the platform overnight.

## What was verified while writing the code (Oct 24, 2026)

| Item | Result | Source |
|---|---|---|
| Cartesia TTS endpoint | `POST https://api.cartesia.ai/tts/bytes`, `Cartesia-Version: 2026-08-14`, Bearer key; body `model_id`, `transcript`, `voice.id`, `output_format` (mp3 needs `sample_rate` + `bit_rate`), `language` | docs.cartesia.ai/api-reference/tts/bytes |
| Cartesia model and languages | `sonic-3.6` recommended; 44 languages; Spanish `es`, Chinese `zh`; `generation_config.speed` 0.6 to 1.5 on sonic-3+ | docs.cartesia.ai/build-with-cartesia/tts-models/latest |
| Claude model IDs | `claude-haiku-5-5` (fastest), `claude-sonnet-5-5`, `claude-opus-5-5` | platform.claude.com/docs/en/models/overview |
| Claude tool use | `tools` with `input_schema`; `tool_use` blocks; reply with `tool_result` | platform.claude.com/docs/en/api/messages |
| Extension memory "50 MB" | Only developer reports, no Apple statement found | developer.apple.com/forums/thread/651367 |
| PiP with sample buffers | `ContentSource` with `AVSampleBufferDisplayLayer` + playback delegate (`setPlaying`, `skipByInterval`, `timeRangeForPlayback`); infinite range means live content. Nothing found on non-video content or App Review | WWDC21 session 10290 |

## Not verified (assumptions in the code)

- `anthropic-version: 2023-06-01` header value (long-standing; check the versioning page if calls fail).
- Cartesia speech-to-text (Ink) languages: not used; we listen with Apple's recognizer.
- The big button forwarding its tap into `RPSystemBroadcastPickerView` (experiment a).
- Whether PiP shows skip buttons for our content and whether a finite time range needs a `controlTimebase` (experiment f).
- Spanish iOS labels (`Acceso completo`, `Acceso limitado`, `Rastreo`, `Fototeca compartida`) and the iOS 18+ "Full Access" confirmation alert. The library marks them unverified.
- Detector thresholds (title region top 30%, centered within 0.15, large title height ≥ 0.03, minimum height 0.018) are guesses; tune them from real frames.
- SpeechAnalyzer (iOS 26) is not wired in; SFSpeechRecognizer is used on every version.

## Device experiments

Open the app → Settings (gear) → **Developer lab (spike tests)**. Each section shows its own numbers.
Do them in order on the demo iPhone. Write results in `SPIKE_REPORT_TEMPLATE.md`, or tap
**Copy results** and paste.

**a. Broadcast picker.** Tap "Show me your screen". Does Apple's sheet open with our extension already chosen? How many taps to start? If "Internal picker button found" says NO, the fallback is to show the system picker icon itself at a large size.

**b. Frames and OCR.** Start the broadcast. Go to Settings → Privacidad y seguridad → Fotos. Watch: frames received, OCR time, extension memory (keep max well under 50 MB), and whether "Photos/Fotos title seen" fills in, with its y and height. Repeat with the phone in English. Note the y/h values: they tune the detector.

**c. Messaging.** Capture-to-app delay should be well under a second.

**d. PiP card.** Tap "Render step 2", then "Start PiP", then go home. Does the card float? Then open Settings → Privacy → Photos: the card should switch to step 3 by itself.

**e. Coexistence.** With the broadcast running and PiP up, go into Settings. Does PiP stay? Does the app keep talking (background audio)? Does "Card text found in captured frames" say YES? If yes, the card text is in frames; the detector already ignores lines below the title region, but check.

**f. PiP input.** Are skip buttons visible? Tap them; the event log should show "skip back → Repeat" / "skip forward → Next". Toggle "Finite time range" and compare. Try tapping inside the card (expected: nothing).

**g. Interruptions.** Lock the phone during a broadcast: does it end? Do notification banners show up in frames? Incoming call?

## What to do with the results

- a fails → show the system picker view directly (large).
- b memory near the limit → keep `.fast` recognition, lower frame rate to 0.5 fps, crop to the top half.
- d or e fails → demo with the in-app card + voice, and the Live Activity idea stays future work.
- f skip buttons don't appear → voice ("otra vez", "siguiente") via tap-to-talk and the in-app buttons.
- Detector misfires → adjust thresholds in **both** `backend/src/detector.js` and `StepDetector.swift`, add the real frame as a fixture, run `npm test` and `swift test`.
