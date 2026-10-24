# Manual smoke test: Convex backend + fallback

Run after `npx convex dev` is up, env vars are set, and the task is seeded.

## Convex (from the repo root)
- [ ] `npx convex run tasks:list` lists `whatsapp-photos`.
- [ ] `npx convex run tasks:get '{"taskId":"whatsapp-photos"}'` returns 5 steps with `es` and `en`.
- [ ] Seed rejects a broken task: edit a copy so an instruction lacks `{label}`; `npm run convex:seed` prints ✗ and seeds nothing.
- [ ] `npx convex run ai:chooseTask '{"sessionId":"3f2504e0-4f89-41d3-9a0c-0305e82c3301","userLanguage":"es","text":"WhatsApp no ve mis fotos"}'` → `taskId: "whatsapp-photos"`, Spanish reply.
- [ ] Same with `"text":"quiero borrar mi iPhone"` → `taskId: null`, "no estoy seguro", `offerFamily: true`.
- [ ] Same with `"text":"me llamaron del banco"` → `source: "guardrail"` warning.
- [ ] `npx convex run speech:stepAudio '{"sessionId":"3f2504e0-4f89-41d3-9a0c-0305e82c3301","taskId":"whatsapp-photos","stepId":"photos","kind":"instruction","userLanguage":"es","phoneLanguage":"es"}'` → a URL; open it, hear "Toca Fotos." Run again → `cached: true`.
- [ ] Dashboard → Data: `sessions` and `events` contain no text fields beyond ids, locale and step ids.
- [ ] Dashboard → Logs: no user sentences appear.

## iOS app on Convex
- [ ] Launch with `CONVEX_URL` set: no "Offline" badge.
- [ ] Say "WhatsApp no ve mis fotos" → confirmation in Spanish → Sí.
- [ ] Steps play with the Cartesia voice; Dashboard → Data → `sessions` shows the step moving live.
- [ ] "Estoy perdido" increments `lost`; a wrong-turn screenshot increments `wrongTurns`.
- [ ] Finish → session `status: done`.

## iOS app fallback
- [ ] Turn on Airplane Mode, relaunch: "Offline" badge shows; the same task works end to end, with bundled audio or the on-device voice.
- [ ] Turn Airplane Mode off: within about a minute, calls go to Convex again and the badge disappears.
- [ ] Remove `CONVEX_URL` from Secrets.xcconfig and rebuild: the app runs fully local.
