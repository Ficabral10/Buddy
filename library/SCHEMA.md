# Task library schema (v1)

The library is the source of truth for every instruction. Claude picks a task and rewords
steps, but it never invents a step or a label. `backend/src/validate.js` enforces this file;
run `npm run validate` in `backend/`.

## index.json

| Field | Type | Notes |
|---|---|---|
| schemaVersion | number | Must be 1 |
| libraryVersion | string | Bump on every change (date-based: `YYYY.MM.DD-n`) |
| languages | string[] | Every language each task must cover (`en`, `es`, ...) |
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
| label | per-language string | The exact text on the control, as the phone shows it in that UI language |
| instruction | per-language string | Must contain `{label}` |
| whereToLook | per-language string | Second hint level |
| referenceImage | string | Asset name for the target picture (third hint level) |
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
