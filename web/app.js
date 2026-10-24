// Lola web app: the no-Xcode version. Same library, same detector, same backend as the iOS app.
// The user does every tap; this page only decides what to say and when.
import { UI, PHRASES, familyMessage } from './i18n.js';
import { Speaker, Listener } from './voice.js';
import { readScreenshot, readMessageText, toJpegBase64, warmUp } from './ocr.js';
import { drawCard, floatingSupported, startFloating } from './floating.js';
import { detect } from '/lib/detector.js';
import { normalize, baseLang } from '/lib/text.js';

const $app = document.getElementById('app');
const PHONE_LANG = navigator.language || 'en';

// ---------- Settings (this phone only) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(`lola.${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`lola.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};
const settings = {
  lang: store.get('lang', baseLang(PHONE_LANG) === 'es' ? 'es' : 'en'),
  mode: store.get('mode', 'both'), // both | voice | text
  patience: store.get('patience', 1),
  familyName: store.get('familyName', ''),
  familyPhone: store.get('familyPhone', ''),
  logging: store.get('logging', false),
  onboarded: store.get('onboarded', false),
};
const save = (k, v) => { settings[k] = v; store.set(k, v); };
const t = () => UI[settings.lang];
const P = () => PHRASES[settings.lang];

// ---------- Services ----------
const speaker = new Speaker({ onChange: () => updateMascots() });
const listener = new Listener();
let library = null;

document.addEventListener('pointerdown', () => speaker.unlockAudio(), { once: true, capture: true });

function speak(text) {
  if (settings.mode !== 'text') speaker.say(text, settings.lang);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

// ---------- Usage log (opt-in, counts only, stays on the phone) ----------
function logEvent(e) {
  if (!settings.logging) return;
  const log = store.get('usage', []);
  log.push({ ...e, t: Date.now() });
  store.set('usage', log.slice(-2000));
}
function exportLog() {
  const lines = store.get('usage', []).map((e) => JSON.stringify(e)).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`${lines}\n`], { type: 'application/x-ndjson' }));
  a.download = `usage-log-${new Date().toISOString().slice(0, 10)}.jsonl`;
  a.click();
}

// ---------- Voice commands (port of BuddyCore/VoiceCommand.swift) ----------
const COMMANDS = {
  stop: ['stop', 'quit', 'para', 'parar', 'detente', 'basta'],
  pause: ['pause', 'wait', 'pausa', 'espera', 'esperate'],
  lost: ["i'm lost", 'im lost', 'lost', 'help', 'estoy perdido', 'estoy perdida', 'perdido', 'perdida', 'ayuda', 'no entiendo'],
  repeat: ['repeat', 'again', 'say it again', 'otra vez', 'repite', 'repitelo', 'de nuevo'],
  next: ['next', 'done', 'siguiente', 'listo', 'ya'],
};
const clean = (s) => normalize(s).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
function parseCommand(text) {
  const c = clean(text);
  if (!c || c.split(' ').length > 4) return null;
  for (const [cmd, words] of Object.entries(COMMANDS)) if (words.some((w) => clean(w) === c)) return cmd;
  return null;
}
const YES = ['si', 'yes', 'yeah', 'claro', 'correcto', 'eso', 'ya'];
const NO = ['no', 'nope', 'todavia no', 'aun no', 'not yet'];

// ---------- Small render helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function mascot(small = false) {
  return `<svg class="mascot${small ? ' small' : ''}" viewBox="0 0 100 100" aria-hidden="true">
    <circle class="ring" cx="50" cy="50" r="48" fill="none" stroke="#b42318" stroke-width="4"/>
    <circle cx="50" cy="50" r="42" fill="var(--mascot)"/>
    <rect x="34" y="34" width="7" height="13" rx="3.5" fill="#222"/>
    <rect x="59" y="34" width="7" height="13" rx="3.5" fill="#222"/>
    <path class="mouth" d="M36 62 Q50 74 64 62" fill="none" stroke="#222" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
}
function updateMascots() {
  document.querySelectorAll('.mascot').forEach((m) => {
    m.classList.toggle('speaking', speaker.speaking);
    m.classList.toggle('listening', listener.listening);
  });
}

/** Wrap the exact on-screen label in an outlined chip so it stands out visually. */
function withLabel(text, label) {
  if (!label) return esc(text);
  const i = text.indexOf(label);
  if (i < 0) return esc(text);
  return `${esc(text.slice(0, i))}<span class="label">${esc(label)}</span>${esc(text.slice(i + label.length))}`;
}

function talkButton(onHeard) {
  const id = `talk-${Math.random().toString(36).slice(2)}`;
  setTimeout(() => {
    const btn = document.getElementById(id);
    const heard = document.getElementById(`${id}-heard`);
    if (!btn) return;
    btn.onclick = () => {
      speaker.unlockAudio();
      if (listener.listening) return listener.stop();
      speaker.stop();
      listener.start(settings.lang, {
        onPartial: (s) => { heard.textContent = s; },
        onFinal: (s) => onHeard(s),
        onError: (err) => { if (err === 'unsupported' || err === 'not-allowed') heard.textContent = t().micOff; },
        onEnd: () => { btn.classList.remove('listening'); btn.textContent = `🎤 ${t().tapTalk}`; updateMascots(); },
      });
      btn.classList.add('listening');
      btn.textContent = t().listening;
      updateMascots();
    };
  });
  return `<button id="${id}" class="talk primary">🎤 ${t().tapTalk}</button>
          <p id="${id}-heard" class="heard"></p>`;
}

// ---------- Pointing at the button on her screenshot ----------
const SENSITIVE = ['enter password', 'enter passcode', 'card number', 'cvv', 'security code', 'verification code',
  'introduce la contrasena', 'ingresa tu contrasena', 'ingresa la contrasena', 'ingresa el codigo',
  'numero de tarjeta', 'codigo de seguridad', 'codigo de verificacion'];
function looksSensitive(lines) {
  const all = lines.map((l) => normalize(l.text)).join(' ');
  return SENSITIVE.some((w) => all.includes(w));
}

/** The row to tap: an exact (or near-exact) match, below the navigation bar. */
function findLabel(lines, label) {
  if (!label) return null;
  const want = clean(label);
  let best = null;
  for (const l of lines) {
    if (l.box.y < 0.11) continue; // skip status bar, back button and title
    const got = clean(l.text);
    const score = got === want ? 3 : got.startsWith(want) && got.length - want.length <= 4 ? 2 : got.includes(want) && want.length >= 5 ? 1 : 0;
    if (score && (!best || score > best.score)) best = { score, box: l.box };
  }
  return best?.box ?? null;
}

/** The back button sits at the top left, under the status bar. */
function backRing(lines) {
  const top = lines.find((l) => l.box.y < 0.11 && l.box.y > 0.03 && l.box.x < 0.3);
  return top ? { ...top.box, x: Math.max(0, top.box.x - 0.05), w: top.box.w + 0.06 } : { x: 0.01, y: 0.05, w: 0.28, h: 0.035 };
}

/** Crop the screenshot around the target and draw a ring + "Toca aquí". Stays in memory only. */
function cropWithRing(canvas, ring, label) {
  const W = canvas.width;
  const H = canvas.height;
  const cropH = Math.round(Math.min(H, W * 0.95));
  const centerY = ring ? (ring.y + ring.h / 2) * H : cropH / 2;
  const top = Math.max(0, Math.min(H - cropH, Math.round(centerY - cropH / 2)));
  const out = document.createElement('canvas');
  out.width = W;
  out.height = cropH;
  const ctx = out.getContext('2d');
  ctx.drawImage(canvas, 0, top, W, cropH, 0, 0, W, cropH);
  if (ring) {
    const pad = W * 0.03;
    const x = ring.x * W - pad;
    const y = ring.y * H - top - pad;
    const w = Math.max(ring.w * W + pad * 2, W * 0.35);
    const h = ring.h * H + pad * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; // dim everything except the target
    ctx.fillRect(0, 0, W, cropH);
    ctx.drawImage(canvas, x, y + top, w, h, x, y, w, h);
    ctx.lineWidth = Math.max(6, W * 0.012);
    ctx.strokeStyle = '#ff3b30';
    ctx.shadowColor = 'rgba(255,59,48,0.8)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 18) : ctx.rect(x, y, w, h);
    ctx.stroke();
    ctx.shadowBlur = 0;
    const tag = `👆 ${settings.lang === 'es' ? 'Toca aquí' : 'Tap here'}`;
    ctx.font = `700 ${Math.round(W * 0.05)}px -apple-system, system-ui, sans-serif`;
    const tw = ctx.measureText(tag).width + W * 0.04;
    const ty = y + h + W * 0.015 + W * 0.07 < cropH ? y + h + W * 0.015 : Math.max(0, y - W * 0.085);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(x, ty, tw, W * 0.07);
    ctx.fillStyle = '#fff';
    ctx.fillText(tag, x + W * 0.02, ty + W * 0.052);
  }
  return out.toDataURL('image/jpeg', 0.85);
}

// ---------- Onboarding ----------
function onboarding(page = 0) {
  const choice = (label, on, attr) => `<button class="choice" aria-pressed="${on}" ${attr}>${esc(label)}</button>`;
  let body = '';
  if (page === 0) {
    body = `<h1>${t().chooseLang}</h1><div class="stack">
      ${choice('Español', settings.lang === 'es', 'data-lang="es"')}
      ${choice('English', settings.lang === 'en', 'data-lang="en"')}</div>`;
  } else if (page === 1) {
    body = `<h1>${t().howHelp}</h1><div class="stack">
      ${choice(t().talkAndText, settings.mode === 'both', 'data-mode="both"')}
      ${choice(t().onlyTalk, settings.mode === 'voice', 'data-mode="voice"')}
      ${choice(t().onlyText, settings.mode === 'text', 'data-mode="text"')}</div>
      <p class="muted center">${t().changeLater}</p>`;
  } else {
    body = `<h1>${t().whoHelps}</h1><p class="muted center">${t().whoHelpsNote}</p>
      <label>${t().name}<input id="fam-name" type="text" autocomplete="off" value="${esc(settings.familyName)}"></label>
      <label>${t().phone}<input id="fam-phone" type="tel" autocomplete="off" value="${esc(settings.familyPhone)}" placeholder="+1 555 123 4567"></label>`;
  }
  $app.innerHTML = `${mascot()}${body}<div class="spacer"></div>
    <button id="next" class="primary">${page < 2 ? t().next : t().start}</button>`;
  $app.querySelectorAll('[data-lang]').forEach((b) => { b.onclick = () => { save('lang', b.dataset.lang); onboarding(0); }; });
  $app.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => { save('mode', b.dataset.mode); onboarding(1); }; });
  document.getElementById('next').onclick = () => {
    if (page === 2) {
      save('familyName', document.getElementById('fam-name').value.trim());
      save('familyPhone', document.getElementById('fam-phone').value.trim());
      save('onboarded', true);
      return home();
    }
    onboarding(page + 1);
  };
}

// ---------- Home ----------
function home(message = '') {
  const tasks = Object.values(library.tasks);
  $app.innerHTML = `
    <div class="top"><div class="title"></div><button id="gear" aria-label="${t().settings}">⚙️</button></div>
    ${mascot()}
    <h1 id="prompt">${esc(message || t().whatNeed)}</h1>
    ${talkButton((s) => submit(s))}
    <div class="type-row">
      <input id="typed" type="text" placeholder="${t().typeHere}" enterkeyhint="send" aria-label="${t().typeHere}">
      <button id="send">${t().send}</button>
    </div>
    <p id="status" class="status" role="status"></p>
    <button id="scam" class="scam-entry"><span class="big">🛡️ ${t().scamTitle}</span><span>${t().scamSub}</span></button>
    <h2>${t().canHelp}</h2>
    <div class="list">${tasks.map((k) => `<button data-task="${k.id}">${esc(k.title[settings.lang] ?? k.title.en)}</button>`).join('')}</div>`;
  document.getElementById('scam').onclick = () => scamPage();
  const typed = document.getElementById('typed');
  document.getElementById('send').onclick = () => submit(typed.value);
  typed.onkeydown = (e) => { if (e.key === 'Enter') submit(typed.value); };
  document.getElementById('gear').onclick = settingsPage;
  $app.querySelectorAll('[data-task]').forEach((b) => {
    b.onclick = () => startSession(library.tasks[b.dataset.task], confirmLine(library.tasks[b.dataset.task]));
  });
  updateMascots();
}

function confirmLine(task) {
  const title = task.title[settings.lang] ?? task.title.en;
  return settings.lang === 'es'
    ? `Quieres: ${title.charAt(0).toLowerCase()}${title.slice(1)}. ¿Es así?`
    : `You want to: ${title}. Is that right?`;
}

async function submit(text) {
  const s = String(text ?? '').trim();
  if (!s) return;
  const status = document.getElementById('status');
  if (status) status.textContent = '…';
  try {
    const r = await api('/agent', { userLanguage: settings.lang, phoneLanguage: PHONE_LANG, event: 'request', text: s });
    if (r.action === 'start_task' && library.tasks[r.taskId]) return startSession(library.tasks[r.taskId], r.say);
    if (r.action === 'safety') return warning(r.say);
    home(r.say);
    speak(r.say);
  } catch {
    home(t().noConnect);
    speak(t().noConnect);
  }
}

/** The scam / out-of-scope warning gets its own clear screen. */
function warning(text) {
  $app.innerHTML = `${mascot()}
    <div class="warn" role="alert"><strong>⚠️ ${t().safety}</strong><p>${esc(text)}</p></div>
    ${familyButtons()}
    <div class="spacer"></div>
    <button id="ok">${t().back}</button>`;
  document.getElementById('ok').onclick = () => home();
  speak(text);
}

function familyButtons(session) {
  if (!settings.familyPhone) return '';
  const digits = settings.familyPhone.replace(/\D/g, '');
  setTimeout(() => {
    document.getElementById('call-family')?.addEventListener('click', () => session?.log('family_call'));
  });
  return `<a id="call-family" class="button" href="facetime:${digits}">📹 ${esc(t().callFamily(settings.familyName || settings.familyPhone))}</a>`;
}

// ---------- "¿Es una estafa?" ----------
function scamPage(state = {}) {
  const { text = '', result = null, reading = false, checking = false } = state;
  const fam = settings.familyName || settings.familyPhone;
  const digits = settings.familyPhone.replace(/\D/g, '');
  let body;
  if (result) {
    const share = settings.familyPhone
      ? `https://wa.me/${digits}?text=${encodeURIComponent(`${t().scamShare(settings.familyName)}\n\n"${text.slice(0, 600)}"`)}` : null;
    body = `<section class="verdict risk-${result.risk}" role="alert">
        <p class="headline">${result.risk === 'high' ? '🚫' : result.risk === 'medium' ? '⚠️' : '✅'} ${esc(result.headline)}</p>
        ${result.flags.length ? `<ul class="chips">${result.flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        ${result.explanation ? `<p>${esc(result.explanation)}</p>` : ''}
        <p class="advice">${esc(result.advice)}</p>
      </section>
      ${share ? `<a class="button primary" href="${share}">💬 ${esc(t().scamAsk(fam))}</a>` : ''}
      ${digits ? `<a class="button" href="facetime:${digits}">📹 ${esc(t().callFamily(fam))}</a>` : ''}
      <button id="again">${t().scamAgain}</button>`;
  } else {
    body = `<p class="center">${t().scamHow}</p>
      <label class="button primary" for="scam-shot">📷 ${t().scamPick}</label>
      <input id="scam-shot" type="file" accept="image/*" hidden>
      ${reading ? `<p class="status">${t().reading}</p>` : ''}
      <textarea id="scam-text" rows="6" placeholder="${t().scamPaste}" aria-label="${t().scamPaste}">${esc(text)}</textarea>
      ${text ? `<p class="privacy">${t().scamPrivacy}</p>` : ''}
      <button id="check" class="primary" ${checking ? 'disabled' : ''}>${checking ? '…' : `🔍 ${t().scamCheck}`}</button>`;
  }
  $app.innerHTML = `<div class="top"><button id="back" style="width:auto">← ${t().back}</button><div class="title"></div></div>
    ${mascot()}<h1>${t().scamTitle}</h1>${body}`;
  document.getElementById('back').onclick = () => { speaker.stop(); home(); };
  document.getElementById('again')?.addEventListener('click', () => scamPage());
  const shot = document.getElementById('scam-shot');
  if (shot) shot.onchange = async () => {
    const file = shot.files?.[0];
    if (!file) return;
    scamPage({ reading: true });
    let read = '';
    try { read = await readMessageText(file, PHONE_LANG); } catch { /* reader failed */ }
    scamPage({ text: read });
  };
  document.getElementById('check')?.addEventListener('click', async () => {
    const msg = document.getElementById('scam-text').value.trim();
    if (!msg) return;
    scamPage({ text: msg, checking: true });
    try {
      const r = await api('/scam', { text: msg, userLanguage: settings.lang });
      scamPage({ text: msg, result: r });
      speak(r.say);
    } catch {
      scamPage({ text: msg });
      speak(t().noConnect);
    }
  });
  updateMascots();
}

// ---------- Settings ----------
function settingsPage() {
  const hasLog = store.get('usage', []).length > 0;
  $app.innerHTML = `<h1>${t().settings}</h1>
    <h2>${t().language}</h2>
    <div class="row"><button class="choice" aria-pressed="${settings.lang === 'es'}" data-lang="es">Español</button>
      <button class="choice" aria-pressed="${settings.lang === 'en'}" data-lang="en">English</button></div>
    <h2>${t().howHelp}</h2>
    <div class="stack">
      <button class="choice" aria-pressed="${settings.mode === 'both'}" data-mode="both">${t().talkAndText}</button>
      <button class="choice" aria-pressed="${settings.mode === 'voice'}" data-mode="voice">${t().onlyTalk}</button>
      <button class="choice" aria-pressed="${settings.mode === 'text'}" data-mode="text">${t().onlyText}</button></div>
    <label>${t().hintTime}: <strong id="pat">${settings.patience}×</strong>
      <input id="patience" type="range" min="0.5" max="3" step="0.5" value="${settings.patience}" style="width:100%"></label>
    <h2>${t().family}</h2>
    <input id="fam-name" type="text" placeholder="${t().name}" value="${esc(settings.familyName)}">
    <input id="fam-phone" type="tel" placeholder="${t().phone}" value="${esc(settings.familyPhone)}">
    <label style="display:flex;gap:12px;align-items:center"><input id="logging" type="checkbox" ${settings.logging ? 'checked' : ''} style="width:28px;height:28px">${t().logging}</label>
    <p class="privacy">${t().loggingNote}</p>
    ${hasLog ? `<div class="row"><button id="export">${t().exportLog}</button><button id="clear" class="danger">${t().clearLog}</button></div>` : ''}
    <p class="privacy">${t().privacy}</p>
    <button id="save" class="primary">${t().save}</button>`;
  $app.querySelectorAll('[data-lang]').forEach((b) => { b.onclick = () => { save('lang', b.dataset.lang); settingsPage(); }; });
  $app.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => { save('mode', b.dataset.mode); settingsPage(); }; });
  const pat = document.getElementById('patience');
  pat.oninput = () => { document.getElementById('pat').textContent = `${pat.value}×`; };
  document.getElementById('export')?.addEventListener('click', exportLog);
  document.getElementById('clear')?.addEventListener('click', () => { store.set('usage', []); settingsPage(); });
  document.getElementById('save').onclick = () => {
    save('patience', Number(pat.value));
    save('familyName', document.getElementById('fam-name').value.trim());
    save('familyPhone', document.getElementById('fam-phone').value.trim());
    save('logging', document.getElementById('logging').checked);
    home();
  };
}

// ---------- Session ----------
let current = null;

function startSession(task, line) {
  current?.dispose();
  current = new Session(task, line);
  current.say(line); // after `current` is set, so render() runs
}

class Session {
  constructor(task, line) {
    this.task = task;
    this.id = crypto.randomUUID?.() ?? String(Date.now());
    this.lang = settings.lang;
    this.phase = 'confirm'; // confirm | guiding | returned | askScreen | askCheck | finished | stopped
    this.i = 0;
    this.hint = 0; // 0 none, 1 repeat, 2 describe, 3 picture
    this.paused = false;
    this.shownAt = Date.now();
    this.leftAt = null;
    this.lastWrong = {};
    this.line = line;
    this.warn = null;
    this.reading = false;
    this.timer = setInterval(() => this.tick(), 1000);
    this.onVis = () => this.visibility();
    document.addEventListener('visibilitychange', this.onVis);
    warmUp(PHONE_LANG).catch(() => {});
    this.log('session_start', { mode: 'helper' });
  }

  dispose() {
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVis);
  }

  log(type, extra = {}) { logEvent({ session: this.id, type, taskId: this.task.id, ...extra }); }

  get step() { return this.task.steps[this.i]; }
  label(step = this.step) {
    if (!step) return '';
    return step.label[baseLang(PHONE_LANG)] ?? step.label.en;
  }
  instruction(step = this.step) {
    if (!step) return '';
    const tpl = step.instruction[this.lang] ?? step.instruction.en;
    return tpl.replaceAll('{label}', this.label(step));
  }
  whereToLook(step = this.step) { return step ? (step.whereToLook[this.lang] ?? step.whereToLook.en) : ''; }
  stepText() { return t().stepOf(Math.min(this.i + 1, this.task.steps.length), this.task.steps.length); }

  say(text) {
    this.line = text;
    this.render();
    speak(text);
    drawCard({ text, step: this.phase === 'finished' ? '' : this.stepText() });
  }

  // ----- flow -----
  confirm(yes) {
    if (this.phase !== 'confirm') return;
    if (!yes) return this.end(false);
    this.phase = 'guiding';
    this.showStep();
  }

  showStep() {
    if (!this.step) return this.finish();
    this.hint = 0;
    this.shownAt = Date.now();
    this.log('step_shown', { step: this.step.id });
    this.say(this.instruction());
  }

  complete(next = this.i + 1) {
    this.log('step_done', { step: this.step?.id });
    this.i = next;
    if (this.i >= this.task.steps.length) return this.finish();
    this.phase = 'guiding';
    this.hint = 0;
    this.shownAt = Date.now();
    this.log('step_shown', { step: this.step.id });
    this.say(`${P().done} ${this.instruction()}`);
  }

  finish() {
    this.phase = 'finished';
    this.log('session_end', { completed: true });
    const offer = this.task.finishAction === 'tell-family' && settings.familyPhone ? ` ${P().offerFamily}` : '';
    this.say(P().finished + offer);
    this.dispose();
  }

  end(completed) {
    this.phase = 'stopped';
    this.log('session_end', { completed });
    this.say(P().stopped);
    this.dispose();
  }

  next() { if (['guiding', 'returned', 'askScreen', 'askCheck'].includes(this.phase)) this.complete(); }
  repeat() { if (this.phase === 'guiding' || this.phase === 'returned') { this.phase = 'guiding'; this.say(this.instruction()); } }
  togglePause() {
    this.paused = !this.paused;
    if (this.paused) { speaker.stop(); this.say(P().paused); } else { this.shownAt = Date.now(); this.say(this.instruction()); }
  }

  answer(yes) {
    if (this.phase === 'confirm') return this.confirm(yes);
    if (!['returned', 'askScreen', 'askCheck'].includes(this.phase)) return;
    if (yes) return this.complete();
    this.phase = 'guiding';
    this.say(`${this.instruction()} ${this.whereToLook()}`);
  }

  async lost() {
    if (!['guiding', 'returned', 'askScreen'].includes(this.phase) || !this.step) return;
    this.phase = 'guiding';
    this.hint = Math.max(this.hint, 2);
    this.log('lost', { step: this.step.id });
    await this.ask('lost', null, `${this.instruction()} ${this.whereToLook()}`);
  }

  async ask(event, text, fallback) {
    this.render(true);
    try {
      const r = await api('/agent', {
        userLanguage: this.lang, phoneLanguage: PHONE_LANG, event, text,
        taskId: this.task.id, stepId: this.step?.id,
      });
      if (r.action === 'safety') { this.paused = true; this.warn = r.say; }
      this.say(r.say);
    } catch {
      this.say(fallback);
    }
  }

  heard(text) {
    const n = clean(text);
    if (['confirm', 'returned', 'askScreen', 'askCheck'].includes(this.phase)) {
      if (YES.includes(n)) return this.answer(true);
      if (NO.includes(n)) return this.answer(false);
    }
    switch (parseCommand(text)) {
      case 'repeat': return this.repeat();
      case 'next': return this.next();
      case 'lost': return this.lost();
      case 'pause': return this.togglePause();
      case 'stop': return this.end(false);
      default:
        if (this.phase === 'guiding' || this.phase === 'returned') this.ask('question', text, this.instruction());
    }
  }

  // ----- "don't hover": hints after a pause, never while she's away or it's talking -----
  tick() {
    if (this.phase !== 'guiding' || this.paused || speaker.speaking || document.hidden || !this.step) return;
    const h = this.step.hintTimingSec;
    const k = settings.patience;
    const elapsed = (Date.now() - this.shownAt) / 1000;
    const level = elapsed >= h.picture * k ? 3 : elapsed >= h.describe * k ? 2 : elapsed >= h.repeat * k ? 1 : 0;
    if (level <= this.hint) return;
    this.hint = level;
    this.log('hint', { step: this.step.id, level });
    if (level === 1) this.say(this.instruction());
    else if (level === 2) this.say(this.whereToLook());
    else this.say(this.hasPicture() ? P().lookAtPicture : this.whereToLook());
  }

  hasPicture() {
    const img = document.getElementById('ref-img');
    return Boolean(img && img.complete && img.naturalWidth > 0);
  }

  // ----- web limitation turned into a feature: when she comes back, ask -----
  visibility() {
    if (document.hidden) { this.leftAt = Date.now(); speaker.stop(); return; }
    const away = this.leftAt ? (Date.now() - this.leftAt) / 1000 : 0;
    this.leftAt = null;
    if (this.phase === 'guiding' && !this.paused && away > 3) {
      this.phase = this.step?.confirmWithUser ? 'askCheck' : 'returned';
      this.say(this.step?.confirmWithUser ? P().confirmCheck : P().didIt);
    }
  }

  // ----- screenshot: read on the phone, match against the library, then POINT at the button -----
  async screenshot(file) {
    if (!file) return;
    this.reading = true;
    this.shot = null;
    this.offerLook = false;
    this.render();
    let lines = [];
    let canvas = null;
    try { ({ lines, canvas } = await readScreenshot(file, PHONE_LANG)); } catch { /* reader failed */ }
    this.reading = false;
    if (!canvas) return this.say(`${this.instruction()} ${this.whereToLook()}`);
    if (looksSensitive(lines)) return this.say(P().sensitive); // never read or send private screens

    const result = detect({ task: this.task, currentStep: this.i, lines, phoneLanguage: PHONE_LANG });
    if (result.kind === 'none') {
      const ring = findLabel(lines, this.label());
      if (ring) {
        // She's on the right screen: show her exactly where to tap.
        this.shot = { url: cropWithRing(canvas, ring, this.label()) };
        this.phase = 'guiding';
        return this.say(`${P().tapHere} ${this.instruction()}`);
      }
      // Unknown screen: offer to let Claude look at this one screenshot, with her permission.
      this.shot = { url: cropWithRing(canvas, null) };
      this.look = { canvas, lines };
      this.offerLook = true;
      this.phase = 'guiding';
      return this.say(P().askLook);
    }
    this.apply(result);
    if (this.phase === 'finished' || !this.step) return;
    const ring = result.kind === 'wrongTurn' ? backRing(lines) : findLabel(lines, this.label());
    this.shot = { url: cropWithRing(canvas, ring, result.kind === 'wrongTurn' ? null : this.label()) };
    this.render();
  }

  /** She agreed: send only this screenshot (small JPEG) to Claude; the answer must use library labels. */
  async lookWithClaude(yes) {
    const look = this.look;
    this.offerLook = false;
    this.look = null;
    if (!yes || !look) return this.say(`${this.instruction()} ${this.whereToLook()}`);
    this.render(true);
    try {
      const r = await api('/vision', {
        image: toJpegBase64(look.canvas), userLanguage: this.lang, phoneLanguage: PHONE_LANG,
        taskId: this.task.id, stepId: this.step.id,
      });
      if (r.stepId) {
        const k = this.task.steps.findIndex((st) => st.id === r.stepId);
        if (k > this.i) { this.log('step_done', { step: this.step.id }); this.i = k; }
      }
      const ring = r.back ? backRing(look.lines) : r.target ? findLabel(look.lines, r.target) : null;
      this.shot = { url: cropWithRing(look.canvas, ring, r.back ? null : r.target) };
      this.say(r.say);
    } catch {
      this.say(`${this.instruction()} ${this.whereToLook()}`);
    }
  }

  /** "Ana, ayúdame": a WhatsApp message that says exactly where she is stuck. She taps Send. */
  familyHelpLink() {
    if (!settings.familyPhone) return null;
    const name = settings.familyName || '';
    const title = this.task.title[this.lang] ?? this.task.title.en;
    const msg = this.lang === 'es'
      ? `${name ? `${name}, ` : ''}¿me ayudas? Estoy tratando de: ${title}. Voy en el ${this.stepText().toLowerCase()}: "${this.instruction()}"`
      : `${name ? `${name}, ` : ''}can you help me? I'm trying to: ${title}. I'm on ${this.stepText().toLowerCase()}: "${this.instruction()}"`;
    return `https://wa.me/${settings.familyPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
  }

  apply(r) {
    switch (r.kind) {
      case 'advance': return this.complete(r.nextStep);
      case 'confirm': this.phase = 'askCheck'; return this.say(P().confirmCheck);
      case 'behind': this.i = r.nextStep; this.phase = 'guiding'; return this.showStep();
      case 'wrongTurn': {
        const wt = this.step.wrongTurns.find((w) => w.id === r.wrongTurnId);
        this.log('wrong_turn', { step: this.step.id });
        this.phase = 'guiding';
        return this.say((wt.hint[this.lang] ?? wt.hint.en).replaceAll('{label}', this.label()));
      }
      case 'unsure': this.phase = 'askScreen'; return this.say(P().confirmScreen);
      default:
        this.phase = 'guiding';
        return this.say(`${P().noMatch} ${this.instruction()} ${this.whereToLook()}`);
    }
  }

  // ----- render -----
  render(thinking = false) {
    if (current !== this) return;
    const total = this.task.steps.length;
    const progress = Array.from({ length: total }, (_, k) => `<span class="${k < this.i || this.phase === 'finished' ? 'done' : ''}"></span>`).join('');
    const guiding = ['guiding', 'returned', 'askScreen', 'askCheck'].includes(this.phase);
    const showLabel = guiding && this.line.includes(this.label());
    const picture = guiding && this.hint >= 3 && this.step?.referenceImage
      ? `<img id="ref-img" src="/app/img/${this.step.referenceImage}.png" alt="" onerror="this.remove()">` : '';
    const text = settings.mode === 'voice' ? '' : `<p class="say">${showLabel ? withLabel(this.line, this.label()) : esc(this.line)}</p>`;

    let controls = '';
    if (this.phase === 'confirm' || this.phase === 'returned' || this.phase === 'askScreen' || this.phase === 'askCheck') {
      controls = `<div class="row"><button class="primary" data-a="yes">${t().yes}</button><button data-a="no">${t().no}</button></div>`;
    }
    if (guiding) {
      controls += `
        <div class="row"><button data-a="repeat">🔁 ${t().repeat}</button><button data-a="next">➡️ ${t().next}</button></div>
        <div class="row"><button data-a="lost">🧭 ${t().lost}</button><button data-a="pause">${this.paused ? `▶️ ${t().resume}` : `⏸ ${t().pause}`}</button></div>
        <label class="button" for="shot">📷 ${t().screenshot}</label>
        <input id="shot" type="file" accept="image/*" hidden>
        ${this.familyHelpLink() ? `<a class="button" data-a="askFamily" href="${this.familyHelpLink()}">🙋 ${esc(t().askFamily(settings.familyName || settings.familyPhone))}</a>` : ''}
        ${familyButtons(this)}
        ${floatingSupported() ? `<details><summary>${t().floating}</summary><button data-a="float">🪟 ${t().floating}</button></details>` : ''}`;
    }
    if (this.phase === 'finished') {
      const wa = settings.familyPhone
        ? `https://wa.me/${settings.familyPhone.replace(/\D/g, '')}?text=${encodeURIComponent(familyMessage(this.lang))}` : null;
      controls = `${wa ? `<a class="button primary" href="${wa}" data-a="wa">💬 ${esc(t().messageFamily(settings.familyName || settings.familyPhone))}</a>` : ''}
        <button data-a="close">${t().done}</button>`;
    }
    if (this.phase === 'stopped') controls = `<button data-a="close">${t().close}</button>`;

    $app.innerHTML = `
      <div class="top">${mascot(true)}<div class="title"><strong>${esc(this.task.title[this.lang] ?? this.task.title.en)}</strong>
        <span>${guiding ? this.stepText() : ''}</span></div>
        ${this.phase === 'finished' || this.phase === 'stopped' ? '' : `<button class="danger" data-a="stop">${t().stop}</button>`}</div>
      ${this.warn ? `<div class="warn" role="alert"><strong>⚠️ ${t().safety}</strong><p>${esc(this.warn)}</p></div>` : ''}
      <section class="card" aria-live="polite">
        ${text}${picture}
        ${guiding && this.shot ? `<img class="shot" src="${this.shot.url}" alt="${esc(this.instruction())}">` : ''}
        ${this.offerLook ? `<div class="look"><p>${t().lookNote}</p>
          <div class="row"><button class="primary" data-a="lookYes">👀 ${t().lookYes}</button><button data-a="lookNo">${t().no}</button></div></div>` : ''}
        ${guiding || this.phase === 'finished' ? `<div class="progress" aria-hidden="true">${progress}</div>` : ''}
        ${this.reading ? `<p class="step">${t().reading}</p>` : ''}${thinking ? '<p class="step">…</p>' : ''}
      </section>
      ${guiding || this.phase === 'confirm' ? talkButton((s) => this.heard(s)) : ''}
      <div class="stack">${controls}</div>`;

    const act = {
      yes: () => this.answer(true), no: () => this.answer(false), repeat: () => this.repeat(), next: () => this.next(),
      lost: () => this.lost(), pause: () => this.togglePause(), stop: () => this.end(false),
      close: () => { current = null; home(); },
      float: async () => { drawCard({ text: this.line, step: this.stepText() }); await startFloating(); },
      wa: () => {},
      lookYes: () => this.lookWithClaude(true), lookNo: () => this.lookWithClaude(false),
      askFamily: () => this.log('family_call'),
    };
    $app.querySelectorAll('[data-a]').forEach((b) => { b.addEventListener('click', () => act[b.dataset.a]?.()); });
    const shot = document.getElementById('shot');
    if (shot) shot.onchange = () => this.screenshot(shot.files?.[0]);
    updateMascots();
  }
}

// ---------- Boot ----------
(async function boot() {
  try {
    library = await api('/library');
  } catch {
    $app.innerHTML = `${mascot()}<h1>Lola</h1><p class="center muted">Server not reachable. Start the backend and reload.</p>`;
    return;
  }
  if (settings.onboarded) home(); else onboarding(0);
})();
