// Guards against the Swift port drifting from the JS reference (Swift can't run in CI here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as detector from '../src/detector.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('detector thresholds match StepDetector.swift', () => {
  const swift = read('ios/Packages/BuddyCore/Sources/BuddyCore/StepDetector.swift');
  const val = (name) => Number(swift.match(new RegExp(`static let ${name} = ([0-9.]+)`))[1]);
  assert.equal(val('titleRegionMaxY'), detector.TITLE_REGION_MAX_Y);
  assert.equal(val('centerTolerance'), detector.CENTER_TOLERANCE);
  assert.equal(val('largeTitleMinH'), detector.LARGE_TITLE_MIN_H);
  assert.equal(val('titleMinH'), detector.TITLE_MIN_H);
});

test('pre-rendered phrases match Phrases.swift', () => {
  const swift = read('ios/Buddy/Session/Phrases.swift');
  const js = read('backend/scripts/cache-demo-audio.js');
  for (const lang of ['en', 'es']) {
    const block = swift.split(`"${lang}": [`)[1].split(']')[0];
    const phrases = [...block.matchAll(/: "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    assert.equal(phrases.length, 9);
    for (const p of phrases) assert.ok(js.includes(p), `${lang}: "${p}" missing from cache-demo-audio.js`);
  }
});
