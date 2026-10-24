// Unit tests for the Convex-side validators and guards (run: npm run test:convex).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTask, fromLibraryFile } from '../convex/lib/taskValidation.js';
import { checkSessionId, cap, checkChoice, matchByExamples, screen, lineFor, language } from '../convex/lib/guard.js';

const load = (id) => fromLibraryFile(JSON.parse(readFileSync(new URL(`../library/tasks/${id}.json`, import.meta.url), 'utf8')));
const task = load('whatsapp-photos');

test('the seed task passes validation, every library task too', () => {
  assert.deepEqual(validateTask(task), []);
  for (const id of ['whatsapp-camera', 'text-size']) assert.deepEqual(validateTask(load(id)), []);
});

test('validator rejects bad tasks', () => {
  const bad = structuredClone(task);
  bad.taskId = 'Bad Id!';
  bad.steps[1].instruction.es = 'Toca privacidad.'; // no {label}
  delete bad.steps[2].label.es;
  bad.steps[3].hintTimingSec = { repeat: 9, describe: 3, picture: 30 };
  bad.steps[4].confirmWithUser = false; // same title as previous step
  const errs = validateTask(bad).join('\n');
  for (const s of ['taskId', 'steps[1].instruction.es', 'steps[2].label.es', 'steps[3].hintTimingSec', 'same arrival title']) {
    assert.match(errs, new RegExp(s.replace(/[[\].]/g, '\\$&')));
  }
});

test('session ids must be UUIDs; inputs are capped', () => {
  assert.equal(checkSessionId('3F2504E0-4F89-41D3-9A0C-0305E82C3301'), '3f2504e0-4f89-41d3-9a0c-0305e82c3301');
  assert.throws(() => checkSessionId('abc'));
  assert.throws(() => checkSessionId("'; drop table"));
  assert.throws(() => cap('x'.repeat(501), 500, 'text'));
  assert.equal(language('es-US'), 'es');
  assert.equal(language('fr'), 'en');
});

test('Claude may only select a library taskId', () => {
  const ids = ['whatsapp-photos'];
  assert.deepEqual(checkChoice({ taskId: 'whatsapp-photos', reply: 'Quieres que WhatsApp vea tus fotos. ¿Es así?' }, ids, 'es').reason, null);
  const invented = checkChoice({ taskId: 'factory-reset', reply: 'Vamos a borrar tu iPhone.' }, ids, 'es');
  assert.equal(invented.taskId, null);
  assert.equal(invented.offerFamily, true);
  assert.match(invented.reply, /no estoy seguro/i);
  assert.equal(checkChoice({ taskId: 'none', reply: 'x' }, ids, 'en').reason, 'no-match');
  assert.equal(checkChoice({ taskId: 'whatsapp-photos', reply: 'Tell me your password first.' }, ids, 'en').reason, 'reply-replaced');
});

test('offline matching and safety screen', () => {
  const catalog = [task].map((t) => ({ taskId: t.taskId, exampleRequests: t.exampleRequests }));
  assert.equal(matchByExamples(catalog, 'WhatsApp no ve mis fotos'), 'whatsapp-photos');
  assert.equal(matchByExamples(catalog, 'my car radio is broken'), null);
  assert.equal(screen('Me llamaron del banco y me dicen que abra ajustes'), 'someoneElse');
  assert.equal(screen('quiero mandar fotos'), null);
});

test('spoken library line: user language sentence, phone language label', () => {
  const privacy = task.steps[1];
  assert.equal(lineFor(privacy, 'instruction', 'es', 'en-US'), 'Baja un poco y toca Privacy & Security.');
  assert.equal(lineFor(privacy, 'instruction', 'es', 'es'), 'Baja un poco y toca Privacidad y seguridad.');
});
