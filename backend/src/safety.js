// Deterministic guardrails. These run before and after Claude, so a bad model reply
// can never ask for a password or code, and sensitive requests go to official channels.
import { normalize, baseLang } from './text.js';

const SECRET_WORDS = [
  'password', 'passcode', 'verification code', 'security code', 'pin', 'card number', 'cvv', 'apple id password',
  'contrasena', 'codigo de verificacion', 'codigo de seguridad', 'numero de tarjeta', 'clave',
];

const OUT_OF_SCOPE = [
  // account recovery, banking, security-sensitive
  'forgot my password', 'reset my apple id', 'locked out', 'bank', 'transfer money', 'gift card',
  'olvide mi contrasena', 'cuenta bloqueada', 'banco', 'transferir dinero', 'tarjeta de regalo',
];

const SOMEONE_ELSE = [
  'someone called me', 'someone is telling me', 'the man on the phone', 'the person on the phone', 'a stranger told me',
  'alguien me llamo', 'alguien me esta diciendo', 'el senor del telefono', 'me llamaron del banco', 'un desconocido me dijo',
];

const has = (text, words) => {
  const t = ` ${normalize(text)} `;
  return words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t));
};

const MESSAGES = {
  outOfScope: {
    en: "That one is best handled by Apple or your bank directly. I can't help with passwords, accounts, or money. Would you like to call a family member?",
    es: 'Eso es mejor resolverlo directamente con Apple o con tu banco. No puedo ayudar con contraseñas, cuentas ni dinero. ¿Quieres llamar a un familiar?',
  },
  someoneElse: {
    en: "Careful: if someone else is telling you what to do on your phone, stop for a moment. Never share passwords or codes. Would you like to call a family member first?",
    es: 'Cuidado: si otra persona te está diciendo qué hacer en tu teléfono, detente un momento. Nunca compartas contraseñas ni códigos. ¿Quieres llamar primero a un familiar?',
  },
  secretInReply: {
    en: "I'll never ask for a password, code, or card number. Let's go back to the step on your screen.",
    es: 'Nunca te voy a pedir contraseñas, códigos ni números de tarjeta. Volvamos al paso en tu pantalla.',
  },
};

export function message(kind, userLanguage) {
  const m = MESSAGES[kind];
  return m[baseLang(userLanguage)] ?? m.en;
}

/** Check the user's words before calling Claude. Returns null or {kind, say}. */
export function screenUserText(text, userLanguage) {
  if (has(text, SOMEONE_ELSE)) return { kind: 'someoneElse', say: message('someoneElse', userLanguage) };
  if (has(text, OUT_OF_SCOPE)) return { kind: 'outOfScope', say: message('outOfScope', userLanguage) };
  return null;
}

/** True if a reply mentions secrets in a way that could read as asking for them. */
export function replyMentionsSecrets(text) {
  return has(text, SECRET_WORDS);
}
