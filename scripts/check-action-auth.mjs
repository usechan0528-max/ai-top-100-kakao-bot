import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createCompetitionActions } from '../src/competition-actions.mjs';
import { runAgent } from '../src/agent.mjs';

// Explicit arguments prevent accidental evaluation calls with a hard-coded practice TC.
const [testCaseId, confirmedOrderNo] = process.argv.slice(2);
try {
  const token = (await readFile(process.env.ACTION_TOKEN_FILE ?? join(homedir(), '.codex', 'secrets', 'aitop100-action-token.txt'), 'utf8')).trim();
  const actions = createCompetitionActions({ token, testCaseId, confirmedOrderNo });
  let verified = false;
  const result = await runAgent({ text: '명세 예시 주문으로 액션 인증과 코드 경로를 확인한다.',
    context: { testCaseId, confirmedOrderNo }, actions,
    model: async ({ history }) => {
      if (!history.length) return { type: 'action', name: 'getConfirmedOrder', arguments: {} };
      if (history.at(-1).error) throw new Error('AUTH_CHECK_FAILED');
      verified = true;
      return { type: 'answer', text: 'ACTION_AUTH_OK' };
    },
  });
  if (!verified || result.text !== 'ACTION_AUTH_OK') throw new Error('AUTH_CHECK_FAILED');
  console.log(JSON.stringify({ authenticated: true, httpStatus: 200, agentToolRoundTrip: true, mutation: false, testCaseId }));
} catch {
  console.error('ACTION_CHECK_FAILED: token, TC, API availability or response validation failed; no credentials or response bodies logged.');
  process.exitCode = 1;
}
