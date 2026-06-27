import { resolveApiBase } from './apiBase.js';

const API_BASE = resolveApiBase();
const REQUEST_TIMEOUT_MS = 15_000;

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
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...fetchOptions.headers },
      signal: fetchOptions.signal ?? AbortSignal.timeout(timeoutMs),
      ...fetchOptions,
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

export async function getArtifact(artifactId, { optional = false } = {}) {
  const query = optional ? '?optional=1' : '';
  return request(`/artifacts/${encodeURIComponent(artifactId)}${query}`);
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

function parseNdjsonLine(line) {
  const trimmed = String(line).trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Pull an Ollama model for a connector. Streams progress via onProgress when the server
 * returns NDJSON; short-circuits with JSON when the model is already present.
 */
export async function pullOllamaModel(connectorId, { onProgress, signal } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}/agent/ollama/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectorId }),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new AgentApiError(
      'Cannot reach the Canvas API. Is npm run server running?',
      { kind: 'network' },
    );
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new AgentApiError(data.error || res.statusText || 'API error', {
        status: res.status,
        kind: 'api',
        details: data,
      });
    }
    return data;
  }

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new AgentApiError(data.error || res.statusText || 'API error', {
      status: res.status,
      kind: 'api',
      details: data,
    });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const event = parseNdjsonLine(line);
      if (!event) continue;
      if (event.ok === true) {
        finalResult = event;
        continue;
      }
      if (event.ok === false) {
        throw new AgentApiError(event.error || 'Ollama pull failed', { kind: 'backend' });
      }
      onProgress?.(event);
    }
  }

  const trailing = parseNdjsonLine(buffer);
  if (trailing) {
    if (trailing.ok === true) {
      finalResult = trailing;
    } else if (trailing.ok === false) {
      throw new AgentApiError(trailing.error || 'Ollama pull failed', { kind: 'backend' });
    } else {
      onProgress?.(trailing);
    }
  }

  if (!finalResult?.ok) {
    throw new AgentApiError('Ollama pull ended without success', { kind: 'backend' });
  }
  return finalResult;
}
