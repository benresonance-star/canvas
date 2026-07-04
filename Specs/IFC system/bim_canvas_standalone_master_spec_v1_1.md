# BIM Canvas + Standalone Master Spec
## Unified OpenBIM Viewer, Agent, Query, Connector, and 3D Artifact Platform
**Version:** v1.1 master merge  
**Date:** 2026-07-04  
**Status:** Master implementation spec for Codex / engineering  
**Primary scope:** Shared BIM core powering both **Canvas BIM** and **Standalone Desktop BIM**  
**Audience:** product, architecture, frontend, BIM platform, agent, connector, and infra engineers

---

# 0. Purpose of this document

This document merges the previously separate BIM-related specs into a single **master implementation spec** and arranges them into a staged roadmap. It is intended to replace the need to juggle multiple partially overlapping documents when building the first working system.

It consolidates and reconciles the following strands into one coherent platform:

1. **Core BIM viewer + agent architecture**
2. **OpenBIM / IFC conformance direction**
3. **BIM query language and deterministic query execution**
4. **Viewer interaction and persistent state model**
5. **Automatic IFC → local BIM database projection on first open**
6. **Semantic assemblies for custom authored components**
7. **Archicad semantic metadata and connector rules**
8. **Shared-core deployment model for both Canvas and standalone desktop**
9. **Relationship to the broader 3D artifact viewer in Canvas**
10. **Staged implementation path rather than one giant first release**

This spec is deliberately **shared-core first**. The goal is:

> **Code once in the BIM core, shell twice**  
> - once inside **Canvas** as a BIM feature / artifact  
> - once inside a **standalone desktop BIM application**

---

# 1. Integrated source specs and how they map into this master

This master spec absorbs and supersedes the following documents as separate implementation references:

| Previous spec | Incorporated into this master as |
|---|---|
| `webifc_bim_agent_base_spec.md` | core BIM viewer architecture, importer, model index concepts, agent panel |
| `webifc_bim_agent_base_spec_v4_openbim.md` | openBIM direction, evidence model, IFC-first grounding |
| `webifc_bim_agent_base_spec_v5_openbim_conformance.md` | shared-core / dual-host deployment, conformance structure, automatic projection additions |
| `bim_viewer_interaction_state_spec.md` | viewer↔table sync, display modes, serialized state, workspace interaction contract |
| `bim_query_language_spec.md` | BQL language contract, agent → BQL translation, deterministic execution |
| `3d_viewer_canvas_artifact_spec.md` | relationship of BIM viewer to general Canvas 3D artifact system and future convergence points |

This master should become the **single working implementation spec** for the BIM system unless and until it is later split again into engineering-facing sub-specs.

---

# 2. Product intent and platform boundaries

## 2.1 Product intent

The system is a **BIM-capable, agent-augmented, evidence-traceable 3D model environment** that can:

- open IFC models
- inspect geometry and BIM properties
- answer model questions through a BIM agent
- run deterministic BIM queries against a structured model index
- highlight and isolate results in the viewer
- preserve provenance back to IFC evidence
- recognise custom authored semantic components such as windows assembled from multiple physical elements
- work both:
  - **inside Canvas**
  - **as a standalone desktop BIM app**

## 2.2 What this system is not trying to be in v1

The first implementation is **not** trying to become:

- a full authoring BIM platform
- a full CDE / document management platform
- a universal CAD kernel
- a cloud-only enterprise BIM data lake
- a fabrication ERP system
- a generic “AI talks to files” toy demo without BIM evidence

It is a **serious BIM evidence + query + semantic assembly + agent viewing environment**.

## 2.3 Relationship to the broader Canvas 3D artifact system

Canvas has a broader 3D artifact direction where the first general-purpose 3D artifact is intentionally **not overfit to BIM** and supports broad 3D formats such as GLB/GLTF. This BIM platform is a **specialised branch of that broader 3D capability**.

Relationship:

- **Canvas 3D Artifact Viewer**
  - broad 3D object/media artifact support
  - GLB-first
  - general annotations / relationships / preview / metadata

- **Canvas BIM Viewer**
  - BIM-specialised mode built on the shared BIM core
  - IFC semantics, query engine, semantic assemblies, BIM evidence, agent workflows

The BIM viewer should feel native to Canvas, but it is a **specialised artifact class**, not merely a generic mesh viewer.

---

# 3. Guiding principles

## 3.1 IFC remains canonical evidence
The IFC file remains the canonical source of truth for geometry, IFC classes, GlobalIds, property sets, quantities, and spatial structure.

## 3.2 The viewer is the evidence layer
Any claim made by the agent should be traceable to visible model evidence:
- IFC element identity
- class/type
- property path
- quantity
- spatial location
- highlighted geometry
- connector-derived metadata
- semantic assembly provenance

## 3.3 Use a derived BIM database as the working model
The app should not repeatedly parse raw IFC for every interaction. Instead it should build a **lossless, provenance-linked local BIM model index** used by the query engine, viewer, table, and agent.

## 3.4 Preserve physical truth while allowing logical semantic meaning
If a “window” is authored from walls/beams/slabs, the physical members keep their true IFC classes. The system may additionally create a logical semantic assembly such as `WindowAssembly`.

## 3.5 Shared core, dual host
The same BIM core should power:
- **Canvas BIM**
- **Standalone desktop BIM**

## 3.6 Standalone must remain truly standalone
The standalone app must not require:
- a cloud backend
- a user-managed database server
- Docker
- a separately installed model database

## 3.7 Deterministic BIM execution under the agent
The agent may interpret user intent, but execution of BIM queries should happen through deterministic query planning and execution against the BIM index.

---

# 4. High-level architecture

## 4.1 System overview

```text
Authoring tools / exports
  - Archicad
  - Revit
  - other IFC-capable tools
          ↓
IFC file + connector-exported metadata
          ↓
Shared BIM Core
  - IFC parser
  - projection pipeline
  - local BIM database
  - semantic assembly builder
  - BQL executor
  - provenance engine
          ↓
Host shell
  - Canvas BIM feature
  - Standalone desktop BIM app
          ↓
User surfaces
  - 3D viewer
  - result table
  - BIM agent panel
  - filters / saved views / exports
```

## 4.2 Shared package split

The recommended package split is:

### `bim-core`
Owns:
- IFC import and parsing
- derived BIM database schema
- projection/indexing pipeline
- semantic assembly logic
- BQL schema + execution engine
- provenance model
- model cache / fingerprinting
- connector rule interfaces
- model services used by both hosts

### `bim-viewer-ui`
Owns:
- viewer workspace UI components
- table UI
- inspector panels
- display mode controls
- selection sync UI
- agent panel shell components

### `canvas-bim-adapter`
Owns:
- Canvas artifact integration
- Canvas project/session wiring
- Canvas artifact lifecycle hooks
- Canvas state persistence hooks
- Canvas-specific permissions / embedding / layout

### `desktop-bim-app`
Owns:
- standalone app shell
- local file open/save flows
- local cache folder management
- desktop packaging/runtime concerns
- optional desktop preferences and diagnostics UI

---

# 5. Staged implementation roadmap

This master spec is intentionally staged. Not every capability is required on day one.

## Stage 0 — foundations and decisions
Purpose:
- lock architecture
- lock data contracts
- choose stack
- avoid rework

Deliverables:
- this master spec approved
- package split agreed
- IFC + local index lifecycle agreed
- BQL shape agreed
- semantic assembly model agreed
- Archicad metadata contract agreed

## Stage 1 — standalone IFC evidence viewer MVP
Goal:
- open IFC
- render model
- inspect properties
- automatic local indexing on first open
- raw element table
- viewer↔table selection sync
- save/load workspace state

Scope:
- standalone shell first
- no full agent orchestration required yet
- basic search/filter and inspector
- BQL optional in constrained form
- no heavy connector inference yet

Key outputs:
- `desktop-bim-app` working
- local embedded BIM index
- geometry + property viewer
- base state serialization
- first importer pipeline

## Stage 2 — BIM query engine + agent side panel
Goal:
- natural language questions become BQL
- deterministic execution against BIM index
- results highlight in viewer and table
- evidence trace shown

Scope:
- BIM agent side panel
- BQL schema and executor
- structured result model
- explanation/provenance surfacing
- display modes: isolate, ghost, color-by, overlay

Key outputs:
- BQL parser/validator/executor
- agent → BQL translation layer
- query result object model
- saved queries and reruns

## Stage 3 — semantic assemblies + Archicad custom component preservation
Goal:
- preserve logical components such as windows assembled from walls/beams/slabs
- query both true IFC elements and semantic assemblies

Scope:
- semantic assembly model
- Archicad semantic metadata ingestion
- assembly-aware queries and UI
- assembly/member inspector behaviour

Key outputs:
- `WindowAssembly`, `DoorAssembly`, etc.
- Archicad metadata contract implemented
- “show all windows” returns both `IfcWindow` and semantic windows

## Stage 4 — Canvas BIM integration
Goal:
- same BIM core runs inside Canvas as a BIM artifact / feature

Scope:
- Canvas adapter
- Canvas workspace embedding
- project/session persistence
- Canvas artifact opening and side-panel integration

Key outputs:
- BIM artifact card / open flow
- Canvas BIM workspace
- shared codebase with standalone

## Stage 5 — connector maturation and richer model semantics
Goal:
- extend beyond Archicad
- improve quality of metadata, mappings, and assembly inference

Scope:
- Revit connector path
- classification mapping
- type mapping
- optional inference rules
- better quantity/type/system handling

## Stage 6 — advanced agent workflows, exports, and analysis
Goal:
- move from “viewer with queries” to “BIM reasoning workspace”

Potential scope:
- BCF export
- change sets
- issue cards
- compare revisions
- compliance-oriented queries
- saved semantic views
- agent-authored reports grounded in viewer evidence

---

# 6. Technology direction

## 6.1 Viewer/rendering stack

### Primary decision
Use **That Open / Fragments** as the primary BIM viewer/runtime stack for both:

- **Canvas BIM**
- **Standalone Desktop BIM**

Use:

- **web-ifc** for IFC parsing, IFC evidence access, property extraction, and relationship extraction
- **That Open / Fragments** as the optimized BIM runtime/viewing format and viewer integration layer
- **Three.js** underneath for rendering and broader web/Canvas compatibility

### Rationale
This platform must handle very large IFC files and potentially millions of triangles. Therefore the viewer architecture shall be **conversion-first**, not direct-IFC-load-first.

The first-open preparation pipeline shall create:

1. a **Fragments-based optimized geometry/runtime model** for viewport performance
2. a **derived local BIM database** for query, agent reasoning, semantic assemblies, and provenance

The runtime shall load the optimized Fragments model rather than reparsing heavy IFC geometry on every open.

### Architectural rule
That Open / Fragments shall be treated as the **primary viewer/runtime infrastructure**, but it shall not own the BIM semantic model. The shared BIM core remains responsible for:

- IFC evidence preservation
- model projection
- local BIM database
- semantic assemblies
- BQL execution
- provenance / evidence bundles
- agent-query grounding

### Deferred fallback
**xeokit / XKT** may be retained as a deferred fallback option only if Fragments fails large-model benchmarks or a later enterprise viewer mode requires it. xeokit shall not be the default implementation path in Stage 1–4.

## 6.2 Local database direction

### Baseline standalone database
For the standalone app, prefer an **embedded local database**:
- SQLite
- DuckDB
- or equivalent embedded store

### Optional future heavier deployment
For future server/team deployments, a heavier backend such as PostgreSQL + PostGIS + pgvector may be introduced, but **must not be required** for the standalone baseline.

## 6.3 Local agent / model assumptions
The BIM core should not hardcode a specific LLM. It should expose deterministic BIM tools that can be called by:
- local Ollama models
- cloud models
- Canvas-side orchestrators
- future domain agents

---

# 7. Model ingestion and automatic first-open projection

## 7.1 Purpose

When a user opens an IFC model, the application shall automatically create or update a **derived local BIM model index** used by the viewer, query engine, and agent layer.

This is required because raw IFC is not a sufficient working model for interactive BIM queries such as:

- show all windows on Level 02
- select all fire doors with width under 920 mm
- find all custom windows assembled from beams/slabs/walls
- explain why this element is classified as a window
- highlight all spaces adjacent to this wall

## 7.2 First-open indexing flow

```text
User opens IFC
→ compute model fingerprint
→ check for compatible existing local BIM index
→ if no valid index exists:
    parse IFC
    convert geometry/runtime payload to That Open Fragments
    extract elements, types, properties, quantities, materials, containment, relationships
    apply connector mappings and semantic assembly rules
    build derived BIM database
    build search / property / spatial / semantic indexes
→ open viewer using Fragments + indexed BIM model
```

## 7.3 Automatic behaviour
The user should not need to manually run a separate “import to database” step. Indexing is automatic on first open.

## 7.4 Background indexing and non-blocking UX
The viewer may render geometry before the full semantic index is complete, provided the UI exposes model preparation status and disables unavailable features clearly.

Recommended status phases:
- Preparing model…
- Parsing IFC…
- Extracting properties and relationships…
- Building semantic assemblies…
- Building search indexes…
- Ready for BIM queries

---

# 8. Model fingerprinting and cache reuse

## 8.1 Purpose
The app should avoid reparsing and reindexing unchanged models.

## 8.2 Fingerprint rule
A local BIM index is valid only if its fingerprint matches the currently opened source model and relevant pipeline versions.

Example conceptual fingerprint:

```ts
modelFingerprint = hash(
  fileBytes +
  ifcSchemaVersion +
  connectorVersion +
  projectionSchemaVersion +
  semanticAssemblyRuleVersion
)
```

## 8.3 Reuse rule
If the fingerprint matches, reuse the local BIM index.

## 8.4 Rebuild rule
If the fingerprint differs, rebuild the local BIM index.

---

# 9. Derived BIM database

## 9.1 Purpose
The derived BIM database is the application’s local working model. It should support:

- fast structured queries
- property/quantity filtering
- table/viewer synchronization
- semantic assembly resolution
- agent evidence retrieval
- local persistence of derived model state

## 9.2 Standalone requirement
In standalone mode, the app shall create and manage the BIM index locally and automatically. The user shall not be required to install or administer a separate database server.

## 9.3 Minimum projected data

The projection must preserve at least:

### Physical BIM records
- elements
- IFC classes
- IFC GlobalIds
- types where available
- storeys
- spaces
- systems where available

### Properties and quantities
- property sets
- properties
- quantities
- units where relevant
- type-level properties where distinguishable
- connector-derived properties

### Relationships
- spatial containment
- decomposition / aggregation
- type assignment
- opening / void / fill relationships
- material assignments where available
- system relationships where available
- semantic assembly membership

### Provenance / revision metadata
- source file id
- source file hash
- connector source
- import timestamp
- projection schema version
- connector rule id where applicable

## 9.4 Suggested conceptual schema slices

The actual physical database schema may vary, but conceptually the BIM index should contain slices equivalent to:

- `models`
- `elements`
- `element_types`
- `properties`
- `property_sets`
- `quantities`
- `spatial_nodes`
- `relationships`
- `semantic_assemblies`
- `assembly_members`
- `provenance_records`
- `saved_views` (later)
- `query_runs` (later)

---

# 10. Provenance model

## 10.1 Requirement
Every projected record must be explainable and traceable back to source IFC and/or connector evidence.

Conceptually:

```ts
interface ProjectionProvenance {
  sourceFileId: string
  sourceRevisionId?: string
  ifcGlobalId?: string
  ifcClass?: string
  nativeAuthoringId?: string
  nativeAuthoringSystem?: "Archicad" | "Revit" | "IFC" | string
  connectorRuleId?: string
  projectionTimestamp: string
}
```

## 10.2 Questions provenance must answer
The system should be able to answer:
- Why is this element treated as a window?
- Which IFC members belong to this custom window?
- Was this classification explicit or inferred?
- Which connector rule created this semantic assembly?
- Which source file and revision did this result come from?

---

# 11. BIM data model layers

The system should explicitly distinguish four layers:

## 11.1 Physical IFC layer
Raw physical BIM objects as exported:
- `IfcWall`
- `IfcBeam`
- `IfcSlab`
- `IfcWindow`
- `IfcDoor`
- etc.

## 11.2 Projected BIM index layer
A structured local representation of IFC + connector-derived metadata.

## 11.3 Semantic assembly layer
Logical BIM components that may span multiple physical IFC elements:
- `WindowAssembly`
- `DoorAssembly`
- `FacadeModule`
- `CustomAssembly`

## 11.4 Query/result layer
Transient query results, selections, highlights, saved filters, and agent evidence bundles.

---

# 12. Semantic assemblies

## 12.1 Purpose
The platform shall support **logical BIM components** composed of one or more physical IFC elements.

This is necessary for custom-authored components that do not survive export as a single IFC object but still need to behave as meaningful BIM objects in the viewer and query layer.

## 12.2 Physical vs logical identity

### Physical identity
The true IFC class of each modeled object remains intact.

### Logical identity
The system may additionally create a semantic assembly such as `WindowAssembly`.

### Rule
The app shall preserve the physical IFC class of each member and shall **not** falsely coerce a custom assembly into a different IFC class.

## 12.3 Conceptual semantic assembly model

```ts
interface SemanticAssembly {
  id: string
  kind: string
  sourceSystem: "Archicad" | "Revit" | "IFC" | "Manual" | string
  sourceRule?: string
  label?: string
  memberElementIds: string[]
  confidence?: "explicit" | "inferred"
  properties?: Record<string, unknown>
}
```

## 12.4 Rule precedence
1. **Explicit connector-exported metadata** takes precedence
2. Deterministic classification rules come second
3. Heuristic / geometric inference is a later fallback, not the baseline

---

# 13. Archicad semantic component preservation

## 13.1 Problem being solved
A meaningful BIM component such as a **window** may be modeled in Archicad using a combination of:
- wall returns
- slab sill
- beam head
- glazing object
- other native modeled elements

If exported naively, the viewer would only see walls, beams, slabs, etc. The higher-order meaning “this is a window” would be lost.

## 13.2 Preferred mechanism
Use explicit semantic metadata authored in Archicad and exported into IFC-accessible data, rather than viewer-side guessing.

## 13.3 Minimum Archicad semantic metadata contract

| Field | Example | Purpose |
|---|---|---|
| `Canvas.ComponentType` | `Window` | Logical component type |
| `Canvas.AssemblyId` | `WIN-023` | Groups multiple physical members into one logical component |
| `Canvas.MemberRole` | `Head`, `Sill`, `Jamb`, `Glazing`, `Host` | Optional semantic role of each member |
| `Canvas.ComponentName` | `Kitchen North Window` | Human-readable label |

Optional fields may later include:
- `Canvas.ComponentVariant`
- `Canvas.IsPrimaryComponent`
- `Canvas.HostLevel`
- `Canvas.SourceDefinition`
- `Canvas.ComponentSubtype`

## 13.4 Archicad projection rule
When the projection pipeline encounters Archicad-exported metadata where multiple elements share:
- the same `Canvas.ComponentType`
- the same `Canvas.AssemblyId`

it shall create a semantic assembly in the derived BIM model.

Example:
- `Canvas.ComponentType = Window`
- `Canvas.AssemblyId = WIN-023`

→ create a logical `WindowAssembly / WIN-023`  
→ attach all matching physical members  
→ preserve each member’s true IFC class and provenance

## 13.5 Example
A custom window authored from:
- 2 wall returns
- 1 slab sill
- 1 beam head
- 1 glazing object

may project as:

| Physical member | IFC class | Assembly |
|---|---|---|
| wall return A | `IfcWall` | `WIN-023` |
| wall return B | `IfcWall` | `WIN-023` |
| slab sill | `IfcSlab` | `WIN-023` |
| beam head | `IfcBeam` | `WIN-023` |
| glazing object | `IfcPlate` / object | `WIN-023` |

with a semantic assembly:
- `WindowAssembly`
- `id = WIN-023`

---

# 14. Connector architecture

## 14.1 Core rule
Connector-specific logic should live in connectors, not in the BIM core.

The BIM core should understand:
- canonical projected records
- semantic assembly records
- provenance
- BQL and result handling

It should not hardcode Archicad-only assumptions throughout the core.

## 14.2 Connector responsibilities
A connector may be responsible for:
- mapping authoring-system metadata into canonical fields
- surfacing classification/type information
- generating connector-specific provenance
- identifying semantic assembly metadata
- optionally performing deterministic mapping transforms before projection

## 14.3 Phase order
### Phase 1
Archicad semantic metadata support

### Phase 2
Revit connector parity

### Phase 3
Optional additional connector families and shared mapping DSL

---

# 15. BIM Query Language (BQL)

## 15.1 Purpose
BQL is the structured intermediate language between user intent and deterministic BIM execution.

The user may ask in natural language:

- “show all windows on Level 02”
- “find all doors wider than 920”
- “highlight all spaces adjacent to this stair”
- “show all custom windows with sill height under 600”

The agent should translate that into BQL, and the deterministic BIM engine should execute the BQL against the projected BIM model.

## 15.2 Why BQL exists
BQL separates:
- natural language interpretation
from
- deterministic BIM execution

This makes the system:
- safer
- more explainable
- easier to test
- more reusable across Canvas and standalone

## 15.3 BQL scope in early stages
Early BQL should support at least:

- element type / class filters
- semantic assembly type filters
- property comparisons
- quantity comparisons
- spatial container filters (storey/space)
- set operations on result sets
- selection targets for viewer highlighting

Later BQL may support:
- adjacency / graph traversal
- path queries
- issue generation
- revision comparison
- export actions

## 15.4 Conceptual BQL examples

```json
{
  "select": "elements",
  "where": {
    "semanticType": "WindowAssembly",
    "storey": "Level 02"
  }
}
```

```json
{
  "select": "elements",
  "where": {
    "ifcClass": "IfcDoor",
    "properties": [
      { "path": "Pset_DoorCommon.FireRating", "op": "=", "value": "FRL-60" }
    ]
  }
}
```

---

# 16. BQL execution engine

## 16.1 Core rule
The BIM engine, not the LLM, executes BIM queries.

## 16.2 Execution flow

```text
User asks question
→ agent interprets intent
→ agent produces BQL
→ BQL validated
→ deterministic BIM executor runs against BIM index
→ result set returned
→ viewer/table state generated
→ evidence + provenance attached
```

## 16.3 Result contract
A BIM query result should be able to return:

- result element ids / assembly ids
- counts / aggregations where relevant
- viewer selection/highlight instructions
- optional table row payloads
- evidence / provenance bundle
- explanation summary for UI display

---

# 17. Agent architecture

## 17.1 Agent role
The BIM agent is a **query and reasoning layer over the evidence-backed BIM model**, not a replacement for the BIM engine.

## 17.2 Agent responsibilities
The agent may:
- translate user intent into BQL
- ask follow-up questions if necessary
- explain results in natural language
- summarize evidence
- help the user navigate the model
- suggest related filters or follow-up queries

## 17.3 Agent must not do
The agent must not silently invent BIM facts that are not grounded in:
- IFC evidence
- connector metadata
- deterministic BIM query results

## 17.4 Side panel model
The default BIM workspace includes:
- viewer
- result table
- BIM agent side panel

---

# 18. Viewer interaction and workspace state

## 18.1 Default workspace
The default workspace consists of:

- **3D BIM viewer**
- **result table / selection table**
- **BIM agent side panel**
- **inspector / properties panel**
- optional filters / saved views controls

## 18.2 Bidirectional selection is mandatory
Selection must be synchronized:

- selecting an element in the viewer selects the corresponding row in the table
- selecting a row in the table highlights/selects the element in the viewer

This applies to:
- physical IFC elements
- semantic assemblies
- query result sets

## 18.3 Display modes
The workspace should support at least:
- highlight result set
- ghost non-results
- isolate result set
- color by attribute
- problem / issue overlay (later)

## 18.4 Persistent state
Workspace state should be serializable, including at minimum:
- camera state
- section / clipping state
- selected elements / assemblies
- active display mode
- visible result set
- active filters
- active saved query reference if any

---

# 19. Table model and inspector behaviour

## 19.1 Table modes
The result table should support multiple modes over time:

### Raw element mode
One row per physical IFC element.

### Semantic assembly mode
One row per logical assembly such as `WindowAssembly`, expandable to member elements.

### Query result mode
Rows representing the current result set from a BQL query.

## 19.2 Inspector behaviour
If a physical member of a semantic assembly is selected, the inspector should be able to show:

- physical element identity
- IFC class
- properties / quantities
- semantic assembly membership
- member role within assembly if known
- provenance / connector rule evidence

---

# 20. Canvas BIM host requirements

## 20.1 Canvas role
Canvas is a host shell for the BIM core, not a separate BIM engine.

## 20.2 Canvas BIM artifact behaviour
A BIM model in Canvas should behave as a Canvas artifact / feature with:
- open in Canvas BIM workspace
- side-panel agent integration
- project/session state persistence
- relationship to other Canvas artifacts

## 20.3 Shared-core rule
Canvas must consume the same:
- BIM index schema
- semantic assembly model
- BQL executor
- provenance model
- query result contracts

as the standalone app.

---

# 21. Standalone desktop app requirements

## 21.1 Core promise
The standalone app should work offline with local files and a local BIM index.

## 21.2 Minimum standalone behaviours
- open IFC from local file system
- automatically build/reuse local BIM index
- render geometry
- inspect BIM properties
- run BIM queries
- persist local workspace state
- operate without a cloud dependency

## 21.3 Local storage responsibilities
The desktop app owns:
- model cache folder strategy
- local BIM index storage location
- file associations / open flows
- cache cleanup / diagnostics UI if added later

---

# 22. Relationship to the broader 3D artifact viewer

## 22.1 General rule
The BIM viewer should not block the broader Canvas 3D artifact strategy.

## 22.2 Shared possibilities
Potential shared layers between generic 3D and BIM over time:
- camera controls
- annotation primitives
- screenshot/export helpers
- artifact shell UI
- generic 3D preview cards
- common relationship / artifact metadata patterns

## 22.3 Important distinction
A BIM viewer is not just a GLB viewer with a chat box. It has:
- IFC semantics
- BIM query engine
- evidence/provenance requirements
- semantic assemblies
- connector-aware projection logic

---

# 23. Suggested initial physical package and service structure

This is one reasonable initial repo/package layout:

```text
/apps
  /desktop-bim-app
  /canvas-bim-adapter

/packages
  /bim-core
    /ifc
    /projection
    /db
    /semantic-assemblies
    /bql
    /provenance
    /connectors
      /archicad
      /revit (later)
  /bim-viewer-ui
  /shared-ui
```

Within `bim-core`, a useful internal module split is:

```text
bim-core/
  ifc/
    parseIfc.ts
    extractElements.ts
    extractRelationships.ts

  projection/
    buildModelIndex.ts
    computeFingerprint.ts
    applyConnectorMappings.ts
    applySemanticAssemblyRules.ts

  db/
    schema/
    repositories/
    migrations/

  semantic-assemblies/
    semanticAssemblyTypes.ts
    buildSemanticAssemblies.ts

  bql/
    schema.ts
    validateBql.ts
    executeBql.ts

  provenance/
    provenanceTypes.ts
    buildEvidenceBundle.ts

  connectors/
    archicad/
      mapArchicadSemanticMetadata.ts
```

---

# 24. Acceptance criteria by stage

## Stage 1 acceptance criteria
- opening an IFC automatically triggers Fragments conversion and local indexing if no valid cached artifacts exist
- reopening the same unchanged IFC reuses the existing local BIM index
- Fragments geometry can be viewed and selected
- raw IFC properties can be inspected
- viewer↔table selection sync works
- workspace state can be saved/restored locally

## Stage 2 acceptance criteria
- a user can ask a BIM question in the side panel
- the system translates it into structured BQL
- deterministic execution runs against the BIM index
- results highlight in the viewer and appear in the table
- evidence/provenance for the result is available

## Stage 3 acceptance criteria
- a custom Archicad window authored from multiple physical elements can still be queried and displayed as a logical window component
- “show all windows” can return both true `IfcWindow` elements and semantic `WindowAssembly` objects
- physical IFC classes of member elements remain intact

## Stage 4 acceptance criteria
- the same BIM core can be run inside Canvas as a BIM artifact/feature
- Canvas and standalone use the same BQL contracts and semantic assembly logic

---

# 25. Non-goals and deferred items

The following are explicitly deferred unless later promoted into a stage:

- full BIM authoring / editing
- arbitrary IFC write-back
- full CDE / document workflows
- full construction sequencing platform
- fabrication ERP and costing engine
- sophisticated graph analytics backend before the embedded baseline works
- broad heuristic inference of semantic assemblies before explicit metadata path is working

---

# 26. Recommended immediate next engineering move

The next practical move after approving this master spec should be to produce **three implementation-facing follow-on specs** derived from it:

## 26.1 Stage 1 implementation spec
A concrete build spec for:
- standalone shell
- IFC open flow
- embedded database schema
- importer/indexer pipeline
- viewer/table/inspector UI
- local state persistence

## 26.2 BQL + agent execution spec
A concrete spec for:
- BQL JSON schema
- query planner / executor
- result payload shape
- agent → BQL translation contract
- evidence bundle format

## 26.3 Archicad semantic connector spec
A concrete spec for:
- Archicad property/classification conventions
- export expectations
- canonical mapping rules
- semantic assembly creation rules
- test IFC fixtures for custom windows/doors/etc.

---

# 27. Final implementation stance

This platform should be treated as:

> **a BIM evidence and reasoning environment built on IFC, a derived local BIM model index, deterministic BIM queries, semantic assemblies, and a shared core that powers both Canvas and a standalone desktop app.**

The implementation should stay disciplined about five things:

1. **IFC remains evidence**
2. **the local BIM database is the working model**
3. **semantic meaning can sit above physical IFC classes**
4. **the agent reasons over deterministic BIM results**
5. **the same core should run in Canvas and standalone**


---

# 28. Viewer Decision Record: That Open / Fragments

## 28.1 Decision
That Open / Fragments is the primary viewer/runtime stack for both Canvas BIM and the standalone desktop BIM app.

## 28.2 Why
The platform requires:

- large IFC handling
- conversion-first performance
- Canvas/web alignment
- standalone packaging compatibility
- permissive commercial/product flexibility
- a single viewer strategy across both hosts

Fragments satisfies these needs better than a split viewer strategy at this stage.

## 28.3 Runtime split
The first-open pipeline shall produce two derived artifacts:

1. **Fragments runtime model** for viewport performance
2. **Local BIM database** for query, semantic assemblies, BQL, agent use, and provenance

Both artifacts shall preserve stable mapping back to IFC GlobalIds and source evidence.

## 28.4 Fallback
xeokit / XKT remains a deferred benchmark fallback only. It shall not be introduced unless Fragments fails defined large-model performance thresholds.

---

# 29. Implementation status (2026-07-04, updated)

The first vertical slice ships **inside Canvas** as `canvas/src/features/bim/`, ahead of the standalone desktop shell. Delivery order is intentionally **Canvas-first** (Stage 4 capabilities) while reusing the shared-core module layout described in §23.

## 29.1 Stage progress

| Stage | Status | Notes |
|---|---|---|
| Stage 0 — foundations | **Done** | Stack locked: web-ifc + That Open Fragments + Three.js; pipeline version constants in `versions.js` |
| Stage 1 — IFC evidence viewer MVP | **Mostly done (Canvas host)** | Prep pipeline, cache, viewer, table (incl. storey column), inspector, selection sync, cache rebuild shipped; standalone shell and filesystem cache layout deferred |
| Stage 2 — BQL + agent | **Partial** | BQL validator + executor + manual query panel + query-driven viewer/table shipped; NL agent side panel, saved queries, and `colorBy` application deferred |
| Stage 3 — semantic assemblies | **Partial** | Archicad `Canvas.*` projection, member inspector, and BQL window query (`IfcWindow` + `WindowAssembly`) shipped; assembly table, assembly selection, and assembly inspector deferred |
| Stage 4 — Canvas integration | **Done (MVP)** | `bim-model` artifact type, card preview, modal workspace, ingest/sync hooks |
| Stage 5+ | **Not started** | Revit connector, inference, multi-model, exports |

## 29.2 Shipped code layout

Monolithic feature module (package split deferred):

```text
canvas/src/features/bim/
  bim-core/
    prepareBimModel.js       # first-open orchestration + cache gate
    ifcProjection.js         # web-ifc evidence extraction
    fragmentsConversion.js   # IFC → Fragments blob
    fragmentsSelection.js    # GlobalId ↔ Fragments localId mapping
    bimRepository.js         # IndexedDB prepared-model + workspace store (+ deletePreparedModel)
    fingerprint.js
    versions.js              # bim-projection-v0.3, bim-connectors-v0.1, thatopen-fragments-v0.2
    types.js
    bql.js                   # validateBqlQuery + executeBqlQuery
  components/
    BimWorkspace.jsx
    BimViewport.jsx
    BimElementTable.jsx
    BimInspector.jsx
    BimQueryPanel.jsx        # manual JSON BQL editor + presets
    BimModelSummary.jsx
  hooks/
    useBimModelSource.js
```

Canvas integration: `CardPreview.jsx`, `ModalContent.jsx`, `TypeIcon.jsx`, `filename.js`, `constants.js`, `readFile.js`, `previewHydrate.js`, `artifactType.js`, `syncIngest.js`, `syncStaging.js`.

Dependencies: `web-ifc@0.0.69`, `@thatopen/fragments@3.1.4`, `@thatopen/components@3.1.0`.

## 29.3 Shipped behaviour

- `.ifc` files ingest as `bim-model` cards with static card preview (`BimModelSummary`).
- First modal open runs `prepareBimModel()`: fingerprint check → Fragments conversion → web-ifc projection → IndexedDB cache.
- Reopen of unchanged model reuses cached prepared artifacts when fingerprint matches; user can force rebuild via `BimQueryPanel`.
- Live extraction feed during first-open preparation.
- 3D viewport: orbit/pan/zoom, fit, raycast pick, highlight / isolate / ghost others.
- Bidirectional selection sync between table, viewport, and inspector via `ifcGlobalId`.
- Element table includes storey column; search and IFC class filter.
- Inspector shows grouped Psets/quantities, provenance, and semantic assembly membership for member elements.
- **BQL executor** (`executeBqlQuery`) runs against prepared model index with `physicalElements`, `semanticAssemblies`, and `allBimObjects` scopes.
- **BimQueryPanel** provides JSON BQL editor with presets (all beams, ground floor, windows incl. `WindowAssembly`).
- Query results drive viewer display mode and filter the element table; evidence bundle returned per result.
- Workspace state (camera, selection, filters, display mode, panel toggles) persisted in IndexedDB per fingerprint.
- Graceful degradation: if Fragments conversion fails, evidence table and inspector still work; viewport shows an error banner.

### Folder sync, dock, and artifact ingest (2026-07-04)

**UI:** The bottom **sync holding tray** (`SyncHoldingTray.jsx`) is the **dock** — colored chips for artefacts waiting to be placed. The right sidebar workspace tree is **not** the dock; it lists Postgres cluster primitives.

**Discovery:** Linked-folder scan (`scanFolderFiles`) maps `.ifc` → `bim-model` with no extension blocklist. Nested paths use folder keys (e.g. `IFC/models__clinic-v1.ifc` → key `IFC/models__clinic`). Recommended on-disk naming: `prefix__name-vN.ifc`.

**Dock vs canvas:** Placement is exclusive — an artefact is on the canvas **or** in the dock, not both. New folder files (including IFC) reach the dock only after **Sync → Apply** (or auto-apply on folder connect/reconnect). Agent-chat sidecars auto-stage; BIM models follow the confirm path like other types.

**Ingest fixes (2026-07-04):**

| Issue | Fix |
|---|---|
| Folder-synced `bim_model` artefacts missing from workspace tree / project list | `POST /artifacts/ingest` now passes `project_id`, sets `title`, and calls `upsertArtifactByHash(..., { addToCluster: true })` |
| Re-ingest of existing hash did not backfill `project_id` or cluster membership | `upsertArtifactByHash` updates null `project_id` and joins cluster when `addToCluster: true` |
| Client ingest payload omitted project scope | `syncIngest.js` sends `project_id` + `title` on each file |
| IFC preview IndexedDB write failure could block scan registration | `readFile.js` treats BIM preview cache as optional (scan still registers the file) |
| Dock chip visibility | `stagingColors.js` adds distinct colors for `bim-model` and `3d-model` |

**Related paths:** `folderScan.js`, `readFile.js`, `syncIngest.js`, `syncStaging.js`, `useFolderLinkScan.js`, `server/routes/artifacts.js`, `server/repositories/artifacts.js`.

**Beat Agent create (same release):** `createMusicAgent` artifact insert now sets required `artifact.title` and `project_id` columns (migration `0021_artifact_base_schema.sql` NOT NULL constraint).

## 29.4 Intentional deviations from this master spec

| Master spec target | Current implementation |
|---|---|
| `/apps/desktop-bim-app` standalone shell | Not built; Canvas modal is the first host |
| `/packages/bim-core` + `/packages/bim-viewer-ui` split | Monolithic `features/bim/` module |
| Filesystem cache (`model-cache/<fingerprint>/`) | IndexedDB via `createIndexedDbBimRepository()` |
| Embedded SQL (`bim-index.db`) | In-memory JS objects stored in IndexedDB |
| NL BIM agent side panel | Not built; manual JSON `BimQueryPanel` instead |
| `colorBy` display mode | Validated in BQL but not applied in viewport |
| Workspace state on card `version.bim` | Read on init; persist to IndexedDB only (no write-back to card metadata) |
| IFC schema in fingerprint | Hardcoded `'unknown'` until schema detection lands |
| Element coverage | 18 common IFC classes, not full schema scan |
| Assembly-level viewer selection | BQL can match assemblies; viewport highlights physical members only |

## 29.5 Next engineering moves

1. NL BIM agent side panel wired to validator → executor → viewer/table apply loop.
2. `colorBy` view instruction application in viewport.
3. Assembly-aware table mode and assembly-level selection/inspector.
4. Saved queries and query history.
5. Extract `bim-core` / `bim-viewer-ui` packages when Canvas + standalone both need the code.
6. Standalone `desktop-bim-app` shell reusing the same core.
