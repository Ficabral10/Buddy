import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLibrary } from '../src/library.js';
import { detect } from '../src/detector.js';

const fixtures = JSON.parse(readFileSync(new URL('../../fixtures/screens/whatsapp-photos.json', import.meta.url), 'utf8'));
const task = loadLibrary().tasks[fixtures.task];

for (const c of fixtures.cases) {
  test(c.name, () => {
    const lines = c.lines.map(([text, x, y, w, h]) => ({ text, box: { x, y, w, h } }));
    const result = detect({ task, currentStep: c.currentStep, lines, phoneLanguage: c.phoneLanguage });
    for (const [k, v] of Object.entries(c.expect)) assert.equal(result[k], v, `${k}: got ${JSON.stringify(result)}`);
  });
}
