// Speaking (Cartesia through our backend, with the browser's voice as a fallback) and
// listening (the browser's speech recognition). iOS Safari only plays audio and opens the
// microphone after a tap, so the first tap anywhere calls unlockAudio().
import { localeFor } from './i18n.js';

// Device voices, best first: Apple's downloaded Premium/Enhanced voices sound far more natural
// than the default compact ones. People can add them in Settings > Accessibility > Spoken Content.
const QUALITY = [/premium/i, /enhanced|mejorad|향상|nâng cao/i, /siri/i, /google|natural|neural/i];
function bestVoice(locale) {
  const all = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
  const lang = locale.slice(0, 2);
  const exact = all.filter((v) => v.lang.replace('_', '-') === locale);
  const same = exact.length ? exact : all.filter((v) => v.lang.toLowerCase().startsWith(lang));
  if (!same.length) return null;
  const score = (v) => {
    const i = QUALITY.findIndex((re) => re.test(`${v.name} ${v.voiceURI}`));
    return (i < 0 ? QUALITY.length : i) * 2 + (v.localService ? 0 : 1);
  };
  return [...same].sort((a, b) => score(a) - score(b))[0];
}
// Some browsers load the voice list lazily; asking once early starts that.
if ('speechSynthesis' in window) speechSynthesis.getVoices();

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export class Speaker {
  constructor({ onChange = () => {} } = {}) {
    this.audio = new Audio();
    this.audio.setAttribute('playsinline', '');
    this.cache = new Map();
    this.speaking = false;
    this.gen = 0;
    this.source = 'none';
    this.onChange = onChange;
    this.unlocked = false;
    this.audio.addEventListener('ended', () => this.#set(false));
    this.audio.addEventListener('error', () => this.#set(false));
  }

  #set(v) {
    this.speaking = v;
    this.onChange(v);
  }

  /** Call from a tap handler once. */
  unlockAudio() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.audio.src = SILENT_WAV;
    this.audio.play().catch(() => {});
    if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  }

  stop() {
    this.gen++;
    this.audio.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.#set(false);
  }

  async say(text, lang) {
    this.stop();
    const gen = this.gen;
    this.#set(true);
    try {
      let url = this.cache.get(`${lang}|${text}`);
      if (!url) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch('/tts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, language: lang }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`tts ${res.status}`);
        url = URL.createObjectURL(await res.blob());
        this.cache.set(`${lang}|${text}`, url);
      }
      if (gen !== this.gen) return;
      this.audio.src = url;
      await this.audio.play();
      this.source = 'cartesia';
    } catch {
      if (gen !== this.gen) return;
      this.#fallback(text, lang);
    }
  }

  #fallback(text, lang) {
    if (!('speechSynthesis' in window)) return this.#set(false);
    this.source = 'browser';
    const u = new SpeechSynthesisUtterance(text);
    u.lang = localeFor(lang);
    const voice = bestVoice(u.lang);
    if (voice) u.voice = voice;
    // A touch slower than default, natural pitch: calmer without sounding drawn out.
    u.rate = 0.92;
    u.pitch = 1;
    u.onend = () => this.#set(false);
    u.onerror = () => this.#set(false);
    speechSynthesis.speak(u);
  }
}

export class Listener {
  constructor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = Boolean(SR);
    this.SR = SR;
    this.listening = false;
    this.rec = null;
  }

  /**
   * Start listening. onPartial(text) while speaking; onFinal(text) once at the end.
   * Calling stop() early sends whatever was heard.
   */
  start(lang, { onPartial = () => {}, onFinal = () => {}, onError = () => {}, onEnd = () => {} } = {}) {
    if (!this.supported) return onError('unsupported');
    this.stop(true);
    const rec = new this.SR();
    rec.lang = localeFor(lang);
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let heard = '';
    let sent = false;
    const finish = () => {
      if (sent) return;
      sent = true;
      if (heard.trim()) onFinal(heard.trim());
    };
    rec.onresult = (e) => {
      heard = Array.from(e.results).map((r) => r[0].transcript).join(' ');
      onPartial(heard);
      if (e.results[e.results.length - 1].isFinal) finish();
    };
    rec.onerror = (e) => onError(e.error);
    rec.onend = () => {
      this.listening = false;
      finish();
      onEnd();
    };
    this.rec = rec;
    this.listening = true;
    try {
      rec.start();
    } catch (err) {
      this.listening = false;
      onError(String(err));
    }
  }

  stop(silent = false) {
    if (!this.rec) return;
    try {
      if (silent) this.rec.abort();
      else this.rec.stop();
    } catch { /* already stopped */ }
    if (silent) this.rec = null;
  }
}
