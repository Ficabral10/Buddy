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

/** Fill {label} in a template. */
export function fill(template, label) {
  return String(template).replaceAll('{label}', label);
}
