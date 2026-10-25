# Task library schema (v1)

The library is the source of truth for every instruction. Claude picks a task and rewords
steps, but it never invents a step or a label. `backend/src/validate.js` enforces this file;
run `npm run validate` in `backend/`.

## index.json

| Field | Type | Notes |
|---|---|---|
| schemaVersion | number | Must be 1 |
| libraryVersion | string | Bump on every change (date-based: `YYYY.MM.DD-n`) |
| languages | string[] | Every language each task must cover (`en`, `es`, `ko`, `vi`) |
| tasks | string[] | Task ids; each has `tasks/<id>.json` |

## tasks/<id>.json

| Field | Type | Notes |
|---|---|---|
| id | string | Matches the file name |
| taskVersion | number | Bump when steps change |
| title, description | per-language map / string | Shown to Claude for task selection |
| exampleRequests | per-language string[] | Helps Claude match the request |
| iosVersions | `{min, max}` | Versions the labels were written for |
| labelsVerified | per-language bool + note | `false` until someone walks the flow on a real device in that phone language |
| finishAction | `"none"` or `"tell-family"` | What the app offers after the last step |
| steps | Step[] | In order |

### Step

| Field | Type | Notes |
|---|---|---|
| id | string | Unique within the task |
| iosVersions | `{min?, max?}` (optional) | Only for steps that differ between iOS releases, e.g. Text Size moved from Display & Brightness (`{"max": "26.99"}`) to Appearance (`{"min": "27.0"}`) in iOS 27. The apps keep only the steps that match the phone (`backend/src/versions.js`, `HelperTask.forIOS`). Steps without it apply to every version |
| label | per-language string | The exact text on the control, as the phone shows it in that UI language |
| instruction | per-language string | Must contain `{label}` |
| whereToLook | per-language string | Second hint level |
| referenceImage | string | Asset name for the target picture (third hint level, iOS app) |
| visual | `{type, icon?, direction?}` | What the web app draws with the step when there is no screenshot, labeled with `label` in the phone's language. `type`: `app`, `row`, `option`, `toggle`, `slider`, `button`, `back`, `swipe`. `icon` and `direction`: see `VISUAL_ICONS` / `SWIPE_DIRECTIONS` in `backend/src/validate.js` |
| arrival | Signature | How the detector knows the user reached the screen that completes this step |
| wrongTurns | `{id, title, hint}`[] | Known wrong screens; `hint` should contain `{label}` |
| hintTimingSec | `{repeat, describe, picture}` | Seconds after the step is shown; must increase |
| confirmWithUser | bool | If true, the detector never auto-advances; the app asks the user |

### Signature

Per phone language:

- `title`: strings; one must match a text line in the top 30% of the screen.
- `anyOf` (optional): at least one must appear anywhere on screen.
- `noneOf` (optional): none may appear.

Matching ignores case, accents, and extra spaces. When several steps match, the detector
picks the furthest step, because the back button on a screen shows the previous screen's title.

## screens/ (real screenshots)

A real screenshot is the most accurate picture of a step, so the web app shows one whenever
it exists, cropped around the target with a red ring. It falls back to the `visual` drawing
otherwise. The app picks the screenshot in the phone's language with the nearest iOS version.

Add one from `backend/`:

```
npm run add-screen -- --task text-size --step display --lang es --ios 27 ~/Desktop/IMG_0412.PNG
```

The script reads the text with Apple's Vision framework on the Mac, finds the step's label,
and places the ring based on `visual.type`: the whole row, the switch, or the app icon above
its name. Use `--box x,y,w,h` (0..1, top-left origin) when the label can't be found, or
`--no-ring` for slider and swipe steps. It saves a 750 px JPEG in `screens/<task>/` and lists it
in `screens/index.json` (`{task, step, lang, ios, file, box}`).

Take the screenshot on the screen *before* the tap, with the phone set to that language. Check
that it shows nothing personal first: the Settings main screen shows the owner's name and photo
at the top, so scroll that out of view or crop it.
