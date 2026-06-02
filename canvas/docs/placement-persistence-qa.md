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
