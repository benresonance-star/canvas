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
} from './sync/projectSyncDocument.js';

export {
  initializeProjectSync,
  runProjectSyncBackground,
} from './sync/projectSyncInit.js';

export {
  getProjectConflict,
  clearProjectConflict,
  recordProjectConflict,
} from './sync/projectSyncConflict.js';
