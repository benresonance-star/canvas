# Canvas Core Phase 1 migration guide

## Current status

Migrations `0026`–`0028` are additive. Legacy `canvas_project_document` remains the compatibility command authority and the artifact-view read mode defaults to `legacy`. The PostgreSQL projection trigger maintains eligible `user_note` views atomically on accepted document PUT/PATCH writes. Dry-run/apply backfill and guarded shadow/canonical reads are available.

## Migration order

1. Run `npm.cmd run audit:migrations`.
2. Apply migrations with `npm.cmd run db:migrate`.
3. Run the identity audit: `node scripts/audit-user-note-identity.mjs`.
4. Dry run: `node scripts/backfill-user-note-views.mjs`.
5. Investigate every unresolved note before applying.
6. Apply: `node scripts/backfill-user-note-views.mjs --apply`.
7. Repeat the apply command to verify no duplicate active rows are created.
8. Enable `shadow` and review diagnostics before enabling `canonical` for a deployment.

## Feature modes

- `legacy`: project-document placements only; default and rollback mode.
- `shadow`: project-document rendering plus artifact-view comparison diagnostics.
- `canonical`: eligible canvas `user_note` geometry is composed from artifact views before `loadProjectIntoState`; missing or failed reads fall back to legacy.

## Mismatch interpretation

- `missing_view`: the note has no eligible active canonical canvas view.
- `identity_mismatch`: artifact identity differs; do not repair automatically.
- `surface_mismatch`: canvas/dock placement differs.
- `geometry_mismatch`: stable geometry differs.
- `duplicate_view`: more than one active candidate; uniqueness should prevent new cases.
- `version_mismatch`: optimistic view versions disagree once direct commands are introduced.

Diagnostics must not include note bodies.

## Rollback

1. Set `VITE_USER_NOTE_ARTIFACT_VIEWS=legacy` and rebuild/restart the client.
2. Do not delete project-document placement data.
3. Artifact-view rows may remain for diagnosis; they are ignored in legacy mode.
4. If necessary, archive affected rows instead of dropping the table.
5. A database schema rollback is not required for application rollback because the migration is additive.

## Known limitations

- Filesystem note writes cannot be atomic with PostgreSQL.
- Pending-ingest notes without one valid artifact identity remain legacy-only.
- Canonical composition currently replaces canvas geometry only; folder presence and note content remain owned by existing paths.
- Artifact-view direct write commands remain deferred; the project document is the Phase 1 compatibility command boundary.
