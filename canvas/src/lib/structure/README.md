# Structure layer (Postgres write-through)

Canvas gestures should persist **structure** to Postgres, not only to `canvas_project_document` JSON.

## Current path

| Module | Role |
|--------|------|
| [`canvasWriteThrough.js`](canvasWriteThrough.js) | On each [`commitProjectDocument`](../projectDocumentCommit.js), dual-writes layout/viewport/placements to `spec_canvas_state` via [`specDataPlaneSync.js`](../specDataPlaneSync.js). |
| [`specDataPlaneSync.js`](../specDataPlaneSync.js) | Load: prefer `spec_canvas_state` when version matches or exceeds document revision. |
| Primitives API | `POST /artifacts/ingest`, clusters — used on folder scan / create flows. |

## Not yet (spec cutover)

- `projects` / `resources` / `project_resources` as sole identity (see architecture spec)
- Shared resource store on disk
- Retire filename keys in project JSON
- Spec-canvas SSE stream (today: project document SSE + spec poll on load)

See [SPEC_MIGRATION.md](../../docs/SPEC_MIGRATION.md) and [placement-persistence-qa.md](../../docs/placement-persistence-qa.md) for verification.
