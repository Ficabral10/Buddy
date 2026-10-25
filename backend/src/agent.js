// The agent: Claude chooses a task from the curated library, rewords steps in the user's
// language, and handles "I'm lost" and off-script questions. Guardrails make sure library
// steps keep their exact labels. When no library task fits, the request goes to a web search
// (websearch.js), and the app marks that answer "from the web".
import { appLang, baseLang, normalize, LANG_NAMES } from './text.js';
import { instructionFor, labelFor, taskCatalog } from './library.js';
import { screenUserText, replyMentionsSecrets, message } from './safety.js';
import { webAnswer } from './websearch.js';

export const DEFAULT_MODEL = 'claude-haiku-5-5';
const MAX_SAY_CHARS = 280;
const MAX_TURNS = 4;


const TOOLS = [
  {
    name: 'lookup_task',
    description: 'Search the curated task library. Returns the tasks this app supports. Only these tasks exist.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: "Short keywords from the user's problem" } },
      required: ['query'],
    },
  },
  {
    name: 'get_step',
    description: "Get one step of a task: the exact on-screen label (as the user's phone shows it), the library instruction, and where to look.",
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string' }, step_id: { type: 'string' } },
      required: ['task_id', 'step_id'],
    },
  },
  {
    name: 'respond',
    description: 'Send your final reply to the user. Always finish by calling this exactly once.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start_task', 'clarify', 'not_supported', 'reexplain', 'answer'],
          description:
            'start_task: the request matches a library task (say restates it in one sentence and asks to confirm). clarify: ask one short question. not_supported: no library task fits (the app then looks it up on the web). reexplain: re-explain the current step. answer: brief reply to a side question.',
        },
        task_id: { type: 'string', description: 'Required for start_task and reexplain.' },
        say: { type: 'string', description: "What the mascot says aloud, in the user's language. One or two short sentences." },
      },
      required: ['action', 'say'],
    },
  },
];

function systemPrompt(req) {
  const ul = LANG_NAMES[appLang(req.userLanguage)];
  const pl = LANG_NAMES[baseLang(req.phoneLanguage)] ?? 'English';
  return [
    `You are the voice of a warm, patient friend inside an iPhone app. You help older adults and people with limited English do things on their own phone. The person does every tap; you never do anything for them.`,
    `Speak ${ul} the way a kind neighbor sitting next to them would: everyday words, contractions, short sentences, a little warmth ("No problem", "Let's do it together"). Vary your wording; don't sound like a recording. Their phone's menus are in ${pl}: when you name a button or row, use the exact label from get_step, word for word, in quotes.`,
    `Rules:`,
    `- For phone tasks, check lookup_task first. Library steps are checked, so prefer them. Never describe library steps from memory. If no library task fits, use not_supported: the app will look it up on the web for them.`,
    `- One action per reply. Short, spoken-friendly sentences. No lists, no emoji, no markdown.`,
    `- Not a teacher or cheerleader: no lessons, quizzes, or gushing praise.`,
    `- Never ask for passwords, codes, card numbers, or personal details. Account recovery, banking, and security problems go to Apple or the bank.`,
    `- If someone else seems to be directing them, tell them to pause and offer to call a family member.`,
    `- Always finish by calling respond.`,
  ].join('\n');
}

function userTurn(req) {
  const parts = [`Event: ${req.event}`];
  if (req.text) parts.push(`User said: "${req.text}"`);
  if (req.taskId) parts.push(`Current task: ${req.taskId}`);
  if (req.stepId) parts.push(`Current step: ${req.stepId}`);
  if (req.screenTitle) parts.push(`The screen title the phone shows right now: "${req.screenTitle}"`);
  if (req.event === 'lost') parts.push('They are lost. Use get_step for the current step, then reexplain it differently: say where to look.');
  return parts.join('\n');
}

function runTool(name, input, library, req) {
  if (name === 'lookup_task') {
    return taskCatalog(library, req.userLanguage);
  }
  if (name === 'get_step') {
    const task = library.tasks[input.task_id];
    const step = task?.steps.find((s) => s.id === input.step_id);
    if (!step) return { error: 'No such task or step.' };
    const ul = baseLang(req.userLanguage);
    const { label, uncertain } = labelFor(step, req.phoneLanguage);
    return {
      exact_label: label,
      label_may_differ: uncertain,
      library_instruction: instructionFor(step, req.userLanguage, req.phoneLanguage),
      where_to_look: step.whereToLook[ul] ?? step.whereToLook.en,
      step_number: task.steps.indexOf(step) + 1,
      total_steps: task.steps.length,
    };
  }
  return { error: `Unknown tool ${name}` };
}

/** Calls the Anthropic Messages API. Injected so tests can replace it. */
export async function callClaude({ system, messages, tools, model, apiKey, maxTokens = 600, timeoutMs = 15000, fetchImpl = fetch }) {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, tools, messages }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ---------- Fallbacks (no network, no key, or a reply that fails the guardrails) ----------

function matchTaskByExamples(library, text) {
  const t = normalize(text);
  let best = null;
  for (const task of Object.values(library.tasks)) {
    const words = new Set(
      Object.values(task.exampleRequests).flat().flatMap((e) => normalize(e).split(' ')).filter((w) => w.length > 3),
    );
    const score = [...words].filter((w) => t.includes(w)).length;
    if (score >= 2 && (!best || score > best.score)) best = { task, score };
  }
  return best?.task ?? null;
}

export const CONFIRM = {
  en: (title) => `Sure, I can help with that. You'd like to: ${title.charAt(0).toLowerCase()}${title.slice(1)}. Is that right?`,
  es: (title) => `Claro, te ayudo con eso. Quieres: ${title.charAt(0).toLowerCase()}${title.slice(1)}. ¿Es así?`,
  ko: (title) => `네, 도와드릴게요. '${title}' 맞으세요?`,
  vi: (title) => `Được, tôi giúp bạn nhé. Bạn muốn: ${title.charAt(0).toLowerCase()}${title.slice(1)}, đúng không?`,
};
const NOT_SURE = {
  en: "Hmm, I'm not sure about that one yet. Would you like to call someone in your family?",
  es: 'Mmm, de eso todavía no estoy seguro. ¿Quieres llamar a alguien de tu familia?',
  ko: '음, 그건 아직 잘 모르겠어요. 가족에게 전화해 볼까요?',
  vi: 'Ừm, việc này tôi chưa chắc lắm. Bạn có muốn gọi cho người nhà không?',
};
const CLARIFY = {
  en: "Tell me a little more. Which app is it, and what's not working?",
  es: 'Cuéntame un poquito más. ¿Qué aplicación es y qué no funciona?',
  ko: '조금만 더 알려 주세요. 어떤 앱인데, 뭐가 안 되나요?',
  vi: 'Bạn kể thêm chút nhé. Đó là ứng dụng nào, và cái gì không chạy?',
};

function libraryReexplain(library, req) {
  const task = library.tasks[req.taskId];
  const step = task?.steps.find((s) => s.id === req.stepId);
  if (!step) return null;
  const ul = appLang(req.userLanguage);
  return `${instructionFor(step, req.userLanguage, req.phoneLanguage)} ${step.whereToLook[ul] ?? step.whereToLook.en}`;
}

export function fallbackReply(library, req) {
  const ul = appLang(req.userLanguage);
  if (req.event === 'lost' || req.event === 'question') {
    const say = libraryReexplain(library, req);
    if (say) return { action: 'reexplain', taskId: req.taskId, say, source: 'library' };
  }
  const task = matchTaskByExamples(library, req.text);
  if (task) {
    const title = task.title[ul] ?? task.title.en;
    return { action: 'start_task', taskId: task.id, say: (CONFIRM[ul] ?? CONFIRM.en)(title), source: 'library' };
  }
  if (!req.text || normalize(req.text).split(' ').length < 3) {
    return { action: 'clarify', say: CLARIFY[ul] ?? CLARIFY.en, source: 'library' };
  }
  return { action: 'not_supported', say: NOT_SURE[ul] ?? NOT_SURE.en, source: 'library' };
}

// ---------- Guardrails on Claude's reply ----------

export function checkReply(reply, library, req) {
  const say = String(reply.say ?? '').trim();
  const action = reply.action;
  const taskId = reply.task_id ?? req.taskId;
  if (!say) return { ok: false, reason: 'empty' };
  if (replyMentionsSecrets(say)) {
    return { ok: true, override: { action: 'answer', say: message('secretInReply', req.userLanguage), source: 'guardrail', guardrail: 'secrets' } };
  }
  if (say.length > MAX_SAY_CHARS) return { ok: false, reason: 'too-long' };
  if (action === 'start_task' && !library.tasks[taskId]) return { ok: false, reason: 'unknown-task' };
  if (action === 'reexplain') {
    const step = library.tasks[taskId]?.steps.find((s) => s.id === req.stepId);
    if (!step) return { ok: false, reason: 'unknown-step' };
    const { label } = labelFor(step, req.phoneLanguage);
    if (!normalize(say).includes(normalize(label))) return { ok: false, reason: 'missing-exact-label' };
  }
  return { ok: true };
}

export async function runAgent(req, opts) {
  const reply = await libraryAgent(req, opts);
  // No library task fits a new request: look it up on the web instead of giving up.
  if (reply.action === 'not_supported' && req.event === 'request') {
    const web = await (opts.web ?? webAnswer)(req, opts);
    if (web) return web;
  }
  return reply;
}

async function libraryAgent(req, { library, apiKey, model = DEFAULT_MODEL, claude = callClaude, log = () => {} }) {
  const pre = screenUserText(req.text, req.userLanguage);
  if (pre) return { action: 'safety', say: pre.say, source: 'guardrail', guardrail: pre.kind };
  if (!apiKey) return { ...fallbackReply(library, req), note: 'no-api-key' };

  const system = systemPrompt(req);
  const messages = [{ role: 'user', content: userTurn(req) }];
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await claude({ system, messages, tools: TOOLS, model, apiKey });
      const uses = (res.content ?? []).filter((b) => b.type === 'tool_use');
      const final = uses.find((u) => u.name === 'respond');
      if (final) {
        const verdict = checkReply(final.input, library, req);
        if (verdict.override) return verdict.override;
        if (!verdict.ok) {
          log(`guardrail rejected Claude reply: ${verdict.reason}`);
          return { ...fallbackReply(library, req), guardrail: verdict.reason };
        }
        return {
          action: final.input.action,
          taskId: final.input.task_id ?? req.taskId ?? null,
          say: final.input.say.trim(),
          source: 'claude',
        };
      }
      if (uses.length === 0) break; // plain text with no respond call: use the library instead
      messages.push({ role: 'assistant', content: res.content });
      messages.push({
        role: 'user',
        content: uses.map((u) => ({
          type: 'tool_result',
          tool_use_id: u.id,
          content: JSON.stringify(runTool(u.name, u.input ?? {}, library, req)),
        })),
      });
    }
  } catch (err) {
    log(`Claude call failed: ${err.message}`);
    return { ...fallbackReply(library, req), note: 'claude-error' };
  }
  return { ...fallbackReply(library, req), note: 'no-respond-call' };
}
