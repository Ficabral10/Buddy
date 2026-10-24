// Summarizes the app's privacy-safe usage log into docs/IMPACT.md.
// Usage: node scripts/summarize-usage.js path/to/usage-*.jsonl [more files...]
// The log holds only events (no screen content, no personal data). See docs/IMPACT.md.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseLines(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
}

export function summarize(events) {
  const sessions = new Map();
  for (const e of events) {
    if (!e.session) continue;
    const s = sessions.get(e.session) ?? {
      mode: 'helper', taskId: null, start: null, end: null, completed: false,
      hints: 0, lost: 0, wrongTurns: 0, familyCalls: 0,
    };
    switch (e.type) {
      case 'session_start': s.start = e.t; s.mode = e.mode ?? 'helper'; s.taskId = e.taskId ?? s.taskId; break;
      case 'hint': s.hints++; break;
      case 'lost': s.lost++; break;
      case 'wrong_turn': s.wrongTurns++; break;
      case 'family_call': s.familyCalls++; break;
      case 'session_end': s.end = e.t; s.completed = Boolean(e.completed); break;
      default: break;
    }
    sessions.set(e.session, s);
  }
  const byMode = {};
  for (const s of sessions.values()) {
    if (s.start == null || s.end == null) continue; // ignore unfinished sessions
    const m = (byMode[s.mode] ??= { n: 0, completed: 0, unaided: 0, durations: [], hints: 0, lost: 0, wrongTurns: 0 });
    m.n++;
    if (s.completed) {
      m.completed++;
      if (s.familyCalls === 0) m.unaided++;
      m.durations.push((s.end - s.start) / 1000);
    }
    m.hints += s.hints; m.lost += s.lost; m.wrongTurns += s.wrongTurns;
  }
  return byMode;
}

const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

export function renderMarkdown(byMode, { generatedAt = new Date().toISOString(), sources = [] } = {}) {
  const modes = Object.keys(byMode);
  const out = ['# Impact: measured results', '', `Generated ${generatedAt} by \`backend/scripts/summarize-usage.js\` from ${sources.length} log file(s).`, ''];
  if (!modes.length) {
    out.push('No completed sessions logged yet. Run the small test in docs/CUSTOMER.md, export the logs from the app, and run this script again.', '');
    out.push('Do not fill this file by hand. Report only what the logs show.');
    return out.join('\n');
  }
  out.push('| Mode | Sessions (n) | Finished | Finished without calling family | Median time to finish (s) | "I\'m lost" per session | Hints per session | Wrong turns per session |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const mode of modes) {
    const m = byMode[mode];
    const med = median(m.durations);
    const per = (x) => (m.n ? (x / m.n).toFixed(1) : '-');
    out.push(`| ${mode} | ${m.n} | ${m.completed}/${m.n} | ${m.unaided}/${m.n} | ${med == null ? '-' : med.toFixed(0)} | ${per(m.lost)} | ${per(m.hints)} | ${per(m.wrongTurns)} |`);
  }
  out.push('', `Small sample (${modes.map((k) => `${k}: n=${byMode[k].n}`).join(', ')}). These are observations from a hackathon test, not a study.`);
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  const events = files.flatMap((f) => parseLines(readFileSync(f, 'utf8')));
  const md = renderMarkdown(summarize(events), { sources: files });
  const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/IMPACT.md');
  writeFileSync(target, `${md}\n`);
  console.log(md);
  console.log(`\nWrote ${target}`);
}
