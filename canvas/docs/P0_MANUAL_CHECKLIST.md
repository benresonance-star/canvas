# P0 refactor — manual regression checklist

Run before and after Phase 0/1 (`projectSync` split). Record pass/fail and date.

| # | Scenario | Pre-refactor | Post-refactor |
|---|----------|--------------|---------------|
| 1 | **Boot:** project list loads; active project paints from cache without long blank screen | — | pending manual |
| 2 | **Project switch:** layout/viewport preserved when switching away and back | — | pending manual |
| 3 | **Placement:** same folder artifact never on canvas **and** dock (tray drag / place from dock) | — | pending manual |
| 4 | **Agent chat:** new chat lands in sync dock; no repeat SYNC modal for same file | — | pending manual |
| 5 | **Folder sync:** non–`agent_chat` new files show SYNC confirm; `agent_chat` auto-stages | — | pending manual |
| 6 | **Save:** project JSON includes `artifactPlacements` after edit + save | — | pending manual |
| 7 | **Server (optional):** `GET /canvas/projects/{id}/spec-canvas` mirrors layout when API + Postgres up | — | pending manual |

## Placement write baseline (Phase 2 prep)

- `setStagedSyncCards` in `src/App.jsx`: **11** occurrences (grep baseline 2026-05-31)
- Phase 2 will add `scripts/check-placement-writes.sh` with allowlist

## Automated baseline

| Metric | Value |
|--------|-------|
| Command | `npm test` (in `canvas/`) |
| Date | 2026-05-31 |
| Result | 81 files, 405 tests passed |
| Duration | ~2.0s |
| Post-split automated | 2026-05-31: 81 files, 406 tests passed (~1.9s) |

## References

- [ARCHITECTURE_MASTER_SPEC.md](./ARCHITECTURE_MASTER_SPEC.md)
- [PROJECT_SYNC_API.md](./PROJECT_SYNC_API.md)
