# "Hey Siri, open ___" name test

Rules: two syllables, open vowels, no accents, not an Apple app or feature. The name is set once
in `ios/project.yml` (`APP_DISPLAY_NAME`); `CFBundleSpokenName` follows it. Before relying on
`INAlternativeAppNames`, check the key in Apple's documentation.

For each candidate: install with that name, set Siri's language, say "Hey Siri, open ___" (or
"Oye Siri, abre ___", "嘿Siri，打开___") ten times, and count correct launches. Also check the App
Store for an existing app with the name.

| Name | Siri English (/10) | Siri Spanish (/10) | Siri Mandarin (/10) | App Store conflict? | Notes |
|---|---|---|---|---|---|
| Lola | | | | | |
| Nico | | | | | |
| Mimi | | | | | |
| Amigo | | | | | |
| Pip | | | | | Possible confusion with "PiP" (Picture in Picture) |
