import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLibrary, labelFor, instructionFor } from '../src/library.js';
import { validateLibrary } from '../src/validate.js';

const library = loadLibrary();
const task = library.tasks['whatsapp-photos'];
const privacy = task.steps.find((s) => s.id === 'privacy');

test('shipped library has no errors', () => {
  const { errors } = validateLibrary(library);
  assert.deepEqual(errors, []);
});

test('unverified labels are reported as warnings', () => {
  const { warnings } = validateLibrary(library);
  assert.ok(warnings.some((w) => w.includes('not yet verified')));
});

test('validator catches a missing {label} and a missing language', () => {
  const broken = structuredClone(library);
  const step = broken.tasks['whatsapp-photos'].steps[0];
  step.instruction.es = 'Abre ajustes.';
  delete step.label.es;
  const { errors } = validateLibrary(broken);
  assert.ok(errors.some((e) => e.includes('instruction.es')));
  assert.ok(errors.some((e) => e.includes('label: missing language "es"')));
});

test('validator catches bad hint timing and duplicate signatures', () => {
  const broken = structuredClone(library);
  const steps = broken.tasks['whatsapp-photos'].steps;
  steps[1].hintTimingSec = { repeat: 20, describe: 10, picture: 30 };
  steps[4].confirmWithUser = false;
  const { errors } = validateLibrary(broken);
  assert.ok(errors.some((e) => e.includes('hintTimingSec')));
  assert.ok(errors.some((e) => e.includes('same arrival title')));
});

test('label follows the phone language, instruction follows the user language', () => {
  assert.equal(labelFor(privacy, 'es-US').label, 'Privacidad y seguridad');
  // Spanish speaker whose phone is in English: Spanish sentence, English label.
  assert.equal(instructionFor(privacy, 'es', 'en'), 'Baja un poco y toca Privacy & Security.');
  assert.equal(instructionFor(privacy, 'es', 'es'), 'Baja un poco y toca Privacidad y seguridad.');
});

test('unknown phone language falls back to English labels and says so', () => {
  const r = labelFor(privacy, 'fr-FR');
  assert.equal(r.label, 'Privacy & Security');
  assert.equal(r.uncertain, true);
});
