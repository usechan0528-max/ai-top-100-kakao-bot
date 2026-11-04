import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentError, runAgent, userMessageFor } from '../src/agent.mjs';
import { createActionClient } from '../src/action-client.mjs';

const answer = text => ({ type: 'answer', text });
const call = (name = 'work', args = {}) => ({ type: 'action', name, arguments: args });
const action = overrides => ({ kind: 'read', validate: () => true, authorize: () => true, execute: async () => ({ ok: true }), ...overrides });
const never = () => new Promise(() => {});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function scenario(steps, actions, options = {}) {
  let index = 0;
  const seen = [];
  const result = await runAgent({ text: '검증', actions, ...options, model: async input => {
    seen.push(input);
    return steps[index++] ?? answer('완료');
  } });
  return { result, seen };
}

for (const stage of ['validate', 'authorize']) {
  for (const [label, fn] of [
    ['async false', async () => false], ['object', () => ({})], ['string', () => 'yes'],
    ['async number', async () => 1], ['throw', () => { throw new Error('secret'); }],
    ['async throw', async () => { throw new Error('secret'); }], ['missing', undefined],
  ]) {
    test(`V-001 ${stage}: ${label} never executes`, async () => {
      let calls = 0;
      const { seen } = await scenario([call()], { work: action({ [stage]: fn, execute: async () => calls++ }) });
      assert.equal(calls, 0);
      assert.equal(seen[1].history[0].error, stage === 'validate' ? 'INVALID_ARGUMENTS' : 'FORBIDDEN');
      assert.ok(!JSON.stringify(seen[1].history).includes('secret'));
    });
  }
}
test('V-001 async true validation and authorization execute once', async () => {
  let calls = 0;
  await scenario([call()], { work: action({ validate: async () => true, authorize: async () => true, execute: async () => calls++ }) });
  assert.equal(calls, 1);
});
test('V-006 forged identity cannot replace trusted context', async () => {
  let calls = 0, identity;
  const context = { userId: 'me', channelId: 'channel', eventId: 'event' };
  const { seen } = await scenario([call('work', { userId: 'other' })], { work: action({
    validate: (_, ctx) => { identity = ctx; return true; },
    authorize: (args, ctx) => { assert.equal(ctx, identity); return args.userId === ctx.userId; },
    execute: async () => calls++,
  }) }, { context });
  assert.equal(calls, 0);
  assert.equal(seen[1].history[0].error, 'FORBIDDEN');
  assert.ok(!JSON.stringify(seen.map(({ signal, ...input }) => input)).includes('channelId'));
  assert.notEqual(identity, context);
  assert.ok(Object.isFrozen(identity));
});
test('V-006 immutable context and argument snapshot reach execution', async () => {
  let validated, authorized, executed;
  const original = { nested: { id: 1 } };
  await scenario([call('work', original)], { work: action({
    validate: (args, context) => { validated = context; assert.ok(Object.isFrozen(args.nested)); return true; },
    authorize: async (args, context) => { authorized = context; original.nested.id = 9; await Promise.resolve(); return true; },
    execute: async (args, { context }) => {
      executed = context;
      assert.equal(args.nested.id, 1);
      assert.throws(() => { context.userId = 'other'; }, TypeError);
      return {};
    },
  }) }, { context: { userId: 'me' } });
  assert.equal(validated, authorized); assert.equal(authorized, executed);
});
for (const [label, context] of [
  ['nested', { user: {} }], ['function', { user() {} }], ['array', []], ['array value', { ids: [] }],
  ['null', null], ['nonfinite', { id: Infinity }], ['long string', { userId: 'x'.repeat(201) }],
  ['too many keys', Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i]))],
  ['getter', Object.defineProperty({}, 'id', { enumerable: true, get() { throw new Error('must not run'); } })],
  ['symbol', { [Symbol('id')]: 'x' }],
]) {
  test(`V-006 invalid context ${label} blocks model`, async () => {
    let calls = 0;
    await assert.rejects(runAgent({ text: 'x', context, model: async () => { calls++; return answer('ok'); } }), /INVALID_CONTEXT/);
    assert.equal(calls, 0);
  });
}
test('V-003 repeated denial reauthorizes every time and reaches STEP_LIMIT', async () => {
  let checks = 0, executes = 0;
  await assert.rejects(runAgent({ text: 'x', maxSteps: 3, model: async () => call(), actions: { work: action({
    authorize: () => { checks++; return false; }, execute: async () => executes++,
  }) } }), /STEP_LIMIT/);
  assert.equal(checks, 3); assert.equal(executes, 0);
});
for (const text of ['가'.repeat(1200), '가'.repeat(499) + '😀😀', '가'.repeat(498) + 'e\u0301e\u0301', '가'.repeat(490) + '👨‍👩‍👧‍👦'.repeat(4)]) {
  test(`V-003 long answer preserves grapheme boundary (${text.length} units)`, async () => {
    const { result } = await scenario([answer(text)], {});
    assert.ok(result.text.length <= 500);
    assert.ok(result.text.endsWith('…'));
    assert.ok(result.text.isWellFormed());
    const prefix = result.text.slice(0, -1);
    const boundaries = new Set([0]);
    let length = 0;
    for (const part of new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text)) { length += part.segment.length; boundaries.add(length); }
    assert.ok(boundaries.has(prefix.length));
  });
}
for (const text of ['', '   ', 123]) {
  test(`V-003 invalid answer ${JSON.stringify(text)}`, async () => assert.rejects(scenario([answer(text)], {}), /INVALID_DECISION/));
}
test('V-003 model exception is normalized and guidance never leaks arbitrary text', async () => {
  let captured;
  await assert.rejects(runAgent({ text: 'x', model: async () => { throw new Error('FAKE-SECRET-MARKER-123'); } }), error => {
    captured = error; return error.code === 'MODEL_ERROR';
  });
  assert.ok(!JSON.stringify(captured).includes('FAKE-SECRET'));
  for (const error of [captured, new Error('secret-key-123'), new AgentError('secret-key-123'), null]) {
    assert.ok(!userMessageFor(error).includes('secret'));
  }
});
test('V-002 canonical duplicate writes execute once; different arguments remain allowed', async () => {
  let calls = 0;
  const { result, seen } = await scenario([
    call('work', { a: 1, nested: { x: 2, y: 3 } }),
    call('work', { nested: { y: 3, x: 2 }, a: 1 }), call('work', { a: 2 }),
  ], { work: action({ kind: 'write', execute: async () => ++calls }) });
  assert.equal(calls, 2);
  assert.equal(seen[2].history.at(-1).error, 'DUPLICATE_WRITE');
  assert.deepEqual(result.writes.map(write => write.outcome), ['success', 'success']);
});
for (const kind of ['write', undefined, 'invalid']) {
  test(`V-004 uncertain ${String(kind)} locks all writes but permits reads`, async () => {
    let calls = 0, otherWrites = 0, reads = 0;
    const { result, seen } = await scenario([call(), call(), call('other'), call('lookup'), answer('완벽히 성공했습니다')], {
      work: action({ kind, execute: async () => { calls++; throw new Error('secret network error'); } }),
      other: action({ kind: 'write', execute: async () => otherWrites++ }),
      lookup: action({ execute: async () => { reads++; return { state: 'pending' }; } }),
    });
    assert.equal(calls, 1); assert.equal(otherWrites, 0); assert.equal(reads, 1);
    assert.deepEqual(seen[4].history.slice(0, 3).map(item => item.error), ['WRITE_OUTCOME_UNKNOWN', 'WRITE_LOCKED', 'WRITE_LOCKED']);
    assert.equal(result.outcomeUnknown, true);
    assert.ok(result.text.includes('상태를 확인')); assert.ok(!result.text.includes('완벽히'));
    assert.ok(!JSON.stringify(seen[4].history).includes('secret'));
  });
}
test('V-004 explicit not-executed does not lock other writes; duplicate attempt still blocked', async () => {
  let calls = 0, other = 0;
  const { result, seen } = await scenario([call(), call(), call('other')], {
    work: action({ kind: 'write', execute: async () => { calls++; throw new AgentError('ACTION_NOT_EXECUTED'); } }),
    other: action({ kind: 'write', execute: async () => ++other }),
  });
  assert.equal(calls, 1); assert.equal(other, 1); assert.equal(result.outcomeUnknown, false);
  assert.equal(seen[1].history.at(-1).error, 'WRITE_REJECTED');
  assert.equal(seen[2].history.at(-1).error, 'DUPLICATE_WRITE');
});
test('V-004 HTTP status alone never proves a write was not executed', async () => {
  const { result } = await scenario([call()], { work: action({ kind: 'write', execute: async () => {
    const error = new AgentError('ACTION_HTTP_ERROR'); error.status = 400; throw error;
  } }) });
  assert.equal(result.outcomeUnknown, true);
});
for (const [label, options, overrides, expected] of [
  ['model', {}, {}, 'TIMEOUT'],
  ['read', {}, { execute: never }, 'TIMEOUT'],
  ['write', { minWriteBudgetMs: 0 }, { kind: 'write', execute: never }, 'TIMEOUT_DURING_WRITE'],
  ['write result selection', { minWriteBudgetMs: 0 }, { kind: 'write', execute: async () => ({}), pick: never }, 'TIMEOUT_DURING_WRITE'],
]) {
  test(`V-004 deadline during ${label}`, async () => {
    const model = label === 'model' ? never : async () => call();
    await assert.rejects(runAgent({ text: 'x', model, timeoutMs: 40, ...options, actions: { work: action(overrides) } }), error => {
      assert.equal(error.code, expected);
      assert.equal(error.outcomeUnknown, expected === 'TIMEOUT_DURING_WRITE');
      if (error.outcomeUnknown) assert.ok(userMessageFor(error).includes('상태를 확인'));
      return true;
    });
  });
}
test('V-004 insufficient time blocks before write execution', async () => {
  let calls = 0;
  const { result, seen } = await scenario([call()], { work: action({ kind: 'write', execute: async () => calls++ }) }, { timeoutMs: 1000 });
  assert.equal(calls, 0); assert.equal(result.outcomeUnknown, false);
  assert.equal(seen[1].history[0].error, 'INSUFFICIENT_TIME');
});
test('V-004 timed-out writes may finish; no later action or success record is produced', async () => {
  let started = 0, finished = 0, modelCalls = 0;
  await assert.rejects(runAgent({ text: 'x', timeoutMs: 40, minWriteBudgetMs: 0,
    model: async () => { modelCalls++; return call(); }, actions: { work: action({ kind: 'write', execute: async () => {
      started++; await sleep(100); finished++; return {};
    } }) },
  }), error => error.code === 'TIMEOUT_DURING_WRITE' && error.writes[0].outcome === 'unknown');
  await sleep(140);
  assert.equal(started, 1); assert.equal(finished, 1); assert.equal(modelCalls, 1);
});
test('V-004 uncertainty survives later model errors and STEP_LIMIT', async () => {
  for (const mode of ['model', 'limit']) {
    let count = 0;
    await assert.rejects(runAgent({ text: 'x', maxSteps: 2, actions: { work: action({ kind: 'write', execute: async () => { throw new Error('network'); } }) },
      model: async () => { if (count++ && mode === 'model') throw new Error('secret'); return call(); },
    }), error => {
      assert.equal(error.outcomeUnknown, true);
      assert.ok(userMessageFor(error).includes('상태를 확인'));
      return true;
    });
  }
});
test('partial successful writes remain identifiable if a later model call fails', async () => {
  let count = 0;
  await assert.rejects(runAgent({ text: 'x', actions: { work: action({ kind: 'write' }) }, model: async () => {
    if (count++) throw new Error('secret'); return call();
  } }), error => {
    assert.deepEqual(error.writes, [{ name: 'work', outcome: 'success' }]);
    assert.equal(error.outcomeUnknown, false); return true;
  });
});

class Instance {}
const cyclic = {}; cyclic.self = cyclic;
const invalidResults = [
  ['function', { fn() {} }], ['undefined property', { x: undefined }], ['undefined element', [undefined]],
  ['sparse array', Array(1)], ['symbol value', { x: Symbol() }], ['symbol key', { [Symbol()]: 1 }],
  ['BigInt', { x: 1n }], ['NaN', NaN], ['Infinity', Infinity], ['Date', new Date()],
  ['Map', new Map()], ['Set', new Set()], ['RegExp', /x/], ['Error', new Error('secret')],
  ['Promise value', { x: Promise.resolve(1) }], ['instance', new Instance()], ['cycle', cyclic],
  ['getter', Object.defineProperty({}, 'id', { enumerable: true, get() { throw new Error('getter must not execute'); } })],
  ['hidden value', Object.defineProperty({}, 'id', { value: 1 })],
  ['deep nesting', Array.from({ length: 10 }).reduce(value => ({ child: value }), {})],
  ['node count', Array(1001).fill(1)],
];
for (const [label, value] of invalidResults) {
  test(`V-005 invalid read result: ${label}`, async () => {
    const { seen } = await scenario([call()], { work: action({ execute: async () => value }) });
    assert.equal(seen[1].history[0].error, 'INVALID_TOOL_RESULT');
  });
}
test('V-005 getter is rejected without invoking it', async () => {
  let reads = 0;
  const value = Object.defineProperty({}, 'x', { enumerable: true, get() { reads++; return 1; } });
  await scenario([call()], { work: action({ execute: async () => value }) });
  assert.equal(reads, 0);
});
test('V-005 failed write result validation locks writes', async () => {
  let calls = 0;
  const { result, seen } = await scenario([call(), call()], { work: action({ kind: 'write', execute: async () => { calls++; return { fn() {} }; } }) });
  assert.equal(calls, 1); assert.equal(result.outcomeUnknown, true);
  assert.deepEqual(seen[2].history.map(item => item.error), ['WRITE_OUTCOME_UNKNOWN', 'WRITE_LOCKED']);
});
test('V-005 pick explicitly excludes fields before data inspection', async () => {
  const { seen } = await scenario([call()], { work: action({
    execute: async () => ({ id: 1, secret: 'FAKE-SECRET', unsupported() {} }), pick: result => ({ id: result.id }),
  }) });
  assert.deepEqual(seen[1].history[0].result, { id: 1 });
  assert.ok(!JSON.stringify(seen[1].history).includes('FAKE-SECRET'));
});
for (const size of [256, 4000]) {
  test(`V-005 entire history entry is capped at ${size} including escaped data`, async () => {
    const { seen } = await scenario([call()], { work: action({ execute: async () => ({ data: ('\u0000"\\😀').repeat(15000) }) }) }, { maxToolResultChars: size });
    const entry = seen[1].history[0];
    assert.equal(entry.result.truncated, true);
    assert.ok(JSON.stringify(entry).length <= size);
    assert.ok(entry.result.preview.isWellFormed());
  });
}
test('V-005 unsupported argument getters never run or reach validators', async () => {
  let reads = 0, calls = 0;
  const args = Object.defineProperty({}, 'id', { enumerable: true, get() { reads++; return 1; } });
  const { seen } = await scenario([call('work', args)], { work: action({ validate: () => { calls++; return true; } }) });
  assert.equal(reads, 0); assert.equal(calls, 0); assert.equal(seen[1].history[0].error, 'INVALID_ARGUMENTS');
});
test('V-007 HTTP error exposes status only and makes one request', async () => {
  let calls = 0;
  const client = createActionClient({ baseUrl: 'https://example.com', fetcher: async () => { calls++; return new Response('FAKE-SECRET-BODY', { status: 500 }); } });
  await assert.rejects(client({ path: '/write', body: {} }), error => {
    assert.equal(error.status, 500);
    assert.ok(!String(error.stack).includes('FAKE-SECRET'));
    assert.ok(!JSON.stringify(error).includes('FAKE-SECRET'));
    return true;
  });
  assert.equal(calls, 1);
});

for (const kind of ['read', 'write']) {
  test(`V-005 pick exceptions are safe for ${kind}`, async () => {
    const { result, seen } = await scenario([call()], { work: action({ kind, pick: () => { throw new Error('FAKE-SECRET'); } }) });
    assert.equal(seen[1].history[0].error, kind === 'write' ? 'WRITE_OUTCOME_UNKNOWN' : 'INVALID_TOOL_RESULT');
    assert.equal(result.outcomeUnknown, kind === 'write');
    assert.ok(!JSON.stringify(seen[1].history).includes('FAKE-SECRET'));
  });
}
test('unexpected decision accessor errors do not expose arbitrary AgentError codes', async () => {
  const decision = Object.defineProperty({}, 'type', { get() { throw new AgentError('FAKE-SECRET'); } });
  await assert.rejects(runAgent({ text: 'x', model: async () => decision }), error => {
    assert.equal(error.code, 'AGENT_ERROR');
    assert.ok(!JSON.stringify(error).includes('FAKE-SECRET')); return true;
  });
});
test('V-004 read failure normalizes error and does not lock a later write', async () => {
  let calls = 0;
  const { result, seen } = await scenario([call('lookup'), call()], {
    lookup: action({ execute: async () => { throw new Error('FAKE-SECRET'); } }),
    work: action({ kind: 'write', execute: async () => ++calls }),
  });
  assert.equal(seen[1].history[0].error, 'ACTION_ERROR');
  assert.equal(calls, 1); assert.equal(result.outcomeUnknown, false);
});
test('V-002 asynchronous validation never allows later mutation to change a write', async () => {
  const original = { id: 1 };
  let observed;
  await scenario([call('work', original)], { work: action({ kind: 'write',
    validate: async () => { original.id = 2; await Promise.resolve(); return true; },
    execute: async args => { observed = args.id; return {}; },
  }) });
  assert.equal(observed, 1);
});
