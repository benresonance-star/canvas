# Placement persistence — manual QA checklist

## Architecture (arrays first)

`cards` and `stagedSyncCards` are authoritative for what appears on canvas vs dock.
`artifactPlacements` is derived on load (`normalizeLoadedProject` patches the map from arrays)
and on save (`commitProjectDocument`). Inbound server merges use `mergeProjectDocuments` in
`projectDocumentMerge.js`. Map-only `deriveArraysFromPlacements` runs only when both arrays
are empty (legacy migration).

Enable audit logging in devtools before reproducing:

```js
localStorage.setItem('canvas-placement-audit', '1');
localStorage.setItem('canvas-sync-trace', '1'); // PATCH/SSE correlation (Phase 3)
```

Reload, reproduce, then filter the console for `[canvas:placement-audit]` and `[canvas:sync-trace]`.

Server terminal (optional): `CANVAS_SYNC_TRACE=1 npm run server`

## Scenarios

1. **Immediate refresh** — Drag artifact from dock to canvas → hard refresh (F5) → artifact remains on canvas at the same position.
2. **Delayed refresh** — Dock → canvas → wait 5s (server push may complete) → refresh → still on canvas.
3. **Project switch** — Dock → canvas → switch to another project → switch back → still on canvas.
4. **Server sync on** — With API running (`:3001`), repeat (1)–(3); local canvas should win over stale server dock until push succeeds.
5. **Server sync off** — Local-only mode; (1)–(3) should still pass via IndexedDB.
6. **Refresh after dock → canvas (2+ items)** — Move two artifacts to canvas, refresh → canvas keeps both; remaining dock items stay in dock.
7. **Refresh with linked folder** — Reconnect prompt is OK; after one Sync click, folder links; canvas layout unchanged.
8. **No spurious boot timeout** — With cards in IndexedDB, canvas paints within ~30s without “Sync took too long” (post-boot server work may continue silently).

## Realtime (PATCH + SSE, `VITE_CANVAS_PATCH_SYNC` not `false`)

9. **Two browsers, same project** — Browser A: dock→canvas → Browser B shows canvas placement within ~2s **without** focusing B.
10. **Two browsers, drag** — A moves a card → B position matches without refresh.
11. **SSE off / API down** — Edits stay in A’s local cache; focus B → `visibilityResume` heals; no data loss.
12. **Conflicting edit** — A and B move the same card → one revision wins via merge; no duplicate keys; audit must not show silent dock revert after a canvas transfer.

## Cross-browser server document (footer Sync)

13. **Postgres document exists** — Browser A: edit canvas → **Sync** → `SELECT COUNT(*) FROM canvas_project_document WHERE project_id = '<id>'` is 1. Browser B: same project → **Sync** (no folder scan) → layout matches A; success banner may show revision number.
14. **Spec layout write-through** — With API up, move a card → Network shows `PUT .../spec-canvas` (or follows project PUT). B refreshes or Sync → positions match when `spec_canvas_state.version` aligns with document revision.

## What to look for in audit logs

| Step | Expected |
|------|----------|
| `transfer:stagedToCanvas` | Map surface `canvas` for moved key |
| `commit:placementTransfer:canvas` | Same map + card on canvas |
| `load:normalize` (after refresh) | Map still `canvas`, card in `cards` |
| `pull:merged` (if server pull runs) | Local canvas preserved, not reverted to dock |

## Pass criteria

- No step after transfer should be the first to show dock-only for a key the user placed on canvas.
- `artifactPlacements[key].surface === 'canvas'` matches visible canvas membership after load.

---

## Placement commit debug (hypothesis-first)

Use this **before** changing placement or projection code. It extends sync trace with projection state and durable readback.

### Enable tracing

```js
localStorage.setItem('canvas-sync-trace', '1');
localStorage.setItem('canvas-placement-audit', '1');
// reload
```

Optional server: `CANVAS_SYNC_TRACE=1 npm run server`

### Three-layer checklist (one drag attempt)

| Layer | What to capture | Pass |
|-------|-----------------|------|
| **1. Trace chain** | Filter `[canvas:sync-trace]` for one `traceId` | `ui:placement-canvas` → `commit:done` OR `placement:commit-deferred` → `placement:commit-flush` → `placement-sync:dispatch` |
| **2. Projection** | `window.__canvasProjectionSnapshot()` at drop time | `canMutateCanvas: true` for steady state (S1); if false, note `phase` / `hydrated` |
| **3. Storage** | `window.__canvasDocumentSnapshot()` **before F5** | `cardCount >= 1`, `canvasPlacementKeys` includes moved key |

### Scenario matrix

| ID | Steps | Expected at drop |
|----|-------|------------------|
| **S1** | Load project, wait 5s, dock→canvas | `phase: ready`, `canMutateCanvas: true` |
| **S2** | Switch project, drag within 2s | May show `placement:ui-before-ready` + `placement:commit-deferred`; must get `placement:commit-flush` before F5 |
| **S3** | New project, drag before load settles | Same as S2 or deferred sync flush |
| **S4** | No project selected | No `ui:placement-canvas`; `activeProjectId` null |

### Hypothesis decision tree

| Observation | Likely cause |
|-------------|--------------|
| Card never appears on canvas | H1a (blocked before transfer) or H3 (no project) |
| Card on canvas, no `commit:done`, has `placement:commit-deferred` | H1b — commit deferred until projection ready (fixed by flush when `canMutateCanvas` true) |
| `commit:done` but `__canvasDocumentSnapshot` still dock-only | Commit bug or wrong `projectId` |
| Storage has canvas, F5 loses it | H4 server/load merge — retry with server sync off |
| `actionSync:placement-no-commit` | H5 — push without committed payload |

### Evidence log template

| Scenario | Card on UI? | `canMutateCanvas` | `commit:done`? | `canvasPlacementKeys` before F5 | After F5? |
|----------|-------------|-------------------|----------------|-----------------------------------|-----------|
| S1 | | | | | |
| S2 | | | | | |

### Automated probes (CI)

```bash
cd canvas
npx vitest run src/lib/__tests__/placementCommitHypothesis.test.js src/lib/__tests__/placementPersistenceIntegration.test.js
```

- `placementCommitHypothesis.test.js` — I6 matrix + commit gate when ref false.
- `placementPersistenceIntegration.test.js` — pipeline works when guards are off (control).
