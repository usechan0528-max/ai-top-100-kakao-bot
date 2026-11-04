import test from 'node:test';
import assert from 'node:assert/strict';
import { sendCallback } from '../src/worker.mjs';

// Network-free checks of the actual serialized Kakao boundary, not a helper copy.
async function delivered(text, env = {}, token = 'test-callback-token') {
  const requests = [];
  await sendCallback(token, text, { BOT_TOKEN: 'test-bot-secret', ...env }, async (url, init) => {
    requests.push({ url, init, body: JSON.parse(init.body) });
    return Response.json({ errorCount: 0 });
  });
  assert.equal(requests.length, 1, 'a long answer must not create multiple bubbles');
  const { body } = requests[0];
  assert.equal(body.skillResponse.version, '2.0');
  const outputs = body.skillResponse.template.outputs;
  assert.equal(outputs.length, 1);
  assert.deepEqual(Object.keys(outputs[0]), ['simpleText']);
  assert.deepEqual(Object.keys(outputs[0].simpleText), ['text']);
  const result = outputs[0].simpleText.text;
  assert.equal(typeof result, 'string');
  assert.ok(result.length <= 500, `final body has ${result.length} UTF-16 units`);
  return result;
}

for (const length of [499, 500, 501]) {
  test(`final callback enforces ${length}-unit boundary with one SimpleText`, async () => {
    const input = '가'.repeat(length);
    const result = await delivered(input);
    if (length <= 500) assert.equal(result, input);
    else assert.ok(result.length < input.length);
  });
}

test('final callback counts spaces and line breaks', async () => {
  const input = '가 \n'.repeat(166) + '끝!';
  assert.equal(input.length, 500);
  assert.equal(await delivered(input), input);
  await delivered(input + '\n');
});

test('redaction expansion is bounded after filtering, not before it', async () => {
  const input = '가'.repeat(491) + ' Bearer x';
  assert.equal(input.length, 500);
  const result = await delivered(input);
  assert.ok(!result.includes('Bearer x'));
  assert.ok(result.startsWith('가'.repeat(491)));
});

for (const cluster of ['😀', '👨‍👩‍👧‍👦', '가', 'e\u0301']) {
  test(`final callback never splits grapheme ${cluster}`, async () => {
    const input = '가'.repeat(498) + cluster + '나'.repeat(12);
    const result = await delivered(input);
    const prefix = result.endsWith('…') ? result.slice(0, -1) : result;
    const boundaries = new Set([0]);
    for (const part of new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(input)) {
      boundaries.add(part.index + part.segment.length);
    }
    assert.equal(input.slice(0, prefix.length), prefix);
    assert.ok(boundaries.has(prefix.length), 'cut must be at a grapheme boundary');
    assert.ok(result.isWellFormed());
  });
}

test('final callback removes every configured secret and callback token', async () => {
  const env = { OPENAI_API_KEY: 'fake-api-secret', BOT_TOKEN: 'fake-bot-secret', WEBHOOK_SECRET: 'fake-webhook-secret' };
  const token = 'fake-callback-secret';
  const secrets = [...Object.values(env), token];
  const result = await delivered(secrets.join(' / '), env, token);
  for (const secret of secrets) assert.ok(!result.includes(secret));
  assert.ok(result.includes('삭제'));
});

test('fixed error and clarification messages use the same final contract', async () => {
  for (const input of ['처리 결과를 확인하지 못했습니다. 다시 실행하기 전에 상태 확인이 필요합니다.', '주문번호를 알려주세요.', '요청이 많습니다. 잠시 후 다시 보내 주세요.']) {
    assert.equal(await delivered(input), input);
  }
});
