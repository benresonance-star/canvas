# Spec data plane migration runbook

This documents Phase 2–3 of the agent chat dock / spec migration program relative to
`Specs/Canvas data architecture Spec -Claude.md`.

## Phase 2 (shipped): `artifactPlacements` in project JSON

- **Field:** `artifactPlacements` — map of canonical sync key → `{ surface, record }`
- **Version:** `artifactPlacementsVersion: 1`
- **Load:** `normalizeLoadedProject` → `reconcileArtifactPlacements` (map authoritative when present; legacy arrays migrated on first load)
- **Save:** `buildProjectSavePayload` → `attachArtifactPlacementsToPayload`
- **Behavior:** `cards` and `stagedSyncCards` remain in the payload for backward compatibility

## Phase 3 (partial): Postgres spec tables + dual-write

### Tables (`server/migrations/0010_spec_data_plane.sql`)

- `spec_resource`, `spec_project_resource`
- `spec_note`, `spec_url_link`, `spec_note_link`
- `spec_canvas_state` (layout + viewport + version)
- `spec_chat`

### API routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/canvas/projects/:id/spec-canvas` | Fetch spec layout/viewport |
| PUT | `/canvas/projects/:id/spec-canvas` | Save with `expectedVersion` CAS |
| GET | `/spec/resources/:id` | Resource + reference count |
| POST | `/canvas/projects/:id/spec-resources/:rid/link` | Add project reference |
| POST | `/canvas/projects/:id/spec-resources/:rid/detach` | Detach (repoint reference) |
| GET/POST/DELETE | `/spec/notes/:noteId/links` | Note → resource links |

### Client dual-write

- **Save:** `syncSpecCanvasStateFromPayload` after project document PUT
- **Load:** `reconcileSpecCanvasOnLoad` logs drift; **project JSON remains authoritative**

### Not yet implemented (spec §11 gaps)

- Shared resource store on disk (`<shared_store>/resources/`)
- `projects.root_path` with `notes/` and `chats/` layout migration
- Full UUIDv7 identity everywhere (still filename keys in JSON)
- Live cross-project resource propagation
- UI: “Used in N projects” from `spec_project_resource` count
- Connectors rendered from `spec_note_link` only (still `relationship` primitives)
- Hard cutover: DB-only layout without `canvas_project_document`

## Applying migrations

```bash
cd canvas
npm run db:migrate
```

## Interim project document revision sync

Until layout is fully authoritative in `spec_canvas_state`, the client keeps `canvas_project_document.revision` in sync via:

- `reconcileActiveProject` on poll, visibility resume, and project switch (adopt revision when payloads match; push or pull otherwise)
- `seedClientRevisionFromMeta` after cache-first project load
- No blocking “stale tab” — revision drift is healed automatically when possible

Target spec (Postgres-authoritative structure) remains described in `Specs/Canvas data architecture Spec -Claude.md`.

## Verification

1. Phase 1 manual checklist in the plan (dock-only chats, no repeat SYNC modal, no canvas+dock duplicate).
2. Save a project — inspect JSON for `artifactPlacements`.
3. With API + Postgres up — `GET /canvas/projects/{id}/spec-canvas` returns layout mirroring cards/staging.
