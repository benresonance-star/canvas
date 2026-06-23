import { resolveApiBase } from '../../../lib/apiBase.js';

const API_BASE = resolveApiBase();

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `Live artifact request failed (${response.status})`);
  return body;
}

export const liveProjectStreamUrl = (projectId) =>
  `${API_BASE}/canvas/projects/${encodeURIComponent(projectId)}/stream`;

export async function createLiveArtifact(projectId, input) {
  return (await request(`/projects/${encodeURIComponent(projectId)}/live-artifacts`, {
    method: 'POST', body: JSON.stringify(input),
  })).live;
}
export async function fetchLiveArtifact(id) { return (await request(`/live-artifacts/${encodeURIComponent(id)}`)).live; }
export async function updateLiveArtifact(id, patch) { return (await request(`/live-artifacts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })).live; }
export async function runLiveArtifact(id) { return request(`/live-artifacts/${encodeURIComponent(id)}/run`, { method: 'POST', body: JSON.stringify({ triggerType: 'manual' }) }); }
export async function fetchLiveHistory(id) { return (await request(`/live-artifacts/${encodeURIComponent(id)}/history`)).versions; }
export async function fetchLiveSources(id) { return (await request(`/live-artifacts/${encodeURIComponent(id)}/sources`)).sources; }
export async function addLiveSource(id, input) { return (await request(`/live-artifacts/${encodeURIComponent(id)}/sources`, { method: 'POST', body: JSON.stringify(input) })).source; }
export async function updateLiveSource(id, patch) { return (await request(`/live-sources/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })).source; }
export async function deleteLiveSource(id) { return request(`/live-sources/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
export async function fetchLiveModelOptions() { return (await request('/live-artifacts/model-options')).models; }
export async function markLiveExported(id, versionId) { return (await request(`/live-artifacts/${encodeURIComponent(id)}/mark-exported`, { method: 'POST', body: JSON.stringify({ versionId }) })).live; }
export async function fetchProjectUpdates(projectId, unreadOnly = false) { return request(`/projects/${encodeURIComponent(projectId)}/updates?unreadOnly=${unreadOnly}&limit=50`); }
export async function markProjectUpdateRead(id) { return request(`/project-updates/${encodeURIComponent(id)}/mark-read`, { method: 'POST' }); }
export async function markAllProjectUpdatesRead(projectId) { return request(`/projects/${encodeURIComponent(projectId)}/updates/mark-read`, { method: 'POST' }); }
