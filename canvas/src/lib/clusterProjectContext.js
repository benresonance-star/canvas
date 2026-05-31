import {
  getClusterIdForProject,
  ensureClusterForProject,
} from './primitivesApi.js';

export const EMPTY_CLUSTER_HULL_SOURCE = {
  clusters: [],
  membersByClusterId: new Map(),
};

/** True when cluster context was resolved for the active project. */
export function isClusterContextValid(activeProjectId, contextProjectId) {
  if (!activeProjectId || !contextProjectId) return false;
  return activeProjectId === contextProjectId;
}

/** Workspace cluster id for a canvas project (fetch or create). */
export async function resolveWorkspaceClusterId(projectId, projectName) {
  if (!projectId) return null;
  let id = await getClusterIdForProject(projectId);
  if (!id) {
    const { cluster } = await ensureClusterForProject(
      projectId,
      projectName?.trim() || 'Project',
    );
    id = cluster?.id ?? null;
  }
  return id;
}
