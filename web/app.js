// Lola web app: the no-Xcode version. Same library, same detector, same backend as the iOS app.
// The user does every tap; this page only decides what to say and when.
import { UI, PHRASES, familyMessage } from './i18n.js';
import { Speaker, Listener } from './voice.js';
import { readScreenshot, warmUp } from './ocr.js';
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
    <h2>${t().canHelp}</h2>
    <div class="list">${tasks.map((k) => `<button data-task="${k.id}">${esc(k.title[settings.lang] ?? k.title.en)}</button>`).join('')}</div>`;
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

  // ----- screenshot: read on the phone, then match against the library -----
  async screenshot(file) {
    if (!file) return;
    this.reading = true;
    this.render();
    let lines = [];
    try { lines = await readScreenshot(file, PHONE_LANG); } catch { /* fall through */ }
    this.reading = false;
    const result = detect({ task: this.task, currentStep: this.i, lines, phoneLanguage: PHONE_LANG });
    this.apply(result);
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
