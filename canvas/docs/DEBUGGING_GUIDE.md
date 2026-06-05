# Canvas debugging guide

Architecture reference: [ARCHITECTURE_MASTER_SPEC.md](ARCHITECTURE_MASTER_SPEC.md). Agent protocol: [AGENTS.md](../AGENTS.md). Placement QA: [placement-persistence-qa.md](placement-persistence-qa.md).

## Enable tracing

```js
localStorage.setItem('canvas-sync-trace', '1');
localStorage.setItem('canvas-placement-audit', '1');
// reload
```

Legacy aliases (also accepted): `canvas:sync-trace`, `canvas:placement-audit`.

Server API trace: `CANVAS_SYNC_TRACE=1 npm run server`

Filter console: `[canvas:sync-trace]`, `[placement-audit]`

### Dev helpers (Vite DEV)

| Helper | Purpose |
|--------|---------|
| `window.__canvasProjectionSnapshot()` | `phase`, `hydrated`, `canMutateCanvas`, revision |
| `window.__canvasDocumentSnapshot(projectId?)` | committed card/placement keys |

## Projection layers

When menu, header, and canvas disagree, name which layer failed to update:

| Layer | Location |
|-------|----------|
| Menu highlight | `pendingSwitchProjectId` |
| Committed selection | `activeProjectId`, `activeProjectIdRef` |
| Workspace phase | `useWorkspaceProjection` → `phase`, `canMutateCanvas` |
| Index | `index.activeProjectId` (IDB / `canvas:project-index`) |
| Server index | Postgres + SSE `index_updated` |
| Canvas body | `state.cards`, `stagedSyncCards` |
| Durable layout | `commitProjectDocument` → IDB + PATCH |
| Folder | IDB handle + `connectedFolderName` |

Invariants: [syncProjectionInvariants.js](../src/lib/syncProjectionInvariants.js) (I1–I6).

## Flow trace stages (by user action)

With `canvas-sync-trace` enabled, filter by `stage` in JSON logs.

### 1. Create project

| Stage | Module | Meaning |
|-------|--------|---------|
| `project:create-ui-start` | useProjectWorkspace | User confirmed name |
| `project:create-start` | projects.js | Index row + empty doc |
| `project:create-done` | projects.js | Index saved, optional server push |
| `project:create-ui-loaded` | useProjectWorkspace | After createProject, before load |
| `project:load-start` | useProjectSyncLifecycle | loadProjectIntoState |
| `project:load-done` | useProjectSyncLifecycle | Canvas hydrated |
| `commit:done` | projectDocumentCommit | Durable write (if edits follow) |

**Check:** `__canvasDocumentSnapshot(newId)` shows index row; cardCount 0 for empty project.

### 2. Switch project

| Stage | Module | Meaning |
|-------|--------|---------|
| `project:switch-start` | useWorkspaceProjection | User selected project |
| `project:switch-outgoing-commit` | useWorkspaceProjection | Save leaving project (awaited before target load) |
| `project:switch-outgoing-done` | useWorkspaceProjection | Outgoing IDB commit finished |
| `project:load-start` / `project:load-done` | useProjectSyncLifecycle | Target hydrated |
| `project:load-superseded` | useProjectSyncLifecycle | Stale switch ignored (I5) |
| `project:switch-load-ok` / `project:switch-load-failed` | useWorkspaceProjection | Paint result |
| `project:switch-finally` | useWorkspaceProjection | Cleared pending/loading |
| `project:switch-skip` | useWorkspaceProjection | Same id already hydrated |

**Browser I1 check:** menu checkmark row name === header `textbox` (see AGENTS.md).

### 3. Delete project

| Stage | Module | Meaning |
|-------|--------|---------|
| `project:delete-ui-start` | useProjectWorkspace | Confirm clicked |
| `project:delete-start` | projects.js | Tombstone + doc delete |
| `project:delete-done` | projects.js | Index saved, `switchToId` if any |

**Check:** deleted id absent from menu; watch `deleteServerMayPersist` banner if server index lags.

### 4. Link folder + import artifacts

| Stage | Module | Meaning |
|-------|--------|---------|
| `folder:link-done` | useFolderLinkScan | Handle in IDB + index name |
| `folder:scan-start` | useFolderLinkScan | Reading disk |
| `folder:scan-done` | useFolderLinkScan | Scan finished (see exitStatus) |
| `requestActionSync` / `folderScan` | actionSync | Push after scan |

Footer **Sync** does not rescan disk when already linked (by design). Connect/reconnect triggers scan.

### 5. Add artifacts to canvas

| Stage | Module | Meaning |
|-------|--------|---------|
| `ui:placement-canvas` | useCanvasDocument | User dock→canvas |
| `placement:commit-deferred` | useActionSync | I6 gate blocked commit |
| `placement:commit-flush` | useActionSync | Deferred commit replayed |
| `commit:done` | projectDocumentCommit | IDB + cache updated |
| `placement-sync:dispatch` | actionSync | PATCH push |

**Check:** `__canvasDocumentSnapshot()` → `canvasPlacementKeys` includes moved key before F5.

### 6. Switch away and back (preserve edits)

Compose actions 2 + 5 (placement-persistence-qa.md **scenario 3**).

**On leave project A** (while `activeProjectId` is still A):

1. `placement:commit-flush` if a deferred dock→canvas commit existed
2. `project:switch-outgoing-commit` → **`commit:done`** (`projectSwitch:outgoing`) → `project:switch-outgoing-done`
3. Then `project:switch-load-ok` for B

**On return to A:**

1. `project:load-done` with same `cardCount` as `__canvasDocumentSnapshot` before leave
2. No `project:load-superseded` on the active switch
3. `[placement-audit]` `load:projectIntoState` — `mapCanvas` matches visible cards

**Fail signals:** `placement:commit-deferred` without `commit:done` before B load; `cardCount` 0 in snapshot after return.

## Trace table template

| Step | File / function | projectId | revision / switchSeq | Drift risk |
|------|-----------------|-----------|----------------------|------------|
| 1 | | | | |

Questions:

1. Where is the entity **first** changed?
2. Where is it **persisted** (IDB vs Postgres)?
3. Where is **SSE** emitted/consumed?
4. Where does the **menu** read?
5. Where does the **canvas** read?
6. Can stale SSE or `switchSeq` overwrite newer state?

## Symptom → layer

| Symptom | Likely layer | First check |
|---------|--------------|-------------|
| Menu/title wrong | I1 projection | `__canvasProjectionSnapshot` |
| Lost after refresh | Commit / load merge | `commit:done` + snapshot before F5 |
| Lost after switch back | Outgoing commit / pull | `project:switch-outgoing-commit`, `pull:merged` |
| Folder won’t link | IDB / permissions | `folder:link-done` |
| Stale import dialog | scan seq | `folder:scan-done` + `invalidateFolderScan` |
| Cross-browser wrong | revision CAS | `db:patch-conflict` |
| Local-only OK, server fails | merge / sync off | retry with API down |

## Automated probes

```bash
cd canvas
npm run test:sync
npx vitest run src/lib/__tests__/placementCommitHypothesis.test.js \
  src/lib/__tests__/placementPersistenceIntegration.test.js \
  src/lib/__tests__/syncProjectionInvariants.test.js \
  src/lib/__tests__/projectSwitch.test.js \
  src/lib/sync/__tests__/syncTrace.test.js
```

## DB inspection

```bash
cd canvas
npm run db:migrate
node scripts/list-db-projects.mjs
```

## Cursor browser checklist (menu/canvas bugs)

1. `browser_navigate` → `http://localhost:5173/`
2. `browser_lock`
3. `browser_snapshot` — header + Projects menu
4. Switch project → wait for loading to clear
5. **Assert I1:** checkmark name === header textbox
6. `browser_console_messages` — filter `[canvas:sync-trace]`
7. `browser_lock` unlock

Prerequisites: API `:3001`, Vite `:5173`, Postgres when testing server sync.
