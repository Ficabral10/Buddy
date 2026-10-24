import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, createRateLimiter } from '../src/server.js';
import { ttsRequestBody, voiceFor, createTts } from '../src/tts.js';
import { summarize, renderMarkdown } from '../scripts/summarize-usage.js';

async function withServer(opts, fn) {
  const server = createServer({ log: () => {}, ...opts });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try { await fn(url); } finally { server.close(); }
}

test('health, library, agent, tts endpoints', async () => {
  const tts = async (text, lang) => ({ audio: Buffer.from(`${lang}:${text}`), cached: false });
  await withServer({ env: {}, tts }, async (url) => {
    assert.equal((await fetch(`${url}/health`)).status, 200);
    const lib = await (await fetch(`${url}/library`)).json();
    assert.ok(lib.tasks['whatsapp-photos']);
    const agent = await (await fetch(`${url}/agent`, {
      method: 'POST', body: JSON.stringify({ userLanguage: 'es', phoneLanguage: 'es', text: 'WhatsApp no ve mis fotos' }),
    })).json();
    assert.equal(agent.action, 'start_task');
    const audio = await fetch(`${url}/tts`, { method: 'POST', body: JSON.stringify({ text: 'Listo.', language: 'es' }) });
    assert.equal(audio.headers.get('content-type'), 'audio/mpeg');
    assert.equal(await audio.text(), 'es:Listo.');
  });
});

test('client token is enforced when set', async () => {
  await withServer({ env: { BUDDY_CLIENT_TOKEN: 'abc' } }, async (url) => {
    assert.equal((await fetch(`${url}/library`)).status, 401);
    assert.equal((await fetch(`${url}/library`, { headers: { 'x-buddy-client': 'abc' } })).status, 200);
  });
});

test('rate limiter refills over time', () => {
  let t = 0;
  const allow = createRateLimiter({ perMinute: 2, now: () => t });
  assert.ok(allow('a')); assert.ok(allow('a')); assert.ok(!allow('a'));
  t = 30000;
  assert.ok(allow('a'));
});

test('Cartesia request matches the documented shape', async () => {
  const body = ttsRequestBody({ text: 'Toca Fotos.', language: 'es-US', voiceId: 'v1' });
  assert.equal(body.model_id, 'sonic-3.6');
  assert.equal(body.language, 'es');
  assert.deepEqual(body.voice, { id: 'v1' });
  assert.deepEqual(body.output_format, { container: 'mp3', sample_rate: 44100, bit_rate: 128000 });
  assert.equal(voiceFor('es', { CARTESIA_VOICE_ID_ES: 'x' }), 'x');

  let sent;
  const fetchImpl = async (url, init) => { sent = { url, init }; return new Response(new Uint8Array([1, 2, 3])); };
  const synth = createTts({ apiKey: 'sk', env: { CARTESIA_VOICE_ID_ES: 'v' }, fetchImpl });
  const { audio } = await synth('Hola', 'es');
  assert.equal(sent.url, 'https://api.cartesia.ai/tts/bytes');
  assert.equal(sent.init.headers['Cartesia-Version'], '2026-08-14');
  assert.equal(sent.init.headers.Authorization, 'Bearer sk');
  assert.equal(audio.length, 3);
});

test('usage summary counts sessions and never invents data', () => {
  assert.match(renderMarkdown(summarize([])), /No completed sessions/);
  const ev = [
    { session: 's1', type: 'session_start', t: 0, mode: 'helper' },
    { session: 's1', type: 'lost', t: 5000 },
    { session: 's1', type: 'session_end', t: 60000, completed: true },
    { session: 's2', type: 'session_start', t: 0, mode: 'helper' },
    { session: 's2', type: 'family_call', t: 1000 },
    { session: 's2', type: 'session_end', t: 90000, completed: true },
    { session: 's3', type: 'session_start', t: 0, mode: 'baseline' },
  ];
  const s = summarize(ev);
  assert.equal(s.helper.n, 2);
  assert.equal(s.helper.unaided, 1);
  assert.equal(s.baseline, undefined); // unfinished sessions are ignored
  assert.match(renderMarkdown(s), /\| helper \| 2 \| 2\/2 \| 1\/2 \| 75 \|/);
});
