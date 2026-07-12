# ADR 0002: Artifact views and legacy authority

Status: Accepted for Canvas Core Phase 1

## Context

`canvas_project_document` currently owns rendered cards, dock entries, and the slim `artifactPlacements` projection. IndexedDB is a cache and `spec_canvas_state` is a secondary compatibility projection. Introducing a second browser write would create a non-atomic split across project switching and revision CAS.

## Decision

An artifact view represents one artifact on one project surface. It owns stable presentation geometry and durable view configuration, never artifact content or transient React interaction state.

During Phase 1, `commitProjectDocument` remains the client command boundary and `canvas_project_document` remains legacy write authority. After an accepted server PUT/PATCH CAS, the server derives `user_note` views from the exact resulting project payload and writes document plus views in one PostgreSQL transaction.

Read modes are:

- `legacy`: no artifact-view composition;
- `shadow`: render legacy and compare the canonical projection;
- `canonical`: compose eligible `user_note` placement from artifact views before `loadProjectIntoState`, retaining visible legacy fallback.

Legacy data is not deleted.

## Alternatives considered

- Independent browser dual-write: rejected because it cannot be atomic and increases project-switch races.
- Immediate canonical write commands: deferred because mixed write authority inside one canvas is beyond the reversible slice.
- UI-level composition in card components: rejected because it bypasses the load/selection projection invariant.

## Consequences

PUT and PATCH repository branches must use explicit transactions before shadow maintenance begins. View reads are batched by project. Canonical mode is unavailable for unresolved identities and can be disabled without data repair.

## Migration implications

Backfill and shadow comparison precede canonical reads. The project document remains sufficient for rollback throughout Phase 1.
