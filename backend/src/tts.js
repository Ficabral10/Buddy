// Cartesia Sonic text-to-speech, called from the backend so the API key never ships in the app.
// API shape checked against docs.cartesia.ai (api-reference/tts/bytes) on 2026-10-24.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { baseLang } from './text.js';

export const CARTESIA_VERSION = '2026-08-14';
export const DEFAULT_TTS_MODEL = 'sonic-3.6';

export function voiceFor(language, env = process.env) {
  const lang = baseLang(language);
  return env[`CARTESIA_VOICE_ID_${lang.toUpperCase()}`] || env.CARTESIA_VOICE_ID_DEFAULT || null;
}

export function ttsRequestBody({ text, language, voiceId, model = DEFAULT_TTS_MODEL, speed = 0.9 }) {
  return {
    model_id: model,
    transcript: text,
    voice: { id: voiceId },
    language: baseLang(language),
    output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
    // Slightly slower than default for older listeners. generation_config needs sonic-3 or newer.
    generation_config: { speed },
  };
}

export function cacheKey(text, language, voiceId, model) {
  return createHash('sha256').update(JSON.stringify([text, baseLang(language), voiceId, model])).digest('hex').slice(0, 32);
}

export function createTts({ apiKey, cacheDir, env = process.env, fetchImpl = fetch, model = env.CARTESIA_MODEL || DEFAULT_TTS_MODEL }) {
  if (cacheDir) mkdirSync(cacheDir, { recursive: true });
  return async function synthesize(text, language) {
    const voiceId = voiceFor(language, env);
    if (!apiKey) throw Object.assign(new Error('CARTESIA_API_KEY not set'), { status: 503 });
    if (!voiceId) throw Object.assign(new Error(`No Cartesia voice set for "${baseLang(language)}"`), { status: 503 });
    const key = cacheKey(text, language, voiceId, model);
    const file = cacheDir ? path.join(cacheDir, `${key}.mp3`) : null;
    if (file && existsSync(file)) return { audio: readFileSync(file), cached: true };

    const res = await fetchImpl('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Cartesia-Version': CARTESIA_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ttsRequestBody({ text, language, voiceId, model })),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw Object.assign(new Error(`Cartesia ${res.status}: ${(await res.text()).slice(0, 300)}`), { status: 502 });
    }
    const audio = Buffer.from(await res.arrayBuffer());
    if (file) writeFileSync(file, audio);
    return { audio, cached: false };
  };
}
