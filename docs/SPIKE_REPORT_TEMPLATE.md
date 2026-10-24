# Spike report

Fill this in on the demo iPhone, then paste it back to Claude Code with: "Here are the spike
results; revise the plan based on what failed."

- Date / time:
- iPhone model:
- iOS version:
- Phone language(s) tested:
- Build (git commit):

## Script

1. Install the app on the iPhone. Allow microphone and speech when asked.
2. Settings (gear) → Developer lab.
3. Run experiments a to g from `docs/SPIKE_PLAN.md`, in order.
4. Tap **Copy results** and paste below. Then fill in the table by hand.

## Results

| # | Question | Result (yes / no / number) | Notes |
|---|---|---|---|
| a1 | System sheet opened from our big button? | | |
| a2 | Our extension preselected? | | |
| a3 | Taps needed to start sharing | | |
| b1 | Frames received per 10 s | | |
| b2 | OCR time (max ms) | | |
| b3 | Extension memory (max MB) | | |
| b4 | "Fotos" title detected (Spanish phone)? y / h values | | |
| b5 | "Photos" title detected (English phone)? y / h values | | |
| c1 | Capture-to-app delay (ms) | | |
| d1 | PiP window appeared? | | |
| d2 | Card changed from step 2 to 3 on its own? | | |
| e1 | PiP stayed visible in Settings during broadcast? | | |
| e2 | Voice kept playing in Settings? | | |
| e3 | Card text appeared in captured frames? | | |
| f1 | Skip buttons visible (live range / finite range)? | | |
| f2 | Skip back reached the app as Repeat? | | |
| f3 | Skip forward reached the app as Next? | | |
| f4 | Taps inside the card did anything? | | |
| g1 | Locking ended the broadcast? | | |
| g2 | Banners visible in frames? | | |
| g3 | Incoming call effect | | |
| x1 | Screenshot fallback (B) recognized the Fotos screen? | | |
| x2 | Spanish labels on the phone match the library? List any that differ | | |

## Pasted "Copy results" output

```
(paste here)
```

## Decision

- Demo rung: A / B / C
- Changes needed:
