// Reference implementation of the step detector. The iOS app runs the Swift port
// (ios/Packages/BuddyCore/Sources/BuddyCore/StepDetector.swift); both are tested against
// the same fixtures in /fixtures/screens so they cannot drift apart silently.
//
// Input lines come from on-device text recognition: { text, box: {x, y, w, h} } with
// normalized coordinates and a TOP-LEFT origin (y = 0 is the top of the screen).
import { normalize, baseLang } from './text.js';

export const TITLE_REGION_MAX_Y = 0.3;

const clean = (s) => normalize(s).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

function langOf(map, phoneLanguage) {
  const l = baseLang(phoneLanguage);
  return map?.[l] ?? map?.en ?? [];
}

// The back button also shows a title (the previous screen's), at the top left in normal-size
// text. A real title is either centered (inline navigation title) or large (large title).
// These thresholds are guesses until the spike measures real frames (docs/SPIKE_PLAN.md).
export const CENTER_TOLERANCE = 0.15;
export const LARGE_TITLE_MIN_H = 0.03;
export const TITLE_MIN_H = 0.018; // home-screen icon captions are smaller than this

export function isTitleLine(ln) {
  if (ln.box.y >= TITLE_REGION_MAX_Y || ln.box.h < TITLE_MIN_H) return false;
  const centered = Math.abs(ln.box.x + ln.box.w / 2 - 0.5) < CENTER_TOLERANCE;
  return centered || ln.box.h >= LARGE_TITLE_MIN_H;
}

function titleMatches(titles, lines) {
  const wanted = titles.map(clean);
  return lines.some((ln) => isTitleLine(ln) && wanted.includes(clean(ln.text)));
}

function anyContains(words, all) {
  return words.some((w) => all.includes(normalize(w)));
}

/** 'full' | 'title-only' | 'no' */
export function matchSignature(sig, lines, phoneLanguage) {
  if (!titleMatches(langOf(sig.title, phoneLanguage), lines)) return 'no';
  const all = lines.map((l) => normalize(l.text)).join(' \n ');
  const noneOf = langOf(sig.noneOf, phoneLanguage);
  if (noneOf.length && anyContains(noneOf, all)) return 'no';
  const anyOf = langOf(sig.anyOf, phoneLanguage);
  if (anyOf.length && !anyContains(anyOf, all)) return 'title-only';
  return 'full';
}

/**
 * Decide what the screen means for the current step.
 *  advance   -> step `matchedStep` is done; move to `nextStep`
 *  confirm   -> current step needs the user's confirmation (e.g. a check mark OCR can't read)
 *  behind    -> the user went back; rewind to `nextStep`
 *  wrongTurn -> a known wrong screen; say `wrongTurnId`'s hint
 *  unsure    -> title matches but the rest doesn't; ask the user
 *  none      -> nothing recognized; keep waiting
 */
export function detect({ task, currentStep, lines, phoneLanguage }) {
  const steps = task.steps;
  const usable = lines.filter((l) => l && typeof l.text === 'string' && l.box);

  // Forward: the furthest completed step wins (a screen's back button shows the previous title).
  for (let j = steps.length - 1; j >= currentStep; j--) {
    if (steps[j].confirmWithUser && j !== currentStep) continue;
    if (matchSignature(steps[j].arrival, usable, phoneLanguage) === 'full') {
      if (steps[j].confirmWithUser) return { kind: 'confirm', stepIndex: j };
      return { kind: 'advance', matchedStep: j, nextStep: j + 1 };
    }
  }
  // Behind: the user is on an earlier screen.
  for (let j = currentStep - 1; j >= 0; j--) {
    if (steps[j].confirmWithUser) continue;
    if (matchSignature(steps[j].arrival, usable, phoneLanguage) === 'full') {
      return j + 1 === currentStep ? { kind: 'none', reason: 'on-expected-screen' } : { kind: 'behind', nextStep: j + 1 };
    }
  }
  const cur = steps[currentStep];
  for (const wt of cur?.wrongTurns ?? []) {
    if (titleMatches(langOf(wt.title, phoneLanguage), usable)) return { kind: 'wrongTurn', wrongTurnId: wt.id };
  }
  if (cur && matchSignature(cur.arrival, usable, phoneLanguage) === 'title-only') {
    return { kind: 'unsure', stepIndex: currentStep };
  }
  return { kind: 'none' };
}
