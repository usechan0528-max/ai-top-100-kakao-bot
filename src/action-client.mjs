import { AgentError } from './agent.mjs';

// Endpoint paths, request mappings and credentials MUST come from trusted configuration,
// never from the user's text or a model-generated URL.
export function createActionClient({ baseUrl, token, fetcher = fetch }) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new AgentError('INVALID_API_URL');
  return async function call({ path, body, signal }) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) throw new AgentError('INVALID_API_PATH');
    const url = new URL(path, base);
    if (url.origin !== base.origin) throw new AgentError('INVALID_API_PATH');
    const response = await fetcher(url, {
      method: 'POST', redirect: 'manual', signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    // Do not retry mutations automatically: a timeout does not prove the operation failed.
    if (!response.ok) {
      const error = new AgentError('ACTION_HTTP_ERROR');
      error.status = response.status;
      throw error;
    }
    return response.json();
  };
}
