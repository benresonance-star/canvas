# Canvas — Agent sync protocol

Instructions for Cursor Composer and other coding agents working on this app.

**Architecture reference:** [docs/ARCHITECTURE_MASTER_SPEC.md](docs/ARCHITECTURE_MASTER_SPEC.md) (load/commit authority §4, debugging §9).

**Local dev stack:** [docs/DEV_STACK.md](docs/DEV_STACK.md) — agent prompts **start canvas** / **restart canvas** / **stop canvas**.

## Mental model

| Layer | Role |
|-------|------|
| **Postgres** | Truth when `isServerSyncEnabled()` is true |
| **IndexedDB / localStorage** | Local cache (local-first writes) |
| **HTTP PATCH/PUT** | Commands with `expectedRevision` CAS |
| **SSE** (`EventSource`) | Committed change notifications — **not** WebSockets |
| **React (`useAppShell`)** | Projection: `state`, `activeProjectId`, `projectList`, refs |

Realtime: `project_updated` (document) and `index_updated` (workspace menu) via SSE.

## Frozen entry points

Do not bypass these from UI or new features:

| Operation | Entry |
|-----------|--------|
| Load structure | `loadProjectStructure` → `loadProjectIntoState` |
| Persist layout | `commitProjectDocument` |
| Workspace index | `saveSyncedProjectIndex` / index SSE |

## Debugging (before you edit)

### Cursor browser verification (required for menu/canvas/header bugs)

Use the **cursor-ide-browser** MCP. Do not claim projection bugs fixed without a browser pass.

**Prerequisites:** Postgres + API (`http://localhost:3001`) + Vite (`http://localhost:5173`). Boot with `npm run dev:stack` from `canvas/` (see [docs/DEV_STACK.md](docs/DEV_STACK.md)).

| Step | Action |
|------|--------|
| 1 | `browser_navigate` → `http://localhost:5173/` |
| 2 | `browser_lock` |
| 3 | `browser_snapshot` — note header `textbox` value and Projects menu |
| 4 | Open Projects → click target project |
| 5 | `browser_wait_for` until `"Loading project…"` is gone (or wait 8–15s) |
| 6 | `browser_snapshot` — **assert I1:** checkmark row name === header `textbox` (trim, case-insensitive) |
| 7 | Optional: `browser_console_messages`, `browser_take_screenshot` for evidence |
| 8 | `browser_lock` unlock |

**Rules:** Phase A reproduces in browser before code edits; Phase B re-runs the same checklist after the fix. One deliberate action per step; fresh snapshot after each navigation-changing action; stop after 4 failed attempts and report the blocker.

**Dev helper (after load):** `window.__canvasProjectionSnapshot()` in dev builds — projection fields for trace tables.

```js
localStorage.setItem('canvas-sync-trace', '1');
localStorage.setItem('canvas-placement-audit', '1');
// reload — see lib/sync/syncTrace.js (legacy `canvas:sync-trace` also works)
```

Full flow guide: [docs/DEBUGGING_GUIDE.md](docs/DEBUGGING_GUIDE.md)

### Sync trace table (fill before coding)

| Step | File / function | Input | Output | entityId | revision / seq | Drift risk |
|------|-----------------|-------|--------|----------|----------------|------------|
| 1 | | | | | | |

Answer:

1. Where is the entity **first** changed?
2. Where is it **persisted** (IDB vs Postgres)?
3. Where is **SSE** emitted/consumed?
4. Where does the **menu** read? (`effectiveProjectId = pending ?? active`, `projectList`)
5. Where does the **canvas** read? (`state`, `loadProjectIntoState`)
6. Can a **stale** SSE event or superseded `switchSeq` overwrite newer state?

### Selection layers (menu/canvas drift)

When debugging menu vs canvas vs DB mismatch, name which layers updated:

- `pendingSwitchProjectId` — in-flight switch highlight
- `activeProjectId` (React) — committed UI selection
- `activeProjectIdRef` — sync/switch guard (updated before React commit on switch)
- Index `activeProjectId` (IDB / `canvas:project-index`)
- Server workspace index (SSE `index_updated`)
- `projectList` — menu rows
- Canvas: `state.projectName`, `state.cards`, `stagedSyncCards`, committed payload, IDB doc, remote patch reload

**Rule:** Change selection and canvas **together** on successful `loadProjectIntoState`, or **rollback together** on switch failure (`restoreWorkspaceProject` in `useWorkspaceProjection.js`).

**Coordinator:** [`useWorkspaceProjection.js`](src/features/workspace/useWorkspaceProjection.js) owns `selectProject`, `commitBoot`, `phase`, `canMutateCanvas`, and the read-only `projection` bundle passed to `CanvasWorkspaceView`.

## Sync invariants (I1–I6)

Pure helpers: [`src/lib/syncProjectionInvariants.js`](src/lib/syncProjectionInvariants.js)

| ID | Invariant |
|----|-----------|
| **I1** | Settled: `pendingSwitchProjectId` is null, `activeProjectId` matches index when known, `loadProjectIntoState` applied for that id; header uses `resolveHeaderProjectName` so menu checkmark === title when not dirty |
| **I2** | Persisted layout only via `commitProjectDocument` → IDB → optional PATCH/PUT |
| **I3** | `incomingRevision >= clientRevision` before applying stale server data; merge rules in `projectSyncRemoteApply` |
| **I4** | `projectList` contains active id; canvas body from project document (reload after index-only changes if needed) |
| **I5** | Stale switch handlers (`switchSeq !== seqNow`) must not call `restoreWorkspaceProject` |
| **I6** | `canMutateCanvas` — placement/drag commits only when `phase === ready`, `effectiveProjectId === committedProjectId`, and project hydrated |

**Switch + artifacts checklist:** place on A → refresh; A→B (A not on B); back to A; rapid A→B→C; drag during loading has no effect.

## Agent workflow

### Phase A — Trace only

1. **Cursor browser repro** (see above) for menu/header/canvas mismatches.
2. Reproduce with sync trace enabled.
3. Complete the trace table.
4. Identify drift layer(s). **No code yet.**

### Phase B — Smallest fix

1. **One bug per change** — no broad sync refactors.
2. **Failing test first** when possible (`npm run test:sync`, `projectSwitch.test.js`, `syncProjectionInvariants.test.js`).
3. Fix at the owning layer (`loadProjectIntoState`, `switchProject`, `applyRemoteProjectPatch`) — not `ProjectSwitcher.jsx` alone.
4. Run tests before claiming done:

```bash
cd canvas
npm run test:sync
npm run test -- src/lib/__tests__/syncProjectionInvariants.test.js src/lib/__tests__/projectSwitch.test.js
```

5. **Re-verify in Cursor browser** (menu checkmark === header name when settled).
6. Report: root cause, files changed, sync path after fix, test output, browser evidence, remaining risks.

## Hard constraints

- Do **not** add Zustand/TanStack Query for canvas documents without an approved architecture change.
- Do **not** persist layout via raw `setState` — use `commitProjectDocument` or `loadProjectIntoState`.
- Do **not** fix menu checkmarks without aligning pending, active, index, and loaded state.
- Respect deferred remote apply during drag (`projectSyncRemoteApply.js`).
- SSE is notification + ops; client still validates revision.

## What to avoid

| Avoid | Why |
|-------|-----|
| Broad “sync refactor” | Drift is usually boundary bugs between projections |
| TanStack Query as a quick fix | Not in the stack today; does not fix switch races |
| Per-card version fields | Document-level `revision` CAS already exists |
| Postgres writes on drag move | Commit on `layoutCommit` / `viewCommit` |
| Symptom fixes in `ProjectSwitcher` only | Presentational; data from `useAppShell` |

## Copy-paste prompt

```text
Canvas sync debugging rules:
1. Postgres + document revision is truth when server sync is on; IDB is cache; React state is projection.
2. Realtime is SSE (not WebSocket): project_updated + index_updated.
3. Trace before edit: UI → commitProjectDocument → PATCH/PUT → Postgres → SSE → loadProjectIntoState / setState.
4. For menu/canvas bugs, list all selection layers and whether loadProjectIntoState succeeded.
5. One bug per change; run npm run test:sync before claiming fixed.
6. Do not add duplicate stores; do not fix ProjectSwitcher alone; do not refactor broadly.
7. Enable `canvas-sync-trace` in localStorage when reproducing.
8. For menu/canvas/header bugs, verify in Cursor browser at http://localhost:5173 (menu checkmark project === header textbox value).
```
