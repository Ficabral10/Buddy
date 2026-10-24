// Plain JS so it runs both inside Convex and in `node --test` without a build step.
// Mirrors backend/src/validate.js for a single task. Convex validators check the shape;
// this checks the rules a shape can't express.

const LANGS = ['en', 'es'];
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const strList = (v) => Array.isArray(v) && v.length > 0 && v.every(isStr);

function perLang(errors, where, value, check = isStr) {
  if (!value || typeof value !== 'object') return errors.push(`${where}: missing`);
  for (const l of LANGS) if (!check(value[l])) errors.push(`${where}.${l}: missing or invalid`);
}

/** Returns a list of problems; empty means the task can be seeded. */
export function validateTask(task) {
  const errors = [];
  if (!task || typeof task !== 'object') return ['task: missing'];
  if (!/^[a-z0-9-]{3,60}$/.test(task.taskId ?? '')) errors.push('taskId: lowercase letters, digits and dashes, 3-60 chars');
  if (!Number.isInteger(task.version) || task.version < 1) errors.push('version: positive integer');
  perLang(errors, 'title', task.title);
  if (!isStr(task.description)) errors.push('description: required');
  perLang(errors, 'exampleRequests', task.exampleRequests, strList);
  if (!Array.isArray(task.steps) || task.steps.length === 0 || task.steps.length > 20) {
    errors.push('steps: 1 to 20 required');
    return errors;
  }
  const ids = new Set();
  task.steps.forEach((s, i) => {
    const w = `steps[${i}]`;
    if (!isStr(s.id)) errors.push(`${w}.id: required`);
    if (ids.has(s.id)) errors.push(`${w}.id: duplicate`);
    ids.add(s.id);
    perLang(errors, `${w}.label`, s.label);
    perLang(errors, `${w}.instruction`, s.instruction, (v) => isStr(v) && v.includes('{label}'));
    perLang(errors, `${w}.whereToLook`, s.whereToLook);
    perLang(errors, `${w}.arrival.title`, s.arrival?.title, strList);
    for (const k of ['anyOf', 'noneOf']) if (s.arrival?.[k] !== undefined) perLang(errors, `${w}.arrival.${k}`, s.arrival[k], strList);
    (s.wrongTurns ?? []).forEach((wt, j) => {
      if (!isStr(wt.id)) errors.push(`${w}.wrongTurns[${j}].id: required`);
      perLang(errors, `${w}.wrongTurns[${j}].title`, wt.title, strList);
      perLang(errors, `${w}.wrongTurns[${j}].hint`, wt.hint);
    });
    const h = s.hintTimingSec;
    if (!h || !(h.repeat > 0 && h.describe > h.repeat && h.picture > h.describe)) errors.push(`${w}.hintTimingSec: 0 < repeat < describe < picture`);
    const prev = task.steps[i - 1];
    if (prev && !s.confirmWithUser && JSON.stringify(prev.arrival?.title) === JSON.stringify(s.arrival?.title)) {
      errors.push(`${w}: same arrival title as previous step; set confirmWithUser`);
    }
  });
  return errors;
}

/** Converts a task file from library/tasks/*.json to the Convex document shape. */
export function fromLibraryFile(file) {
  return {
    taskId: file.id,
    version: file.taskVersion,
    title: file.title,
    description: file.description,
    exampleRequests: file.exampleRequests,
    finishAction: file.finishAction,
    labelsVerified: Boolean(file.labelsVerified?.en && file.labelsVerified?.es),
    steps: file.steps.map((s) => ({
      id: s.id,
      label: s.label,
      instruction: s.instruction,
      whereToLook: s.whereToLook,
      ...(s.referenceImage ? { referenceImage: s.referenceImage } : {}),
      arrival: s.arrival,
      wrongTurns: s.wrongTurns,
      hintTimingSec: s.hintTimingSec,
      confirmWithUser: s.confirmWithUser,
    })),
  };
}
