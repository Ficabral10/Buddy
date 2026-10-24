import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkScam, redFlags, ruleRisk } from '../src/scam.js';
import { screenHelp } from '../src/vision.js';
import { loadLibrary } from '../src/library.js';

const library = loadLibrary();
const toolUse = (name, input) => ({ content: [{ type: 'tool_use', id: 't1', name, input }] });

test('red flags: a classic package scam is high risk without any model', async () => {
  const msg = 'USPS: Tu paquete está retenido. Paga $1.99 hoy mismo en https://usps-entrega.co/pago o será devuelto.';
  const flags = redFlags(msg);
  for (const f of ['link', 'money', 'delivery', 'urgency']) assert.ok(flags.includes(f), f);
  const r = await checkScam({ text: msg, userLanguage: 'es' }, {});
  assert.equal(r.risk, 'high');
  assert.equal(r.source, 'rules');
  assert.match(r.say, /No toques el enlace/);
});

test('family new-number trick is high risk', () => {
  assert.equal(ruleRisk(redFlags('Hola abuela soy yo, cambié de número, guárdalo')), 'high');
});

test('an ordinary family message is low risk', () => {
  assert.equal(ruleRisk(redFlags('Hola mamá, ¿vienes a cenar el domingo? Te quiero')), 'low');
  assert.deepEqual(redFlags('the groups meeting'), []); // "ups" inside a word is not a flag
});

test('Claude can raise the risk but never lower it below the rules', async () => {
  const claude = async () => toolUse('verdict', { risk: 'low', explanation: 'Parece normal.' });
  const r = await checkScam({ text: 'Tu cuenta del banco está bloqueada. Verifica tu código aquí: bit.ly/x', userLanguage: 'es' }, { apiKey: 'k', claude });
  assert.equal(r.risk, 'high');
  const up = async () => toolUse('verdict', { risk: 'high', explanation: 'Nadie regala viajes así.' });
  const r2 = await checkScam({ text: 'Te invitamos a un viaje gratis', userLanguage: 'es' }, { apiKey: 'k', claude: up });
  assert.equal(r2.risk, 'high');
  assert.equal(r2.source, 'claude');
});

test('advice that steers toward the scammer is dropped', async () => {
  const claude = async () => toolUse('verdict', { risk: 'medium', explanation: 'Haz clic en el enlace para verificar.' });
  const r = await checkScam({ text: 'Mensaje raro con enlace www.x.com', userLanguage: 'es' }, { apiKey: 'k', claude });
  assert.equal(r.explanation, null);
  assert.doesNotMatch(r.say, /Haz clic/);
});

test('vision: Claude may only point at library labels, with the exact label in what it says', async () => {
  const req = { image: 'AAAA', userLanguage: 'es', phoneLanguage: 'es', taskId: 'whatsapp-photos', stepId: 'photos' };
  const ok = async () => toolUse('screen_help', { screen: 'privacy', tap: 'Fotos', say: 'Toca "Fotos", unas filas abajo, en el medio.' });
  const r = await screenHelp(req, { library, apiKey: 'k', claude: ok });
  assert.equal(r.source, 'claude');
  assert.equal(r.target, 'Fotos');

  const invented = async () => toolUse('screen_help', { screen: 'other', tap: 'Restablecer ajustes', say: 'Toca "Restablecer ajustes".' });
  const r2 = await screenHelp(req, { library, apiKey: 'k', claude: invented });
  assert.equal(r2.guardrail, 'label-not-in-library');
  assert.equal(r2.source, 'library');

  const back = async () => toolUse('screen_help', { screen: 'other', tap: 'BACK', say: 'Vuelve atrás.' });
  assert.equal((await screenHelp(req, { library, apiKey: 'k', claude: back })).back, true);

  const noKey = await screenHelp(req, { library });
  assert.equal(noKey.note, 'no-api-key');
});
