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
- `healProjectsMissingServerDocuments`
- `shouldFallbackToPutAfterPatch`

### Document

- `pushProjectDocumentIfLocalNewer`
- `flushOutgoingProjectDocument`
- `startProjectSyncStream` / `stopProjectSyncStream` (SSE inbound)
- `applyRemoteProjectPatch` / `flushPendingRemoteProjectPatch`
- `isProjectPatchSyncEnabled` / `getProjectSyncClientId`

### HTTP (server)

- `PATCH /canvas/projects/:projectId` — body `{ ops, expectedRevision, clientId?, reason?, traceId?, allowEmptyRemoteOverwrite?, allowDockOnlyRemoteOverwrite? }`
- `GET /canvas/projects/:projectId/stream` — SSE `project_updated` + `revision` heartbeat
- `GET /canvas/index/stream` — SSE `index_updated` + `revision` heartbeat (project list / renames)
- `PUT /canvas/projects/:projectId` — full document fallback (conflicts, large diffs); accepts the same overwrite guard flags as PATCH
- `pullProjectDocumentIfServerNewer`
- `reconcileProjectDocumentOnSwitch`
- `persistProjectDocumentLocally`
- `loadSyncedProjectDocument`
- `saveSyncedProjectDocument`
- `deleteSyncedProjectDocument`
- `flushProjectSync`
- `hasLocalProjectDocument`
- `prefetchProjectDocumentFromServer`

## Document push invariants

- Empty local payloads must not overwrite non-empty server documents unless `allowEmptyRemoteOverwrite` is explicitly true or the commit is an intentional authoritative empty repair.
- Dock-only payloads must not overwrite server documents that still have canvas cards unless `allowDockOnlyRemoteOverwrite` is true for the explicit dock transfer path.
- Server payloads carrying `identityRepair.authoritative` or `identityRepair.authoritativeEmpty` are authoritative repair documents and may replace richer local cache state.
- Successful PATCH/PUT writes update the client revision, workspace index document revision, local serialised cache, and best-effort `spec_canvas_state` projection.

## Module boundaries (incremental)

Implementation files stay in `src/lib/sync/`; optional entry points group responsibilities without changing the barrel path:

| Module path | Responsibility |
|-------------|----------------|
| `sync/document/index.js` | PUT/PATCH, pull, reconcile |
| `sync/workspaceIndex/index.js` | Index merge, push, ghost repair |
| `sync/stream/index.js` | SSE + remote patch apply |

## Verification

```bash
node scripts/verify-project-sync-exports.mjs
```
