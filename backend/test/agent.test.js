import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLibrary } from '../src/library.js';
import { runAgent, fallbackReply } from '../src/agent.js';

const library = loadLibrary();
const base = { userLanguage: 'es', phoneLanguage: 'es', event: 'request' };

// Fake Claude: replays scripted responses and records what it was sent.
function scripted(...responses) {
  const calls = [];
  const fn = async (args) => {
    calls.push(structuredClone(args));
    return responses.shift();
  };
  fn.calls = calls;
  return fn;
}
const toolUse = (name, input, id = `t_${name}`) => ({ content: [{ type: 'tool_use', id, name, input }] });

test('Claude looks up the library, then starts the task', async () => {
  const claude = scripted(
    toolUse('lookup_task', { query: 'whatsapp fotos' }),
    toolUse('respond', { action: 'start_task', task_id: 'whatsapp-photos', say: 'Quieres que WhatsApp pueda ver tus fotos. ¿Es así?' }),
  );
  const r = await runAgent({ ...base, text: 'WhatsApp no ve mis fotos' }, { library, apiKey: 'k', claude });
  assert.equal(r.action, 'start_task');
  assert.equal(r.taskId, 'whatsapp-photos');
  assert.equal(r.source, 'claude');
  // The tool result sent back to Claude contains the library catalog.
  const toolResult = claude.calls[1].messages.at(-1).content[0];
  assert.equal(toolResult.type, 'tool_result');
  assert.match(toolResult.content, /whatsapp-photos/);
});

test('an invented task id is rejected and the library fallback answers', async () => {
  const claude = scripted(toolUse('respond', { action: 'start_task', task_id: 'reset-iphone', say: 'Vamos a reiniciar tu iPhone.' }));
  const r = await runAgent({ ...base, text: 'WhatsApp no ve mis fotos' }, { library, apiKey: 'k', claude });
  assert.equal(r.source, 'library');
  assert.equal(r.guardrail, 'unknown-task');
  assert.equal(r.taskId, 'whatsapp-photos');
});

test('a re-explanation without the exact on-screen label is replaced by the library text', async () => {
  const claude = scripted(toolUse('respond', { action: 'reexplain', task_id: 'whatsapp-photos', say: 'Toca la opción de privacidad.' }));
  const req = { ...base, event: 'lost', text: 'estoy perdida', taskId: 'whatsapp-photos', stepId: 'privacy' };
  const r = await runAgent(req, { library, apiKey: 'k', claude });
  assert.equal(r.guardrail, 'missing-exact-label');
  assert.match(r.say, /Privacidad y seguridad/);
});

test('a re-explanation that names the exact label passes', async () => {
  const say = 'Baja con el dedo. Busca la fila "Privacidad y seguridad", con una mano blanca en azul.';
  const claude = scripted(toolUse('respond', { action: 'reexplain', task_id: 'whatsapp-photos', say }));
  const req = { ...base, event: 'lost', taskId: 'whatsapp-photos', stepId: 'privacy' };
  const r = await runAgent(req, { library, apiKey: 'k', claude });
  assert.equal(r.source, 'claude');
  assert.equal(r.say, say);
});

test('a reply that mentions passwords or codes is overridden', async () => {
  const claude = scripted(toolUse('respond', { action: 'answer', say: 'Dime tu contraseña y el código de verificación.' }));
  const r = await runAgent({ ...base, event: 'question', text: 'y ahora?' }, { library, apiKey: 'k', claude });
  assert.equal(r.guardrail, 'secrets');
  assert.match(r.say, /Nunca te voy a pedir/);
});

test('scam signals are caught before Claude is called', async () => {
  const claude = scripted();
  const r = await runAgent({ ...base, text: 'Me llamaron del banco y dicen que abra ajustes' }, { library, apiKey: 'k', claude });
  assert.equal(r.action, 'safety');
  assert.equal(r.guardrail, 'someoneElse');
  assert.equal(claude.calls.length, 0);
});

test('banking requests go to official channels', async () => {
  const r = await runAgent({ ...base, userLanguage: 'en', text: 'help me transfer money to my son' }, { library, apiKey: 'k', claude: scripted() });
  assert.equal(r.guardrail, 'outOfScope');
});

test('no API key: library-only replies still work for the demo task', async () => {
  const r = await runAgent({ ...base, text: 'no puedo mandar fotos por WhatsApp' }, { library, apiKey: '' });
  assert.equal(r.action, 'start_task');
  assert.equal(r.note, 'no-api-key');
});

test('Claude errors fall back to the library', async () => {
  const claude = async () => { throw new Error('network down'); };
  const req = { ...base, event: 'lost', taskId: 'whatsapp-photos', stepId: 'photos' };
  const r = await runAgent(req, { library, apiKey: 'k', claude });
  assert.equal(r.note, 'claude-error');
  assert.equal(r.say, 'Ahora toca Fotos. Está unas filas más abajo, junto a una flor de colores.');
});

test('unknown requests are not guessed', () => {
  const r = fallbackReply(library, { ...base, userLanguage: 'en', text: 'my car bluetooth keeps dropping calls on the highway' });
  assert.equal(r.action, 'not_supported');
});

test('library-only routing picks the right task among several', () => {
  const pick = (text, lang = 'es') => fallbackReply(library, { ...base, userLanguage: lang, text }).taskId;
  assert.equal(pick('WhatsApp no ve mis fotos'), 'whatsapp-photos');
  assert.equal(pick('WhatsApp no puede usar la cámara'), 'whatsapp-camera');
  assert.equal(pick('las letras están muy chiquitas, no puedo leer'), 'text-size');
  assert.equal(pick('the letters are too small', 'en'), 'text-size');
});
