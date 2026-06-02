/**
 * Document sync module boundary (PUT/PATCH, pull, reconcile).
 * @see ../../../../docs/PROJECT_SYNC_API.md
 */
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
} from '../projectSyncDocument.js';

export {
  pushProjectPatchIfEnabled,
  shouldFallbackToPutAfterPatch,
} from '../projectSyncPatch.js';
