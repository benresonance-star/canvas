import { resolveApiBase } from '../../../lib/apiBase.js';

const API_BASE = resolveApiBase();

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `Agent request failed (${response.status})`);
  return body;
}

export async function fetchAgentTypes() {
  return (await request('/agent-types')).agentTypes;
}

export async function fetchAgentTypeCatalog() {
  return request('/agent-types/catalog');
}

export async function createAgentType(input) {
  return (await request('/agent-types', { method: 'POST', body: JSON.stringify(input) })).agentType;
}

export async function updateAgentType(id, patch) {
  return (await request(`/agent-types/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })).agentType;
}

export async function deleteAgentType(id) {
  return (await request(`/agent-types/${encodeURIComponent(id)}`, { method: 'DELETE' })).agentType;
}

export async function fetchAgents(projectId) {
  return (await request(`/projects/${encodeURIComponent(projectId)}/agents`)).agents;
}

export async function createAgent(projectId, input) {
  return (await request(`/projects/${encodeURIComponent(projectId)}/agents`, {
    method: 'POST',
    body: JSON.stringify(input),
  })).agent;
}

export async function fetchAgent(id) {
  return (await request(`/agents/${encodeURIComponent(id)}`)).agent;
}

export async function updateAgent(id, patch) {
  return (await request(`/agents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })).agent;
}

export async function deleteAgent(id) {
  return (await request(`/agents/${encodeURIComponent(id)}`, { method: 'DELETE' })).agent;
}

export async function duplicateAgent(id) {
  return (await request(`/agents/${encodeURIComponent(id)}/duplicate`, { method: 'POST' })).agent;
}

export async function executeAgent(id, input) {
  return request(`/agents/${encodeURIComponent(id)}/execute`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchAgentExecutions(id) {
  return (await request(`/agents/${encodeURIComponent(id)}/executions`)).executions;
}

export async function fetchAgentModelOptions(provider = 'local') {
  const query = new URLSearchParams({ provider }).toString();
  return request(`/agents/model-options?${query}`);
}
