# Canvas Artifact Schema — Codex Implementation Brief

## Purpose

This brief translates the `artifact_schema_spec.md` into a concrete implementation plan for Codex.

The goal is to build the **minimum solid architecture** for Canvas artifacts:

- Postgres schema / migrations
- TypeScript domain types
- Zod validation
- Repository/service layer
- API endpoints
- MVP vs deferred scope

This should be implemented as a foundation, not as a full workflow product.

---

# 1. Implementation Goals

Build a small, testable artifact system that supports:

1. Creating artifacts
2. Updating artifacts
3. Recording artifact events
4. Linking artifacts with typed relationships
5. Optionally binding artifacts to state machines
6. Transitioning artifact state with history
7. Querying artifact history and relationships
8. Leaving room for future agents, runs, branching, and capabilities

---

# 2. Non-Goals for MVP

Do not build these yet:

- BPMN-style workflow editor
- visual state machine designer
- full event-sourced reconstruction
- complex branch merge logic
- universal ontology editor
- permissions system beyond basic actor metadata
- agent approval workflow
- deep typed tables for every artifact kind

For MVP, the artifact table stores the latest/current state, while events act as an append-only audit log.

---

# 3. Suggested File Structure

Adjust paths to match the existing Canvas repo conventions.

```text
src/
  server/
    db/
      migrations/
        001_create_artifacts.sql
        002_create_artifact_events.sql
        003_create_artifact_relationships.sql
        004_create_state_machines.sql

    artifacts/
      artifact.types.ts
      artifact.schemas.ts
      artifact.repository.ts
      artifact.service.ts
      artifact.routes.ts
      artifact.events.ts
      artifact.relationships.ts
      artifact.state.ts
      artifact.test.ts

    stateMachines/
      stateMachine.types.ts
      stateMachine.schemas.ts
      stateMachine.repository.ts
      stateMachine.service.ts
      stateMachine.routes.ts
      stateMachine.test.ts

  shared/
    artifactTypes.ts
    relationshipTypes.ts
    eventTypes.ts
    capabilityTypes.ts
```

If the repo already has separate backend/frontend/shared packages, place the shared types accordingly.

---

# 4. Postgres Migrations

## 4.1 `artifacts`

```sql
create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),

  project_id uuid not null,

  type text not null,
  title text not null,
  description text,

  current_state_id text,
  state_machine_id uuid,

  content jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  capabilities text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by text not null,
  updated_by text,

  version_id uuid,
  branch_id uuid,
  parent_artifact_id uuid,

  schema_version int not null default 1,
  content_schema_version int,

  archived_at timestamptz
);

create index if not exists idx_artifacts_project_id
  on artifacts(project_id);

create index if not exists idx_artifacts_type
  on artifacts(type);

create index if not exists idx_artifacts_state_machine_id
  on artifacts(state_machine_id);

create index if not exists idx_artifacts_current_state_id
  on artifacts(current_state_id);

create index if not exists idx_artifacts_content_gin
  on artifacts using gin(content);

create index if not exists idx_artifacts_metadata_gin
  on artifacts using gin(metadata);
```

---

## 4.2 `artifact_events`

```sql
create table if not exists artifact_events (
  id uuid primary key default gen_random_uuid(),

  artifact_id uuid not null references artifacts(id) on delete cascade,
  project_id uuid not null,

  type text not null,
  payload jsonb not null default '{}'::jsonb,

  actor_type text not null,
  actor_id text not null,

  run_id uuid,

  created_at timestamptz not null default now()
);

create index if not exists idx_artifact_events_artifact_id
  on artifact_events(artifact_id);

create index if not exists idx_artifact_events_project_id
  on artifact_events(project_id);

create index if not exists idx_artifact_events_type
  on artifact_events(type);

create index if not exists idx_artifact_events_created_at
  on artifact_events(created_at desc);

create index if not exists idx_artifact_events_payload_gin
  on artifact_events using gin(payload);
```

---

## 4.3 `artifact_relationships`

```sql
create table if not exists artifact_relationships (
  id uuid primary key default gen_random_uuid(),

  project_id uuid not null,

  source_artifact_id uuid not null references artifacts(id) on delete cascade,
  target_artifact_id uuid not null references artifacts(id) on delete cascade,

  relationship_type text not null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  created_by text not null,

  constraint artifact_relationship_no_self_link
    check (source_artifact_id <> target_artifact_id)
);

create index if not exists idx_artifact_relationships_project_id
  on artifact_relationships(project_id);

create index if not exists idx_artifact_relationships_source
  on artifact_relationships(source_artifact_id);

create index if not exists idx_artifact_relationships_target
  on artifact_relationships(target_artifact_id);

create index if not exists idx_artifact_relationships_type
  on artifact_relationships(relationship_type);

create unique index if not exists uq_artifact_relationship_unique_edge
  on artifact_relationships(source_artifact_id, target_artifact_id, relationship_type);
```

---

## 4.4 `state_machines`

For MVP, store states and transitions as JSONB. Normalize later if needed.

```sql
create table if not exists state_machines (
  id uuid primary key default gen_random_uuid(),

  project_id uuid,

  name text not null,
  description text,

  applies_to_types text[] not null default '{}',

  states jsonb not null default '[]'::jsonb,
  transitions jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by text not null,
  updated_by text
);

create index if not exists idx_state_machines_project_id
  on state_machines(project_id);

create index if not exists idx_state_machines_applies_to_types
  on state_machines using gin(applies_to_types);

create index if not exists idx_state_machines_states_gin
  on state_machines using gin(states);

create index if not exists idx_state_machines_transitions_gin
  on state_machines using gin(transitions);
```

---

# 5. TypeScript Domain Types

## 5.1 Artifact

```ts
export type Artifact = {
  id: string
  projectId: string

  type: string
  title: string
  description?: string | null

  currentStateId?: string | null
  stateMachineId?: string | null

  content: unknown
  metadata: Record<string, unknown>

  capabilities: string[]

  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy?: string | null

  versionId?: string | null
  branchId?: string | null
  parentArtifactId?: string | null

  schemaVersion: number
  contentSchemaVersion?: number | null

  archivedAt?: string | null
}
```

## 5.2 Artifact event

```ts
export type ArtifactEventType =
  | "ArtifactCreated"
  | "ContentUpdated"
  | "StateTransitioned"
  | "RelationshipAdded"
  | "RelationshipRemoved"
  | "RunStarted"
  | "RunCompleted"
  | "DecisionRecorded"
  | "VersionCreated"
  | "BranchCreated"
  | "ArtifactArchived"

export type ActorType = "user" | "agent" | "system" | "function"

export type ArtifactEvent = {
  id: string
  artifactId: string
  projectId: string
  type: ArtifactEventType
  payload: Record<string, unknown>
  actorType: ActorType
  actorId: string
  runId?: string | null
  createdAt: string
}
```

## 5.3 Relationship

```ts
export type ArtifactRelationshipType =
  | "depends_on"
  | "derived_from"
  | "references"
  | "contains"
  | "produces"
  | "evidences"
  | "contradicts"
  | "blocks"
  | "supports"
  | "part_of"
  | "variant_of"
  | "uses"
  | "generated_by"
  | "input_to"
  | "output_of"

export type ArtifactRelationship = {
  id: string
  projectId: string
  sourceArtifactId: string
  targetArtifactId: string
  relationshipType: ArtifactRelationshipType | string
  metadata: Record<string, unknown>
  createdAt: string
  createdBy: string
}
```

## 5.4 State machine

```ts
export type StateKind =
  | "initial"
  | "normal"
  | "terminal"
  | "paused"
  | "error"

export type StateDefinition = {
  id: string
  label: string
  description?: string
  kind?: StateKind
}

export type TransitionDefinition = {
  id: string
  fromStateId: string
  toStateId: string
  label: string
  guardIds?: string[]
  actionIds?: string[]
}

export type StateMachine = {
  id: string
  projectId?: string | null
  name: string
  description?: string | null
  appliesToTypes: string[]
  states: StateDefinition[]
  transitions: TransitionDefinition[]
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy?: string | null
}
```

---

# 6. Zod Validation

Use Zod or the repo's existing validation approach.

## 6.1 Artifact schemas

```ts
import { z } from "zod"

export const createArtifactSchema = z.object({
  projectId: z.string().uuid(),
  type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),

  currentStateId: z.string().optional(),
  stateMachineId: z.string().uuid().optional(),

  content: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),

  capabilities: z.array(z.string()).optional(),

  createdBy: z.string().min(1),

  parentArtifactId: z.string().uuid().optional(),
  contentSchemaVersion: z.number().int().positive().optional(),
})

export const updateArtifactSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),

  content: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),

  capabilities: z.array(z.string()).optional(),

  updatedBy: z.string().min(1),

  contentSchemaVersion: z.number().int().positive().optional(),
})
```

## 6.2 State transition schema

```ts
export const transitionArtifactStateSchema = z.object({
  toStateId: z.string().min(1),
  reason: z.string().optional(),
  actorType: z.enum(["user", "agent", "system", "function"]),
  actorId: z.string().min(1),
  runId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
```

## 6.3 Relationship schema

```ts
export const createRelationshipSchema = z.object({
  projectId: z.string().uuid(),
  sourceArtifactId: z.string().uuid(),
  targetArtifactId: z.string().uuid(),
  relationshipType: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdBy: z.string().min(1),
})
```

---

# 7. Repository Layer

The repository should be thin and database-focused.

## 7.1 Artifact repository functions

```ts
export interface ArtifactRepository {
  createArtifact(input: CreateArtifactInput): Promise<Artifact>
  getArtifactById(id: string): Promise<Artifact | null>
  listArtifactsByProject(projectId: string, options?: ListArtifactOptions): Promise<Artifact[]>
  updateArtifact(id: string, input: UpdateArtifactInput): Promise<Artifact>
  archiveArtifact(id: string, actorId: string): Promise<Artifact>
}
```

## 7.2 Event repository functions

```ts
export interface ArtifactEventRepository {
  appendEvent(input: AppendArtifactEventInput): Promise<ArtifactEvent>
  listEventsForArtifact(artifactId: string): Promise<ArtifactEvent[]>
  listEventsForProject(projectId: string, options?: ListEventOptions): Promise<ArtifactEvent[]>
}
```

## 7.3 Relationship repository functions

```ts
export interface ArtifactRelationshipRepository {
  createRelationship(input: CreateRelationshipInput): Promise<ArtifactRelationship>
  deleteRelationship(id: string, actorId: string): Promise<void>
  listRelationshipsForArtifact(artifactId: string): Promise<ArtifactRelationship[]>
  listOutgoingRelationships(artifactId: string): Promise<ArtifactRelationship[]>
  listIncomingRelationships(artifactId: string): Promise<ArtifactRelationship[]>
}
```

## 7.4 State machine repository functions

```ts
export interface StateMachineRepository {
  createStateMachine(input: CreateStateMachineInput): Promise<StateMachine>
  getStateMachineById(id: string): Promise<StateMachine | null>
  listStateMachines(projectId?: string): Promise<StateMachine[]>
  updateStateMachine(id: string, input: UpdateStateMachineInput): Promise<StateMachine>
}
```

---

# 8. Service Layer Behaviour

The service layer should enforce business rules and create events.

## 8.1 Create artifact

When an artifact is created:

1. Insert artifact row
2. Append `ArtifactCreated` event
3. If initial state exists, append `StateTransitioned` event from null to initial state

Pseudo-code:

```ts
async function createArtifact(input) {
  return db.transaction(async tx => {
    const artifact = await artifactRepo.createArtifact(input, tx)

    await eventRepo.appendEvent({
      artifactId: artifact.id,
      projectId: artifact.projectId,
      type: "ArtifactCreated",
      payload: {
        artifactType: artifact.type,
        title: artifact.title,
      },
      actorType: "user",
      actorId: input.createdBy,
    }, tx)

    if (artifact.currentStateId) {
      await eventRepo.appendEvent({
        artifactId: artifact.id,
        projectId: artifact.projectId,
        type: "StateTransitioned",
        payload: {
          fromStateId: null,
          toStateId: artifact.currentStateId,
          reason: "Initial state",
        },
        actorType: "system",
        actorId: "system",
      }, tx)
    }

    return artifact
  })
}
```

---

## 8.2 Update artifact content

When content changes:

1. Update artifact row
2. Append `ContentUpdated` event

Payload should include changed fields where practical.

```ts
{
  type: "ContentUpdated",
  payload: {
    changedFields: ["content", "metadata"],
    summary: "Updated artifact content"
  }
}
```

---

## 8.3 Transition artifact state

When state changes:

1. Fetch artifact
2. Fetch bound state machine if present
3. Validate transition if machine exists
4. Update `artifacts.current_state_id`
5. Append `StateTransitioned` event

Pseudo-code:

```ts
async function transitionArtifactState(artifactId, input) {
  return db.transaction(async tx => {
    const artifact = await artifactRepo.getArtifactById(artifactId, tx)
    if (!artifact) throw new Error("Artifact not found")

    if (artifact.stateMachineId) {
      const machine = await stateMachineRepo.getStateMachineById(artifact.stateMachineId, tx)
      if (!machine) throw new Error("State machine not found")

      const valid = machine.transitions.some(t =>
        t.fromStateId === artifact.currentStateId &&
        t.toStateId === input.toStateId
      )

      if (!valid) {
        throw new Error("Invalid state transition")
      }
    }

    const updated = await artifactRepo.updateArtifact(artifactId, {
      currentStateId: input.toStateId,
      updatedBy: input.actorId,
    }, tx)

    await eventRepo.appendEvent({
      artifactId,
      projectId: artifact.projectId,
      type: "StateTransitioned",
      payload: {
        fromStateId: artifact.currentStateId,
        toStateId: input.toStateId,
        reason: input.reason,
        metadata: input.metadata ?? {},
      },
      actorType: input.actorType,
      actorId: input.actorId,
      runId: input.runId,
    }, tx)

    return updated
  })
}
```

---

## 8.4 Create relationship

When a relationship is created:

1. Insert relationship row
2. Append `RelationshipAdded` event to source artifact
3. Optionally append event to target artifact later if useful

```ts
{
  type: "RelationshipAdded",
  payload: {
    relationshipId,
    sourceArtifactId,
    targetArtifactId,
    relationshipType
  }
}
```

---

## 8.5 Delete relationship

When a relationship is deleted:

1. Capture existing relationship
2. Delete relationship row
3. Append `RelationshipRemoved` event to source artifact

---

# 9. API Endpoints

Adapt route paths to existing backend style.

## 9.1 Artifacts

```text
POST   /api/artifacts
GET    /api/artifacts/:id
GET    /api/projects/:projectId/artifacts
PATCH  /api/artifacts/:id
POST   /api/artifacts/:id/archive
GET    /api/artifacts/:id/events
GET    /api/artifacts/:id/relationships
```

## 9.2 State

```text
POST   /api/artifacts/:id/transition
```

Request:

```json
{
  "toStateId": "growing",
  "reason": "Initial feasibility evidence collected",
  "actorType": "user",
  "actorId": "ben"
}
```

Response:

```json
{
  "artifact": {
    "id": "...",
    "currentStateId": "growing"
  },
  "event": {
    "type": "StateTransitioned"
  }
}
```

## 9.3 Relationships

```text
POST   /api/artifact-relationships
DELETE /api/artifact-relationships/:id
```

## 9.4 State machines

```text
POST   /api/state-machines
GET    /api/state-machines/:id
GET    /api/projects/:projectId/state-machines
PATCH  /api/state-machines/:id
```

---

# 10. MVP Seed Data

Create three initial state machines.

## 10.1 Exploration lifecycle

```json
{
  "name": "Exploration Lifecycle",
  "appliesToTypes": ["exploration"],
  "states": [
    { "id": "seedling", "label": "Seedling", "kind": "initial" },
    { "id": "growing", "label": "Growing", "kind": "normal" },
    { "id": "mature", "label": "Mature", "kind": "normal" },
    { "id": "dormant", "label": "Dormant", "kind": "paused" },
    { "id": "archived", "label": "Archived", "kind": "terminal" }
  ],
  "transitions": [
    { "id": "start_growing", "fromStateId": "seedling", "toStateId": "growing", "label": "Start growing" },
    { "id": "mature", "fromStateId": "growing", "toStateId": "mature", "label": "Mature exploration" },
    { "id": "pause", "fromStateId": "growing", "toStateId": "dormant", "label": "Pause exploration" },
    { "id": "reactivate", "fromStateId": "dormant", "toStateId": "growing", "label": "Reactivate" },
    { "id": "archive_from_seedling", "fromStateId": "seedling", "toStateId": "archived", "label": "Archive" },
    { "id": "archive_from_growing", "fromStateId": "growing", "toStateId": "archived", "label": "Archive" },
    { "id": "archive_from_mature", "fromStateId": "mature", "toStateId": "archived", "label": "Archive" },
    { "id": "archive_from_dormant", "fromStateId": "dormant", "toStateId": "archived", "label": "Archive" }
  ]
}
```

## 10.2 Artifact review lifecycle

```json
{
  "name": "Artifact Review Lifecycle",
  "appliesToTypes": ["note", "image", "report", "design_option"],
  "states": [
    { "id": "draft", "label": "Draft", "kind": "initial" },
    { "id": "under_review", "label": "Under Review", "kind": "normal" },
    { "id": "approved", "label": "Approved", "kind": "normal" },
    { "id": "rejected", "label": "Rejected", "kind": "terminal" },
    { "id": "published", "label": "Published", "kind": "terminal" }
  ],
  "transitions": [
    { "id": "submit_review", "fromStateId": "draft", "toStateId": "under_review", "label": "Submit for review" },
    { "id": "approve", "fromStateId": "under_review", "toStateId": "approved", "label": "Approve" },
    { "id": "reject", "fromStateId": "under_review", "toStateId": "rejected", "label": "Reject" },
    { "id": "publish", "fromStateId": "approved", "toStateId": "published", "label": "Publish" }
  ]
}
```

## 10.3 Run lifecycle

```json
{
  "name": "Run Lifecycle",
  "appliesToTypes": ["run"],
  "states": [
    { "id": "queued", "label": "Queued", "kind": "initial" },
    { "id": "running", "label": "Running", "kind": "normal" },
    { "id": "waiting", "label": "Waiting", "kind": "paused" },
    { "id": "succeeded", "label": "Succeeded", "kind": "terminal" },
    { "id": "failed", "label": "Failed", "kind": "error" },
    { "id": "cancelled", "label": "Cancelled", "kind": "terminal" }
  ],
  "transitions": [
    { "id": "start", "fromStateId": "queued", "toStateId": "running", "label": "Start" },
    { "id": "wait", "fromStateId": "running", "toStateId": "waiting", "label": "Wait for input" },
    { "id": "resume", "fromStateId": "waiting", "toStateId": "running", "label": "Resume" },
    { "id": "succeed", "fromStateId": "running", "toStateId": "succeeded", "label": "Succeed" },
    { "id": "fail", "fromStateId": "running", "toStateId": "failed", "label": "Fail" },
    { "id": "cancel_from_queued", "fromStateId": "queued", "toStateId": "cancelled", "label": "Cancel" },
    { "id": "cancel_from_running", "fromStateId": "running", "toStateId": "cancelled", "label": "Cancel" },
    { "id": "cancel_from_waiting", "fromStateId": "waiting", "toStateId": "cancelled", "label": "Cancel" }
  ]
}
```

---

# 11. Testing Requirements

## 11.1 Artifact tests

Test:

- create artifact
- read artifact
- list project artifacts
- update artifact
- archive artifact
- event is created on artifact creation
- event is created on content update
- event is created on archive

## 11.2 Relationship tests

Test:

- create relationship
- prevent self-link
- prevent duplicate edge
- list incoming relationships
- list outgoing relationships
- delete relationship
- create/remove relationship events

## 11.3 State machine tests

Test:

- create state machine
- bind artifact to state machine
- valid transition succeeds
- invalid transition fails
- transition updates current state
- transition creates event
- transition records actor and reason

## 11.4 Transaction tests

State transition should be atomic:

- if artifact update fails, no event should be written
- if event write fails, artifact state should not be updated

---

# 12. Indexing and Performance Notes

MVP indexes should cover:

- artifacts by project
- artifacts by type
- artifacts by state
- events by artifact
- events by project
- events by time
- relationships by source
- relationships by target

Use GIN indexes for JSONB only where needed.

Avoid premature graph complexity. Postgres can handle early graph-like relationships through indexed edge tables.

---

# 13. UI Contract for Later

The backend should support these UI queries:

## 13.1 Artifact overview

Given an artifact ID, return:

- artifact
- current state
- state machine if bound
- valid next transitions
- recent events
- incoming/outgoing relationships

## 13.2 Why is this in this state?

Return recent relevant events:

- latest `StateTransitioned`
- recent `ContentUpdated`
- recent `RunCompleted`
- recent relationships added as evidence

## 13.3 What can happen next?

If artifact has a state machine:

- return all transitions from `currentStateId`
- include labels
- include guard/action IDs if present

If artifact has no state machine:

- return default actions based on capabilities

---

# 14. Deferred Design Questions

Do not solve these in MVP, but leave the code open for them.

## 14.1 Permissions

Need future handling for:

- who can transition state
- who can edit content
- who can create relationships
- who can edit state machines
- whether agents can execute or only propose transitions

## 14.2 Agent trust

Need future distinction between:

- agent suggested
- agent executed
- user approved
- system generated

For now, store `actorType` and `actorId` clearly.

## 14.3 Branching

Leave hooks:

- `branchId`
- `versionId`
- `parentArtifactId`

But do not implement merge logic yet.

## 14.4 Content schemas

Add `schemaVersion` and `contentSchemaVersion`.

Later, each artifact type can have a content validator/migration.

## 14.5 Guard rules and actions

For MVP, state transitions can reference `guardIds` and `actionIds`, but do not need to execute them.

Later, guards/actions can be resolved through a rule/function registry.

---

# 15. Acceptance Criteria

The implementation is acceptable when:

1. Artifacts can be created, updated, archived, and listed.
2. Every material change writes an event.
3. Relationships can be created, listed, and removed.
4. State machines can be created and assigned.
5. Valid state transitions work.
6. Invalid state transitions are rejected.
7. State transitions update `current_state_id`.
8. State transitions write `StateTransitioned` events.
9. Code has tests for core behaviours.
10. The architecture does not force every artifact into a workflow.

---

# 16. Key Architectural Warning

Do not let this become workflow software.

The product direction is:

```text
Artifact → current state → evidence → next valid moves → history
```

Not:

```text
Diagram editor → boxes → arrows → workflow configuration
```

The state machine exists to help artifacts move forward clearly, not to become the main user experience.

---

# 17. Shipped implementation mapping (2026-07-03)

This section records how the MVP landed in the Canvas repo. Use it when reconciling this brief with `artifact_schema_spec.md` §20.

## 17.1 Repo paths (actual)

```text
canvas/server/migrations/0021_artifact_base_schema.sql
canvas/server/schemas/artifacts.js
canvas/server/repositories/artifacts.js
canvas/server/repositories/artifact-events.js
canvas/server/repositories/relationships.js
canvas/server/repositories/state-machines.js
canvas/server/services/artifactService.js
canvas/server/routes/artifacts.js
canvas/server/routes/stateMachines.js
canvas/server/routes/__tests__/artifactBaseRoutes.test.js
canvas/server/services/__tests__/artifactService.test.js
canvas/src/primitives/shared/types.js
canvas/src/lib/primitivesApi.js
canvas/src/components/PrimitiveInspectorPanel.jsx
```

Shared types live in `canvas/src/primitives/shared/types.js` (not a separate `shared/` package).

## 17.2 Naming deltas from this brief

| Brief | Shipped |
|-------|---------|
| `artifacts` table | extended singular `artifact` table |
| `artifact_events` | `artifact_event` |
| `state_machines` | `state_machine` |
| UUID ids | TEXT ULID ids |
| Separate `artifact.relationships` table | existing `relationship` table + event append on add/remove |

## 17.3 Acceptance criteria status

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Create, update, archive, list artifacts | Shipped |
| 2 | Material changes write events | Shipped (`artifactService.js`) |
| 3 | Relationships create/list/remove | Shipped (existing graph + new routes) |
| 4 | State machines create/assign | Shipped (API + seed data) |
| 5–8 | Valid/invalid transitions, event on transition | Shipped with tests |
| 9 | Core behaviour tests | Shipped |
| 10 | No forced workflow UX | Shipped (inspector read-only state; no BPMN editor) |

## 17.4 Related shipped work (same release)

Exploration agent context and multi-select:

- `useFlowAgentContext.js` — selection scope, optional network expansion, `flowContextSteps` for agent sidebar
- `FlowEditorSelection.js` — shift-click additive selection helpers
- `AgentSidePanel.jsx` — renders exploration context steps in agent mode

See `canvas/docs/ARCHITECTURE_MASTER_SPEC.md` changelog `2026.07.03.1`.
