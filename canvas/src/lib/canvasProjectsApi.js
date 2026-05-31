import { BOOT_API_REQUEST_TIMEOUT_MS } from './bootSync.js';

const API_BASE = import.meta.env.VITE_PRIMITIVES_API || '/api';
const REQUEST_TIMEOUT_MS = BOOT_API_REQUEST_TIMEOUT_MS;

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || 'API error');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export { isApiAvailable } from './primitivesApi.js';

/**
 * @returns {Promise<{ index: object | null, updatedAt: string | null }>}
 */
export async function fetchCanvasIndexDocument() {
  const data = await request('/canvas/index');
  return {
    index: data.index ?? null,
    updatedAt: data.updatedAt ?? null,
    revision: Number(data.revision) || 0,
  };
}

/** @deprecated Prefer fetchCanvasIndexDocument for updatedAt */
export async function fetchCanvasIndex() {
  const { index } = await fetchCanvasIndexDocument();
  return index;
}

/**
 * @param {object} index
 * @param {number} expectedRevision
 */
export async function saveCanvasIndex(index, expectedRevision = 0) {
  const res = await fetch(`${API_BASE}/canvas/index`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index, expectedRevision }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409) {
    return {
      ok: false,
      conflict: true,
      revision: Number(data.revision) || 0,
      index: data.index ?? null,
      updatedAt: data.updatedAt ?? null,
    };
  }
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || 'API error');
    err.status = res.status;
    throw err;
  }
  return {
    ok: true,
    revision: Number(data.revision) || 0,
    updatedAt: data.updatedAt ?? null,
  };
}

/**
 * @param {string} projectId
 * @returns {Promise<{ revision: number, updatedAt: string | null } | null>}
 */
export async function fetchCanvasProjectMeta(projectId) {
  const res = await fetch(
    `${API_BASE}/canvas/projects/${encodeURIComponent(projectId)}/meta`,
    {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) return null;
  if (!res.ok) {
    const msg = data.error || res.statusText || 'API error';
    throw new Error(msg);
  }
  return {
    revision: Number(data.revision) || 0,
    updatedAt: data.updatedAt ?? null,
  };
}

/**
 * @param {string} projectId
 * @returns {Promise<{ payload: object, updatedAt: string | null, revision: number } | null>}
 */
export async function fetchCanvasProjectDocument(projectId) {
  const res = await fetch(`${API_BASE}/canvas/projects/${encodeURIComponent(projectId)}`, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) return null;
  if (!res.ok) {
    const msg = data.error || res.statusText || 'API error';
    throw new Error(msg);
  }
  if (!data?.payload) return null;
  return {
    payload: data.payload,
    updatedAt: data.updatedAt ?? null,
    revision: Number(data.revision) || 0,
  };
}

/** @deprecated Prefer fetchCanvasProjectDocument for updatedAt */
export async function fetchCanvasProject(projectId) {
  const row = await fetchCanvasProjectDocument(projectId);
  return row?.payload ?? null;
}

/**
 * @param {string} projectId
 * @param {object} payload
 * @param {number} expectedRevision
 * @returns {Promise<
 *   | { ok: true, revision: number, updatedAt: string | null }
 *   | { ok: false, conflict: true, revision: number, payload: object | null, updatedAt: string | null }
 * >}
 */
export async function saveCanvasProject(projectId, payload, expectedRevision) {
  const res = await fetch(`${API_BASE}/canvas/projects/${encodeURIComponent(projectId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, expectedRevision }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409) {
    return {
      ok: false,
      conflict: true,
      revision: Number(data.revision) || 0,
      payload: data.payload ?? null,
      updatedAt: data.updatedAt ?? null,
    };
  }
  if (res.status === 413) {
    throw new Error(data.error || 'Project document too large for server storage');
  }
  if (!res.ok) {
    const msg = data.error || res.statusText || 'API error';
    throw new Error(msg);
  }
  return {
    ok: true,
    revision: Number(data.revision) || 0,
    updatedAt: data.updatedAt ?? null,
  };
}

export async function deleteCanvasProject(projectId) {
  return request(`/canvas/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
}
