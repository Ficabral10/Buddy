// "Let Lola look": when the on-device reader can't place a screenshot, the user can choose to
// send THAT ONE screenshot to Claude. Claude may only point at labels from the curated library
// (or say "go back"); code checks the reply before she hears it. The image is not stored.
import { baseLang, normalize } from './text.js';
import { callClaude, DEFAULT_MODEL } from './agent.js';
import { labelFor, instructionFor } from './library.js';

const MAX_IMAGE_BYTES = 1_500_000; // base64 of a downscaled JPEG

const TOOL = {
  name: 'screen_help',
  description: 'Say where the user is and what single thing to tap next.',
  input_schema: {
    type: 'object',
    properties: {
      screen: { type: 'string', description: 'The id of the library step whose screen this is, or "other".' },
      tap: { type: 'string', description: 'The exact label to tap next, copied from the list, or "BACK" to go back.' },
      say: { type: 'string', description: "One or two short sentences in the user's language naming the label in quotes and where it is on the screen." },
    },
    required: ['screen', 'tap', 'say'],
  },
};

const BACK = {
  es: 'Toca la flecha de atrás, arriba a la izquierda.',
  en: 'Tap the back arrow at the top left.',
};

export async function screenHelp(req, { library, apiKey, model = DEFAULT_MODEL, claude = callClaude, log = () => {} }) {
  const lang = baseLang(req.userLanguage) === 'es' ? 'es' : 'en';
  const task = library.tasks[req.taskId];
  const stepIndex = task?.steps.findIndex((s) => s.id === req.stepId) ?? -1;
  if (!task || stepIndex < 0) return { ok: false, error: 'unknown task or step' };
  const step = task.steps[stepIndex];
  const fallback = { ok: true, say: instructionFor(step, lang, req.phoneLanguage), target: labelFor(step, req.phoneLanguage).label, source: 'library' };

  const image = String(req.image ?? '');
  if (!apiKey) return { ...fallback, note: 'no-api-key' };
  if (!image || image.length > MAX_IMAGE_BYTES || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) {
    return { ...fallback, note: 'bad-image' };
  }

  // The only labels Claude may point at: this step and the ones after it.
  const allowed = task.steps.slice(stepIndex).map((s) => labelFor(s, req.phoneLanguage).label);
  const list = task.steps.map((s, i) => `- ${s.id}${i === stepIndex ? ' (CURRENT STEP)' : ''}: tap "${labelFor(s, req.phoneLanguage).label}"`).join('\n');

  try {
    const res = await claude({
      apiKey, model, tools: [TOOL],
      system: [
        'You help an older adult on their own iPhone. You see one screenshot. They do every tap.',
        `Task: ${task.title.en}. Steps, in order, with the exact on-screen labels:\n${list}`,
        `Say what single thing to tap next. "tap" must be one of: ${allowed.map((a) => `"${a}"`).join(', ')}, or "BACK" if they are on a screen that is not on the path.`,
        `Write "say" in ${lang === 'es' ? 'Spanish' : 'English'}, calm and short, describing where on the screen it is (top, middle, a few rows down).`,
        'Never mention or read out anything else visible on the screen (messages, names, numbers). Never ask for passwords or codes.',
        'Call screen_help exactly once.',
      ].join('\n'),
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: 'Where am I, and what do I tap next?' },
        ],
      }],
    });
    const v = (res.content ?? []).find((b) => b.type === 'tool_use' && b.name === 'screen_help')?.input;
    if (!v || typeof v.say !== 'string' || typeof v.tap !== 'string') return { ...fallback, guardrail: 'no-reply' };
    if (v.tap === 'BACK') return { ok: true, say: BACK[lang], back: true, source: 'claude' };
    const target = allowed.find((a) => normalize(a) === normalize(v.tap));
    if (!target) return { ...fallback, guardrail: 'label-not-in-library' };
    const say = v.say.trim().slice(0, 280);
    if (!normalize(say).includes(normalize(target))) return { ...fallback, target, guardrail: 'missing-exact-label' };
    const nextIndex = task.steps.findIndex((s, i) => i >= stepIndex && labelFor(s, req.phoneLanguage).label === target);
    return { ok: true, say, target, stepId: task.steps[nextIndex]?.id, source: 'claude' };
  } catch (err) {
    log(`vision: Claude failed: ${err.message}`);
    return { ...fallback, note: 'claude-error' };
  }
}
