/**
 * Backward-compatible barrel for project sync. Implementation lives in ./sync/*.
 */
export {
  setCacheEvictionContext,
  resetProjectSyncState,
  isServerSyncEnabled,
  getProjectSyncMode,
  consumeProjectSyncRecoveryNotice,
  shouldShowOpenInCursorToSync,
  shouldShowDatabaseUnavailable,
} from './sync/projectSyncState.js';

export {
  getClientRevision,
  setSyncLockListener,
  seedClientRevisionFromMeta,
  migrateRevisionsOnIndexRepair,
} from './sync/projectSyncRevision.js';

export {
  parseServerUpdatedAt,
  projectCardCount,
  projectPayloadFingerprint,
  payloadsEquivalent,
  mergeProjectRow,
  preserveMergedLocalRowsWithCards,
  mergeProjectIndices,
} from './sync/projectSyncMerge.js';

export {
  hasPendingProjectSave,
  cancelPendingProjectSave,
} from './sync/projectSyncPending.js';

export {
  getLastServerWorkspaceIndexUpdatedAt,
  pullAndMergeProjectIndex,
  patchIndexDocumentRevision,
  applyWorkspaceIntegrityRepair,
  loadSyncedProjectIndex,
  saveSyncedProjectIndex,
  healProjectsMissingServerDocuments,
} from './sync/projectSyncIndex.js';

export {
  pushProjectDocumentIfLocalNewer,
  flushOutgoingProjectDocument,
  pullProjectDocumentIfServerNewer,
  reconcileProjectDocumentOnSwitch,
  persistProjectDocumentLocally,
  loadSyncedProjectDocument,
  saveSyncedProjectDocument,
  deleteSyncedProjectDocument,
  flushProjectSync,
  hasLocalProjectDocument,
  prefetchProjectDocumentFromServer,
  checkServerRevisionAhead,
  peekServerProjectRevision,
  reconcileSyncLock,
  adoptSyncLockForProject,
  reconcileActiveProject,
  recordGoodLocalCardCount,
  getLastGoodLocalCardCount,
  clearLastGoodLocalCardCount,
  preserveCanvasCardsInMergedPayload,
} from './sync/projectSyncDocument.js';

export {
  initializeProjectSync,
  runProjectSyncBackground,
} from './sync/projectSyncInit.js';

export {
  startProjectSyncStream,
  stopProjectSyncStream,
} from './sync/projectSyncStream.js';

export {
  startWorkspaceIndexSyncStream,
  stopWorkspaceIndexSyncStream,
} from './sync/workspaceIndexSyncStream.js';

export {
  applyRemoteProjectPatch,
  flushPendingRemoteProjectPatch,
  setRemotePatchAppliedListener,
} from './sync/projectSyncRemoteApply.js';

export { getProjectSyncClientId } from './sync/projectSyncClientId.js';

export { isProjectPatchSyncEnabled } from './sync/projectPatchSync.js';

export { shouldFallbackToPutAfterPatch } from './sync/projectSyncPatch.js';

export {
  getProjectConflict,
  clearProjectConflict,
  recordProjectConflict,
} from './sync/projectSyncConflict.js';
