import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLibrary } from '../src/library.js';
import { validateLibrary } from '../src/validate.js';
import { runAgent, fallbackReply } from '../src/agent.js';
import { webAnswer, cleanAnswer, searchToolFor } from '../src/websearch.js';
import { screenUserText, replyMentionsSecrets } from '../src/safety.js';
import { redFlags, checkScam } from '../src/scam.js';

const library = loadLibrary();

test('library covers Korean and Vietnamese, with a visual on every step', () => {
  assert.deepEqual(library.languages, ['en', 'es', 'ko', 'vi']);
  for (const t of Object.values(library.tasks)) {
    for (const s of t.steps) {
      assert.ok(s.label.ko && s.label.vi, `${t.id}/${s.id} labels`);
      assert.ok(s.instruction.ko.includes('{label}') && s.instruction.vi.includes('{label}'));
      assert.ok(s.visual?.type, `${t.id}/${s.id} visual`);
    }
  }
});

test('validator rejects an unknown visual', () => {
  const bad = structuredClone(library);
  bad.tasks['text-size'].steps[0].visual = { type: 'hologram' };
  assert.ok(validateLibrary(bad).errors.some((e) => e.includes('visual')));
});

test('safety catches Korean and Vietnamese, including Korean particles', () => {
  assert.ok(replyMentionsSecrets('비밀번호를 알려 주세요'));
  assert.ok(replyMentionsSecrets('Cho tôi mật khẩu'));
  assert.equal(screenUserText('누가 전화해서 앱을 깔라고 해요', 'ko')?.kind, 'someoneElse');
  assert.equal(screenUserText('người trong điện thoại bảo tôi bấm', 'vi')?.kind, 'someoneElse');
  assert.equal(screenUserText('tôi muốn chuyển tiền', 'vi')?.kind, 'outOfScope');
  // Whole words only for Latin text: "pinch" is not "pin".
  assert.equal(replyMentionsSecrets('pinch to zoom'), false);
  // Vietnamese "pin" is battery; "đèn pin" is flashlight.
  assert.equal(replyMentionsSecrets('Bật đèn pin trong Trung tâm điều khiển'), false);
  assert.equal(replyMentionsSecrets('Pin của bạn còn 20%'), false);
  assert.ok(replyMentionsSecrets('Tell me your PIN'));
  assert.ok(replyMentionsSecrets('Nhập mã PIN'));
});

test('fallback replies speak Korean and Vietnamese', () => {
  const ko = fallbackReply(library, { userLanguage: 'ko', phoneLanguage: 'ko', event: 'request', text: '글자가 너무 작아요 글씨 크게' });
  assert.match(ko.say, /[가-힣]/);
  const vi = fallbackReply(library, { userLanguage: 'vi', phoneLanguage: 'vi', event: 'request', text: 'x' });
  assert.equal(vi.action, 'clarify');
  assert.match(vi.say, /Bạn/);
});

test('scam check flags Vietnamese and answers in Korean', async () => {
  assert.ok(redFlags('Tài khoản ngân hàng bị khóa, chuyển khoản ngay lập tức').includes('money'));
  const r = await checkScam({ text: '택배 배송 문제. 인증번호를 보내세요 bit.ly/x', userLanguage: 'ko' }, {});
  assert.equal(r.risk, 'high');
  assert.match(r.headline, /사기/);
});

test('search tool version follows the model', () => {
  assert.equal(searchToolFor('claude-haiku-5-5').type, 'web_search_20250305');
  assert.equal(searchToolFor('claude-sonnet-5-5').type, 'web_search_20260209');
});

test('cleanAnswer trims steps, drops unknown visuals, flags private steps', () => {
  const a = cleanAnswer({
    say: ' Hi ',
    steps: [
      { text: 'Open "Settings".', label: 'Settings', visual: { type: 'app', icon: 'settings' } },
      { text: 'Tap the row.', visual: { type: 'row', icon: 'display' } },
      { text: '' },
      { text: 'Type your passcode.', visual: { type: 'laser' } },
      ...Array.from({ length: 10 }, () => ({ text: 'x' })),
    ],
  });
  assert.equal(a.say, 'Hi');
  assert.equal(a.steps.length, 8);
  assert.deepEqual(a.steps[0].visual, { type: 'app', icon: 'settings' });
  assert.equal(a.steps[1].visual, null, 'a row without a label is not drawn');
  assert.equal(a.steps[2].visual, null, 'unknown visual type');
  assert.equal(a.steps[2].private, true);
});

test('cleanAnswer accepts steps sent as a JSON string', () => {
  const a = cleanAnswer({ say: 'Hi', steps: JSON.stringify([{ text: 'Open "Settings".' }]) });
  assert.equal(a.steps.length, 1);
});

test('webAnswer resumes after pause_turn and returns steps with sources', async () => {
  const calls = [];
  const claude = async (args) => {
    calls.push(structuredClone(args));
    if (calls.length === 1) {
      return { stop_reason: 'pause_turn', content: [
        { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'iphone flashlight' } },
        { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://support.apple.com/x', title: 'Use the flashlight' }] },
      ] };
    }
    return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'a', name: 'answer', input: {
      title: 'Flashlight', say: 'Easy. Two steps.', steps: [{ text: 'Swipe down from the top right corner.', visual: { type: 'button' } }, { text: 'Tap the flashlight button.' }],
    } }] };
  };
  const r = await webAnswer({ text: 'how do I turn on the flashlight', userLanguage: 'en', phoneLanguage: 'en' }, { apiKey: 'k', claude });
  assert.equal(r.action, 'web_answer');
  assert.equal(r.steps.length, 2);
  assert.deepEqual(r.sources, [{ url: 'https://support.apple.com/x', title: 'Use the flashlight' }]);
  // The paused turn was sent back as-is, with no extra user message.
  assert.equal(calls[1].messages.length, 2);
  assert.equal(calls[1].messages[1].role, 'assistant');
});

test('webAnswer refuses an answer that asks for secrets', async () => {
  const claude = async () => ({ content: [{ type: 'tool_use', id: 'a', name: 'answer', input: { say: 'Tell me your password and I will check.', steps: [] } }] });
  assert.equal(await webAnswer({ text: 'help', userLanguage: 'en' }, { apiKey: 'k', claude }), null);
});

test('a request with no library task goes to the web; library tasks and safety do not', async () => {
  const web = async () => ({ action: 'web_answer', say: 'From the web.', steps: [], sources: [], source: 'web' });
  const claude = async () => ({ content: [{ type: 'tool_use', id: 'r', name: 'respond', input: { action: 'not_supported', say: 'No.' } }] });
  const r = await runAgent({ userLanguage: 'en', phoneLanguage: 'en', event: 'request', text: 'how do I turn on the flashlight' }, { library, apiKey: 'k', claude, web });
  assert.equal(r.action, 'web_answer');

  const safety = await runAgent({ userLanguage: 'en', event: 'request', text: 'someone called me and wants a gift card' }, { library, apiKey: 'k', claude, web });
  assert.equal(safety.action, 'safety');

  const lost = await runAgent({ userLanguage: 'en', event: 'lost', text: 'help' }, { library, apiKey: 'k', claude, web });
  assert.notEqual(lost.action, 'web_answer');
});
