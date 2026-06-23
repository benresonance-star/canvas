# specV5.md
# Canvas Operating System — Agent Types, Agent Artifacts & Image Generation Vertical Slice
Version: 5.0

## Purpose

Implement the first usable Agent system in the Canvas app.

The first production slice remains narrow:

- Existing Note Artifact as prompt source
- Existing Image/File Artifacts as references
- Image Generation Agent Type
- User-created Image Generation Agent Artifact
- Image Transformer
- Execution history
- Generated Image Artifacts auto-saved to the project folder

This version introduces full CRUD for Agent Types and Agent Artifacts.

---

# Core Distinction

## Deterministic Layer

Transformers are deterministic or bounded functions.

They do work.

They do not reason.

Examples:

- Image Transformer
- PDF Parser
- Summary Transformer
- Format Converter

---

## Agentic Layer

Agents reason, choose, review and orchestrate.

They may call Transformers.

Agents do not directly create hidden outputs.

Every meaningful action produces an Execution and, where relevant, Artifacts.

---

# Core Primitives

- Artifact
- Agent Type
- Agent Artifact
- Transformer
- Execution
- Relationship

---

# Artifact

Artifacts are the core knowledge and media objects.

Initial existing artifact types:

- Note
- Image
- File

Generated outputs also use existing artifact types.

No special prompt artifact.
No special reference artifact.
No special generated-image artifact.

Meaning comes from relationships.

Example:

A Note Artifact becomes a prompt because it is linked as:

Note Artifact --prompt_input_to--> Image Generation Agent Artifact

---

# Agent Type

An Agent Type is a reusable blueprint.

It defines:

- schema
- default instructions
- default rules
- default skills
- allowed tools
- default memory sources
- default UI layout
- validation rules
- allowed transformers

Agent Types are editable through full CRUD.

---

## Initial Agent Type

Implement one built-in type:

Image Generation Agent Type

Purpose:

Create image outputs from Note Artifacts and reference Image/File Artifacts.

---

## Future Agent Types

Not implemented in this slice, but architecture must support:

- Research Agent Type
- Development Intelligence Agent Type
- Design Review Agent Type
- Living Playbook Agent Type
- Report Agent Type

---

# Agent Artifact

An Agent Artifact is a user-created instance of an Agent Type.

Example:

Architectural Facade Image Agent

Created from:

Image Generation Agent Type

The Agent Artifact may customise:

- name
- description
- goal
- instructions
- rules
- enabled skills
- enabled tools
- memory sources
- model preferences
- transformer settings

---

# Agent Creation Flow

1. User selects Create Agent
2. User chooses Agent Type
3. System applies type defaults
4. User edits one-screen control room
5. User saves Agent Artifact
6. Agent appears on Canvas as a node

---

# Full CRUD Requirements

## Agent Types

User can:

- create Agent Type
- read Agent Type
- update Agent Type
- delete Agent Type

Deletion should be blocked if active Agent Artifacts depend on the type unless the user migrates or archives those agents.

---

## Agent Artifacts

User can:

- create Agent Artifact
- read Agent Artifact
- update Agent Artifact
- delete/archive Agent Artifact
- duplicate Agent Artifact
- rename Agent Artifact

---

## Instructions

Instructions are editable, versioned text objects associated with Agent Types or Agent Artifacts.

Agent Artifact instructions override Agent Type defaults.

---

## Rules

Rules are explicit constraints.

Rules may exist at:

- Agent Type level
- Agent Artifact level

Agent Artifact rules may extend or override defaults.

---

## Skills

Skills are reusable capability descriptions.

Examples for Image Generation Agent:

- Prompt Engineering
- Reference Selection
- Image Critique
- Style Consistency

Skills may be shared between Agent Types.

---

## Tools

Tools are callable capabilities.

Initial tools:

- Artifact Reader
- Artifact Writer
- Image Transformer

Future tools:

- Web Search
- Vector Search
- Postgres Query
- ComfyUI Runner
- Local Model Runner

---

# Image Generation Agent Type Schema

```ts
interface ImageGenerationAgentType {
  id: string;
  name: "Image Generation Agent";
  description: string;

  defaultGoal: string;
  defaultInstructions: string;
  defaultRules: Rule[];
  defaultSkills: Skill[];
  allowedTools: ToolReference[];
  allowedTransformers: TransformerReference[];

  uiLayout: AgentControlRoomLayout;

  createdAt: string;
  updatedAt: string;
}
```

---

# Agent Artifact Schema

```ts
interface AgentArtifact {
  id: string;
  artifactType: "agent";

  agentTypeId: string;

  name: string;
  description?: string;

  goal: string;

  instructions: string;
  rules: Rule[];
  skills: SkillReference[];
  tools: ToolReference[];
  memorySources: ArtifactReference[];

  modelPreferences: ModelPreference[];

  transformerSettings: Record<string, unknown>;

  projectId: string;

  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}
```

---

# Image Transformer

The Image Transformer is deterministic/bounded.

It receives a structured request and returns generated image files.

It does not:

- reason
- plan
- critique
- select strategy
- own memory

---

## Image Transformer Request

```ts
interface ImageTransformerRequest {
  prompt: string;

  referenceArtifactIds: string[];

  provider: "openai" | "gemini" | "comfyui" | "local";

  model?: string;

  settings: {
    aspectRatio: "1:1" | "4:3" | "16:9" | "9:16";
    quality: "draft" | "standard" | "high";
    seed?: number;
    imageCount: number;
    outputFormat: "png" | "jpg" | "webp";
  };
}
```

---

# Input Sources

## Prompt

Prompt source is an existing Note Artifact.

The body text of the Note Artifact is passed to the Agent.

The Agent may improve, expand or adapt the prompt before calling the Image Transformer.

The original Note Artifact remains unchanged.

Prompt snapshots are stored in the Execution.

---

## References

Reference sources are existing Image/File Artifacts.

Examples:

- precedent image
- sketch
- material reference
- render
- photograph

No special reference artifact type.

---

# Output

Generated images become new Image Artifacts.

They are automatically saved into the current project folder.

---

# Output File Storage

Generated images must be saved to:

```text
/projects/{projectSlug}/generated/{agentSlug}/
```

Filename pattern:

```text
YYYY-MM-DD_HHmm_{agentSlug}_exec-{executionNumber}_v{version}.{ext}
```

Example:

```text
2026-06-23_1432_facade-image-agent_exec-0007_v01.png
```

---

# Generated Image Artifact Metadata

Each generated Image Artifact stores:

```ts
interface GeneratedImageMetadata {
  executionId: string;
  agentArtifactId: string;
  agentTypeId: string;
  transformerId: string;

  promptNoteArtifactId: string;
  referenceArtifactIds: string[];

  originalPromptSnapshot: string;
  agentPromptSnapshot: string;

  provider: string;
  model?: string;

  version: number;
  filePath: string;

  createdAt: string;
}
```

---

# Execution

An Execution records a single run.

Executions are immutable.

---

## Execution Schema

```ts
interface Execution {
  id: string;

  projectId: string;

  agentArtifactId?: string;
  agentTypeId?: string;

  transformerId?: string;

  status: "pending" | "running" | "completed" | "failed";

  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;

  originalPromptSnapshot?: string;
  agentPromptSnapshot?: string;

  logs: ExecutionLogEntry[];

  startedAt: string;
  completedAt?: string;

  error?: string;
}
```

---

# One-Screen Agent Control Room

Double-clicking an Agent Artifact opens a fullscreen one-screen view.

No tabs.

The view exposes the agent as an inspectable machine.

---

## Required Sections

- Identity
- Goal
- Instructions
- Rules
- Skills
- Tools
- Memory Sources
- Model Preferences
- Transformer Settings
- Connected Inputs
- Recent Executions
- Outputs

---

## Layout Principle

Everything important should be visible on one screen.

Cards may expand inline.

No hidden tab navigation.

---

## Wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ IMAGE GENERATION AGENT                                       │
│ Name · Type · Status · Last Execution                         │
├─────────────────────────────┬────────────────────────────────┤
│ GOAL                        │ CONNECTED INPUTS                │
│ Create architectural images │ Prompt Note                     │
│                             │ Reference Images                │
├─────────────────────────────┼────────────────────────────────┤
│ INSTRUCTIONS                │ RULES                           │
│ Editable text               │ Explicit constraints            │
├─────────────────────────────┼────────────────────────────────┤
│ SKILLS                      │ TOOLS                           │
│ Prompt Engineering          │ Artifact Reader                 │
│ Reference Selection         │ Artifact Writer                 │
│ Image Critique              │ Image Transformer               │
├─────────────────────────────┼────────────────────────────────┤
│ MODEL PREFERENCES           │ TRANSFORMER SETTINGS            │
│ Provider selector           │ Aspect ratio, count, quality    │
├─────────────────────────────┼────────────────────────────────┤
│ MEMORY SOURCES              │ RECENT EXECUTIONS               │
│ Saved prompts               │ Execution #007                  │
│ Previous outputs            │ Execution #006                  │
├─────────────────────────────┴────────────────────────────────┤
│ OUTPUTS                                                       │
│ Generated Image v01 · v02 · v03                                │
└──────────────────────────────────────────────────────────────┘
```

---

# Canvas Behaviour

Agent Artifact appears as a node.

Transformer appears as a different node type.

Artifacts appear as existing artifact nodes.

Suggested visual distinction:

- Artifact: rectangle
- Agent Artifact: circle
- Transformer: hexagon
- Execution: hidden by default, expandable in provenance view

---

# Relationships

Required relationship types:

- prompt_input_to
- reference_input_to
- input_to
- output_of
- generated_from
- created_by_agent
- created_by_transformer
- version_of
- references
- uses_tool
- has_skill
- has_rule
- has_instruction

---

# Example Graph

```text
Note Artifact
"Townhouse facade prompt"
        │
        ├── prompt_input_to
        ↓

Architectural Facade Image Agent
        │
        ├── uses_tool
        ↓

Image Transformer
        │
        ↓

Execution #007
        │
        ├── output_of
        ↓

Image Artifact v01
Image Artifact v02
Image Artifact v03
```

---

# Database Tables

Required tables:

- artifacts
- agent_types
- agent_artifacts
- transformers
- executions
- relationships
- skills
- rules
- tools

---

# API Requirements

## Agent Type CRUD

```text
GET    /api/agent-types
POST   /api/agent-types
GET    /api/agent-types/:id
PATCH  /api/agent-types/:id
DELETE /api/agent-types/:id
```

---

## Agent Artifact CRUD

```text
GET    /api/agents
POST   /api/agents
GET    /api/agents/:id
PATCH  /api/agents/:id
DELETE /api/agents/:id
POST   /api/agents/:id/duplicate
```

---

## Execute Agent

```text
POST /api/agents/:id/execute
```

Request:

```json
{
  "promptNoteArtifactId": "artifact_note_123",
  "referenceArtifactIds": [
    "artifact_image_456"
  ],
  "settings": {
    "provider": "openai",
    "aspectRatio": "16:9",
    "quality": "standard",
    "imageCount": 3,
    "outputFormat": "png"
  }
}
```

Response:

```json
{
  "executionId": "exec_0007",
  "status": "pending"
}
```

---

# Real-Time Events

Use WebSockets for execution updates.

Events:

- execution.started
- execution.progress
- execution.completed
- execution.failed
- artifact.created
- artifact.versioned

---

# Acceptance Criteria

A user can:

1. Create an Agent Artifact from the Image Generation Agent Type
2. Edit the Agent Artifact in a fullscreen one-screen control room
3. Connect an existing Note Artifact as prompt input
4. Connect existing Image/File Artifacts as reference inputs
5. Select model provider
6. Run the agent
7. Agent calls the Image Transformer
8. Generated images are saved to the project folder
9. Generated images appear as new Image Artifacts
10. Execution history is visible
11. Provenance is traceable from output image back to Execution, Agent Artifact, Agent Type, Transformer, Note Artifact and references
12. User can CRUD Agent Types
13. User can CRUD Agent Artifacts

---

# Non-Goals For v5

Do not implement:

- multiple agent types beyond Image Generation Agent Type
- web search
- autonomous research
- scheduling
- agent-to-agent communication
- vector memory
- external database tools
- complex multi-step planning

The goal is to prove the architecture with one useful agent.

---

# Related: Single-Agent Chat (Gemma / ChatGPT)

Canvas has a **separate** conversational agent path from v5 Agent Artifacts above. It uses connector-based chat (`POST /api/agent/chat`), not `POST /api/agents/:id/execute`.

| System | Entry | Purpose |
|--------|-------|---------|
| **Agent Artifact (v5)** | `POST /api/agents/:id/execute` | Image generation via Image Transformer |
| **Single-agent chat** | `POST /api/agent/chat` | Conversational ChatGPT or local Gemma |

## Connector capabilities

Each chat connector exposes explicit capability flags on `GET /api/agent/connectors`:

```ts
interface ConnectorCapabilities {
  canReadImages: boolean;
  canReadText: boolean;
  canUseTools: boolean;
}
```

| Connector | canReadImages | canReadText | canUseTools |
|-----------|---------------|-------------|-------------|
| `openai` (ChatGPT) | true | true | true |
| `ollama-gemma-12b` | true | true | false |
| `ollama-gemma-26b` | true | true | false |

## Multimodal image context (Gemma / Ollama)

When image cards are added to agent context, the client builds OpenAI-style `image_url` parts in `apiContent`. The Ollama adapter (`server/services/ollamaChat.js`) converts these to Ollama's chat format:

```json
{
  "role": "user",
  "content": "Describe the attached image.",
  "images": ["<base64 without data: prefix>"]
}
```

**Image load sources** (client `loadContextDocumentForCard`):

- Preview cache (`previewCacheKey`)
- Inline `pinned.dataUrl` (generated image cards)
- Artifact `payload_text` when `data:image/...` (Postgres-backed generated images)
- Linked project folder file

**Guardrails:**

- If images are in context but `canReadImages` is false, the Agent panel shows a warning and send is blocked — images are not silently dropped to text-only.
- Context size limits (`maxImageBytes`, `maxImagesPerAdd`) still apply.

**Diagnostic test** (no live Ollama required):

```bash
cd canvas
npm run test -- server/services/__tests__/ollamaChat.test.js
```

The test `diagnostic: sends stripped base64 images in the Ollama request body` asserts the Ollama `POST /api/chat` body includes `images[]` with stripped base64.

## Implementation status (v5 vertical slice)

| Area | Status |
|------|--------|
| Agent Type CRUD (`agent_type`) | Shipped — builtin Image Generation type seeded in `0016_agent_system.sql` |
| Agent Artifact CRUD | Shipped — `agent_artifact` + canvas `type: 'agent'` cards |
| Execute + Image Transformer | Shipped — `POST /api/agents/:id/execute`, OpenAI + local placeholder |
| Generated Image Artifacts | Shipped — `payload_text` data URLs + project folder paths |
| Reference inputs | Shipped — `reference_input_to` edges, Control Room checkboxes |
| Execution history | Shipped — `execution` table + Control Room recent runs |
| Real-time WebSockets | **Not shipped** — polling / refresh only (non-goal deferral) |
| Agent Type user CRUD UI | **Partial** — read catalog; create/update/delete API exists, minimal UI |
