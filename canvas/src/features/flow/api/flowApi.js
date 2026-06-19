import { resolveApiBase } from '../../../lib/apiBase.js';

const API_BASE = resolveApiBase();

async function jsonRequest(path, options) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error || `Flow request failed (${response.status})`);
    error.status = response.status;
    error.currentRevision = body?.currentRevision;
    throw error;
  }
  return body;
}

export async function createFlowArtifact(projectId, input) {
  const result = await jsonRequest(`/projects/${encodeURIComponent(projectId)}/flows`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return result.flow;
}

export async function fetchFlow(flowId) {
  const result = await jsonRequest(`/flows/${encodeURIComponent(flowId)}`, { method: 'GET' });
  return result.flow;
}

export async function saveFlow(flowId, snapshot) {
  const result = await jsonRequest(`/flows/${encodeURIComponent(flowId)}`, {
    method: 'PUT',
    body: JSON.stringify(snapshot),
  });
  return result.flow;
}

export async function removeFlow(flowId) {
  return jsonRequest(`/flows/${encodeURIComponent(flowId)}`, { method: 'DELETE' });
}

export function flowStreamUrl(flowId) {
  return `${API_BASE}/flows/${encodeURIComponent(flowId)}/stream`;
}
