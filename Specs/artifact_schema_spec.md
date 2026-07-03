# Canvas Base Artifact Schema — Spec

## Purpose

This document captures the current architectural direction for Canvas's **base artifact schema** so implementation can proceed in a way that matches the deeper product thesis rather than drifting into a generic document store or workflow engine.

The aim is to build a **small, extensible foundation** for a state-aware collaborative environment where humans and AI evolve shared project state over time.

---

# 1. Core Thesis

Canvas should **not** be designed around prompts, chats, files, or diagrams as the primary abstraction.

It should be designed around **persistent artifacts whose state evolves over time**.

## Working model

```text
Artifacts are the durable units.
Runs, agents, functions, conversations, and user actions modify artifact state.
History records how and why state changed.
```

So the base architecture must support:

- identity
- type
- content
- state
- relationships
- history / events
- capabilities
- metadata

---

# 2. Design Goals

The base artifact model should:

1. **Unify many artifact types under one stable abstraction**
2. **Treat state as first-class**
3. **Record history as an event log**
4. **Support graph-like relationships between artifacts**
5. **Allow capabilities/behaviours without rigid inheritance**
6. **Stay small enough to be stable**
7. **Avoid becoming workflow/BPMN software**
8. **Be practical to build in Postgres first**

---

# 3. What an Artifact Is

An artifact is not just content.

A normal app might model an artifact as:

```ts
{
  id,
  title,
  type,
  content
}
```

Canvas needs something richer.

An artifact is closer to:

> **A living project object with identity, content, state, relationships, history, and possible next actions.**

The artifact should answer:

- What is this?
- Where is it in its lifecycle?
- What is it connected to?
- What changed?
- Who or what changed it?
- What can happen next?
- Why?

---

# 4. Why a Base Schema Is Necessary

Canvas will contain many artifact types over time, for example:

- Note
- Image
- Prompt
- Agent
- Function
- State machine
- Music sketch
- Feasibility model
- Design option
- Report
- Decision
- External resource

These should **not** become isolated data models with no common spine.

They should share a common base so Canvas can treat them uniformly for things like:

- search
- linking
- history
- state transitions
- runs
- reviews
- branching
- versioning
- auditability
- evidence attachment

The base schema should remain small and stable. Domain-specific data should live in typed content or extensions.

---

# 5. Architectural Principles Reached So Far

## 5.1 Artifact-first, not workflow-first

Canvas should not be centred on workflow diagrams.

It should be centred on **artifacts** and their evolving state.

Bad framing:

```text
draw boxes and arrows
```

Better framing:

```text
show the artifact
show where it is
show why it is there
show what can happen next
show what evidence supports moving forward
```

## 5.2 State is first-class

Artifacts can have a lifecycle.

Examples:
- exploration lifecycle
- review lifecycle
- run lifecycle
- publication lifecycle

State should be represented directly on the artifact for fast access.

## 5.3 History contains state changes

We concluded:

- `currentState` belongs on the artifact
- **state transitions belong in the event history**

So we do **not** want a giant duplicated state-history blob embedded in the artifact record.

## 5.4 Runs are attempts to change artifact state

A run is not merely a background job.

A run may:

- read artifacts
- produce artifacts
- update content
- propose a transition
- execute a transition
- create evidence
- record a decision

## 5.5 Relationships matter

Canvas is not just a document store.

Artifacts need explicit relationships such as:

- depends_on
- derived_from
- references
- contains
- produces
- evidences
- contradicts
- blocks
- supports
- part_of
- variant_of

## 5.6 Capabilities may matter more than rigid subclasses

Rather than hardcoding everything into a deep inheritance tree, artifacts can also advertise capabilities such as:

- canRun
- canEdit
- canReview
- canBranch
- canGenerate
- canExecute
- canTransform
- canReference
- canHaveState

This keeps the system extensible as Canvas moves into new domains.

---

# 6. Proposed Data Model Overview

The minimum foundation should consist of four core models:

1. **Artifact** — current object state and identity
2. **ArtifactEvent** — append-only history / audit log
3. **ArtifactRelationship** — graph edges between artifacts
4. **StateMachine** — optional lifecycle definition that artifacts can bind to

---

# 7. Proposed Artifact Schema

## 7.1 Base Artifact

```ts
type Artifact = {
  id: string
  projectId: string

  type: string
  title: string
  description?: string

  currentStateId?: string
  stateMachineId?: string

  content: unknown
  metadata: Record<string, unknown>

  capabilities: string[]

  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy?: string

  versionId?: string
  branchId?: string
  parentArtifactId?: string

  schemaVersion: number
  contentSchemaVersion?: number

  archivedAt?: string
}
```

---

## 7.2 Field reasoning

### Identity / ownership
- `id`
- `projectId`
- `createdBy`
- `updatedBy`

These allow the artifact to exist as a stable project object with authorship and provenance.

### Classification
- `type`
- `title`
- `description`

`type` should be stable and machine-usable, e.g. `note`, `image`, `agent`, `function`, `state_machine`, `decision`, `design_option`.

### State
- `currentStateId`
- `stateMachineId`

These are optional because not every artifact may need a formal lifecycle.

### Content
- `content`
- `metadata`

`content` is the main artifact payload.
`metadata` is for structured supporting information that is not the core content.

### Capability surface
- `capabilities`

This allows the system and UI to reason about what the artifact can do without relying solely on `type`.

### History / lineage hooks
- `versionId`
- `branchId`
- `parentArtifactId`

These support versioning, branching, derivation, and cloning.

### Schema migration support
- `schemaVersion`
- `contentSchemaVersion`

These are important because artifact shapes will evolve.

---

# 8. Proposed Artifact Event Schema

History should be append-only and event-oriented.

## 8.1 Event model

```ts
type ArtifactEvent = {
  id: string
  artifactId: string
  projectId: string

  type:
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

  payload: Record<string, unknown>

  actorType: "user" | "agent" | "system" | "function"
  actorId: string

  runId?: string

  createdAt: string
}
```

---

## 8.2 Event reasoning

The event log is the canonical record of what happened and why.

Examples:

### Artifact creation
```json
{
  "type": "ArtifactCreated",
  "payload": {
    "artifactType": "exploration",
    "title": "Brighton Townhouse Exploration"
  }
}
```

### State transition
```json
{
  "type": "StateTransitioned",
  "payload": {
    "fromStateId": "seedling",
    "toStateId": "growing",
    "reason": "Initial evidence collected and feasibility review started"
  }
}
```

### Content update
```json
{
  "type": "ContentUpdated",
  "payload": {
    "changedFields": ["content.summary", "metadata.confidence"]
  }
}
```

### Run completion
```json
{
  "type": "RunCompleted",
  "payload": {
    "runType": "feasibility_agent",
    "status": "success",
    "summary": "Feasibility margin improved after revised cost assumptions"
  }
}
```

---

# 9. Proposed Relationship Schema

Relationships should not be hidden inside arbitrary content blobs.

## 9.1 Relationship model

```ts
type ArtifactRelationship = {
  id: string
  projectId: string

  sourceArtifactId: string
  targetArtifactId: string

  relationshipType: string

  metadata?: Record<string, unknown>

  createdAt: string
  createdBy: string
}
```

## 9.2 Suggested relationship types

Initial examples:

- `depends_on`
- `derived_from`
- `references`
- `contains`
- `produces`
- `evidences`
- `contradicts`
- `blocks`
- `supports`
- `part_of`
- `variant_of`
- `uses`
- `generated_by`
- `input_to`
- `output_of`

These should likely be constrained by an enum or validated registry rather than completely free-form strings.

---

# 10. Proposed State Machine Schema

State machines should exist, but as **supporting lifecycle definitions**, not as the centre of the product.

## 10.1 State machine model

```ts
type StateMachine = {
  id: string
  projectId?: string
  name: string
  appliesToTypes: string[]

  states: StateDefinition[]
  transitions: TransitionDefinition[]

  createdAt: string
  updatedAt: string
}
```

## 10.2 State definition

```ts
type StateDefinition = {
  id: string
  label: string
  description?: string
  kind?: "initial" | "normal" | "terminal" | "paused" | "error"
}
```

## 10.3 Transition definition

```ts
type TransitionDefinition = {
  id: string
  fromStateId: string
  toStateId: string
  label: string

  guardIds?: string[]
  actionIds?: string[]
}
```

---

# 11. State Handling Rules

## 11.1 Current state on artifact

Artifacts may store:

```ts
currentStateId?: string
stateMachineId?: string
```

This gives fast access to the artifact’s current lifecycle state.

## 11.2 Transition history in events

All actual state changes should be recorded as events.

This gives:

- auditability
- explanation
- timeline reconstruction
- future undo/redo options
- branching support
- agent accountability

## 11.3 State machine optionality

Not every artifact must have a state machine.

Likely categories:

### A. No formal state machine
Simple artifacts such as static references or raw uploads may not need lifecycle logic.

### B. Simple lifecycle
Some artifacts may use a lightweight default lifecycle like:
- draft
- active
- archived

### C. Full state machine
Complex artifacts such as explorations, agent runs, design options, or reviewable outputs may use richer project-defined state machines.

---

# 12. Capabilities Model

Capabilities are a useful way to keep the core stable while allowing new artifact types to emerge.

## 12.1 Examples

### Image artifact
```ts
capabilities: ["canReview", "canTransform", "canBranch"]
```

### Function artifact
```ts
capabilities: ["canExecute", "canVersion", "canReference"]
```

### Agent artifact
```ts
capabilities: ["canRun", "canProduceArtifacts", "canUseTools"]
```

### Exploration artifact
```ts
capabilities: ["canHaveState", "canBranch", "canReview", "canContain"]
```

Capabilities should not replace all type-specific logic, but they are a useful secondary abstraction for UI and system behaviour.

---

# 13. Recommended Postgres MVP Shape

For the first build, do **not** overcomplicate this.

Recommended MVP storage approach:

## 13.1 Tables

### `artifacts`
Current artifact state row

### `artifact_events`
Append-only event history

### `artifact_relationships`
Explicit graph edges

### `state_machines`
State machine definitions

Potentially later:
- `state_machine_states`
- `state_machine_transitions`
if we want them normalized instead of embedded JSON.

---

# 14. Suggested MVP Table Design

## 14.1 `artifacts`

Suggested columns:

- `id uuid pk`
- `project_id uuid not null`
- `type text not null`
- `title text not null`
- `description text null`
- `current_state_id text null`
- `state_machine_id uuid null`
- `content jsonb not null default '{}'`
- `metadata jsonb not null default '{}'`
- `capabilities text[] not null default '{}'`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `created_by text not null`
- `updated_by text null`
- `version_id uuid null`
- `branch_id uuid null`
- `parent_artifact_id uuid null`
- `schema_version int not null default 1`
- `content_schema_version int null`
- `archived_at timestamptz null`

## 14.2 `artifact_events`

Suggested columns:

- `id uuid pk`
- `artifact_id uuid not null`
- `project_id uuid not null`
- `type text not null`
- `payload jsonb not null default '{}'`
- `actor_type text not null`
- `actor_id text not null`
- `run_id uuid null`
- `created_at timestamptz not null`

## 14.3 `artifact_relationships`

Suggested columns:

- `id uuid pk`
- `project_id uuid not null`
- `source_artifact_id uuid not null`
- `target_artifact_id uuid not null`
- `relationship_type text not null`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz not null`
- `created_by text not null`

---

# 15. What the UI Should Eventually Optimise For

Even though this spec is about schema, the schema should support the product direction we want.

The UI should eventually answer:

- What is this artifact?
- What state is it in?
- Why is it in that state?
- What is blocking progress?
- What are the next valid moves?
- What evidence supports moving forward?
- What changed recently?

It should **not** drift toward becoming a generic workflow editor where the main task is drawing arrows between states.

---

# 16. Areas Not Yet Stress-Tested

These are the main unresolved areas we have **not yet fully tested**.

## 16.1 Schema flexibility vs queryability

Using `content jsonb` and `metadata jsonb` is flexible, but querying can become messy.

Open questions:
- Which fields should always be top-level columns?
- Which fields should live in JSONB?
- Which artifact types eventually deserve typed side tables?

## 16.2 Event sourcing complexity

We like event logs, but full event sourcing may be overkill.

Need to decide:

### Option A — full event sourcing
Current state is rebuilt from events.

### Option B — current-state row + append-only event log
Artifact table stores current state; events provide audit/history.

**Likely MVP recommendation:** Option B.

## 16.3 Versioning and branching

Not yet fully resolved:

- Does every edit create a version?
- Are branches artifact-level or project-level?
- Can branches merge?
- How do relationships behave across branches?
- How do runs interact with branches?

## 16.4 Permissions and trust boundaries

Need to define:

- Who can transition state?
- Who can edit state machines?
- Can agents execute transitions or only propose them?
- Which artifacts can be locked?
- How are approvals represented?

## 16.5 State machine granularity

Unclear whether every artifact should have one.

Likely answer: no.

Need rules for:
- no lifecycle
- simple lifecycle
- full project-defined lifecycle

## 16.6 Relationship explosion

Canvas could become graph-heavy and noisy.

Need guardrails for:
- duplicate relationships
- weak semantic links
- AI-generated relationship spam
- stale or low-confidence edges

## 16.7 UI overload

The schema can support many concepts, but the UI must remain action-focused.

Need to avoid dumping:
- all events
- all links
- all states
- all metrics
- all branches
onto the same screen at once.

## 16.8 Agent accountability

Need clear separation between:

- agent-suggested changes
- agent-executed changes
- user-approved changes
- system-generated changes

This is especially important for state transitions.

## 16.9 Migration strategy

Artifact shapes will evolve.

Need:
- schema versioning
- content schema versioning
- migration scripts
- validation strategy
- backward compatibility rules

## 16.10 Performance

Need to stress test:

- large canvases
- large event logs
- many relationships
- timeline rendering
- search
- graph traversal
- undo/redo
- branching queries

---

# 17. Recommended Implementation Stance for Codex

Build the foundation conservatively.

## What to implement first

1. Artifact base model
2. Artifact event log
3. Artifact relationship model
4. Optional state machine binding
5. Current state stored on artifact
6. State transitions recorded as events
7. Capabilities array
8. JSONB content/metadata with schema version fields

## What not to overbuild yet

Do **not** prematurely build:

- full workflow software
- BPMN-style editors
- fully generic graph ontology engines
- deep inheritance hierarchies
- complete event-sourced reconstruction infrastructure
- universal branch merge logic

---

# 18. Suggested Build Order

## Phase 1 — Foundation
- artifacts table
- artifact_events table
- artifact_relationships table
- base types and repository layer
- create/read/update artifact flows
- append event on important changes

## Phase 2 — State support
- state_machine model
- bind artifact to state machine
- store `current_state_id`
- record `StateTransitioned` events
- basic transition validation

## Phase 3 — Runs and provenance
- attach run IDs to events
- support `createdByRunId` / provenance conventions
- allow runs to propose or execute transitions

## Phase 4 — Query surfaces
- artifact timeline
- related artifacts graph view
- “why is this in this state?” event aggregation
- next-valid-transition helpers

## Phase 5 — Hardening
- migrations
- validation
- permissions
- optimistic locking/version safety
- indexes and performance tuning

---

# 19. Summary

Canvas should be built around **persistent artifacts with evolving state**, not around prompts or workflow diagrams.

The base schema should therefore support:

- a stable artifact identity
- optional lifecycle state
- append-only event history
- explicit relationships
- capabilities
- version / branch hooks
- flexible but migration-safe content storage

The recommended MVP is:

- **Artifact** table for current state
- **ArtifactEvent** table for history
- **ArtifactRelationship** table for graph edges
- **StateMachine** definitions for optional lifecycle logic

That gives Canvas a strong architectural spine without prematurely locking it into heavyweight workflow software or an overdesigned ontology system.

---

# 20. Implementation status (2026-07-03)

Phase 1–2 of this spec are **shipped** in migration `canvas/server/migrations/0021_artifact_base_schema.sql`.

## 20.1 Integration choice

Canvas already had a singular `artifact` primitive table. The MVP **extends that table** rather than introducing a parallel `artifacts` table. History lives in `artifact_event` (singular). Lifecycle definitions live in `state_machine` (singular). Graph edges continue to use the existing `relationship` table via `server/repositories/relationships.js`.

IDs remain **TEXT ULIDs**, matching existing Canvas primitive conventions (not UUID).

## 20.2 Shipped storage

| Spec concept | Shipped table / column |
|--------------|------------------------|
| Artifact current state | `artifact` + new columns (`project_id`, `title`, `description`, `current_state_id`, `state_machine_id`, `capabilities`, `created_by`, `updated_by`, `created_at`, `updated_at`, `schema_version`, `content_schema_version`, `archived_at`) |
| Event log | `artifact_event` |
| Relationships | existing `relationship` rows (typed edges; events appended on add/remove) |
| State machines | `state_machine` with embedded `states` / `transitions` JSONB |

Backfill on migrate: existing rows receive inferred `title`, `project_id`, default `capabilities` by artifact type, and a synthetic `ArtifactCreated` event per row.

Three built-in lifecycle machines are seeded: `builtin_exploration_lifecycle`, `builtin_artifact_review_lifecycle`, `builtin_run_lifecycle`.

## 20.3 Shipped server layer

| Layer | Path |
|-------|------|
| Migration | `canvas/server/migrations/0021_artifact_base_schema.sql` |
| Zod request schemas | `canvas/server/schemas/artifacts.js` |
| Repositories | `artifacts.js`, `artifact-events.js`, `relationships.js`, `state-machines.js` |
| Service (transactions + events) | `canvas/server/services/artifactService.js` |
| Routes | `canvas/server/routes/artifacts.js`, `stateMachines.js` |
| Tests | `artifactService.test.js`, `artifactBaseRoutes.test.js` |

## 20.4 Shipped API (extends existing `/artifacts/*`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/artifacts` | Create artifact + `ArtifactCreated` event |
| GET | `/projects/:projectId/artifacts` | List project artifacts |
| PATCH | `/artifacts/:id` | Update artifact + `ContentUpdated` event |
| POST | `/artifacts/:id/archive` | Archive artifact + `ArtifactArchived` event |
| POST | `/artifacts/:id/transition` | Validate transition, update `current_state_id`, append `StateTransitioned` |
| GET | `/artifacts/:id/events` | List artifact event history |
| GET | `/artifacts/:id/relationships` | List typed relationships |
| POST | `/artifact-relationships` | Create edge + `RelationshipAdded` event |
| DELETE | `/artifact-relationships/:id` | Remove edge + `RelationshipRemoved` event |
| POST | `/state-machines` | Create lifecycle definition |
| GET | `/state-machines/:id` | Fetch lifecycle definition |
| GET | `/projects/:projectId/state-machines` | List project lifecycle definitions |
| PATCH | `/state-machines/:id` | Update lifecycle definition |

## 20.5 Shipped client surfaces

- `PrimitiveInspectorPanel.jsx` — collapsible **Identity**, **Lifecycle**, **State**, **Capabilities**, **Events**, and **Relationships** sections for workspace artifact inspection.
- `primitivesApi.js` — `fetchArtifactEvents`.
- `src/primitives/shared/types.js` — extended artifact types and structural relationship enums aligned with the spec registry.

## 20.6 History model decision

**Option B (shipped):** current-state row on `artifact` plus append-only `artifact_event` audit log. Full event-sourced reconstruction is deferred.

## 20.7 Still deferred

See §16. Permissions, branching merge logic, guard/action execution, UI transition controls, and typed per-artifact side tables remain future work.
