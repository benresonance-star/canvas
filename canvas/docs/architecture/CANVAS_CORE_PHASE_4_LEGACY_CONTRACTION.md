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

Migration `0030_artifact_view_write_authority.sql` adds a reversible database authority mode. `projection` remains the migration default and preserves the Phase 1 trigger behavior. After the canonical gate passes, switch with:

```powershell
npm.cmd run artifact-view:authority:verification
npm.cmd run gate:artifact-view-authority
```

In `verification` mode, generic project-document writes may create the first view for a genuinely new note and archive views for a deleted note. They cannot change existing note geometry or move an existing note between surfaces. Those changes must already have been committed through the explicit canonical placement or transfer command, otherwise the document transaction is rejected.

Immediate database rollback is:

```powershell
npm.cmd run artifact-view:authority:projection
```

This database switch complements the frontend `VITE_USER_NOTE_ARTIFACT_VIEW_WRITES` flag. Keep both rollback controls documented until the compatibility payload and trigger are removed in a separately approved destructive migration.
