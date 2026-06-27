# Canvas Path + Step Implementation Spec

**Version:** 0.1  
**Scope:** Rename lightly-used Flow artifacts to Path artifacts and implement an MVP executable Path system.  
**Initial use case:** Sonic Studio component exploration → validated idea → research → scope → spec artifact → coding-agent build brief artifact.

---

## 1. Core Concept

Canvas should model repeatable work as **Paths** made of **Steps** that move and transform **Artifacts**.

```text
Artifact → Step → Artifact → Step → Artifact
```

A **Path** is a reusable graph or sequence of Steps.

A **Step** is a unit of work. It may be performed by one human, one agent, one tool, multiple humans, multiple agents, humans and agents together, or another nested Path.

A **Transition** connects Steps and describes how work moves from one Step to another.

A **Run** is one execution of a Path.

---

## 2. Rename Existing Flow Language

If Flow is lightly used, migrate now.

```text
Flow Artifact   → Path Artifact
Flow Node       → Path Step
Flow Edge       → Path Transition
Flow Run        → Path Run
Node Type       → Step Type
```

Suggested table rename:

```text
flows           → paths
flow_nodes      → path_steps
flow_edges      → path_transitions
flow_runs       → path_runs
flow_run_events → path_run_events
```

Product language:

```text
Flow      → Path
Node      → Step
Edge      → Transition
Execute   → Run
```

---

## 3. High-Level Mental Model

### Artifact

Artifacts are persistent things. They hold state.

Examples:

- Idea Note
- Research Notes
- Validation Report
- Scope Summary
- Specification
- Coding Agent Brief
- Decision Record
- Test Result
- Generated Audio
- Generated Code Sandbox Output

### Step

Steps do work.

Examples:

- Human writes an idea.
- Agent critiques an idea.
- Human and agent discuss scope.
- Agent researches sources.
- Decision gate chooses revise or approve.
- Tool creates a markdown brief.
- Nested Path performs deeper research.

### Path

A Path defines how Artifacts move through Steps.

Examples:

- Sonic Component Exploration Path
- Primitive Build Path
- Research Path
- Specification Path
- Validation Path

### Transition

Transitions connect Steps. They can carry meaning:

```text
feeds
reviews
approves
revises
blocks
branches_to
loops_to
produces
depends_on
```

---

## 4. MVP Use Case

Build a Path for one Sonic Studio component.

Example component idea:

> Add a State Variable Filter primitive to Sonic Studio.

The MVP Path:

```text
Idea Artifact
   ↓
Validate Idea Step
   ↓
Decision Gate
   ├── revise → Idea Artifact / Validate Idea Step
   └── approve
          ↓
Research Step
   ↓
Scope Step
   ↓
Generate Spec Step
   ↓
Generate Coding Brief Step
   ↓
Approved Build Brief Artifact
```

The MVP includes one loop gate:

```text
Decision Gate
   ├── Revise → returns to Idea / Validate Idea
   └── Approve → continues
```

---

## 5. Workflow Example: Sonic Studio Component Path

### Step 1 — Capture Idea

**Step type:** `human`  
**Participants:** one human  
**Input artifacts:** none or existing note  
**Output artifacts:** `idea_note`

Example output:

```json
{
  "artifactType": "idea_note",
  "title": "State Variable Filter Primitive",
  "body": "Add a CS-80 inspired state-variable filter primitive with LP/BP/HP/Notch outputs."
}
```

### Step 2 — Validate Idea

**Step type:** `collaboration` or `agent`  
**Participants:** human + one or more agents  
**Input artifacts:** `idea_note`  
**Output artifacts:** `idea_validation_report`

Validation questions:

- Is the idea coherent?
- Does it fit the Sonic Studio architecture?
- Does it duplicate an existing primitive?
- Is it suitable for MVP, later phase, or rejection?
- What are the main risks?
- What should be clarified?

Example output:

```json
{
  "artifactType": "idea_validation_report",
  "status": "needs_revision",
  "summary": "The idea fits Sonic Studio, but the required filter algorithm and output ports need clarification.",
  "questions": [
    "Should the MVP use TPT/ZDF SVF or simpler biquad-derived SVF?",
    "Should all filter outputs be exposed as separate ports?"
  ],
  "recommendation": "revise"
}
```

### Step 3 — Decision Gate

**Step type:** `decision`  
**Participants:** human, optionally agent recommendation  
**Input artifacts:** `idea_note`, `idea_validation_report`  
**Output artifacts:** `decision_record`

Decision branches:

```text
Revise  → loop back to Idea / Validate Idea
Approve → continue to Research
Reject  → end Path
```

Example output:

```json
{
  "artifactType": "decision_record",
  "decision": "approve",
  "reason": "SVF is useful for pads, drones, percussion tone shaping and CS-style synthesis."
}
```

### Step 4 — Research

**Step type:** `agent` initially, later `path` sub-step  
**Participants:** one or more agents, optionally human review  
**Input artifacts:** `approved_idea`, `decision_record`  
**Output artifacts:** `research_summary`, `source_notes`, `open_questions`

Research topics:

- Known algorithms
- TPT/ZDF state-variable filter
- Multi-output filters
- Parameter smoothing
- Resonance stability
- Oversampling needs
- Real-time safety
- Tests and benchmarks
- Relevant implementation references

Example output:

```json
{
  "artifactType": "research_summary",
  "recommendedAlgorithm": "TPT/ZDF State Variable Filter",
  "alternatives": [
    "naive Chamberlin SVF",
    "biquad filter bank",
    "zero-delay feedback variants"
  ],
  "risks": [
    "resonance instability at high cutoff",
    "parameter zipper noise",
    "inconsistent multi-output gain"
  ]
}
```

### Step 5 — Scope

**Step type:** `collaboration`  
**Participants:** human + agent  
**Input artifacts:** `idea_note`, `research_summary`  
**Output artifacts:** `scope_artifact`

Example output:

```json
{
  "artifactType": "scope_artifact",
  "inScope": [
    "TPT/ZDF SVF",
    "LP/BP/HP/Notch outputs",
    "cutoff and resonance parameters",
    "typed ports",
    "registry entry",
    "unit tests"
  ],
  "outOfScope": [
    "oversampling",
    "SIMD",
    "nonlinear drive model",
    "UI polish"
  ]
}
```

### Step 6 — Generate Spec

**Step type:** `agent` or `collaboration`  
**Participants:** agent drafts, human may edit  
**Input artifacts:** `scope_artifact`, `research_summary`, `ontology_reference`, `primitive_library_reference`  
**Output artifacts:** `component_spec`

### Step 7 — Generate Coding Brief

**Step type:** `agent` or `tool`  
**Participants:** agent, optional human approval  
**Input artifacts:** `component_spec`, `scope_artifact`, `research_summary`  
**Output artifacts:** `coding_agent_brief`

This is the artifact handed to Cursor/Codex.

Example output:

```json
{
  "artifactType": "coding_agent_brief",
  "target": "Cursor/Codex",
  "instruction": "Implement only the StateVariableFilter primitive as specified. Do not redesign the registry.",
  "filesToCreate": [
    "packages/sonic-core/src/dsp/StateVariableFilter.ts",
    "packages/sonic-core/src/dsp/StateVariableFilter.test.ts",
    "packages/sonic-core/src/registry/StateVariableFilter.registry.ts"
  ]
}
```

---

## 6. MVP Step Types

The first implementation should support six Step types.

### 6.1 Human Step

A human creates, edits, reviews, or approves artifacts.

```ts
type StepType = "human";

interface HumanStepConfig {
  instructions: string;
  requiredParticipantIds?: string[];
  outputArtifactTypes: string[];
  allowInlineEditing: boolean;
}
```

### 6.2 Agent Step

An AI model transforms input artifacts into output artifacts.

```ts
type StepType = "agent";

interface AgentStepConfig {
  model: string;
  systemPrompt: string;
  userPromptTemplate: string;
  inputArtifactRoles: Record<string, string>;
  outputArtifactType: string;
  outputSchema?: Record<string, unknown>;
  temperature?: number;
}
```

### 6.3 Tool Step

A deterministic tool or sandbox transforms artifacts.

```ts
type StepType = "tool";

interface ToolStepConfig {
  toolId: string;
  command?: string;
  sandboxed: boolean;
  inputMappings: Record<string, string>;
  outputMappings: Record<string, string>;
}
```

### 6.4 Decision Step

A Step that chooses the next transition.

```ts
type StepType = "decision";

interface DecisionStepConfig {
  decisionMode: "human" | "agent_recommendation_human_approval" | "automatic";
  options: DecisionOption[];
  defaultOptionId?: string;
}

interface DecisionOption {
  id: string;
  label: string;
  description?: string;
  transitionId: string;
}
```

### 6.5 Collaboration Step

A Step involving multiple participants.

```ts
type StepType = "collaboration";

interface CollaborationStepConfig {
  mode: "discussion" | "review" | "critique" | "workshop";
  participants: ParticipantRef[];
  instructions: string;
  outputArtifactTypes: string[];
  completionMode: "manual" | "all_required_participants_done" | "decision_reached";
}
```

### 6.6 Path Step

A Step that runs another Path.

```ts
type StepType = "path";

interface PathStepConfig {
  childPathId: string;
  inputMappings: Record<string, string>;
  outputMappings: Record<string, string>;
  runMode: "inline" | "separate_run";
}
```

---

## 7. Path Schema

### 7.1 Path

```ts
interface Path {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  status: "draft" | "active" | "archived";
  pathType: "exploration" | "build" | "review" | "utility";
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
```

### 7.2 Path Step

```ts
interface PathStep {
  id: string;
  pathId: string;
  name: string;
  description?: string;
  stepType:
    | "human"
    | "agent"
    | "tool"
    | "decision"
    | "collaboration"
    | "path";
  position: { x: number; y: number };
  inputArtifactTypes: string[];
  outputArtifactTypes: string[];
  config: Record<string, unknown>;
  status?: "not_started" | "ready" | "running" | "waiting" | "complete" | "failed" | "skipped";
  createdAt: string;
  updatedAt: string;
}
```

### 7.3 Path Transition

```ts
interface PathTransition {
  id: string;
  pathId: string;
  sourceStepId: string;
  targetStepId: string;
  label?: string;
  relationType:
    | "feeds"
    | "reviews"
    | "approves"
    | "revises"
    | "rejects"
    | "branches_to"
    | "loops_to"
    | "depends_on";
  condition?: TransitionCondition;
  createdAt: string;
  updatedAt: string;
}

interface TransitionCondition {
  type: "always" | "decision_option" | "artifact_status" | "expression";
  value?: string;
}
```

### 7.4 Path Run

```ts
interface PathRun {
  id: string;
  pathId: string;
  projectId: string;
  status: "queued" | "running" | "waiting" | "complete" | "failed" | "cancelled";
  startedAt?: string;
  completedAt?: string;
  startedBy: string;
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  currentStepIds: string[];
  parentRunId?: string;
  parentStepId?: string;
}
```

### 7.5 Step Run

```ts
interface StepRun {
  id: string;
  pathRunId: string;
  stepId: string;
  status: "queued" | "running" | "waiting" | "complete" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  selectedTransitionId?: string;
  logs?: StepRunLog[];
  error?: string;
}
```

### 7.6 Step Run Log

```ts
interface StepRunLog {
  id: string;
  stepRunId: string;
  timestamp: string;
  level: "debug" | "info" | "warning" | "error";
  message: string;
  metadata?: Record<string, unknown>;
}
```

---

## 8. Artifact Schema Additions

Existing Canvas artifacts can remain, but add generic execution metadata.

```ts
interface ArtifactExecutionMetadata {
  producedByPathRunId?: string;
  producedByStepRunId?: string;
  sourceArtifactIds?: string[];
  artifactRole?: string;
  schemaVersion?: string;
  validationStatus?: "unknown" | "valid" | "invalid" | "needs_review";
}
```

Recommended artifact types for MVP:

```text
idea_note
idea_validation_report
decision_record
research_summary
scope_artifact
component_spec
coding_agent_brief
```

---

## 9. MVP Database Tables

### 9.1 paths

```sql
CREATE TABLE paths (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  path_type TEXT NOT NULL DEFAULT 'exploration',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);
```

### 9.2 path_steps

```sql
CREATE TABLE path_steps (
  id UUID PRIMARY KEY,
  path_id UUID NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  step_type TEXT NOT NULL,
  position JSONB NOT NULL DEFAULT '{"x":0,"y":0}',
  input_artifact_types JSONB NOT NULL DEFAULT '[]',
  output_artifact_types JSONB NOT NULL DEFAULT '[]',
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'not_started',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 9.3 path_transitions

```sql
CREATE TABLE path_transitions (
  id UUID PRIMARY KEY,
  path_id UUID NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
  source_step_id UUID NOT NULL REFERENCES path_steps(id) ON DELETE CASCADE,
  target_step_id UUID NOT NULL REFERENCES path_steps(id) ON DELETE CASCADE,
  label TEXT,
  relation_type TEXT NOT NULL DEFAULT 'feeds',
  condition JSONB NOT NULL DEFAULT '{"type":"always"}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 9.4 path_runs

```sql
CREATE TABLE path_runs (
  id UUID PRIMARY KEY,
  path_id UUID NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  started_by TEXT,
  input_artifact_ids JSONB NOT NULL DEFAULT '[]',
  output_artifact_ids JSONB NOT NULL DEFAULT '[]',
  current_step_ids JSONB NOT NULL DEFAULT '[]',
  parent_run_id UUID,
  parent_step_id UUID
);
```

### 9.5 step_runs

```sql
CREATE TABLE step_runs (
  id UUID PRIMARY KEY,
  path_run_id UUID NOT NULL REFERENCES path_runs(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES path_steps(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  input_artifact_ids JSONB NOT NULL DEFAULT '[]',
  output_artifact_ids JSONB NOT NULL DEFAULT '[]',
  selected_transition_id UUID,
  logs JSONB NOT NULL DEFAULT '[]',
  error TEXT
);
```

---

## 10. Execution Logic MVP

### 10.1 Starting a Path Run

1. Create `path_run`.
2. Find starting Steps:
   - Steps with no incoming transitions, or
   - explicitly selected start Step.
3. Create queued `step_runs`.
4. Mark Path Run as `running`.

### 10.2 Step Execution

Each Step receives:

```ts
interface StepExecutionContext {
  projectId: string;
  pathId: string;
  pathRunId: string;
  stepId: string;
  inputArtifacts: Artifact[];
  config: Record<string, unknown>;
}
```

Each Step returns:

```ts
interface StepExecutionResult {
  status: "complete" | "waiting" | "failed";
  outputArtifacts?: Artifact[];
  selectedTransitionId?: string;
  logs?: StepRunLog[];
  error?: string;
}
```

### 10.3 Transition Selection

After a Step completes:

1. Get outgoing transitions.
2. If no outgoing transitions, mark Step terminal.
3. If one `always` transition, continue.
4. If decision transition, use selected decision option.
5. If loop transition, allow transition back to earlier Step.
6. Create next Step Run.

### 10.4 Loop Guard

Add a simple loop guard for MVP.

```ts
interface LoopGuard {
  maxIterationsPerRun: number; // default 5
}
```

If a loop exceeds the guard:

- pause the run
- mark status `waiting`
- ask for human approval to continue

---

## 11. React Flow UI Requirements

Use existing React Flow infrastructure.

### 11.1 Path Editor

Rename Flow editor labels:

```text
Flow Editor → Path Editor
Node        → Step
Edge        → Transition
```

### 11.2 Step Cards

Each Step card should show:

- Step name
- Step type
- status
- input artifact count
- output artifact count
- participant icons
- small run status indicator

### 11.3 Step Detail Panel

When selected:

- name
- description
- step type
- inputs
- outputs
- config
- participants
- run history
- error logs

### 11.4 Transition Labels

Transitions can show labels:

```text
approve
revise
reject
feeds
loops
```

### 11.5 Loop UI

Loop transition should be visually distinct.

Example:

```text
Decision Gate ── revise ──► Validate Idea
```

---

## 12. MVP Path Template

Create one built-in template:

```text
Sonic Studio Component Exploration Path
```

Steps:

1. Capture Idea
2. Validate Idea
3. Decision Gate
4. Research
5. Scope
6. Generate Spec
7. Generate Coding Brief

Transitions:

```text
Capture Idea → Validate Idea
Validate Idea → Decision Gate
Decision Gate approve → Research
Decision Gate revise → Capture Idea
Decision Gate reject → End
Research → Scope
Scope → Generate Spec
Generate Spec → Generate Coding Brief
```

---

## 13. Step Participants

A Step may involve multiple participants.

```ts
interface ParticipantRef {
  id: string;
  type: "human" | "agent" | "tool";
  role: string;
  required: boolean;
}
```

For MVP, participants can live inside Step config JSON rather than a separate table.

---

## 14. Artifact Input/Output Contract

Each Step should declare expected artifact roles.

```ts
interface ArtifactPort {
  id: string;
  role: string;
  artifactType: string;
  required: boolean;
  multiple: boolean;
  direction: "input" | "output";
}
```

Example for Generate Coding Brief:

```json
{
  "inputs": [
    {
      "role": "component_spec",
      "artifactType": "component_spec",
      "required": true
    },
    {
      "role": "scope",
      "artifactType": "scope_artifact",
      "required": true
    }
  ],
  "outputs": [
    {
      "role": "coding_brief",
      "artifactType": "coding_agent_brief",
      "required": true
    }
  ]
}
```

---

## 15. Safety Rules

### 15.1 Path System

- A Step must not modify unrelated artifacts without explicit mapping.
- Each generated artifact must record which Step Run produced it.
- Loops must have iteration guards.
- Human approval must be available at decision gates.
- Failed Steps must preserve logs and input artifacts.
- Path Runs must be restartable from failed/waiting Steps later.

### 15.2 Coding Agent Handoff

The MVP does **not** allow a Canvas coding agent to edit the Canvas app source.

The output is only a `coding_agent_brief` artifact for use in Cursor/Codex.

Hard boundary:

```text
Canvas Path produces build brief.
Cursor/Codex implements code outside Canvas.
```

---

## 16. Implementation Phases

### Phase 1 — Rename and Schema

- Rename Flow to Path in UI and code.
- Add tables or migrate existing flow tables.
- Add Path, PathStep, PathTransition types.
- Preserve React Flow rendering.

Acceptance:

- User can create a Path artifact.
- User can add Steps.
- User can connect Steps with Transitions.
- UI uses Path/Step/Transition language.

### Phase 2 — Step Primitives

Implement Step types:

- human
- agent
- tool
- decision
- collaboration
- path

For MVP, `agent` and `tool` may be mocked if needed.

Acceptance:

- Step type can be selected.
- Step config can be edited.
- Step input/output artifact types can be declared.

### Phase 3 — MVP Template

Create built-in template:

```text
Sonic Studio Component Exploration Path
```

Acceptance:

- Template creates all seven Steps.
- Template creates approve/revise/reject transitions.
- Revise transition loops back to Capture Idea or Validate Idea.

### Phase 4 — Simple Path Run Engine

Implement run engine:

- start run
- execute human/waiting Steps
- execute mocked agent Steps
- execute decision Step
- follow transitions
- loop guard
- record Step Runs

Acceptance:

- User can run the Sonic Studio Component Exploration Path.
- It pauses at Human and Decision Steps.
- It loops on revise.
- It produces placeholder artifacts.

### Phase 5 — Artifact Generation

Implement real artifact creation for each Step:

- Idea Note
- Validation Report
- Decision Record
- Research Summary
- Scope Artifact
- Component Spec
- Coding Agent Brief

Acceptance:

- Each Step produces correct artifact type.
- Each artifact records run metadata.
- Final brief can be downloaded or copied into Cursor/Codex.

### Phase 6 — Agent Integration

Replace mocked agent Steps with actual model calls.

Acceptance:

- Validate Idea Step calls model.
- Research Step calls model or later web-enabled agent.
- Generate Spec and Brief Steps produce structured artifacts.
- Human can edit generated artifacts.

---

## 17. First Codex Prompt

```text
Implement the Canvas Path + Step MVP.

Rename the lightly-used Flow model to Path:
- Flow Artifact → Path Artifact
- Node → Step
- Edge → Transition
- Flow Run → Path Run

Implement schema/types for:
- Path
- PathStep
- PathTransition
- PathRun
- StepRun

Implement Step types:
- human
- agent
- tool
- decision
- collaboration
- path

Create the built-in template:
Sonic Studio Component Exploration Path

Template steps:
1. Capture Idea
2. Validate Idea
3. Decision Gate
4. Research
5. Scope
6. Generate Spec
7. Generate Coding Brief

Transitions:
- Capture Idea → Validate Idea
- Validate Idea → Decision Gate
- Decision approve → Research
- Decision revise → Capture Idea
- Decision reject → End
- Research → Scope
- Scope → Generate Spec
- Generate Spec → Generate Coding Brief

For this first pass:
- agent and tool steps can use mocked outputs
- do not call external APIs yet
- do not implement coding agent execution
- do not modify Canvas source from inside a Path
- final output is a Coding Agent Brief artifact for manual handoff to Cursor/Codex

Add run history:
- PathRun
- StepRun
- logs
- produced artifact IDs
- selected transition ID

Add a loop guard with max 5 iterations.

Use existing React Flow infrastructure for the Path editor.
Focus on schema, persistence, UI naming, template creation, and mocked execution.
```

---

## 18. Key Principle

Canvas should begin with the smallest executable pattern:

```text
Artifact → Step → Artifact
```

Everything else can grow from this.

Paths are saved chains of Steps.  
Steps can involve humans, agents, tools, decisions, or nested Paths.  
Runs create history.  
Artifacts preserve knowledge.  
Transitions explain how work moves and loops.

The first valuable MVP is one reliable Path that starts with a Sonic Studio idea and produces a clean specification and coding-agent brief.
