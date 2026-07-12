# Canvas Core Phase 2 — Shadow rollout

## Objective

Prove that canonical `user_note` artifact views remain equivalent to legacy project-document placement under normal use before canonical reads are enabled. Shadow mode never changes rendered geometry.

## Deployment sequence

1. Apply migrations through `0029_artifact_view_diagnostics.sql`.
2. Run `node scripts/audit-user-note-identity.mjs` and require zero unresolved identities.
3. Run `node scripts/backfill-user-note-views.mjs --apply`, followed by `node scripts/backfill-user-note-views.mjs --strict`; require zero unresolved identities and zero authoritative geometry mismatches.
4. Set `VITE_USER_NOTE_ARTIFACT_VIEWS=shadow` at client build time and deploy.
5. Exercise project load, note movement/resizing, docking/restoring, refresh, and A → B → A switching.
6. Inspect `GET /canvas/projects/:projectId/artifact-view-diagnostics?hours=24` or run `npm run report:artifact-view-rollout -- --hours 24`.
7. Require recorded loads and zero mismatch/fallback categories for the observation window.

## Promotion gate

Canonical reads may be proposed only when all are true:

- identity audit has zero unresolved notes;
- backfill is idempotent and complete;
- shadow telemetry contains `loads` for representative projects;
- `missing_view`, identity, surface, geometry, duplicate, version, and fallback counts are zero;
- project switching and dock/canvas transfers preserve visible placement;
- the full test, sync, lint, import-boundary, migration, and build gates pass.

Use `--strict` for an automation-friendly report. It exits non-zero when no evidence exists or when a mismatch/fallback category is present.

```bash
npm run report:artifact-view-rollout -- --hours 24 --strict
```

## Rollback

Set `VITE_USER_NOTE_ARTIFACT_VIEWS=legacy` and rebuild/redeploy the client. The legacy project document remains intact and authoritative. Diagnostic writes may remain enabled because legacy mode does not issue comparison reports.

Do not delete artifact views or diagnostic history during rollback; both are evidence for root-cause analysis and a later retry.
