# Canvas Core Phase 4: Legacy Authority Contraction

## Checkpoint 1: canonical placement writes

User-note canvas move and resize commits can now write directly to `artifact_view` when both rollout flags are canonical:

```dotenv
VITE_USER_NOTE_ARTIFACT_VIEWS=canonical
VITE_USER_NOTE_ARTIFACT_VIEW_WRITES=canonical
```

The server locks the project document and active artifact views, checks each expected view version, updates canonical geometry, increments view versions, writes the legacy card geometry as a compatibility projection, increments the document revision, and records an `artifact_view_placement_updated` event in one transaction.

The compatibility projection is deliberately retained at this checkpoint. It keeps older clients and rollback safe while write authority moves to `artifact_view`.

## Routing boundary

The direct canonical command applies only when a layout commit contains one or more user-note cards and every card has an unambiguous artifact identity and canonical view version. These operations remain on the document compatibility path:

- canvas viewport commits;
- dock-to-canvas and canvas-to-dock transfers;
- mixed-card or non-note layout commits;
- notes without a canonical view/version;
- a canonical request that fails or conflicts.

## Rollback

Set `VITE_USER_NOTE_ARTIFACT_VIEW_WRITES=legacy` and restart the frontend stack. Canonical reads may remain enabled independently. No data migration or schema rollback is required.

## Subsequent contraction checkpoints

Checkpoint 2 routes eligible user-note dock/canvas transfers through an explicit, version-checked artifact-view surface command. The command archives the source-surface view, creates the target-surface view, verifies the supplied compatibility projection contains exactly one target note and no source note, persists that projection, records an `artifact_view_surface_transferred` event, and publishes the new project revision atomically. Dock views are composed with their canonical version so the reverse transfer is also concurrency-safe.

Before removing the compatibility trigger or legacy note geometry, production telemetry must show successful canonical placement and surface-transfer writes with no unresolved version, identity, or projection mismatches. The next checkpoint should remove remaining user-note geometry writes from generic document commits and make the legacy trigger verification-only. Destructive legacy-column or payload cleanup remains a separate, explicitly approved migration after all readers and writers have moved.

## Checkpoint 3: verification authority

Migration `0030_artifact_view_write_authority.sql` introduced the reversible database authority mode used during the checkpoint 3 rollout. `projection` preserved the Phase 1 behavior and `verification` guarded the canonical cutover.

In `verification` mode, generic project-document writes may create the first view for a genuinely new note and archive views for a deleted note. They cannot change existing note geometry or move an existing note between surfaces. Those changes must already have been committed through the explicit canonical placement or transfer command, otherwise the document transaction is rejected.

These temporary switch commands and the runtime setting were removed by checkpoint 5 after lifecycle authority became explicit.

## Checkpoint 4: payload geometry contraction

Migration `0031_contract_user_note_geometry.sql` moves the verification and lifecycle trigger to `BEFORE` document persistence and adds a second ordered trigger that strips `x`, `y`, `width`, `height`, `zIndex`, and transient view versions from eligible canvas user notes. Artifact identity and content references remain in the project document; rendered placement is reconstructed from `artifact_view` on every load.

Canonical read and write modes are now the defaults. A canonical view read failure fails the project load closed rather than rendering geometry-less notes. Pending or unresolved notes keep their compatibility geometry until they acquire an unambiguous artifact identity and active view.

During checkpoint 4, `projection` mode remained an emergency reconstruction path. Checkpoint 5 removed that path after explicit lifecycle authority replaced the triggers.

## Checkpoint 5: explicit lifecycle authority

Migration `0032_remove_artifact_view_projection_triggers.sql` replaces both document triggers with `prepare_user_note_artifact_view_document(project_id, payload)`. Every accepted project-document INSERT or UPDATE invokes this lifecycle function inside the same SQL statement and transaction. It creates the first canonical view for a new identified note, validates that existing geometry/surface changes were performed by explicit commands, archives removed-note views, and returns the contracted document payload.

The projection trigger functions, runtime authority table, and projection switch commands are removed. Canonical artifact views are now the sole persisted placement authority for identified user notes. Recovery requires restoring canonical views from database backup or a purpose-built repair operation; switching the client to legacy mode is no longer a valid rollback.
