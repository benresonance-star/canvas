import { resolveApiBase } from '../../../lib/apiBase.js';

const API_BASE = resolveApiBase();

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || res.statusText || 'BIM API error');
  }
  return data;
}

export async function saveBimStylePreset(projectId, preset) {
  const data = await request(`/bim/projects/${encodeURIComponent(projectId)}/style-presets`, {
    method: 'POST',
    body: JSON.stringify(preset),
  });
  return data.preset;
}

export async function fetchBimStylePresets(projectId, { cardId = null } = {}) {
  const query = cardId ? `?cardId=${encodeURIComponent(cardId)}` : '';
  const data = await request(`/bim/projects/${encodeURIComponent(projectId)}/style-presets${query}`);
  return data.presets ?? [];
}

export async function fetchBimStylePreset(presetId) {
  const data = await request(`/bim/style-presets/${encodeURIComponent(presetId)}`);
  return data.preset;
}

export async function updateBimStylePreset(presetId, patch) {
  const data = await request(`/bim/style-presets/${encodeURIComponent(presetId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.preset;
}

export async function deleteBimStylePreset(presetId) {
  const data = await request(`/bim/style-presets/${encodeURIComponent(presetId)}`, {
    method: 'DELETE',
  });
  return data.preset;
}
