import { resolveApiBase } from './apiBase.js';

export async function listProjectArtifactViews(projectId, { surface = null } = {}) {
  const query = surface ? `?surface=${encodeURIComponent(surface)}` : '';
  const response = await fetch(
    `${resolveApiBase()}/canvas/projects/${encodeURIComponent(projectId)}/artifact-views${query}`,
  );
  if (!response.ok) throw new Error(`Artifact view read failed (${response.status})`);
  const body = await response.json();
  return body.views ?? [];
}

export async function reportProjectArtifactViewDiagnostics(projectId, diagnostic) {
  const response = await fetch(
    `${resolveApiBase()}/canvas/projects/${encodeURIComponent(projectId)}/artifact-view-diagnostics`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(diagnostic),
      keepalive: true,
    },
  );
  if (!response.ok) throw new Error(`Artifact view diagnostic write failed (${response.status})`);
}

export async function auditProjectArtifactViews(projectId) {
  const response = await fetch(
    `${resolveApiBase()}/canvas/projects/${encodeURIComponent(projectId)}/artifact-view-audit`,
  );
  if (!response.ok) throw new Error(`Artifact view audit failed (${response.status})`);
  const body = await response.json();
  return body.counts ?? {};
}

export async function commitProjectArtifactViewPlacements(projectId, placements) {
  const response = await fetch(
    `${resolveApiBase()}/canvas/projects/${encodeURIComponent(projectId)}/artifact-view-placements`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placements }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Artifact view placement write failed (${response.status})`);
    error.status = response.status;
    error.currentVersion = body.currentVersion ?? null;
    throw error;
  }
  return body;
}

export async function commitProjectArtifactViewTransfer(projectId, transfer, payload) {
  const response = await fetch(
    `${resolveApiBase()}/canvas/projects/${encodeURIComponent(projectId)}/artifact-view-transfers`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transfer, payload }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Artifact view transfer failed (${response.status})`);
    error.status = response.status;
    error.currentVersion = body.currentVersion ?? null;
    throw error;
  }
  return body;
}
