const API_BASE = import.meta.env.VITE_PRIMITIVES_API || '/api';

export class AgentApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, kind?: 'network' | 'backend' | 'api', details?: object }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'AgentApiError';
    this.status = options.status;
    this.kind = options.kind ?? 'api';
    this.details = options.details ?? null;
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
        details: data,
      });
    }
    throw new AgentApiError(serverError, { status: res.status, kind: 'api', details: data });
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

export async function listAgentTemplates() {
  return request('/agent/templates');
}

export async function getAgentTemplate(templateId) {
  return request(`/agent/templates/${encodeURIComponent(templateId)}`);
}

export async function saveAgentTemplate(template, expectedRevision = 0) {
  const ensureTemplateResponse = async (data) => {
    if (data?.template?.id) return data;
    const fetched = await getAgentTemplate(template.id);
    if (fetched?.template?.id) {
      return {
        ...data,
        template: fetched.template,
        revision: fetched.revision ?? fetched.template.revision ?? data?.revision,
        updatedAt: fetched.updatedAt ?? fetched.template.updatedAt ?? data?.updatedAt,
      };
    }
    throw new AgentApiError('Template save did not return an Agent Type.', {
      status: 502,
      kind: 'backend',
      details: data ?? null,
    });
  };
  const path = expectedRevision > 0
    ? `/agent/templates/${encodeURIComponent(template.id)}`
    : '/agent/templates';
  try {
    const data = await request(path, {
      method: expectedRevision > 0 ? 'PUT' : 'POST',
      body: JSON.stringify({ template, expectedRevision }),
    });
    return ensureTemplateResponse(data);
  } catch (err) {
    const serverTemplate = err?.details?.template;
    const revision = Number(err?.details?.revision) || Number(serverTemplate?.revision) || 0;
    if (expectedRevision === 0 && err?.status === 409 && revision > 0) {
      const data = await request(`/agent/templates/${encodeURIComponent(template.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ template, expectedRevision: revision }),
      });
      return ensureTemplateResponse(data);
    }
    throw err;
  }
}

export async function importMasterAgentTemplates() {
  return request('/agent/templates/import-master', { method: 'POST' });
}

export async function deleteAgentTemplate(templateId) {
  return request(`/agent/templates/${encodeURIComponent(templateId)}`, {
    method: 'DELETE',
  });
}

export async function estimateAgentChat({
  provider,
  connectorId,
  messages,
  systemContext,
  templateId,
}) {
  return request('/agent/estimate', {
    method: 'POST',
    body: JSON.stringify({ provider, connectorId, messages, systemContext, templateId }),
  });
}

export async function sendAgentChat({
  provider,
  connectorId,
  messages,
  systemContext,
  templateId,
}) {
  return request('/agent/chat', {
    method: 'POST',
    body: JSON.stringify({ provider, connectorId, messages, systemContext, templateId }),
  });
}
