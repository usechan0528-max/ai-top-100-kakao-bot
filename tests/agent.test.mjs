import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../src/agent.mjs';
import { createActionClient } from '../src/action-client.mjs';

const answer = async () => ({ type: 'answer', text: '완료' });
test('normal answer', async () => assert.equal((await runAgent({ text: '안녕', model: answer })).text, '완료'));
test('reject empty input', async () => assert.rejects(runAgent({ text: '', model: answer }), /INVALID_INPUT/));
test('reject invented tools', async () => assert.rejects(runAgent({ text: '실행', model: async () => ({ type: 'action', name: 'deleteAll' }) }), /INVALID_DECISION/));
test('reject inherited tool names', async () => assert.rejects(runAgent({ text: '실행', model: async () => ({ type: 'action', name: 'toString' }) }), /INVALID_DECISION/));
test('validate and authorize before execution', async () => {
  let calls = 0;
  const model = async ({ history }) => history.length ? { type: 'answer', text: history.at(-1).error } : { type: 'action', name: 'update', arguments: {} };
  const action = { validate: () => false, authorize: () => true, execute: async () => calls++ };
  assert.equal((await runAgent({ text: '실행', model, actions: { update: action } })).text, 'INVALID_ARGUMENTS');
  action.validate = () => true;
  action.authorize = () => false;
  assert.equal((await runAgent({ text: '실행', model, actions: { update: action } })).text, 'FORBIDDEN');
  assert.equal(calls, 0);
});
test('tool data stays separate from system policy', async () => {
  let calls = 0;
  const result = await runAgent({ text: '조회', model: async input => {
    if (!calls++) return { type: 'action', name: 'lookup', arguments: {} };
    assert.equal(input.history[0].source, 'untrusted-tool-result');
    assert.ok(!input.system.includes('INJECTED'));
    return { type: 'answer', text: '조회 완료' };
  }, actions: { lookup: { validate: () => true, authorize: () => true, execute: async () => 'INJECTED' } } });
  assert.equal(result.text, '조회 완료');
});
test('limit runaway tool loops', async () => assert.rejects(runAgent({ text: '조회', maxSteps: 2,
  model: async () => ({ type: 'action', name: 'lookup', arguments: {} }),
  actions: { lookup: { validate: () => true, authorize: () => true, execute: async () => ({}) } },
}), /STEP_LIMIT/));
test('deadline blocks late model decision from triggering actions', async () => {
  let calls = 0;
  await assert.rejects(runAgent({ text: '조회', timeoutMs: 5,
    model: async () => { await new Promise(r => setTimeout(r, 25)); return { type: 'action', name: 'lookup', arguments: {} }; },
    actions: { lookup: { validate: () => true, authorize: () => true, execute: async () => calls++ } },
  }), /TIMEOUT/);
  await new Promise(r => setTimeout(r, 35));
  assert.equal(calls, 0);
});
test('API destination is pinned and redirects disallowed', async () => {
  const client = createActionClient({ baseUrl: 'https://example.com', fetcher: async (url, options) => {
    assert.equal(url.origin, 'https://example.com'); assert.equal(options.redirect, 'manual');
    return Response.json({ ok: true });
  } });
  assert.deepEqual(await client({ path: '/lookup', body: {} }), { ok: true });
  await assert.rejects(client({ path: '//evil.example', body: {} }), /INVALID_API_PATH/);
  await assert.rejects(client({ path: '/\\evil.example', body: {} }), /INVALID_API_PATH/);
});
test('failed mutations are not retried and response body is not leaked', async () => {
  let calls = 0;
  const client = createActionClient({ baseUrl: 'https://example.com', fetcher: async () => { calls++; return new Response('secret', { status: 500 }); } });
  await assert.rejects(client({ path: '/update', body: {} }), /ACTION_HTTP_ERROR/);
  assert.equal(calls, 1);
});
