export class AgentError extends Error {
  constructor(code) { super(code); this.name = 'AgentError'; this.code = code; }
}

const UNKNOWN_MESSAGE = '요청이 처리되었을 수 있으나 결과를 확인하지 못했습니다. 다시 실행하기 전에 처리 상태를 확인해 주세요.';
const MESSAGES = Object.freeze({
  INVALID_INPUT: '요청 내용을 확인하고 다시 입력해 주세요.',
  INVALID_CONTEXT: '사용자 정보를 확인하지 못했습니다. 연결 상태를 확인해 주세요.',
  INVALID_LIMIT: '요청 처리 설정에 문제가 있습니다. 잠시 후 다시 이용해 주세요.',
  MODEL_NOT_CONFIGURED: 'AI 연결 준비가 완료되지 않았습니다.',
  MODEL_ERROR: 'AI 응답을 확인하지 못했습니다. 잠시 후 다시 이용해 주세요.',
  INVALID_DECISION: '요청에 맞는 응답을 만들지 못했습니다. 내용을 구체적으로 알려주세요.',
  STEP_LIMIT: '한 번에 처리할 수 있는 범위를 넘었습니다. 요청을 나누어 주세요.',
  TIMEOUT: '응답 확인 시간이 초과되었습니다. 처리 중인 작업이 있다면 상태를 먼저 확인해 주세요.',
  TIMEOUT_DURING_WRITE: UNKNOWN_MESSAGE,
  WRITE_OUTCOME_UNKNOWN: UNKNOWN_MESSAGE,
  INVALID_ARGUMENTS: '작업에 필요한 정보가 올바른지 확인해 주세요.',
  FORBIDDEN: '이 작업을 수행할 권한이 없습니다.',
});

// Never interpolate provider messages, response bodies, stack traces or arbitrary codes.
export function userMessageFor(error) {
  if (error instanceof AgentError) {
    if (error.outcomeUnknown === true) return UNKNOWN_MESSAGE;
    if (Object.hasOwn(MESSAGES, error.code)) return MESSAGES[error.code];
  }
  return '요청을 처리하는 중 문제가 발생했습니다. 잠시 후 다시 이용해 주세요.';
}
