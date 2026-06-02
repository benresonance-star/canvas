/**
 * Realtime sync stream module boundary (SSE + remote patch apply).
 * @see ../../../../docs/PROJECT_SYNC_API.md
 */
export {
  startProjectSyncStream,
  stopProjectSyncStream,
} from '../projectSyncStream.js';

export {
  startWorkspaceIndexSyncStream,
  stopWorkspaceIndexSyncStream,
} from '../workspaceIndexSyncStream.js';

export {
  applyRemoteProjectPatch,
  flushPendingRemoteProjectPatch,
} from '../projectSyncRemoteApply.js';
