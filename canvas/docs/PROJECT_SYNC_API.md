# projectSync.js — stable public API

All symbols below **must** remain exported from [`src/lib/projectSync.js`](../src/lib/projectSync.js) (re-export barrel). Do not rename the barrel path — tests mock `../projectSync.js` directly.

## Consumers

| Module | Usage |
|--------|--------|
| `projects.js` | Re-exports most sync surface to the app |
| `persistence.js` | `initializeProjectSync`, `loadSyncedProjectDocument`, `persistProjectDocumentLocally`, `flushOutgoingProjectDocument` |
| `actionSync.js` | `cancelPendingProjectSave`, `flushOutgoingProjectDocument`, `persistProjectDocumentLocally` |
| `projectReconcile.js` | `isServerSyncEnabled`, `hasLocalProjectDocument`, `loadSyncedProjectIndex`, `saveSyncedProjectIndex` |

## Exported symbols (frozen)

### State / init

- `setCacheEvictionContext`
- `resetProjectSyncState`
- `isServerSyncEnabled`
- `getProjectSyncMode`
- `initializeProjectSync`
- `runProjectSyncBackground`
- `consumeProjectSyncRecoveryNotice`
- `shouldShowOpenInCursorToSync`
- `shouldShowDatabaseUnavailable`
- `getLastServerWorkspaceIndexUpdatedAt`

### Revision / sync lock

- `getClientRevision`
- `setSyncLockListener`
- `seedClientRevisionFromMeta`
- `migrateRevisionsOnIndexRepair`
- `parseServerUpdatedAt`
- `reconcileSyncLock`
- `adoptSyncLockForProject`
- `reconcileActiveProject`
- `checkServerRevisionAhead`
- `peekServerProjectRevision`

### Merge (pure)

- `projectCardCount`
- `projectPayloadFingerprint`
- `payloadsEquivalent`
- `mergeProjectRow`
- `preserveMergedLocalRowsWithCards`
- `mergeProjectIndices`

### Pending saves

- `hasPendingProjectSave`
- `cancelPendingProjectSave`

### Index

- `pullAndMergeProjectIndex`
- `patchIndexDocumentRevision`
- `applyWorkspaceIntegrityRepair`
- `loadSyncedProjectIndex`
- `saveSyncedProjectIndex`

### Document

- `pushProjectDocumentIfLocalNewer`
- `flushOutgoingProjectDocument`
- `pullProjectDocumentIfServerNewer`
- `reconcileProjectDocumentOnSwitch`
- `persistProjectDocumentLocally`
- `loadSyncedProjectDocument`
- `saveSyncedProjectDocument`
- `deleteSyncedProjectDocument`
- `flushProjectSync`
- `hasLocalProjectDocument`
- `prefetchProjectDocumentFromServer`

## Verification

```bash
node scripts/verify-project-sync-exports.mjs
```
