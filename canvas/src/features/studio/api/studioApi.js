import { resolveApiBase } from '../../../lib/apiBase.js';

const API_BASE = resolveApiBase();

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || `Studio request failed (${response.status})`);
  }
  return body;
}

export async function createStudio(input) {
  const result = await jsonRequest('/studios', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return result.overview;
}

export async function fetchStudioOverview(studioId) {
  const result = await jsonRequest(`/studios/${encodeURIComponent(studioId)}/overview`);
  return result.overview;
}

export async function updateStudio(studioId, input) {
  const result = await jsonRequest(`/studios/${encodeURIComponent(studioId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return result.studio;
}

export async function archiveStudio(studioId, input = {}) {
  const result = await jsonRequest(`/studios/${encodeURIComponent(studioId)}/archive`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return result.studio;
}

export async function restoreStudio(studioId, input = {}) {
  const result = await jsonRequest(`/studios/${encodeURIComponent(studioId)}/restore`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return result.studio;
}

export async function listStudioPlaybooks() {
  const result = await jsonRequest('/studio-playbooks');
  return result.playbooks ?? [];
}

export async function createStudioSurface(studioId, input) {
  const result = await jsonRequest(`/studios/${encodeURIComponent(studioId)}/surfaces`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return result.surface;
}

export async function createStudioContextPacket(studioId, input) {
  const result = await jsonRequest(`/studios/${encodeURIComponent(studioId)}/context-packets`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return result.contextPacket;
}

export async function invokeChildStudio(studioId, input) {
  return jsonRequest(`/studios/${encodeURIComponent(studioId)}/invoke-child`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listStudioCandidates(studioId) {
  const result = await jsonRequest(`/studios/${encodeURIComponent(studioId)}/candidates`);
  return result.candidates ?? [];
}

export async function createStudioCandidate(studioId, input) {
  const result = await jsonRequest(`/studios/${encodeURIComponent(studioId)}/candidates`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return result.candidate;
}

export async function updateStudioCandidate(candidateId, input) {
  const result = await jsonRequest(`/studio-candidates/${encodeURIComponent(candidateId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return result.candidate;
}

export async function listStudioPromotions(studioId) {
  const result = await jsonRequest(`/studios/${encodeURIComponent(studioId)}/promotions`);
  return result.promotions ?? [];
}

export async function createStudioPromotion(studioId, input) {
  const result = await jsonRequest(`/studios/${encodeURIComponent(studioId)}/promotions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return result.promotion;
}

export async function applyStudioPromotion(promotionId, input = {}) {
  const result = await jsonRequest(`/studio-promotions/${encodeURIComponent(promotionId)}/apply`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return result.promotion;
}
