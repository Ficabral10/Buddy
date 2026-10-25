// Adds a real iPhone screenshot to a library step, so the app shows the actual screen with a ring
// around what to tap instead of a drawing.
//
// Usage (from backend/):
//   npm run add-screen -- --task text-size --step display --lang es --ios 27 ~/Desktop/IMG_0412.PNG
// Options:
//   --box x,y,w,h   ring position (0..1, top-left origin) when the label can't be found automatically
//   --no-ring       show the screen without a ring (e.g. a slider or swipe step)
//
// The label is found with Apple's Vision text reader on this Mac (scripts/ocr.swift, compiled once).
// Before adding a screenshot, check it shows nothing personal: no name, photo, phone number, messages.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLibrary, LIBRARY_DIR } from '../src/library.js';
import { normalize } from '../src/text.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = { en: 'en-US', es: 'es-ES', ko: 'ko-KR', vi: 'vi-VN' };
const WIDTH = 750; // plenty for a phone screen; keeps each file around 100 KB

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-ring') out.noRing = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

/** Compile the Vision reader once; `swift file.swift` would recompile it on every run. */
function ocr(image, lang) {
  const src = path.join(here, 'ocr.swift');
  const bin = path.join(here, '../.ocr-bin/ocr');
  if (!existsSync(bin) || statSync(bin).mtimeMs < statSync(src).mtimeMs) {
    mkdirSync(path.dirname(bin), { recursive: true });
    console.log('Compiling the text reader (once)…');
    execFileSync('swiftc', ['-O', src, '-o', bin], { stdio: 'inherit' });
  }
  return JSON.parse(execFileSync(bin, [image, LOCALES[lang] ?? 'en-US'], { encoding: 'utf8' }));
}

const clean = (s) => normalize(s).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** Same matching as findLabel in web/app.js: exact, then a close prefix, then contains. */
export function findLine(lines, label, { top = 0.11 } = {}) {
  const want = clean(label);
  let best = null;
  for (const l of lines) {
    if (l.box.y < top) continue;
    const got = clean(l.text);
    const score = got === want ? 3 : got.startsWith(want) && got.length - want.length <= 4 ? 2 : got.includes(want) && want.length >= 5 ? 1 : 0;
    if (score && (!best || score > best.score)) best = { score, box: l.box };
  }
  return best?.box ?? null;
}

/** Where the ring goes, from the label's text box and the kind of control. All values 0..1. */
export function ringFor(type, line, aspect) {
  const cy = line.y + line.h / 2;
  const rowH = Math.max(line.h * 2.4, 0.05);
  const clamp = (b) => {
    const x = Math.max(0, b.x);
    const y = Math.max(0, b.y);
    return { x, y, w: Math.min(1 - x, b.w), h: Math.min(1 - y, b.h) };
  };
  switch (type) {
    case 'row':
    case 'option':
      return clamp({ x: 0.03, y: cy - rowH / 2, w: 0.94, h: rowH });
    case 'toggle':
      return clamp({ x: 0.76, y: cy - rowH / 2, w: 0.21, h: rowH });
    case 'app': {
      // The name sits under the icon; the icon is about 16% of the screen width and square.
      const iconW = 0.2;
      const iconH = iconW * aspect;
      const cx = line.x + line.w / 2;
      return clamp({ x: cx - iconW / 2, y: line.y - iconH - 0.004, w: iconW, h: iconH + line.h + 0.012 });
    }
    default: {
      const pad = 0.015;
      return clamp({ x: line.x - pad * 2, y: line.y - pad, w: line.w + pad * 4, h: line.h + pad * 2 });
    }
  }
}

function main() {
  const a = args(process.argv.slice(2));
  const image = a._[0];
  if (!a.task || !a.step || !a.lang || !a.ios || !image) {
    fail('usage: npm run add-screen -- --task <id> --step <id> --lang <en|es|ko|vi> --ios <major> <screenshot> [--box x,y,w,h | --no-ring]');
  }
  if (!existsSync(image)) fail(`No file at ${image}`);
  const library = loadLibrary();
  const step = library.tasks[a.task]?.steps.find((s) => s.id === a.step);
  if (!step) fail(`No step "${a.step}" in task "${a.task}".`);
  if (!library.languages.includes(a.lang)) fail(`Language must be one of: ${library.languages.join(', ')}`);
  if (!/^\d+$/.test(a.ios)) fail('--ios must be the major version, e.g. 27');

  let box = null;
  if (a.box) {
    const [x, y, w, h] = a.box.split(',').map(Number);
    box = { x, y, w, h };
  } else if (!a.noRing) {
    const label = step.label[a.lang];
    const type = step.visual?.type ?? 'row';
    const read = ocr(path.resolve(image), a.lang);
    const line = type === 'back' ? null : findLine(read.lines, label, { top: type === 'app' ? 0.05 : 0.11 });
    if (type === 'back') box = { x: 0.02, y: 0.055, w: 0.16, h: 0.05 };
    else if (line) box = ringFor(type, line, read.width / read.height);
    else {
      console.error(`Couldn't find "${label}" on the screenshot. Text found:`);
      for (const l of read.lines) console.error(`  ${l.text}`);
      fail('Pass --box x,y,w,h (0..1, from the top left) or --no-ring.');
    }
  }
  const round = (n) => Math.round(n * 1000) / 1000;
  if (box) box = Object.fromEntries(Object.entries(box).map(([k, v]) => [k, round(v)]));

  const file = `${a.task}/${a.step}.${a.lang}.ios${a.ios}.jpg`;
  const out = path.join(LIBRARY_DIR, 'screens', file);
  mkdirSync(path.dirname(out), { recursive: true });
  const width = Number(execFileSync('sips', ['-g', 'pixelWidth', image], { encoding: 'utf8' }).match(/pixelWidth: (\d+)/)[1]);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', ...(width > WIDTH ? ['--resampleWidth', String(WIDTH)] : []), image, '--out', out], { stdio: 'ignore' });

  const manifestFile = path.join(LIBRARY_DIR, 'screens', 'index.json');
  const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : { screens: [] };
  const entry = { task: a.task, step: a.step, lang: a.lang, ios: Number(a.ios), file, box };
  manifest.screens = manifest.screens.filter((s) => s.file !== file).concat(entry)
    .sort((p, q) => p.file.localeCompare(q.file));
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Added ${file}${box ? ` with a ring at ${JSON.stringify(box)}` : ' (no ring)'}.`);
  console.log('Open the step in the web app to check the ring, and make sure nothing personal is on the screen.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
