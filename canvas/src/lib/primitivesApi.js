import { resolveApiBase } from './apiBase.js';

const API_BASE = resolveApiBase();
const REQUEST_TIMEOUT_MS = 15_000;

const DB_UNAVAILABLE_HINT =
  'Database unavailable. Start Docker Desktop, then run: npm run db:up && npm run db:migrate';

/**
 * @param {Response} res
 * @param {Record<string, unknown>} data
 */
export function formatApiError(res, data) {
  const raw = typeof data.error === 'string' ? data.error : '';
  if (raw) return raw;
  if (res.status === 502 || res.status === 503) {
    return DB_UNAVAILABLE_HINT;
  }
  if (res.statusText && res.statusText !== 'Internal Server Error') {
    return res.statusText;
  }
  return res.status >= 500
    ? 'Server error — check that Postgres is running (npm run db:up).'
    : 'API error';
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = formatApiError(res, data);
    if (res.status === 404 && path.startsWith('/clusters/') && options.method === 'PATCH') {
      throw new Error(
        'Cluster rename is not available. Restart the API server (npm run server) and try again.',
      );
    }
    throw new Error(msg);
  }
  return data;
}

export async function ensureClusterForProject(projectId, name) {
  return request('/clusters', {
    method: 'POST',
    body: JSON.stringify({ projectId, name }),
  });
}

export async function getClusterIdForProject(projectId) {
  const data = await request(`/clusters/by-project/${encodeURIComponent(projectId)}`);
  return data.clusterId;
}

export async function createSubCluster({
  parentClusterId,
  projectId,
  name,
  purpose,
  members = [],
}) {
  return request('/clusters', {
    method: 'POST',
    body: JSON.stringify({ parentClusterId, projectId, name, purpose, members }),
  });
}

export async function listSubClusters(projectId) {
  return request(`/clusters/by-project/${encodeURIComponent(projectId)}/subclusters`);
}

export async function fetchClusterMembers(clusterId) {
  return request(`/clusters/${clusterId}/members`);
}

export function clusterProjectStreamUrl(projectId) {
  const base = API_BASE.replace(/\/$/, '');
  return `${base}/clusters/by-project/${encodeURIComponent(projectId)}/stream`;
}

export async function addClusterMembers(clusterId, members) {
  return request(`/clusters/${clusterId}/members`, {
    method: 'POST',
    body: JSON.stringify({ members }),
  });
}

export async function removeClusterMember(clusterId, ref) {
  return request(`/clusters/${clusterId}/members`, {
    method: 'DELETE',
    body: JSON.stringify(ref),
  });
}

export async function deleteSubCluster(clusterId) {
  return request(`/clusters/${clusterId}`, { method: 'DELETE' });
}

export async function updateCluster(clusterId, { name, purpose } = {}) {
  return request(`/clusters/${clusterId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, purpose }),
  });
}

export async function ingestArtifacts(projectId, { files, relationships }) {
  return request('/artifacts/ingest', {
    method: 'POST',
    body: JSON.stringify({ projectId, files, relationships }),
  });
}

export async function listPrimitives(clusterId, { type, limit } = {}) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (limit) params.set('limit', String(limit));
  const q = params.toString();
  return request(`/clusters/${clusterId}/primitives${q ? `?${q}` : ''}`);
}

export async function listClusterEvents(clusterId, { limit } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  const q = params.toString();
  return request(`/clusters/${clusterId}/events${q ? `?${q}` : ''}`);
}

export async function getPrimitiveDetail(type, id) {
  return request(`/primitives/${type}/${id}`);
}

export async function createNote(clusterId, fields) {
  return request('/notes', {
    method: 'POST',
    body: JSON.stringify({ clusterId, ...fields }),
  });
}

export async function listArtifactNotes(artifactId) {
  return request(`/artifacts/${artifactId}/notes`);
}

export async function deleteNote(noteId) {
  return request(`/notes/${noteId}`, { method: 'DELETE' });
}

export async function updateArtifactContent(artifactId, { content_hash, payload_text }) {
  return request(`/artifacts/${artifactId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content_hash, payload_text }),
  });
}

export async function createRelationship(clusterId, fields, { idempotent = true } = {}) {
  return request('/relationships', {
    method: 'POST',
    body: JSON.stringify({ clusterId, idempotent, ...fields }),
  });
}

export async function deleteRelationship(relationshipId) {
  return request(`/relationships/${relationshipId}`, { method: 'DELETE' });
}

export async function fetchClusterGraph(clusterId) {
  return request(`/clusters/${clusterId}/graph`);
}

export async function fetchArtifactEdges(artifactId) {
  return request(`/artifacts/${artifactId}/edges`);
}

export async function createAssertion(clusterId, fields) {
  return request('/assertions', {
    method: 'POST',
    body: JSON.stringify({ clusterId, ...fields }),
  });
}

export async function getAssertionDefaults() {
  return request('/assertions/defaults');
}

export async function createTask(clusterId, fields) {
  return request('/tasks', {
    method: 'POST',
    body: JSON.stringify({ clusterId, ...fields }),
  });
}

/**
 * @returns {Promise<{ apiReachable: boolean, ok: boolean, dbReady: boolean, error: string | null }>}
 */
export async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    const data = await res.json().catch(() => null);
    const hasHealthShape =
      data
      && (typeof data.ok === 'boolean' || typeof data.dbReady === 'boolean');
    if (!hasHealthShape) {
      return { apiReachable: false, ok: false, dbReady: false, error: null };
    }
    return {
      apiReachable: true,
      ok: data.ok === true,
      dbReady: data.dbReady !== false && data.ok === true,
      error: typeof data.error === 'string' ? data.error : null,
    };
  } catch {
    return { apiReachable: false, ok: false, dbReady: false, error: null };
  }
}

export async function isApiAvailable() {
  const health = await fetchHealth();
  return health.ok;
}

/** @typedef {'ok' | 'api_unreachable' | 'db_unavailable'} ClusterApiReason */

/**
 * @param {{ apiReachable: boolean, ok: boolean, dbReady: boolean }} health
 * @returns {{ available: boolean, reason: ClusterApiReason }}
 */
export function clusterApiStatusFromHealth(health) {
  if (!health.apiReachable) {
    return { available: false, reason: 'api_unreachable' };
  }
  if (!health.ok || !health.dbReady) {
    return { available: false, reason: 'db_unavailable' };
  }
  return { available: true, reason: 'ok' };
}
