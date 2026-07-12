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
