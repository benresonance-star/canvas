# Canvas Core Phase 1 audit

Status: Gate A complete
Date: 2026-07-12
Scope: evidence gathering only; no runtime or schema behavior changed

Final implementation update: Gates B–D subsequently completed. Migrations `0026`–`0028`, transactional application services, feature modes, backfill, canonical browser verification, and rollback verification are now implemented. The final verification matrix is recorded in the implementation handoff.

## Executive finding

The proposed `user_note` artifact-view slice fits the current architecture only if canonical artifact identity is resolved before view backfill. The repository already separates some artifact identity from cards through `versions[].artifactRef.id`, but note creation deliberately tolerates ingest failure and creates a usable card with `artifactRef: null` and `artifactSyncState: pending`. A card ID, filename, relative path, or sync key therefore cannot be promoted silently to canonical artifact identity.

The existing project-document boundary should remain the only client write boundary during Phase 1. `commitProjectDocument` persists locally and optionally calls `flushOutgoingProjectDocument`; Postgres `canvas_project_document` remains rendered-canvas authority. If artifact views are introduced, the safest shadow-write location is the server transaction that accepts the project-document CAS, not an independent browser request.

The repository has also implemented part of the proposed Phase C already: `server/services/artifactService.js` wraps artifact lifecycle changes, artifact-event append, and canvas-event append in a PostgreSQL transaction. Phase C should complete this boundary rather than introduce a parallel application service.

## Baseline and working-tree state

The working tree was already dirty before this audit. In particular, `server/repositories/artifacts.js` and multiple client artifact, agent, sync, task, and markdown files contain user-owned changes. The rewrite must not overwrite or reformat those changes. The rewrite specification itself and the `Plans/` directory are currently untracked.

Baseline commands executed through `npm.cmd` because the host PowerShell execution policy blocks `npm.ps1`:

| Command | Result | Notes |
|---|---|---|
| `npm run audit:imports` | Pass | Current audit only rejects deep sync imports from selected UI paths. |
| `npm run audit:deprecated-sync` | Report generated, exit 0 | Reports active compatibility/facade references; it is informational rather than a zero-reference assertion. |
| `npm run audit:migrations` | Pass | 25 ordered migrations. |
| `npm run build` | Pass | Existing large-chunk and ineffective-dynamic-import warnings remain. |
| `npm run lint` | Fail (baseline) | 15 existing errors in BIM, 3D/diagnostics modules; no audit-created source file is implicated. |
| `npm test` | Fail (baseline) | 340 files: 330 passed, 10 failed; 2,336 tests: 2,320 passed, 16 failed. |
| `npm run test:features` | Pass | 131 files, 935 tests. |
| `npm run test:sync` | Pass after prerequisite stabilization | 42 files, 372 tests. Initial baseline had 6 failures. |

The initial six sync failures were: four project-sync cases throwing `ReferenceError: Cannot access 'placementRef' before initialization` in `projectDocumentMerge.js`; one index-integrity case affected by the same failed server merge and retaining an extra local card; and one PostgreSQL fixture insert missing required base-artifact columns. The prerequisite stabilization pass moved `placementRef` initialization before the remote-preference branch and aligned the patch/PostgreSQL fixtures with actual repository contracts. The complete sync suite now passes.

The full-suite baseline contains those sync failures plus: a project-patch mock/result failure; two Flow route status failures; four folder/mock persistence and generated-image backfill failures; two project-name persistence expectations; and one Sonic Core gain expectation. In total, 16 baseline tests fail. These are recorded rather than repaired because they span unrelated dirty-worktree areas and Gate A is not authorized as a general regression-fix pass.

## Current source-of-truth table

| Concern | Current authority | Secondary projection/cache | Writers | Readers | Migration risk |
|---|---|---|---|---|---|
| Canvas layout | Postgres `canvas_project_document` when server sync is enabled; local project document while offline/pending | IndexedDB project cache; `spec_canvas_state`; slim `artifactPlacements` inside the same document | `commitProjectDocument` -> local persistence -> `flushOutgoingProjectDocument` -> canvas project routes/repository | `loadProjectStructure` -> `loadSyncedProjectDocument` -> `reconcileSpecCanvasOnLoad` -> `loadProjectIntoState` | Critical: cards, staged cards, and placement map must remain mutually consistent. |
| Artifact identity and common metadata | `artifact` | Card-version `artifactRef`; spec-resource compatibility rows | Generic artifact repository/service plus direct domain writers in live artifacts, agents, executions, flows, music, and studios | Artifact/primitives APIs, graph, agent context, card projection | Critical: some note cards have no artifact reference while ingest is pending. |
| Note body | Folder file when linked and present; otherwise project-only card/version content | Artifact payload/preview paths depending on ingest and hydration | `saveUserNote` for folder writes; `saveUserNoteToProject` and document commit for fallback | User note editors, project hydration, folder scan | High: filesystem and PostgreSQL cannot share a transaction. |
| Folder presence | Result of folder scan (`folderPresentKeys`) | Card keys and normalized `relativePath` values | Folder scanning and rename/relink paths | Missing-file UI and `noteRequiresProjectOnlySave` | High: artifact views must never determine file presence. |
| Artifact history | `artifact_event`, with additional general audit records in `canvas_event` | None identified as authoritative | `artifactService`, artifact routes, and some domain repositories | Artifact event APIs/inspectors | High: route-level relationship changes are not currently in one application-service transaction. |
| Exploration document | Revisioned Flow tables (`flow_document`, nodes, edges) | Optional linked-folder JSON snapshot and canvas flow card | Flow repository/routes/editor | Flow editor and previews | Out of scope; must remain unchanged. |
| Music/Sonic data | Music domain tables plus artifact rows created by music repository | Canvas cards and Sonic client state | Music repository/routes and Sonic features | Music/Sonic UI | Out of scope; direct artifact writes are a later convergence concern. |

## Current read path

```text
project selection / boot / SSE refresh
  -> useWorkspaceProjection or useProjectSyncLifecycle
  -> loadProjectStructure(projectId)
  -> initializeProjectSync
  -> loadSyncedProjectDocument(projectId)
       -> IndexedDB cache and optional server reconciliation
  -> reconcileSpecCanvasOnLoad(projectId, payload)
       -> project document remains authoritative on drift
  -> loadProjectIntoState(projectId, fenced payload)
  -> React state.cards + stagedSyncCards + project selection projection
```

`loadProjectIntoState` is owned by `src/features/sync/useProjectSyncLifecycle.js`. Project switching is coordinated by `src/features/workspace/useWorkspaceProjection.js`, which guards stale switch sequences and commits selection with the loaded canvas projection.

## Current write path

```text
canvas interaction / note edit / placement transfer
  -> owning feature updates an explicit project state snapshot
  -> commitProjectDocument(projectId, options)
       -> buildProjectSavePayload
       -> slimProjectPayloadForCache
       -> persistProjectDocumentLocally (IndexedDB/cache)
       -> update per-project committed-payload cache
       -> optional flushOutgoingProjectDocument(projectId, payload, CAS options)
            -> PATCH or PUT canvas project API
            -> canvas_project_document transaction/revision update
            -> spec_canvas_state compatibility write after successful document write
            -> project_updated SSE notification
```

`commitProjectDocument` carries an explicit project ID and maintains prior payloads for patch generation. This boundary must not be bypassed by artifact-view UI code.

Folder-backed note editing has a separate external boundary:

```text
note editor
  -> noteRequiresProjectOnlySave
       -> project-only save when folder is unavailable or file is missing
       -> otherwise saveUserNote using normalized relativePath
  -> commit updated card/project document
```

The folder write cannot be made atomic with a PostgreSQL artifact/view transaction. Its ordering and compensation must remain explicit.

## Structural authority and dual-write inventory

1. `canvas_project_document` is the rendered layout authority.
2. IndexedDB/local persistence is a local-first cache and offline write surface.
3. `spec_canvas_state` receives layout/viewport compatibility writes after a successful remote document write. Load reconciliation does not allow it to replace a differing project document.
4. `artifactPlacements` is not an independent table; it is a slim placement projection embedded in project JSON alongside `cards` and `stagedSyncCards`.
5. Card-version `artifactRef` projects generic artifact identity into the canvas document.
6. Artifact lifecycle history is dual-recorded in `artifact_event` and, for application-service operations, `canvas_event`.
7. Folder-backed note bodies may also be represented in cached/project or artifact content paths, but the linked file remains content authority while present.
8. Flow optionally writes a linked-folder snapshot in addition to its revisioned database document; it is outside this slice.

## Direct legacy and bypass writers

Direct SQL writes identified during Gate A:

- `server/repositories/canvas-projects.js`: all `canvas_project_document` insert/update/delete operations.
- `server/repositories/spec-canvas-state.js`: `spec_canvas_state` insert/update.
- `server/repositories/artifacts.js`: generic artifact insert/update/archive/state/content operations.
- `server/repositories/artifact-events.js`: generic event append.
- `server/repositories/live-artifacts.js`: direct artifact insert/update.
- `server/repositories/agent-artifacts.js`: direct artifact insert/update.
- `server/repositories/executions.js`: direct artifact insert.
- `server/repositories/flows.js`: direct artifact insert/update/delete.
- `server/repositories/music.js`: direct artifact insert.
- `server/repositories/studios.js`: direct artifact and artifact-event writes.
- `server/repositories/project-primitives.js`: scoped artifact deletion.

These domain writers are not all defects: several own domain-specific bodies and lifecycles. Gate C should first define which generic lifecycle commands must use the application service and explicitly defer bounded-domain migrations. It must not mechanically route every domain write through a generic registry.

At the HTTP adapter layer, `server/routes/artifacts.js` uses the application service for create, update, archive, and state transition. Relationship create/delete and their event append are still orchestrated in the route, so mutation and history are not guaranteed by one application-service transaction.

## Existing artifact application boundary

`server/services/artifactService.js` currently provides:

- transactional artifact creation plus `ArtifactCreated` and canvas audit events;
- transactional artifact update plus `ContentUpdated` and canvas audit events;
- transactional archive plus `ArtifactArchived` and canvas audit events;
- state-machine validation and transactional state transition plus events.

Known gaps against the convergence specification:

- no restore command;
- no expected artifact-version conflict check in the service contract;
- relationship mutation/event orchestration remains in the route;
- repository update accepts state fields, allowing callers to bypass transition policy;
- default capabilities are selected by a central type conditional in `server/repositories/artifacts.js`;
- content-schema validation is not yet composed through a narrow type registry.

## `user_note` identity assessment

### Confirmed mappings

New successfully ingested notes receive a stable `artifactRef` from `ingestFoundFiles`; the same reference is copied into every new note version. Existing helpers can look up or ensure missing artifact references using project/path metadata.

### Unresolved mappings

`createUserNoteArtifact` deliberately creates the Canvas card even when ingest fails. Such a card has:

```text
versions[].artifactRef = null
versions[].artifactSyncState = pending
```

and an artifact-sync retry is queued. Consequently:

- `card.id` is only view identity and must not become artifact identity;
- filename, `relativePath`, card key, and content hash may be lookup evidence but are not sufficient identity independently;
- unresolved notes must remain legacy-only until a unique project-scoped artifact mapping exists;
- canonical mode must be gated on zero ambiguous mappings, not necessarily zero pending cards globally.

### Representative local database measurement

A read-only audit/backfill dry-run must report, per project:

- total `user_note` cards and dock entries;
- unique valid project-scoped artifact references;
- missing artifact references;
- references to absent or cross-project artifacts;
- duplicate views/cards for one artifact and surface;
- mappings uniquely recoverable through existing artifact metadata/path lookup;
- ambiguous and permanently unmapped records.

The read-only `scripts/audit-user-note-identity.mjs` audit ran successfully against the available local database:

- 6 project documents inspected;
- 13 `user_note` canvas/dock records found across 3 projects;
- 13 have exactly one existing, project-compatible artifact reference;
- 0 missing references;
- 0 references to missing artifacts;
- 0 cross-project references;
- 0 cards with multiple artifact references.

This representative dataset clears the immediate deterministic-identity concern, but the migration must retain the unresolved classifications because the creation path still permits pending ingest and other installations may contain legacy records.

The script currently reports identity eligibility only. Gate D's dry-run tool must additionally detect duplicate view candidates, archived records, exact geometry eligibility, and recoverable path-based mappings without mutating data.

## Current test coverage

Relevant existing coverage includes:

- project sync, patch robustness, pull guards, index integrity, and CAS behavior under `src/lib/__tests__/projectSync*`;
- placement maps, dock/canvas restore, placement persistence, and action sync tests;
- project switch and sync-projection invariant tests;
- `saveUserNote`, filename/path, folder scan, and project hydration tests;
- artifact-service transaction orchestration tests;
- artifact route response/adapter tests;
- canvas-project and PostgreSQL repository tests;
- Flow and feature-level tests.

## Missing or insufficient characterization coverage

Before changing behavior, add or strengthen focused coverage for:

1. Exact geometry round-trip for `user_note`, including z-order and dock surface.
2. A -> B -> A with note geometry and missing-file state unchanged.
3. A late Project A note-placement commit after B becomes active.
4. Final-only drag and resize persistence specifically for notes.
5. Nested note edit and rename preserving `relativePath` and artifact identity.
6. Missing-file restore without creating a second artifact.
7. Pending-ingest note behavior during backfill and canonical-read composition.
8. Relationship mutation plus event rollback on failure.
9. Artifact expected-version conflicts.
10. Shadow projection behavior after PATCH as well as full PUT.

## Import-boundary audit assessment

`scripts/check-import-boundaries.mjs` currently scans `App.jsx` and `src/components` and rejects deep `lib/sync/*` imports except established facades. It does not yet enforce all requested rules. Gate B should extend it carefully to cover feature UI and shared-core modules while allowing the frozen project and sync facades.

Required additional assertions:

- browser/UI modules do not import `server/repositories`;
- UI uses approved persistence/project facades rather than deep persistence internals;
- shared core does not import domain modules;
- shared core does not import runtime implementations or React workspace state.

## Migration risks

| Risk | Severity | Mitigation / gate |
|---|---|---|
| Notes without stable artifact references | Critical | Identity dry-run; unresolved records remain legacy-only; no synthesized identity. |
| Duplicate or cross-project artifact mappings | Critical | Enforce project scope and report ambiguity before schema writes. |
| Late project-switch writes | Critical | Keep explicit project ID, existing switch/load fences, and server CAS; add A/B tests. |
| Split browser dual-write | Critical | Maintain shadow views inside the accepted server document transaction. |
| PATCH payload lacks enough state to project a view | High | Project from the transaction's resulting stored document rather than raw patch input. |
| Folder/Postgres non-atomicity | High | Preserve current safe file ordering and document compensation; never log bodies. |
| Mixed cards/staged cards/placement map drift | High | One pure projection over the normalized resulting document; shadow mismatch categories. |
| Dirty worktree overlap | High | Preserve user changes and isolate edits; review diffs file-by-file. |
| Over-general type registry | Medium | Immutable declarative registrations only; no repositories, React, or runtime objects. |
| Load and switch performance regression | Medium | Batch project view reads and measure existing baseline before canonical mode. |

## Proposed Phase B files

- `docs/architecture/ADR/0001-artifact-identity-content.md`
- `docs/architecture/ADR/0002-artifact-views-legacy-authority.md`
- `docs/architecture/ADR/0003-atomic-artifact-mutations.md`
- `docs/architecture/ADR/0004-artifact-types-and-domain-boundaries.md`
- `scripts/check-import-boundaries.mjs`
- focused tests beside existing project switch, sync, placement, folder-note, artifact-service, and route tests

The original eight ADRs should be consolidated into four until later decisions genuinely diverge.

## Proposed Phase C files

- `server/services/artifactService.js`
- `server/repositories/artifacts.js`
- `server/repositories/artifact-events.js`
- `server/repositories/relationships.js`
- `server/routes/artifacts.js`
- `server/schemas/artifacts.js`
- a narrow server-side artifact type registry module
- corresponding service, repository, schema, and route tests

The exact edits must be rebased mentally against the existing uncommitted changes in `server/repositories/artifacts.js`.

## Proposed Phase D files

- additive migration after `0025_bim_style_presets.sql`
- `server/repositories/artifact-views.js`
- pure note-view projection and comparison module
- project-document transaction integration in `server/repositories/canvas-projects.js` or a narrowly composed coordinator
- batch artifact-view read route/API
- dry-run/apply backfill script with structured counts
- load-boundary composition before `loadProjectIntoState`
- focused projection, migration, repository, sync, switch, and folder-note tests
- `docs/architecture/CANVAS_CORE_PHASE_1_MIGRATION.md`
- architecture master, system architecture spec, graph, route manifest, and changelog updates required by `AGENTS.md`

## Conflicts and adjustments to the supplied specification

1. Phase C is partially implemented already. Extend it; do not create duplicate repository/service layers.
2. A client-side independent dual-write would weaken the repository's frozen commit boundary and cannot be atomic. Maintain shadow views in the server document transaction instead.
3. Canonical artifact identity is not universal for notes because pending ingest is supported. Add an identity eligibility gate and preserve legacy-only records.
4. Eight up-front ADRs are disproportionate for one vertical slice. Use four evidence-backed ADRs initially.
5. `artifactPlacements` is embedded in project JSON, not a separate persistence system.
6. Canonical read composition must occur before `loadProjectIntoState`, not inside presentational card/workspace components.

## Shadow projection transaction integration

Both full PUT and PATCH converge in `server/repositories/canvas-projects.js`:

- `putCanvasProject` validates the expected revision and writes the complete resulting payload;
- `patchCanvasProject` validates operations, computes `merged = applyProjectOps(existing.payload, ops)`, and writes that complete resulting payload.

Therefore both paths have sufficient post-command state to derive note views without relying on raw patch operations. They currently use pool-level `query` calls rather than an explicit multi-statement transaction because the document CAS is a single insert/update statement.

Before shadow view maintenance, refactor each accepted create/update branch to use a checked-out client transaction:

```text
BEGIN
  perform document insert/update CAS
  if CAS succeeded, project user_note views from the exact resulting payload
  batch upsert/archive shadow artifact views
COMMIT
```

On CAS failure, no view write occurs. On view projection/write failure, the document mutation rolls back. Workspace-name updates and SSE publication remain post-commit side effects; they must not occur before the document/view transaction succeeds.

## Gate A exit criteria

Gate A exit evidence:

- all requested baseline checks are recorded;
- a read-only identity coverage report has run against representative local projects and artifact rows (complete for the available six-document database);
- all direct project-document write paths are confirmed to terminate in `server/repositories/canvas-projects.js` (confirmed by SQL-write search; scripts/tests excluded);
- the exact transaction integration point for shadow view projection is identified for both PATCH and PUT (accepted create/update branches using their complete resulting payload);
- dirty-worktree overlap is documented and must be reviewed file-by-file before Phase B edits.

Gate A is complete. Gate B may add isolated characterization tests and ADRs, but Gate C must not begin while the baseline application/sync failures prevent a trustworthy green comparison unless the owner explicitly accepts a documented failing baseline.
