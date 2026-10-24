// Pre-renders every library instruction and hint with Cartesia so the demo works on slow Wi-Fi.
// Writes mp3 files plus a manifest into ios/Buddy/Resources/DemoAudio/. Needs CARTESIA_API_KEY
// and CARTESIA_VOICE_ID_EN / _ES in ../.env. Usage: npm run cache-audio
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLibrary, instructionFor, labelFor } from '../src/library.js';
import { createTts, cacheKey, voiceFor, DEFAULT_TTS_MODEL } from '../src/tts.js';
import { fill } from '../src/text.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../../ios/Buddy/Resources/DemoAudio');
mkdirSync(outDir, { recursive: true });

// Fixed phrases the app speaks (keep in sync with ios/Buddy/Session/Phrases.swift).
const PHRASES = {
  en: ['Done.', 'Are you on this screen?', 'Do you see a check mark next to it?', "That's it. It's done.",
    'Would you like to send a message to your family?', 'Tap the big button. On the next screen, tap the button to start.',
    'Look for the row in the picture.', 'Paused.', "Okay, I'll stop here."],
  es: ['Listo.', '¿Estás en esta pantalla?', '¿Ves una marca al lado?', 'Eso es todo. Ya está.',
    '¿Quieres mandarle un mensaje a tu familia?', 'Toca el botón grande. En la siguiente pantalla, toca el botón para iniciar.',
    'Busca la fila que ves en la imagen.', 'En pausa.', 'Está bien, aquí me detengo.'],
};

const library = loadLibrary();
const synth = createTts({ apiKey: process.env.CARTESIA_API_KEY, cacheDir: path.resolve(here, '../.audio-cache') });
const model = process.env.CARTESIA_MODEL || DEFAULT_TTS_MODEL;
const manifest = {};

async function render(text, lang) {
  const key = cacheKey(text, lang, voiceFor(lang), model);
  const { audio } = await synth(text, lang);
  writeFileSync(path.join(outDir, `${key}.mp3`), audio);
  manifest[`${lang}|${text}`] = `${key}.mp3`;
  console.log(`${lang}: ${text}`);
}

for (const lang of library.languages) {
  for (const task of Object.values(library.tasks)) {
    for (const step of task.steps) {
      // The demo phone language is assumed to match the user's language.
      await render(instructionFor(step, lang, lang), lang);
      await render(step.whereToLook[lang], lang);
      for (const wt of step.wrongTurns) await render(fill(wt.hint[lang], labelFor(step, lang).label), lang);
    }
  }
  for (const p of PHRASES[lang] ?? []) await render(p, lang);
}
writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nWrote ${Object.keys(manifest).length} clips to ${outDir}`);
