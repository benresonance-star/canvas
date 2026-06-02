/**
 * Workspace index sync module boundary (merge, push, ghost repair).
 * @see ../../../../docs/PROJECT_SYNC_API.md
 */
export {
  getLastServerWorkspaceIndexUpdatedAt,
  pullAndMergeProjectIndex,
  patchIndexDocumentRevision,
  applyWorkspaceIntegrityRepair,
  loadSyncedProjectIndex,
  saveSyncedProjectIndex,
  healProjectsMissingServerDocuments,
} from '../projectSyncIndex.js';
