// Validates the task library against library/SCHEMA.md. Returns { errors, warnings }.

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

function perLang(errors, where, value, langs, check = isStr) {
  if (!isObj(value)) return errors.push(`${where}: must be a per-language object`);
  for (const l of langs) {
    if (!(l in value)) errors.push(`${where}: missing language "${l}"`);
    else if (!check(value[l])) errors.push(`${where}.${l}: invalid value`);
  }
}

const strList = (v) => Array.isArray(v) && v.length > 0 && v.every(isStr);

function signature(errors, where, sig, langs) {
  if (!isObj(sig)) return errors.push(`${where}: missing signature`);
  perLang(errors, `${where}.title`, sig.title, langs, strList);
  for (const key of ['anyOf', 'noneOf']) {
    if (sig[key] !== undefined) perLang(errors, `${where}.${key}`, sig[key], langs, strList);
  }
}

export function validateLibrary(library) {
  const errors = [];
  const warnings = [];
  if (library.schemaVersion !== 1) errors.push('index: schemaVersion must be 1');
  if (!isStr(library.libraryVersion)) errors.push('index: libraryVersion required');
  const langs = library.languages;
  if (!strList(langs) || !langs.includes('en')) errors.push('index: languages must include "en"');

  for (const [id, t] of Object.entries(library.tasks)) {
    const w = `task ${id}`;
    if (t.id !== id) errors.push(`${w}: id does not match file name`);
    if (!Number.isInteger(t.taskVersion)) errors.push(`${w}: taskVersion must be an integer`);
    perLang(errors, `${w}.title`, t.title, langs);
    if (!isStr(t.description)) errors.push(`${w}: description required`);
    perLang(errors, `${w}.exampleRequests`, t.exampleRequests, langs, strList);
    if (!isObj(t.iosVersions) || !isStr(t.iosVersions.min) || !isStr(t.iosVersions.max)) {
      errors.push(`${w}: iosVersions {min,max} required`);
    }
    if (!['none', 'tell-family'].includes(t.finishAction)) errors.push(`${w}: finishAction invalid`);
    for (const l of langs) {
      if (t.labelsVerified?.[l] !== true) warnings.push(`${w}: labels not yet verified on a device for "${l}"`);
    }
    if (!Array.isArray(t.steps) || t.steps.length === 0) {
      errors.push(`${w}: steps required`);
      continue;
    }
    const ids = new Set();
    t.steps.forEach((s, i) => {
      const sw = `${w}.steps[${i}]${s.id ? ` (${s.id})` : ''}`;
      if (!isStr(s.id)) errors.push(`${sw}: id required`);
      if (ids.has(s.id)) errors.push(`${sw}: duplicate id`);
      ids.add(s.id);
      perLang(errors, `${sw}.label`, s.label, langs);
      perLang(errors, `${sw}.instruction`, s.instruction, langs, (v) => isStr(v) && v.includes('{label}'));
      perLang(errors, `${sw}.whereToLook`, s.whereToLook, langs);
      if (!isStr(s.referenceImage)) warnings.push(`${sw}: no referenceImage (third hint level will be skipped)`);
      signature(errors, `${sw}.arrival`, s.arrival, langs);
      if (!Array.isArray(s.wrongTurns)) errors.push(`${sw}: wrongTurns must be an array`);
      else s.wrongTurns.forEach((wt, j) => {
        const ww = `${sw}.wrongTurns[${j}]`;
        if (!isStr(wt.id)) errors.push(`${ww}: id required`);
        perLang(errors, `${ww}.title`, wt.title, langs, strList);
        perLang(errors, `${ww}.hint`, wt.hint, langs);
      });
      const h = s.hintTimingSec;
      if (!isObj(h) || !(h.repeat > 0 && h.describe > h.repeat && h.picture > h.describe)) {
        errors.push(`${sw}: hintTimingSec must have 0 < repeat < describe < picture`);
      }
      if (typeof s.confirmWithUser !== 'boolean') errors.push(`${sw}: confirmWithUser must be boolean`);
      // Consecutive auto-advancing steps that end on the same screen title would make the
      // detector jump past the earlier one (furthest match wins).
      const prev = t.steps[i - 1];
      if (prev && !s.confirmWithUser && JSON.stringify(prev.arrival?.title) === JSON.stringify(s.arrival?.title)) {
        errors.push(`${sw}: same arrival title as previous step; set confirmWithUser: true`);
      }
    });
  }
  return { errors, warnings };
}
