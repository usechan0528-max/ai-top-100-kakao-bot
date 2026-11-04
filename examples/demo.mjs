import { runAgent } from '../src/agent.mjs';

// Offline exercise only. This does not call an AI model or the competition API.
const result = await runAgent({
  text: '준비 상태 확인',
  model: async () => ({ type: 'answer', text: '기본 실행 구조가 준비되었습니다. 실제 모델·대회 API·카카오톡 연결 검증은 남아 있습니다.' }),
});
console.log(result.text);
