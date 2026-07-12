# Canvas Core Phase 3 — Canonical read rollout

## Objective

Promote canonical `artifact_view` geometry to read authority for eligible `user_note` cards while preserving the project document as the immediate rollback source.

## Promotion gate

Run the following against the target database after the Phase 2 shadow observation window:

```bash
npm run gate:artifact-view-canonical
```

The gate requires:

- zero unresolved user-note artifact identities;
- zero authoritative missing/extra/geometry view mismatches;
- recorded shadow evidence within 24 hours;
- zero shadow mismatch or read-fallback counters.

Do not promote merely because no diagnostic rows exist; absence of observation is a failed gate.

## Canonical deployment

1. Preserve a database backup and the current deploy identifier.
2. Set `VITE_USER_NOTE_ARTIFACT_VIEWS=canonical` at client build time.
3. Rebuild and deploy the client; the API and migration level remain unchanged.
4. Verify note-bearing and note-free projects through refresh and A → B → A switching.
5. Move and resize a note, dock and restore it, refresh, then confirm geometry survives.
6. Query canonical comparison/fallback diagnostics and repeat the strict authoritative audit.

Canonical mode reads artifact views even when a project switch begins from a local-only project-document snapshot. A failed artifact-view request visibly falls back to legacy geometry and records `read_fallback`.

## Acceptance window

Keep canonical mode behind the environment switch for at least one representative observation window. Require:

- zero `read_fallback` events;
- zero identity, surface, geometry, duplicate, missing, or version mismatch events;
- no placement regression across switching, refresh, docking, or restoration;
- the full repository and sync-critical CI gates remain green.

## Immediate rollback

Set `VITE_USER_NOTE_ARTIFACT_VIEWS=legacy`, rebuild, and redeploy. Do not delete artifact views, diagnostic history, migrations, or legacy placement fields. Re-run the authoritative audit before attempting canonical mode again.

Legacy placement authority must not be removed in Phase 3. That contraction is a separate Phase 4 change after the canonical acceptance window.
