import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { baseLang, fill } from './text.js';

export const LIBRARY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../library');

export function loadLibrary(dir = LIBRARY_DIR) {
  const index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const tasks = index.tasks.map((id) =>
    JSON.parse(readFileSync(path.join(dir, 'tasks', `${id}.json`), 'utf8')),
  );
  return { ...index, tasks: Object.fromEntries(tasks.map((t) => [t.id, t])) };
}

/**
 * Pick the label as the phone shows it. If the library has no labels for the phone's
 * language, fall back to English and flag it so the app can say so honestly.
 */
export function labelFor(step, phoneLanguage) {
  const lang = baseLang(phoneLanguage);
  if (step.label[lang]) return { label: step.label[lang], uncertain: false };
  return { label: step.label.en, uncertain: true };
}

/** Instruction in the user's language, naming the control in the phone's language. */
export function instructionFor(step, userLanguage, phoneLanguage) {
  const ul = baseLang(userLanguage);
  const template = step.instruction[ul] ?? step.instruction.en;
  return fill(template, labelFor(step, phoneLanguage).label);
}

export function taskCatalog(library, userLanguage) {
  const lang = baseLang(userLanguage);
  return Object.values(library.tasks).map((t) => ({
    id: t.id,
    title: t.title[lang] ?? t.title.en,
    description: t.description,
    examples: [...(t.exampleRequests.en ?? []), ...(t.exampleRequests[lang] ?? [])],
  }));
}
