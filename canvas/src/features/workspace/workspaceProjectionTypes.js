/** @typedef {'idle' | 'selecting' | 'ready' | 'noProjects'} ProjectPhase */

export const PROJECT_PHASE = {
  IDLE: 'idle',
  SELECTING: 'selecting',
  READY: 'ready',
  NO_PROJECTS: 'noProjects',
};

/** @typedef {'user' | 'boot' | 'create' | 'repair'} SelectProjectReason */

export const SELECT_PROJECT_REASON = {
  USER: 'user',
  BOOT: 'boot',
  CREATE: 'create',
  REPAIR: 'repair',
};

/**
 * @typedef {object} WorkspaceProjection
 * @property {string | null} effectiveProjectId
 * @property {string | null} committedProjectId
 * @property {string | null} pendingProjectId
 * @property {string} displayProjectName
 * @property {ProjectPhase} phase
 * @property {boolean} hydrated
 * @property {boolean} canMutateCanvas
 * @property {number | null} clientRevision
 * @property {string | null} indexActiveProjectId
 */

/**
 * @typedef {object} ProjectionRollbackSnapshot
 * @property {string | null} committedProjectId
 * @property {string | null} previousActiveId
 */
