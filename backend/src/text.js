// Text helpers shared by the validator, the agent guardrails and the reference detector.

/** Lowercase, strip accents, unify quotes and ampersands, collapse spaces. */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”«»]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Base language code: "es-US" -> "es". */
export function baseLang(code) {
  return String(code || 'en').toLowerCase().split(/[-_]/)[0];
}

/** Fill {label} in a template. Korean "을(를)" becomes the right particle when the label is Hangul. */
export function fill(template, label) {
  return String(template).replaceAll('{label}', label)
    .replace(/([가-힣])(을\(를\)|을|를)(?=\s|$|[.,!?])/g, (m, ch) => ch + ((ch.charCodeAt(0) - 0xac00) % 28 ? '을' : '를'));
}

/** Languages the app speaks. Anything else falls back to English. */
export const LANGS = ['en', 'es', 'ko', 'vi'];
export const LANG_NAMES = { en: 'English', es: 'Spanish', ko: 'Korean', vi: 'Vietnamese', zh: 'Mandarin Chinese' };

/** "ko-KR" -> "ko"; unsupported -> "en". */
export function appLang(code) {
  const l = baseLang(code);
  return LANGS.includes(l) ? l : 'en';
}
