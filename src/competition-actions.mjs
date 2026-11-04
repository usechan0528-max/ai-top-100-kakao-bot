import { AgentError } from './errors.mjs';

export const ACTION_ORIGIN = 'https://gyodong-mall-action.aitop100.org';
export const validTestCaseId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value);
const validOrder = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);

// The TC is bound by the caller, never selected by the model.
export function createCompetitionClient({ token, testCaseId, fetcher = fetch }) {
  if (typeof token !== 'string' || !/^aitop100_[A-Za-z0-9._-]+$/.test(token)) throw new AgentError('INVALID_ACTION_TOKEN');
  if (!validTestCaseId(testCaseId)) throw new AgentError('INVALID_TEST_CASE_ID');
  async function get(path, signal) {
    let response;
    try {
      response = await fetcher(new URL(path, ACTION_ORIGIN), {
        method: 'GET', redirect: 'manual', signal: signal ?? AbortSignal.timeout(8000),
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Aitop100-Test-Case-Id': testCaseId },
      });
    } catch { throw new AgentError('ACTION_NETWORK_ERROR'); }
    if (!response.ok) {
      const error = new AgentError('ACTION_HTTP_ERROR');
      error.status = response.status;
      const retry = response.headers.get('Retry-After');
      if (retry && /^\d+$/.test(retry)) error.retryAfterSeconds = Number(retry);
      // No raw error body, headers or credentials escape to model/logs.
      throw error;
    }
    try { return await response.json(); }
    catch { throw new AgentError('INVALID_ACTION_RESPONSE'); }
  }
  return Object.freeze({
    async getOrder(orderNo, { signal } = {}) {
      if (!validOrder(orderNo)) throw new AgentError('INVALID_ORDER_NO');
      const data = await get(`/api/orders/${encodeURIComponent(orderNo)}`, signal);
      if (!data || Array.isArray(data) || data.order_no !== orderNo || typeof data.status !== 'string') throw new AgentError('INVALID_ACTION_RESPONSE');
      return data;
    },
    async getShipments(orderNo, { signal } = {}) {
      if (!validOrder(orderNo)) throw new AgentError('INVALID_ORDER_NO');
      const data = await get(`/api/shipments?order_no=${encodeURIComponent(orderNo)}`, signal);
      if (!Array.isArray(data) || data.some(row=>!row || row.order_no!==orderNo || !['READY','IN_TRANSIT','DELIVERED','RETURNED'].includes(row.status))) throw new AgentError('INVALID_ACTION_RESPONSE');
      return data;
    },
  });
}

// Trusted application context must establish the requested order before enabling tools.
// This does not infer ownership from a Kakao user identifier or from a model argument.
export function createCompetitionActions({ token, testCaseId, confirmedOrderNo, fetcher }) {
  if (!validOrder(confirmedOrderNo)) throw new AgentError('INVALID_ORDER_NO');
  const client = createCompetitionClient({ token, testCaseId, fetcher });
  const base = {
    kind: 'read',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    validate: args => args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).length === 0,
    authorize: (_args, context) => context.testCaseId === testCaseId && context.confirmedOrderNo === confirmedOrderNo,
  };
  return {
    getConfirmedOrder: { ...base, description: '확인된 대상 주문 조회. 접수번호는 처리 완료가 아니다.',
      execute: (_args, { signal }) => client.getOrder(confirmedOrderNo, { signal }),
      pick: ({ recipient_name, shipping_address, ...rest }) => rest },
    getConfirmedShipments: { ...base, description: '확인된 대상 주문의 배송 조회.',
      execute: (_args, { signal }) => client.getShipments(confirmedOrderNo, { signal }) },
  };
}
