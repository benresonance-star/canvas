import { resolveApiBase } from '../../../lib/apiBase.js';

const API_BASE = resolveApiBase();

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || res.statusText || 'Music API error');
  }
  return data;
}

export async function createMusicAgent(projectId, payload) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/agents`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.agent;
}

export async function fetchMusicAgent(agentId) {
  const data = await request(`/music/agents/${encodeURIComponent(agentId)}`);
  return data.agent;
}

export async function updateMusicAgent(agentId, patch) {
  const data = await request(`/music/agents/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.agent;
}

export async function fetchProjectMusicTransport(projectId) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/transport`);
  return data.transport;
}

export async function saveProjectMusicTransport(projectId, state) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/transport`, {
    method: 'PATCH',
    body: JSON.stringify({ state }),
  });
  return data.transport;
}

export async function saveMusicPreset(projectId, preset) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/presets`, {
    method: 'POST',
    body: JSON.stringify(preset),
  });
  return data.preset;
}

export async function fetchMusicPresets(projectId) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/presets`);
  return data.presets ?? [];
}

export async function deleteMusicPreset(presetId) {
  const data = await request(`/music/presets/${encodeURIComponent(presetId)}`, {
    method: 'DELETE',
  });
  return data.preset;
}

export async function saveMusicVersion(agentId, version) {
  const data = await request(`/music/agents/${encodeURIComponent(agentId)}/versions`, {
    method: 'POST',
    body: JSON.stringify(version),
  });
  return data.version;
}

export async function fetchMusicVersions(agentId) {
  const data = await request(`/music/agents/${encodeURIComponent(agentId)}/versions`);
  return data.versions ?? [];
}

export async function restoreMusicVersion(agentId, versionId) {
  const data = await request(
    `/music/agents/${encodeURIComponent(agentId)}/restore-version/${encodeURIComponent(versionId)}`,
    { method: 'POST' },
  );
  return data.agent;
}

export async function exportMusicAgent(agentId) {
  const data = await request(`/music/agents/${encodeURIComponent(agentId)}/export`, {
    method: 'POST',
  });
  return data.package;
}

export async function importMusicAgentPackage(projectId, pkg) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/import`, {
    method: 'POST',
    body: JSON.stringify({ package: pkg }),
  });
  return data.agent;
}

export async function saveMusicBlackboard(projectId, state) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/blackboard`, {
    method: 'PUT',
    body: JSON.stringify({ state }),
  });
  return data.blackboard;
}

export async function fetchSketchClusters(projectId) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/sketch-clusters`);
  return data.clusters ?? [];
}

export async function saveSketchCluster(projectId, cluster) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/sketch-clusters`, {
    method: 'POST',
    body: JSON.stringify(cluster),
  });
  return data.cluster;
}

export async function fetchSonicSketches(projectId) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/sketches`);
  return data.sketches ?? [];
}

export async function saveSonicSketch(projectId, sketch) {
  const path = sketch?.id
    ? `/music/sketches/${encodeURIComponent(sketch.id)}`
    : `/music/projects/${encodeURIComponent(projectId)}/sketches`;
  const data = await request(path, {
    method: sketch?.id ? 'PATCH' : 'POST',
    body: JSON.stringify(sketch),
  });
  return data.sketch;
}

export async function fetchSketchForAgent(agentId) {
  const data = await request(`/music/agents/${encodeURIComponent(agentId)}/sketch`);
  return data.sketch;
}

export async function fetchProjectDescriptorGraph(projectId) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/descriptor-graph`);
  return data.descriptorGraph;
}

export async function saveProjectDescriptorGraph(projectId, descriptorGraph) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/descriptor-graph`, {
    method: 'PUT',
    body: JSON.stringify({ descriptorGraph }),
  });
  return data.descriptorGraph;
}

export async function saveSketchDescriptorGraph(sketchId, descriptorGraph) {
  const data = await request(`/music/sketches/${encodeURIComponent(sketchId)}/descriptor-graph`, {
    method: 'PUT',
    body: JSON.stringify({ descriptorGraph }),
  });
  return data.sketch;
}

export async function fetchProjectSpaceState(projectId) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/space`);
  return data.space?.state ?? data.space;
}

export async function saveProjectSpaceState(projectId, state) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/space`, {
    method: 'PUT',
    body: JSON.stringify({ state }),
  });
  return data.space?.state ?? data.space;
}

export async function fetchTemporalSketches(projectId, sketchId = null) {
  const query = sketchId ? `?sketchId=${encodeURIComponent(sketchId)}` : '';
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/temporal-sketches${query}`);
  return data.temporalSketches ?? [];
}

export async function saveTemporalSketch(projectId, temporalSketch) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/temporal-sketches`, {
    method: 'POST',
    body: JSON.stringify(temporalSketch),
  });
  return data.temporalSketch;
}

export async function fetchChronicleEvents(projectId, { sketchId = null, limit = 80 } = {}) {
  const params = new URLSearchParams();
  if (sketchId) params.set('sketchId', sketchId);
  if (limit) params.set('limit', String(limit));
  const suffix = params.toString() ? `?${params}` : '';
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/chronicle${suffix}`);
  return data.events ?? [];
}

export async function recordChronicleEvent(projectId, event) {
  const data = await request(`/music/projects/${encodeURIComponent(projectId)}/chronicle`, {
    method: 'POST',
    body: JSON.stringify(event),
  });
  return data.event;
}
