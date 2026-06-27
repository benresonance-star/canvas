import { resolveApiBase } from './apiBase.js';
import { BOOT_API_REQUEST_TIMEOUT_MS } from './bootSync.js';

const API_BASE = resolveApiBase();
const READ_REQUEST_TIMEOUT_MS = BOOT_API_REQUEST_TIMEOUT_MS;
const WRITE_REQUEST_TIMEOUT_MS = 60_000;

async function request(path, options = {}) {
  const timeoutMs = options.timeoutMs ?? READ_REQUEST_TIMEOUT_MS;
  const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...fetchOptions.headers },
    signal: fetchOptions.signal ?? AbortSignal.timeout(timeoutMs),
    ...fetchOptions,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || res.statusText || 'API error');
  }
  return data;
}

function enc(s) {
  return encodeURIComponent(s);
}

/** @deprecated Legacy session without thread id */
export async function fetchAgentChatSession(projectId, connectorId) {
  const data = await request(
    `/canvas/agent-chat/${enc(projectId)}/${enc(connectorId)}`,
  );
  return data.session ?? null;
}

export async function fetchAgentChatThreadIndex(projectId, connectorId) {
  const data = await request(
    `/canvas/agent-chat/${enc(projectId)}/${enc(connectorId)}/threads`,
  );
  return {
    index: data.index ?? null,
    revision: Number(data.revision) || 0,
  };
}

export async function saveAgentChatThreadIndexRemote(
  projectId,
  connectorId,
  index,
  expectedRevision = 0,
) {
  const res = await fetch(
    `${API_BASE}/canvas/agent-chat/${enc(projectId)}/${enc(connectorId)}/threads`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index, expectedRevision }),
      signal: AbortSignal.timeout(WRITE_REQUEST_TIMEOUT_MS),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (res.status === 409) {
    return {
      ok: false,
      conflict: true,
      revision: Number(data.revision) || 0,
      index: data.index ?? null,
    };
  }
  if (!res.ok) {
    throw new Error(data.error || res.statusText || 'API error');
  }
  return { ok: true, revision: Number(data.revision) || 0 };
}

export async function fetchAgentChatSessionForThread(
  projectId,
  connectorId,
  threadId,
) {
  const data = await request(
    `/canvas/agent-chat/${enc(projectId)}/${enc(connectorId)}/${enc(threadId)}`,
  );
  return {
    session: data.session ?? null,
    revision: Number(data.revision) || 0,
  };
}

export async function saveAgentChatSessionRemote(
  projectId,
  connectorId,
  session,
  threadId,
  expectedRevision = 0,
) {
  const tid = threadId ?? session?.threadId;
  const path = !tid
    ? `/canvas/agent-chat/${enc(projectId)}/${enc(connectorId)}`
    : `/canvas/agent-chat/${enc(projectId)}/${enc(connectorId)}/${enc(tid)}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session, expectedRevision }),
    signal: AbortSignal.timeout(WRITE_REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409) {
    return {
      ok: false,
      conflict: true,
      revision: Number(data.revision) || 0,
      session: data.session ?? null,
    };
  }
  if (!res.ok) {
    throw new Error(data.error || res.statusText || 'API error');
  }
  return { ok: true, revision: Number(data.revision) || 0 };
}

export async function deleteAgentChatSessionRemote(
  projectId,
  connectorId,
  threadId,
) {
  if (!threadId) {
    return request(
      `/canvas/agent-chat/${enc(projectId)}/${enc(connectorId)}`,
      { method: 'DELETE', timeoutMs: WRITE_REQUEST_TIMEOUT_MS },
    );
  }
  return request(
    `/canvas/agent-chat/${enc(projectId)}/${enc(connectorId)}/${enc(threadId)}`,
    { method: 'DELETE', timeoutMs: WRITE_REQUEST_TIMEOUT_MS },
  );
}
