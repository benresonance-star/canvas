const API_BASE = import.meta.env.VITE_PRIMITIVES_API || '/api';

export class AgentApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, kind?: 'network' | 'backend' | 'api' }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'AgentApiError';
    this.status = options.status;
    this.kind = options.kind ?? 'api';
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
  } catch {
    throw new AgentApiError(
      'Cannot reach the Canvas API. Is npm run server running?',
      { kind: 'network' },
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const serverError = data.error || res.statusText || 'API error';
    if (res.status === 502) {
      throw new AgentApiError(`Agent backend: ${serverError}`, {
        status: res.status,
        kind: 'backend',
      });
    }
    throw new AgentApiError(serverError, { status: res.status, kind: 'api' });
  }

  return data;
}

export async function getAgentHealth() {
  return request('/agent/health');
}

export async function listAgentConnectors() {
  return request('/agent/connectors');
}

export async function getArtifact(artifactId) {
  return request(`/artifacts/${encodeURIComponent(artifactId)}`);
}

export async function saveAgentCredential(provider, apiKey) {
  return request(`/agent/credentials/${encodeURIComponent(provider)}`, {
    method: 'PUT',
    body: JSON.stringify({ apiKey }),
  });
}

export async function deleteAgentCredential(provider) {
  return request(`/agent/credentials/${encodeURIComponent(provider)}`, {
    method: 'DELETE',
  });
}

export async function estimateAgentChat({ provider, messages, systemContext }) {
  return request('/agent/estimate', {
    method: 'POST',
    body: JSON.stringify({ provider, messages, systemContext }),
  });
}

export async function sendAgentChat({ provider, messages, systemContext }) {
  return request('/agent/chat', {
    method: 'POST',
    body: JSON.stringify({ provider, messages, systemContext }),
  });
}
