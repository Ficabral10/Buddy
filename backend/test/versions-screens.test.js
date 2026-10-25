import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLibrary } from '../src/library.js';
import { validateLibrary } from '../src/validate.js';
import { inRange, forIos, iosFromUserAgent } from '../src/versions.js';
import { findLine, ringFor } from '../scripts/add-screen.js';

const library = loadLibrary();
const ids = (task) => task.steps.map((s) => s.id);

test('inRange: both ends included, missing ends open', () => {
  assert.equal(inRange('26.4', { max: '26.99' }), true);
  assert.equal(inRange('27.0', { max: '26.99' }), false);
  assert.equal(inRange('27.0', { min: '27.0' }), true);
  assert.equal(inRange('18.6', { min: '27.0' }), false);
  assert.equal(inRange('17.0', undefined), true);
});

test('text-size: Display & Brightness before iOS 27, Appearance from iOS 27', () => {
  const t = library.tasks['text-size'];
  assert.deepEqual(ids(forIos(t, '26.1')), ['open-settings', 'display', 'text-size-row', 'slider']);
  assert.deepEqual(ids(forIos(t, '18.6')), ['open-settings', 'display', 'text-size-row', 'slider']);
  assert.deepEqual(ids(forIos(t, '27.0')), ['open-settings', 'appearance', 'text-size-row', 'slider']);
  // Unknown version: assume the newest the task was written for.
  assert.deepEqual(ids(forIos(t, null)), ['open-settings', 'appearance', 'text-size-row', 'slider']);
});

test('every task has one path per iOS version, with no repeated arrival screens', () => {
  for (const t of Object.values(library.tasks)) {
    for (const v of ['17.0', '18.6', '26.0', '27.0']) {
      const steps = forIos(t, v).steps;
      assert.ok(steps.length > 0, `${t.id} on iOS ${v}`);
      steps.forEach((s, i) => {
        if (i && !s.confirmWithUser) {
          assert.notDeepEqual(s.arrival.title, steps[i - 1].arrival.title, `${t.id}/${s.id} on iOS ${v}`);
        }
      });
    }
  }
});

test('iOS version from the user agent', () => {
  const safari26 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
  const safari18 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1';
  const chrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1';
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
  assert.equal(iosFromUserAgent(safari26), '26.0');
  assert.equal(iosFromUserAgent(safari18), '18.3');
  assert.equal(iosFromUserAgent(chrome), null); // frozen 18_6: could be newer, so unknown
  assert.equal(iosFromUserAgent(mac), null);
});

test('validator rejects bad step versions and bad screenshot entries', () => {
  const lib = structuredClone(library);
  lib.tasks['text-size'].steps[1].iosVersions = { from: 27 };
  lib.screens = [
    { task: 'text-size', step: 'nope', lang: 'es', ios: 27, file: 'text-size/nope.es.ios27.jpg', box: null },
    { task: 'text-size', step: 'display', lang: 'es', ios: '26.1', file: '../secret.jpg', box: { x: 2, y: 0, w: 1, h: 1 } },
  ];
  const { errors } = validateLibrary(lib);
  assert.ok(errors.some((e) => e.includes('iosVersions')));
  assert.ok(errors.some((e) => e.includes('unknown task/step')));
  assert.ok(errors.some((e) => e.includes('ios must be')));
  assert.ok(errors.some((e) => e.includes('file must')));
  assert.ok(errors.some((e) => e.includes('box must')));
});

test('add-screen: finds the label below the status bar and rings the whole row', () => {
  const lines = [
    { text: 'Ajustes', box: { x: 0.05, y: 0.06, w: 0.3, h: 0.04 } },
    { text: 'Pantalla y brillo', box: { x: 0.17, y: 0.38, w: 0.3, h: 0.025 } },
  ];
  const line = findLine(lines, 'Pantalla y brillo');
  assert.deepEqual(line, lines[1].box);
  const ring = ringFor('row', line, 0.46);
  assert.equal(ring.x, 0.03);
  assert.ok(ring.y < line.y && ring.y + ring.h > line.y + line.h);
  assert.equal(findLine(lines, 'Ajustes'), null); // the title isn't a tap target
});

test('add-screen: an app ring covers the icon above its name', () => {
  const name = { x: 0.42, y: 0.5, w: 0.16, h: 0.015 };
  const ring = ringFor('app', name, 1179 / 2556);
  assert.ok(ring.y < name.y - 0.07, 'reaches up over the icon');
  assert.ok(ring.y + ring.h >= name.y + name.h, 'includes the name');
  assert.ok(Math.abs(ring.x + ring.w / 2 - 0.5) < 0.001, 'centered on the name');
});
