// Input caps and safety checks shared by Convex functions. Plain JS for node --test.

export const LIMITS = {
  userText: 500,      // what the user said or typed
  speechText: 400,    // one spoken line
  locale: 20,
  taskId: 60,
  stepId: 60,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function checkSessionId(id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new Error('sessionId must be a UUID');
  return id.toLowerCase();
}

export function cap(value, max, name) {
  const s = String(value ?? '');
  if (s.length > max) throw new Error(`${name} is too long (max ${max})`);
  return s;
}

export function language(code) {
  const base = String(code ?? 'en').toLowerCase().split(/[-_]/)[0];
  return base === 'es' ? 'es' : 'en';
}

export function normalize(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Same intent as backend/src/safety.js: these never reach the model.
const SOMEONE_ELSE = ['someone called me', 'someone is telling me', 'the man on the phone', 'a stranger told me',
  'alguien me llamo', 'alguien me esta diciendo', 'el senor del telefono', 'me llamaron del banco', 'un desconocido me dijo'];
const OUT_OF_SCOPE = ['forgot my password', 'reset my apple id', 'locked out', 'transfer money', 'gift card',
  'olvide mi contrasena', 'cuenta bloqueada', 'transferir dinero', 'tarjeta de regalo'];

export function screen(text) {
  const t = ` ${normalize(text)} `;
  const hit = (list) => list.some((w) => t.includes(` ${w} `) || t.includes(` ${w}`));
  if (hit(SOMEONE_ELSE)) return 'someoneElse';
  if (hit(OUT_OF_SCOPE)) return 'outOfScope';
  return null;
}

export const REPLIES = {
  notSure: {
    en: "I'm not sure I can help with that one yet. Would you like to call a family member?",
    es: 'Todavía no estoy seguro de poder ayudarte con eso. ¿Quieres llamar a un familiar?',
  },
  someoneElse: {
    en: 'Careful: if someone else is telling you what to do on your phone, stop for a moment. Never share passwords or codes. Would you like to call a family member first?',
    es: 'Cuidado: si otra persona te está diciendo qué hacer en tu teléfono, detente un momento. Nunca compartas contraseñas ni códigos. ¿Quieres llamar primero a un familiar?',
  },
  outOfScope: {
    en: "That one is best handled by Apple or your bank directly. I can't help with passwords, accounts, or money. Would you like to call a family member?",
    es: 'Eso es mejor resolverlo directamente con Apple o con tu banco. No puedo ayudar con contraseñas, cuentas ni dinero. ¿Quieres llamar a un familiar?',
  },
};

const SECRETS = ['password', 'passcode', 'verification code', 'card number', 'cvv', 'contrasena', 'codigo de verificacion', 'numero de tarjeta'];

/**
 * Validates Claude's choice. The taskId must be one of the library's ids; the reply must be
 * short and must not mention secrets. Otherwise: "I'm not sure" + offer to call family.
 */
export function checkChoice(choice, validIds, lang) {
  const taskId = typeof choice?.taskId === 'string' ? choice.taskId : null;
  const reply = typeof choice?.reply === 'string' ? choice.reply.trim() : '';
  if (!taskId || taskId === 'none' || !validIds.includes(taskId)) {
    return { taskId: null, reply: REPLIES.notSure[lang], offerFamily: true, reason: taskId && taskId !== 'none' ? 'invalid-task' : 'no-match' };
  }
  const n = normalize(reply);
  if (!reply || reply.length > 240 || SECRETS.some((w) => n.includes(w))) {
    return { taskId, reply: null, offerFamily: false, reason: 'reply-replaced' };
  }
  return { taskId, reply, offerFamily: false, reason: null };
}

/** No API key or Claude down: pick a task by overlap with its example requests (or null). */
export function matchByExamples(catalog, text) {
  const t = normalize(text);
  let best = null;
  for (const task of catalog) {
    const words = new Set(Object.values(task.exampleRequests).flat()
      .flatMap((e) => normalize(e).split(' ')).filter((w) => w.length > 3));
    const score = [...words].filter((w) => t.includes(w)).length;
    if (score >= 2 && (!best || score > best.score)) best = { taskId: task.taskId, score };
  }
  return best?.taskId ?? null;
}

export function confirmLine(title, lang) {
  return lang === 'es'
    ? `Quieres: ${title.charAt(0).toLowerCase()}${title.slice(1)}. ¿Es así?`
    : `You want to: ${title}. Is that right?`;
}

/** The library line to speak: instruction in the user's language, label in the phone's language. */
export function lineFor(step, kind, userLanguage, phoneLanguage) {
  const ul = language(userLanguage);
  const pl = String(phoneLanguage ?? 'en').toLowerCase().split(/[-_]/)[0];
  const label = step.label[pl] ?? step.label.en;
  const map = kind === 'whereToLook' ? step.whereToLook : step.instruction;
  return String(map[ul] ?? map.en).replaceAll('{label}', label);
}
