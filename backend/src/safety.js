// Deterministic guardrails. These run before and after Claude, so a bad model reply
// can never ask for a password or code, and sensitive requests go to official channels.
import { normalize, baseLang } from './text.js';

const SECRET_WORDS = [
  // Not a bare "pin": in Vietnamese "pin" is battery and "đèn pin" is flashlight.
  'password', 'passcode', 'verification code', 'security code', 'pin code', 'pin number', 'your pin', 'sim pin', 'card number', 'cvv', 'apple id password',
  'contrasena', 'codigo de verificacion', 'codigo de seguridad', 'numero de tarjeta', 'clave',
  '비밀번호', '인증번호', '보안 코드', '카드 번호', '암호', 'mat khau', 'ma xac minh', 'ma bao mat', 'so the', 'ma pin', 'ma otp',
];

const OUT_OF_SCOPE = [
  // account recovery, banking, security-sensitive
  'forgot my password', 'reset my apple id', 'locked out', 'bank', 'transfer money', 'gift card',
  'olvide mi contrasena', 'cuenta bloqueada', 'banco', 'transferir dinero', 'tarjeta de regalo',
  '비밀번호를 잊어', '계정이 잠겼', '은행', '송금', '돈을 보내', '기프트카드',
  'quen mat khau', 'tai khoan bi khoa', 'ngan hang', 'chuyen tien', 'the qua tang',
];

const SOMEONE_ELSE = [
  'someone called me', 'someone is telling me', 'the man on the phone', 'the person on the phone', 'a stranger told me',
  'alguien me llamo', 'alguien me esta diciendo', 'el senor del telefono', 'me llamaron del banco', 'un desconocido me dijo',
  '누가 전화해서', '전화한 사람이', '모르는 사람이', '시키는 대로',
  'co nguoi goi', 'nguoi la bao toi', 'nguoi trong dien thoai', 'ho bao toi lam',
];

const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;

// Whole-word match for Latin scripts. Korean attaches particles to words ("비밀번호를"), so
// Hangul phrases match as substrings. Both sides go through normalize(), so this compares
// like with like (Hangul syllables become jamo there).
// Vietnamese đ has no combining mark, so normalize() keeps it; fold it here so "điện" matches "dien".
const fold = (s) => normalize(s).replace(/đ/g, 'd');
const has = (text, words) => {
  const t = fold(text);
  return words.some((w) => {
    const n = fold(w);
    if (HANGUL.test(w)) return t.includes(n);
    return new RegExp(`(?<![\\p{L}\\p{N}])${escape(n)}(?![\\p{L}\\p{N}])`, 'u').test(t);
  });
};

const MESSAGES = {
  outOfScope: {
    en: "That one is best handled by Apple or your bank directly. I can't help with passwords, accounts, or money. Would you like to call a family member?",
    es: 'Eso es mejor resolverlo directamente con Apple o con tu banco. No puedo ayudar con contraseñas, cuentas ni dinero. ¿Quieres llamar a un familiar?',
    ko: '그건 Apple이나 은행에 직접 문의하는 게 가장 안전해요. 비밀번호, 계정, 돈 문제는 제가 도와드릴 수 없어요. 가족에게 전화해 볼까요?',
    vi: 'Việc này tốt nhất nên hỏi thẳng Apple hoặc ngân hàng của bạn. Tôi không giúp được về mật khẩu, tài khoản hay tiền bạc. Bạn có muốn gọi cho người nhà không?',
  },
  someoneElse: {
    en: "Careful: if someone else is telling you what to do on your phone, stop for a moment. Never share passwords or codes. Would you like to call a family member first?",
    es: 'Cuidado: si otra persona te está diciendo qué hacer en tu teléfono, detente un momento. Nunca compartas contraseñas ni códigos. ¿Quieres llamar primero a un familiar?',
    ko: '잠깐만요. 다른 사람이 휴대폰에서 뭘 하라고 시키고 있다면 잠시 멈추세요. 비밀번호나 코드는 절대 알려 주지 마세요. 먼저 가족에게 전화해 볼까요?',
    vi: 'Khoan đã. Nếu có người khác đang bảo bạn làm gì trên điện thoại, hãy dừng lại một chút. Đừng bao giờ đưa mật khẩu hay mã số. Bạn có muốn gọi cho người nhà trước không?',
  },
  secretInReply: {
    en: "I'll never ask for a password, code, or card number. Let's go back to the step on your screen.",
    es: 'Nunca te voy a pedir contraseñas, códigos ni números de tarjeta. Volvamos al paso en tu pantalla.',
    ko: '저는 비밀번호, 코드, 카드 번호를 절대 묻지 않아요. 화면의 단계로 돌아가요.',
    vi: 'Tôi sẽ không bao giờ hỏi mật khẩu, mã số hay số thẻ. Mình quay lại bước trên màn hình nhé.',
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
