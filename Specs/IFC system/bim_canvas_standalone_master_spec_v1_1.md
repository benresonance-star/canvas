# BIM Canvas + Standalone Master Spec
## Unified OpenBIM Viewer, Agent, Query, Connector, and 3D Artifact Platform
**Version:** v1.1 master merge  
**Date:** 2026-07-06  
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
- active filters (`tableSearch`, `ifcClassFilter`, `inspectorSearch`)
- element table layout (`tableColumns`, `tableSort`, `leftPanelWidth`)
- inspector panel width (`rightPanelWidth`)
- active saved query reference if any

## 18.5 View navigator gimbal and axis camera presets (shipped MVP, 2026-07-08)

Canvas BIM ships a **view navigator gimbal** in the viewport top-right (`BimViewNavigatorGimbal.jsx`), wired from `BimViewport.jsx`.

### Presets (v1)
| Preset | Behaviour |
|---|---|
| **Home** | Oblique default fit `(1, 0.65, 1)`; `camera.up = world Y`; free OrbitControls orbit |
| **Top** | Plan view from `+Y`; footprint long-edge alignment via geometry heuristic; `camera.up = world Y` |
| **Bottom** | Ceiling view from `−Y`; same alignment rules as Top |

- Right-click gimbal cube → context menu: Home / Top / Bottom.
- Gimbal label from `resolveViewNavigatorLabel()` (`bimViewNavigator.js`): `HOME VIEW`, `TOP VIEW`, `BOTTOM VIEW`, or `ISO VIEW`.
- **Fit to model** toolbar button removed in v1 (Home preset replaces ad-hoc fit).

### Camera framing implementation
- Shared fit API: `fitCameraToViewPreset()` in `canvas/src/features/threeDArtifact/utils/cameraFit.js`.
- Top/Bottom use `resolveFootprintLongEdge()` — area-weighted XZ footprint samples + minimum-area bounding rectangle (MBR), Fragments-safe — exposed via `resolveFootprintHorizontalAxis()` + `alignAxisPresetAzimuth()` (rotate camera around world Y so the long edge is screen-horizontal).
- Small **pole nudge** (`AXIS_VIEW_POLE_NUDGE_FRACTION`) offsets the camera slightly off the exact orbit pole so OrbitControls can rotate at plan/ceiling views.
- Top/Bottom keyboard walk uses screen-aligned axes (`resolveAxisViewWalkAxes` in `bimCameraKeyboardNav.js`).
- Viewport toolbar is **viewport-centred** with the gimbal **absolutely positioned** top-right; gimbal label uses a **fixed width** so toolbar controls do not shift when the view label changes.
- **HUD stack anchoring (2026-07-09):** `bimViewportLayout.js` measures chrome at runtime and writes CSS variables on the viewport container (`applyBimViewportToolbarLayout`). **Left HUD stack** (layers, section cut, sun study) starts at `--bim-viewport-hud-top` = measured toolbar bottom + 8 px gap. **Right HUD stack** (BQL, agent, 4D, 5D, style settings) starts at `--bim-viewport-right-hud-top` = measured gimbal bottom (wireframe cube + label) + 8 px gap so panels never overlap the gimbal. `BimViewport.jsx` observes toolbar and gimbal via `ResizeObserver`; right-stack `maxHeight` is derived from the same offset.

### Known limitations (2026-07-09)
1. **Long-edge alignment is heuristic, not IFC-specific.** Axis comes from geometry in the scene, not `IfcSite.RefDirection`.
2. **MBR is geometry-only.** Very sparse or highly fragmented models may still pick a suboptimal long edge; no per-discipline overrides.

## 18.6 Bounding box overlay (shipped MVP, updated 2026-07-09)

- Toolbar toggle (`BoxSelect` icon) immediately **right of** the **Color by IFC type** toggle (`Palette` icon) and **left of wireframe** in the display group (`BimViewport.jsx`).
- Viewport-local toggle (not persisted in workspace state in v1).
- Renders a **footprint-oriented OBB** from `buildFootprintOrientedBounds()` in `cameraFit.js` via `bimBoundingBoxOverlay.js` on the wireframe overlay scene — same area-weighted MBR basis as Top/Bottom alignment.
- World AABB in `modelBoundsRef` remains for sectioning / fit distance (`syncModelBounds` → `buildViewportBoundsFromBox3`).

## 18.7 Color-by IFC type (shipped MVP, 2026-07-09)

- Toolbar toggle (`Palette` icon) immediately **left of bounding box** in the display group (`BimViewport.jsx`).
- Sets workspace `displayMode: 'colorBy'` and `colorByProperty: 'ifcClass'` (persisted in IndexedDB workspace state).
- **Standard render:** tints all model elements by IFC class using stable palette colours from `bimColorBy.js` (`applyColorByHighlight` via Fragments `highlight`).
- **Clay render:** falls back to highlight (no type colouring in v1).
- **BQL / agent:** `view.mode: 'colorBy'` with `colorByProperty` still supported; active query `viewerState` takes precedence over toolbar defaults. Query result subset colours when `highlightElementIds` is non-empty; otherwise full model.
- **Selection accent:** selected element keeps orange (`#f59e0b`) highlight on top of class colour — standard render via Fragments `highlight`; clay render via post-SSAO overlay (see §18.8).
- **Element table:** when colour-by is active, each row shows a leading swatch matching the viewport class colour (`BimElementTable.jsx`).

**Deferred:** colour legend overlay, clay-render type colouring, per-subtype palettes beyond shared `ifcClass` key.

## 18.8 Clay mode selection highlight (shipped MVP, 2026-07-09)

Clay SSAO desaturates fragment `highlight()` colours, so selected elements no longer read as solid orange when only the Fragments material path is used. **Shipped fix:** a dedicated **post-SSAO selection overlay** composited after the clay composer (before optional wireframe).

- **Colour:** `#f59e0b` — shared constant `BIM_SELECTION_HIGHLIGHT_COLOR` in `bimClayRender.js` (same as highlight-mode `SELECTED_MATERIAL` in `BimViewport.jsx`).
- **Build:** `buildClaySelectionOverlay()` in `bimClaySelectionOverlay.js` — fetches geometry via Fragments `getItemsGeometry(localIds)` (same source as wireframe edges), builds `MeshBasicMaterial` solids on the wireframe overlay scene.
- **Render:** `renderClayFrame()` calls `renderClaySelectionOverlayPass()` after `EffectComposer` output; targets the screen framebuffer (`setRenderTarget(null)`), runs `populateScreenDepthFromScene()` for hidden-line depth, then draws the overlay with `depthTest: true`, `depthWrite: false`, `LessEqualDepth`.
- **Hide base clay geometry:** while the overlay is active, selected fragment local IDs are temporarily hidden from the clay pass (`model.setVisible(localIds, false)`) so the white clay surface does not depth-occlude the orange overlay. Visibility is restored on deselect, render-style change, or viewport dispose.
- **Reapply safety:** clay material reapply (`reapplyClayMaterialsAfterUpdate`) and the clay-materials effect re-invoke selection via `applySelectionOverlayRef` / `selectionRefreshNonce` so the overlay survives per-frame clay updates.
- **Display modes:** works in highlight, ghost others, isolate, and color-by (clay coerces color-by to highlight for geometry; overlay still applies to selected element).

**Deferred:** per-element multi-fragment ID expansion beyond one local ID per `ifcGlobalId`; legend / table swatch sync for clay-only selection state.

## 18.9 Camera history undo (shipped MVP, 2026-07-09)

Viewport-local **back / forward camera stack** (not persisted in workspace state in v1).

- **Toolbar:** `History` icon in the **camera group** (between FOV and orthographic toggle) opens a compact HUD (`BimCameraHistoryControls.jsx`) with **Go back** / **Go forward** and past/future counts.
- **Stack:** up to **10** entries (`BIM_CAMERA_HISTORY_MAX_ENTRIES`); stores serialised camera + projection via `serializeBimCameraState()` / `restoreBimCameraState()`.
- **Recording:** unified **settle-based coalescing** (`BIM_CAMERA_HISTORY_SETTLE_MS = 750`) — orbit, zoom, pan, keyboard walk, and wheel bursts each produce **one undo step per gesture** after input settles. Orbit controls `start`/`change`/`end` plus keyboard-walk session hooks (`onCameraSessionBegin` / `onCameraSessionEnd` in `bimCameraKeyboardNav.js`) feed the recorder. **Minimum-change gate:** scene-relative orbit/zoom thresholds (`bimCameraSnapshotsMeaningfullyDiffer()`) skip sub-threshold wiggles.
- **Playback:** animated restore (`BIM_CAMERA_HISTORY_ANIMATION_MS = 300`) via `createBimCameraHistoryAnimator()`; recording disabled during programmatic camera apply (fit, saved view apply, boot restore).
- **Implementation:** `bimCameraHistory.js`, wired in `BimViewport.jsx`; unit tests in `bimCameraHistory.test.js`.

**Deferred:** persist history in workspace state; keyboard shortcuts (Ctrl+Z); named camera bookmarks separate from saved views.

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

### 19.2.1 Shipped inspector UX (Canvas host, 2026-07-06)
- **Attribute search:** text filter (`inspectorSearch`) across identity rows, grouped Psets/quantities, semantic assembly membership, and provenance; empty sections hidden while filtering; “No attributes match this filter.” when nothing matches.
- **Property grid:** two-column label/value layout with horizontal row dividers and **inset vertical dividers** (vertical lines stop short of horizontal borders, matching the element table).
- **Label wrapping:** long property names wrap to multiple lines; row height grows with label text (no single-line truncation on labels/values).

## 19.3 Element table UX (Canvas host, 2026-07-06)
- **Configurable columns:** add/remove columns (up to 12), pick IFC attributes from a grouped catalog (element fields + projected properties), drag header grip to reorder, drag header divider to resize (`fr` widths persisted in `tableColumns`).
- **Header sort:** right-click column header → Ascending / Descending / Default (`tableSort`); menu is **anchored below the column title** (not cursor-fixed — avoids misplacement inside floating panels with `backdrop-filter`) and **clamped within the panel** (`right-0` flip on overflow).
- **Search + class filter:** `tableSearch` matches name, class, GlobalId, type, storey, and visible column values; `ifcClassFilter` narrows by IFC class.
- **Floating side panels (2026-07-06):** element list (left) and inspector (right) are **overlay HUDs** over the full viewport (`BimFloatingSidePanel.jsx`), not docked columns — opening/closing or resizing them does **not** shrink the canvas or move the toolbar. Width adjustable 240–720 px (default 320 / 320) via invisible inner-edge drag handles (`leftPanelWidth`, `rightPanelWidth` persisted). Panels span `top-14` → `bottom-3` below the floating toolbar band.
- **Grid styling:** inset vertical column dividers; horizontal row borders; search input retains focus while typing (regression-tested).
- **Color-by swatches (2026-07-09):** when `displayMode === 'colorBy'`, a leading colour square per row matches the viewport IFC-class palette (`bimColorBy.js`); tooltip shows class name.

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

# 29. Implementation status (2026-07-05, updated 2026-07-08)

The first vertical slice ships **inside Canvas** as `canvas/src/features/bim/`, ahead of the standalone desktop shell. Delivery order is intentionally **Canvas-first** (Stage 4 capabilities) while reusing the shared-core module layout described in §23.

## 29.1 Stage progress

| Stage | Status | Notes |
|---|---|---|
| Stage 0 — foundations | **Done** | Stack locked: web-ifc + That Open Fragments + Three.js; pipeline version constants in `versions.js` |
| Stage 1 — IFC evidence viewer MVP | **Mostly done (Canvas host)** | Prep pipeline, cache, viewer, **configurable element table + floating resizable side panels**, **inspector attribute search + wrapping property grid**, selection sync, cache rebuild shipped; standalone shell and filesystem cache layout deferred |
| Stage 2 — BQL + agent | **Mostly done** | BQL validator + executor + manual query panel + query-driven viewer/table shipped; **`BimAgentHud`** with local NL rules + Canvas agent connectors (OpenAI/Ollama), validator → executor → viewer/table loop; saved BQL queries (max 20, persisted in workspace). **`colorBy` viewport application** shipped (toolbar IFC-class mode + BQL `view.mode: 'colorBy'`) |
| Stage 2b — 4D/5D analysis HUDs | **Partial (MVP)** | Canvas-first construction-sequence and cost-takeoff HUDs; not full CPM/Gantt or estimating platform — see §29.3 |
| Stage 2c — environmental analysis (sun study) | **Partial (MVP)** | Visual sun study + saved view carousel shipped; Meeus/NOAA apparent solar position, DST toggle, cast shadows, sun path grid/compass overlay, optional sky/tracker, clay sun direction; numeric daylight/heat analysis and time animation playback deferred — see §29.3 |
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
    bimRepository.js         # IndexedDB prepared-model + workspace + view-thumbnail stores (DB v2)
    bimSunStudy.js           # environmentalAnalysis state, Meeus/NOAA solar position, sun path samples, readouts
    bimSunLighting.js        # Three.js sun-light adapter (shadows, sky, tracker, sun path grid, ground receiver)
    bimViewSets.js           # saved view sets + view state normalisation/CRUD
    bimViewportCapture.js    # downscaled JPEG thumbnail capture from live WebGL renderer
    fingerprint.js
    versions.js              # bim-projection-v0.3, bim-connectors-v0.1, thatopen-fragments-v0.2
    types.js
    bql.js                   # validateBqlQuery + executeBqlQuery
    bimWireframeOverlay.js   # feature-edge overlay (LineSegments2 + two-pass render)
    bimClayRender.js         # Arctic/clay presentation (material override + SSAO + selection overlay + wireframe pass)
    bimClaySelectionOverlay.js # post-SSAO orange selection solids for clay mode
    bimStyleSettings.js      # shared style normalisation + card/IndexedDB patch helpers
    bimLayerVisibility.js    # storey/layer hide lists + apply to element table / viewport
    bimElementLayers.js      # derive layer groups from prepared model index
    bimViewportBoot.js       # layout wait, Fragments registration/sync boot helpers, phased loading
    bimSectioning.js         # section plane state, getSection overlay, storey preset heights
    bimScreenDepth.js        # screen depth prepass (avoids clay/section circular import)
    bimCamera.js             # perspective / orthographic camera helpers
    bimCameraHistory.js      # viewport camera undo stack (settle coalescing + animated restore)
    bimCameraKeyboardNav.js  # WASD / arrow keyboard walk + camera session hooks for history
    bimLighting.js           # HDRI environment + legacy/direct lights
    bimMeasurementController.js
    bimMeasurementOverlay.js
    bimMeasurementPick.js
    bimRlMeasure.js            # RL height math, datum/RL record factories, colour + label helpers
    bimRlMarkerPick.js         # raycast pick for RL/datum markers in measurement overlay
    bimAgent.js / bimLlmAgent.js / bimAgentResponse.js / bimSemanticResolver.js
    bim4d.js                 # construction-sequence model + task element resolution
    bim5d.js                 # cost-plan takeoff + IFC quantity rollup
    bimResultSets.js         # persisted named element/assembly sets (4D/5D linkage)
    bimTableColumns.js       # element table column catalog, add/remove/reorder/resize, sort helpers
    bimInspectorSearch.js    # inspector attribute search filter helpers
    bimViewportLayout.js     # floating toolbar/panel top inset constants (`top-14`, overlay classes)
  components/
    BimWorkspace.jsx
    BimViewport.jsx
    BimCameraHistoryControls.jsx  # camera undo/redo toolbar HUD
    BimElementTable.jsx
    BimInspector.jsx
    BimFloatingSidePanel.jsx # floating resizable element-list / inspector overlays
    BimQueryPanel.jsx        # manual JSON BQL editor + presets (also embedded in BimBqlHud)
    BimModelSummary.jsx
    BimStyleSettingsHud.jsx  # floating style panel (sliders icon toggle; shared + mode sliders)
    BimStyleToolbarControls.jsx  # HUD shared controls + clay/wireframe slider sections
    BimClayDebugPanel.jsx    # clay apply debug HUD (toggle in style settings panel)
    BimStylePresetsMenu.jsx  # save/load project style presets
    BimLayersHud.jsx         # floating storey/layer visibility panel
    BimSectionHud.jsx        # floating section-cut panel (plane height, fills, edges, storey presets)
    BimBqlHud.jsx            # viewport-top-right BQL HUD shell
    BimAgentHud.jsx          # viewport-top-right BIM agent HUD shell
    Bim4dHud.jsx             # floating 4D sequence/task HUD
    Bim5dHud.jsx             # floating 5D cost-plan takeoff HUD
    BimSunStudyHud.jsx       # floating sun study controls (manual/geo, shadows, sky, tracker)
    BimViewCarousel.jsx      # floating bottom-centre view-set carousel (thumbnails, rename, update, apply)
  api/
    bimApi.js                # REST client for style presets
  hooks/
    useBimModelSource.js
    useBimBqlPanel.js
    useBimAgentPanel.js
    useBimViewSets.js        # view-set CRUD, thumbnail persistence, apply-to-viewport
```

Canvas integration: `CardPreview.jsx`, `ModalContent.jsx`, `TypeIcon.jsx`, `filename.js`, `constants.js`, `readFile.js`, `previewHydrate.js`, `artifactType.js`, `syncIngest.js`, `syncStaging.js`.

Dependencies: `web-ifc@0.0.69`, `@thatopen/fragments@3.1.4`, `@thatopen/components@3.1.0`.

## 29.3 Shipped behaviour

- `.ifc` files ingest as `bim-model` cards with static card preview (`BimModelSummary`).
- First modal open runs `prepareBimModel()`: fingerprint check → Fragments conversion → web-ifc projection → IndexedDB cache.
- Reopen of unchanged model reuses cached prepared artifacts when fingerprint matches; user can force rebuild via `BimQueryPanel`.
- Live extraction feed during first-open preparation.
- 3D viewport: orbit/pan/zoom, fit, raycast pick, highlight / isolate / ghost others; **full-height canvas** (no fixed viewport chrome bar).
- **Workspace header (2026-07-06):** single compact row — project title left; element/property counts and cache status (`Loaded prepared BIM cache · Ready`) right; separate cache status strip and default viewport helper text removed.
- **Floating viewport toolbar HUD (2026-07-06, updated 2026-07-09):** all viewport controls in a **top-centre** floating panel inside the viewport (`absolute inset-x-0 top-3`, `rounded-md`, `bg-surface/95`, shadow, backdrop blur) over the **full-height canvas**; toolbar sizes to content (`w-max`, `max-w-[calc(100%-1.5rem)]`, horizontal scroll when needed). Grouped by vertical separators (`mx-3`). **Section order (left → right):** (1) side-panel toggles, (2) measurement, (3) view (reset visibility + fit), (4) camera (FOV + **camera history** + orthographic toggle), (5) display (wireframe, clay, highlight, ghost, isolate, style settings, **saved views** `Images` icon), (6) tools (BQL, agent, 4D, 5D, section, layers, sun study). **Measurement tools HUD (2026-07-08):** ruler button toggles a **separate floating panel** portalled below the ruler (`MeasurementToolbarControls` + `MeasurementToolsHud` in `MeasurementUi.jsx`; `resolveMeasurementHudStyle()`, `MEASUREMENT_HUD_TOOLBAR_GAP = 5` px) — not clipped by toolbar scroll. **Linear single-row layout:** Distance / Polyline / Vertex / Edge | Height / Datum / datum RL input | **Edit** (pencil, only when measurements/datum exist). **HUD open ⇒ measure mode active:** opening the HUD immediately enables placement; if the stored tool is still the default Distance (`segment`), BIM defaults to **Height** (`rl`) with vertex snap. **Edit mode (2026-07-08):** pencil toggle (BIM viewport only, controlled via `editMode` / `onEditModeChange` on `MeasurementToolbarControls`) — when on, **placement is disabled** (measurement controller inactive, tool buttons greyed out, hover previews off, in-progress draft cleared); toolbar hint shows **Click × on labels to delete**; **×** delete buttons appear on **viewport CSS2D labels** next to datum, RL markers, and distance/polyline measurements (`bimMeasurementOverlay.js`, label layer raised above canvas in edit mode); clicking × removes the item immediately. Edit auto-exits when the HUD closes or the last deletable item is removed. **Cancel vs close:** **Delete / Backspace** while the HUD is open clears only the in-progress draft — measure mode stays active and the HUD stays open; closing the HUD (ruler toggle, click outside, **Escape**) exits measure mode and cancels any draft. Measurement hints prepend inside the toolbar band when measure mode is active (**Delete to cancel** copy when placing; edit hint when in edit mode). **Escape** on the fullscreen card still closes back to the canvas (not measurement cancel).
- **RL height markers + datum (2026-07-08):** BIM measure tool adds **Height** (`measureKind: 'rl'`) and **Datum** (`measureKind: 'datum'`) modes — single vertex-snap click per marker. Visual: **3-axis cross + semi-transparent centre sphere** (`RL_MARKER_SPHERE_OPACITY = 0.4` so crosshair intersection stays visible); opaque cross arms. Labels: `RL x.xxx` (display units, 3 dp); datum label `DATUM · RL x.xxx`. **RL formula:** without datum, or when a marker’s `measuredFromDatum` is false → raw model world **Y**; when datum is live and `measuredFromDatum` is true → `datum.rlValue + (position.y − datum.position.y)`. **Datum:** singleton per viewer in `workspaceState.rlDatum` (separate from `measurements[]`); defaults to **RL 0.000** at placement with user-editable RL in the measurement HUD; replace on new datum placement; delete via **edit-mode × on viewport label** or the bottom-right **Measurements** list panel. **Colour coding:** blue (`0x60a5fa`) model elevation; teal (`0x14b8a6`) datum-relative; gold (`0xf59e0b`) datum marker; amber (`0xfbbf24`) selected pick. **Per-marker datum toggle:** `MeasurementsListPanel` shows **Measured from user datum** checkbox per RL entry only when a datum is live; new RL markers default `measuredFromDatum: true` when placed with datum active. **Visibility:** measurements eye toggle hides distance/polyline markers **and** datum; RL markers respect the same `measurementsVisible` flag. **Viewport pick (HUD open, edit mode off):** left-click selects RL/datum marker (amber highlight); right-click deletes selected marker. **Edit mode on:** viewport pick disabled; use × on labels to delete. Implementation: `bimRlMeasure.js`, `bimRlMarkerPick.js`, `bimMeasurementController.js` (`rl`/`datum` single-click paths), `bimMeasurementOverlay.js`, `MeasurementUi.jsx` (`enableRlOptions` on BIM viewport). Distance/polyline measure kinds unchanged (`segment`, `polyline`, vertex/edge snap).
- **Floating side panels (2026-07-06):** toolbar toggles open **left** (element table) and **right** (inspector) overlay panels (`BimFloatingSidePanel.jsx`) over the viewport — same visual language as other HUDs (`rounded-md`, `bg-surface/95`, shadow). Width 240–720 px with invisible inner-edge resize handles; persisted in `leftPanelWidth` / `rightPanelWidth`. Panels and tool HUD stacks start below the toolbar band (`top-14`); toggling panels does not reflow the canvas or toolbar.
- **Wireframe overlay** (2026-07-04, updated 2026-07-05): optional camera-visible feature edges composited over lit/ghost/highlight/clay views — independent of display mode. Built from Fragments `getItemsGeometry()` into `LineSegments2` + `LineMaterial` (screen-space px width). **Standard (lit/ghost) path:** main scene render (colour + depth), then overlay scene with `autoClear: false` and transparent blending. **Edge mode toggle (`Hdn` / `All`):** persisted as `wireframeHiddenLines` (default `true`). **Hdn** — hidden-line / edge-aware overlay (`depthTest: true`, occludes edges behind surfaces). **All** — full wireframe (`depthTest: false`, draws all feature edges including through walls). When wireframe is on, the **style settings HUD** exposes **line weight** (0.5–6 px), **transparency** (`Trn`, 0–100%), **colour**, and **Hdn/All**. Transparency semantics: **100% = invisible lines (base render only)**, **0% = solid outlines**. Values persist in workspace state (`wireframeMode`, `wireframeLineWeight`, `wireframeOpacity`, `wireframeColor`, `wireframeHiddenLines`). **Full wireframe opacity:** dense overlapping edges use a curved map capped at `WIREFRAME_DENSE_OPACITY_MAX` (0.38) so the transparency slider is usable across the full range; hidden-line mode uses linear transparency. Live style updates apply without edge rebuild. Line material uses `toneMapped: false` when composited over tone-mapped output.
- **Clay render / Arctic presentation** (2026-07-05): optional `renderStyle: 'clay'` orthogonal to `displayMode` and `wireframeMode`. Rhino-style white-model presentation for design review:
  - **Stage 1 — material override:** all Fragments geometry highlighted with uniform clay surface colour; glazing IFC classes (`IfcWindow`, `IfcPlate`, `IfcCurtainWall`, `IfcDoor`, …) get semi-transparent glass override.
  - **Stage 2–3 — SSAO post-process:** `EffectComposer` → `RenderPass` → `SSAOPass` (`OUTPUT.Default`) → `OutputPass` (`needsSwap: false` so RenderPass depth stays in `readBuffer`). Composer sized to **logical** viewport pixels (`getRendererLogicalSize()`); camera `near`/`far` tightened to model bounds each frame (required because default BIM `far: 100000` collapses SSAO linear depth). Clay materials are **unlit colour overrides** — AO/R/B/D/Smp/Res control SSAO exclusively; Res below 100% trades sharpness for speed. **`renderClayFrame` forces `renderer.shadowMap.enabled = false`** during the SSAO pass so sun-study cast shadows cannot corrupt clay definition. In clay mode, sun study applies **direction only** via `updateClaySunDirection()` — no sun cast shadows or adapter lights in the clay path.
  - **Stage 4 — optional wireframe:** when wireframe is also on, SSAO colour pass renders to screen first, then:
    - **Hdn:** `populateScreenDepthFromScene()` — re-render Fragments geometry to the default framebuffer with **colour writes locked off** and depth cleared/written (Fragments ignores `scene.overrideMaterial`, so override-based depth prepass must not be used). Then `renderWireframeOverlayPass()` with `depthTest: true`.
    - **All:** skip depth population; `renderWireframeOverlayPass()` with `depthTest: false` and transparent blend over clay.
    - Wireframe skipped when line opacity ≤ 0 (100% transparency).
  - **Stage 4.5 — selection overlay (2026-07-09):** when an element is selected, orange geometry is composited **after SSAO** via `bimClaySelectionOverlay.js` (see §18.8). Selected fragment IDs are hidden from the clay pass while the overlay is active. Runs before the optional wireframe pass.
  - Clay mode disables HDRI when sun study is off; uses low hemisphere + directional skylight fill instead. When **sun study** is enabled, clay key/fill lights follow the resolved sun direction via `updateClaySunDirection()` while SSAO remains contact depth; sun cast shadows and adapter lights stay off in clay mode.
  - Toolbar **clay toggle** uses a circle icon in a rounded-square button (same active styling as highlight / wireframe / layers).
  - **Clay material blend (`Orig`):** 0% restores native IFC colours; partial blend lerps only fragments with IFC colour metadata (~438 IDs on typical models); 100% applies uniform Surf to all geometry. Fast-path batch highlight at 100%; per-frame `fragments.update` skipped at full clay (no layer/section filters) so white clay is not cleared every frame.
  - Style settings HUD controls when clay is active (live numeric readouts beside sliders; accent highlight when pinned at min/max). **Reset clay defaults** button re-applies `RHINO_ARCTIC_CLAY_STYLE` via `getClayPresetWorkspacePatch()`:
    | Control | Field | Range | Default |
    |---|---|---|---|
    | AO | `clayAoIntensity` | 0–100 | **25** |
    | R | `clayAoRadius` | 0.0005–0.05 | 0.0005 |
    | B | `clayAoBias` | 0.05–0.2 | 0.05 |
    | D | `clayAoDistance` | 0–1 | 0.17 |
    | Smp | `clayAoSamples` | 8–256 | 256 |
    | Res | `clayAoResolution` | 0.25–1 (scale) | **1** |
    | Lit | `clayLightIntensity` | 0–10 | 2.7 |
    | Gls | `clayGlassOpacity` | 0.05–0.5 | 0.31 |
    | Orig | `clayOriginalColorBlend` | 0–1 (0% native → 100% Surf) | 1 |
    | Surf | `claySurfaceColor` | hex | `#f8f8f8` |
    | Background | `viewportBackgroundColor` | hex | `#ffffff` |
  - State normalised via `normalizeClayStyle()` in `types.js`; clay preset via `getClayPresetWorkspacePatch()` (does not force wireframe off).
- **Default viewer open state** (2026-07-05, updated): each workspace open applies `BIM_VIEWER_DEFAULTS` via `applyBimViewerDefaults()` in `types.js` — `displayMode: 'highlight'`, `renderStyle: 'standard'`, empty `hiddenStoreys` / `hiddenLayers`, `isolateOnSelect: false`, **`section.enabled: false`**. Camera, panel layout, measurements, lighting, saved queries, and section style fields (plane height, fill/edge colours) still restore from IndexedDB / card metadata; display mode, render style, layer/storey visibility, and section-cut **enabled** flag reset on every open.
- **Style settings HUD** (2026-07-05, updated 2026-07-06): toolbar **sliders icon** (`SlidersHorizontal`) toggles floating `BimStyleSettingsHud` in the viewport top-right HUD stack (alongside BQL / agent). **Shared section (always in HUD):** viewport **background colour**, **style presets** menu. **Standard render only:** HDRI lighting cycle (off / studio / city / sunset). **Clay mode:** AO/R/B/D/Smp/Res/Lit/Gls/**Orig**/Surf sliders, **Reset clay defaults** button, and optional **clay debug** panel (toggle in HUD, not console). **Wireframe mode:** Wt/Trn/Line/Hdn controls. Preset menu uses viewport-aware portal positioning (not clipped by HUD scroll). Implementation split: `BimStyleToolbarControls.jsx` (`BimStyleHudSharedControls`, `BimStyleToolbarSliders`); debug markers in `bimClayDebug.js`.
- **Storey / layer visibility** (2026-07-05): toolbar layers button opens `BimLayersHud` — toggles per-storey and per-layer visibility (`bimLayerVisibility.js`, `bimElementLayers.js`); hidden lists persist in workspace state.
- **Style presets API** (2026-07-05): Postgres table `bim_style_presets` (migration `0025_bim_style_presets.sql`); REST routes under `/bim/projects/:projectId/style-presets` (list/create) and `/bim/style-presets/:presetId` (get/patch/delete). Client `bimApi.js` + `BimStylePresetsMenu.jsx`; debounced write-back of current style bundle to card `version.bim.styleSettings`.
- **Floating viewport HUDs** (2026-07-05, updated 2026-07-09): BQL and BIM agent panels moved from the sidebar into the viewport **right HUD stack** (`BimBqlHud.jsx`, `BimAgentHud.jsx`) alongside style settings, 4D, and 5D. Right stack top offset is measured below the view navigator gimbal (see §18.5).
- **Section cut** (2026-07-05): toolbar slice button opens `BimSectionHud.jsx` — horizontal clipping plane on Fragments geometry plus optional fill/edge overlay from `model.getSection()`. State in `workspaceState.section` (`enabled`, `planes`, `showFills`, `showEdges`, colours, edge weight). **Off by default** on each workspace open (`applyBimViewerDefaults` forces `section.enabled: false` while preserving saved plane/style). Storey preset buttons place the plane at **IfcBuildingStorey Elevation + 1 m** (`SECTION_STOREY_PLANE_OFFSET`); `Elevation` / `LongName` extracted in `ifcProjection.js`. Overlay fills use `MeshBasicMaterial` with `DoubleSide` and `depthTest: false`; edges use `LineSegments2` with depth test against a screen-depth prepass (`bimScreenDepth.js`, shared with clay hidden-line wireframe). HUD sliders use stacked layout (`ClaySliderControl stacked`) so labels stay on one line above the range input.
- **Viewport boot + loading feedback** (2026-07-05, updated): `bimViewportBoot.js` gates first paint on (1) non-zero container layout via `ResizeObserver` (up to 20s), (2) Fragments worker model registration, (3) optional short `model.isBusy` wait (2.5s cap), (4) `syncFragmentsForViewportBoot()` — immediate `fragments.update()` then retry up to 8s. Overlay shows phased status (`BIM_VIEWPORT_LOAD_PHASES`) with spinner and element count until `loadState === 'ready'`. `updateFragments()` skips worker calls when the model is not yet registered. React Strict Mode double-mount ignored via effect sequence ids; animation loop starts only after boot succeeds.
- Bidirectional selection sync between table, viewport, and inspector via `ifcGlobalId`.
- **Element table (2026-07-06, updated 2026-07-06):** configurable columns (add/remove/reorder/resize from IFC attribute catalog), header sort menu **anchored to column header** and clamped inside floating panel, text search + IFC class filter, **floating left overlay panel** with invisible width resize, inset vertical grid dividers. State: `tableColumns`, `tableSort`, `tableSearch`, `ifcClassFilter`, `leftPanelWidth` (240–720 px).
- **Inspector (2026-07-06, updated 2026-07-06):** attribute search (`inspectorSearch`) across identity, grouped properties, assembly membership, and provenance; two-column property grid with inset vertical dividers and wrapping multi-line labels; **floating right overlay panel** with invisible width resize (`rightPanelWidth`, 240–720 px); `floating` prop drops docked left border.
- **BQL executor** (`executeBqlQuery`) runs against prepared model index with `physicalElements`, `semanticAssemblies`, and `allBimObjects` scopes.
- **BimQueryPanel** provides JSON BQL editor with presets (all beams, ground floor, windows incl. `WindowAssembly`).
- Query results drive viewer display mode and filter the element table; evidence bundle returned per result.
- **Saved BQL queries** (2026-07-05): `saveBqlQuery` persists up to 20 named queries in workspace state (`savedQueries`); save/load/delete in `BimBqlHud` and `BimQueryPanel` via `useBimBqlPanel.js`.
- **BIM agent HUD** (2026-07-05): floating `BimAgentHud` with chat transcript and connector picker. Local regex/NL → BQL drafting via `draftBqlFromNaturalLanguage` in `bimAgent.js`; LLM path via existing Canvas agent connectors (`bimLlmAgent.js`, `useBimAgentPanel.js`) with JSON parse → validate → auto-repair loop. Storey clarification flow; formatted responses via `buildBimAgentResponse` in `bimAgentResponse.js`. **`colorBy` applied in viewport** (2026-07-09) — see §18.7.
- **Saved result sets** (2026-07-05): `savedResultSets` in workspace state; create from current selection or BQL results; consumed by 4D task linking and 5D `groupBy: 'resultSet'`.
- **4D sequencing (MVP)** (2026-07-05): toolbar calendar button opens `Bim4dHud`. **Shipped:** sequence/task CRUD (limits: 12 sequences / 200 tasks), prev/next active-task stepping, link tasks to element IDs, assembly IDs, and saved result sets, active-task viewport highlight (`ghostOthers`). **Deferred:** `ghostFuture` / `hideFuture` visibility modes, playback animation (`playing`, `speed`), Gantt / timeline UI, full date/status editing UI.
- **5D takeoff (MVP)** (2026-07-05): toolbar dollar button opens `Bim5dHud`. **Shipped:** cost plans with rate rows, IFC quantity rollup (Area / Volume / Length from `ifc-quantity` properties), group-by class / type / storey / layer / semantic type / classification / result set, row click → viewport element highlight. **Deferred:** rate-row match-criteria editor in HUD (backend supports `match.ifcClass/storey/...`), external cost DB, export.
- **Sun study (MVP)** (2026-07-06, updated 2026-07-06): toolbar sun button opens `BimSunStudyHud` in the top-right HUD stack (alongside section/layers). **Shipped:** `environmentalAnalysis` workspace namespace (`site`, `sunStudy`, reserved `lightingAnalysis` / `heatAnalysis`); manual azimuth/elevation and geo mode from latitude, longitude, IANA timezone, and local wall-clock datetime; **built-in site presets** (`BIM_SITE_PRESETS` — Melbourne default plus AU capitals and London, New York, Paris, Shanghai, Mumbai, Singapore) with lat/lon/timezone/DST locked per preset; **Custom** mode for editable coordinates and **Save** to persist named presets in `site.customPresets`; **daylight-saving toggle** on `site.daylightSavingTime` (default on; when off, uses standard-time offset from Jan/Jul minima); true-north offset; north-clockwise azimuth readouts; **apparent solar position** via pure helpers in `bimSunStudy.js` (`computeSolarPosition`, algorithm id `meeus-noaa-apparent-v1` — Julian century, equation of time, refraction correction; no `luxon`/`suncalc` dependency); explicit Three.js sun-light adapter in `bimSunLighting.js` (`createBimSunLightingAdapter`, `applyBimSunLighting`) with one shadow-casting directional light, optional ground receiver (`ShadowMaterial`) with **`shadowOpacity`** (0–1, default 0.22) and **`shadowColor`** (hex, default `#000000`) HUD controls, procedural `Sky` dome, optional sun tracker marker/ray, and **geo sun-path overlay** (`showSunPath`, `showCompass`, `sunPathRadius` 0.25–5× model radius): daily above/below-horizon arcs from `buildSunPathSamples()`, month arcs (21st of each month) and hour curves (06:00–18:00, every 5 days) from `buildSunPathGridSamples()`; shadow quality presets (`low`/`medium`/`high` → map sizes); model `castShadow`/`receiveShadow` on load; clay mode uses **direction-only** sun sync (`updateClaySunDirection`) — cast shadows and adapter lights stay off in clay; below-horizon dimming; HUD readout shows active calc algorithm. **Not in style presets or saved views** — site/sun state is project workspace context, not `extractBimStyleSettings()`. **Deferred:** geo time-of-day animation playback loop (HUD toggles/speed persisted only), numeric daylight/illuminance analysis, solar radiation / heat-gain analysis, IFC site auto-import.
- **Saved view sets / carousel (MVP)** (2026-07-06, updated 2026-07-06): toolbar **Images** icon toggles a **floating bottom-centre HUD** (`BimViewCarousel`) — not a full-width docked band. Width adapts to thumbnail count (`w-max`, cap **`max-w-[75vw]`**); horizontal scroll when capped. **Shipped:** up to **12** view sets × **40** views each; each view stores camera, projection, section style/plane, hidden storeys/layers, display mode, and style bundle (not sun study or selection); **`view.state` schema v1** (`schemaVersion: 1`) with explicit **`isPerspective`**, **`fieldOfView`** (degrees, only when perspective), **`projectionMode`**, and projection-specific **`camera`** payload (`fov` for perspective; `zoom` + `viewHeight` for orthographic); capture current viewport via `captureBimViewportThumbnail()` (320×180 JPEG); thumbnails in IndexedDB `viewThumbnails` store (`bimRepository.js` DB v2); create/rename/delete sets; save/update/rename/delete/apply views; `useBimViewSets.js` orchestrates thumbnail put/delete and apply requests back into `BimWorkspace`. **Deferred:** server-synced view sets, drag reorder, multi-user sharing.
- Workspace state (camera, selection, filters, display mode, projection mode, measurements, **`rlDatum`**, `measureKind` (`segment` | `polyline` | `rl` | `datum`), wireframe mode + style (`wireframeHiddenLines` included), **render style + clay tuning**, **section cut state**, **environmentalAnalysis (sun study)**, **view sets + active view/set + carousel open**, **saved queries**, **saved result sets**, **4D sequences**, **5D cost plans**, lighting, panel toggles, **element table columns/sort/search/filters**, **inspector attribute search**, **left/right panel widths**) persisted in IndexedDB per fingerprint.
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
| NL BIM agent side panel | **Shipped (MVP)** — `BimAgentHud` with local rules + LLM connectors; validator → executor → viewer/table loop; `colorBy` viewport apply shipped (§18.7) |
| 4D construction sequencing | **Partial (MVP)** — sequence/task HUD + active-task highlight; not full CPM/Gantt, playback, or future-task visibility modes |
| 5D cost takeoff | **Partial (MVP)** — cost-plan HUD + IFC quantity rollup; not full rate matching UI, external cost DB, or export |
| Environmental / sun study | **Partial (MVP)** — visual sun study HUD + Meeus/NOAA apparent solar position + DST toggle + cast shadows + sun path grid/compass overlay; animation playback loop, numeric daylight, and heat/solar-gain analysis deferred |
| Saved view sets | **Shipped (MVP)** — IndexedDB-backed carousel with thumbnails; server sync and drag reorder deferred |
| Wireframe overlay | Shipped — toggle + style controls (weight, transparency, colour, Hdn/All); clay + wireframe compositing with depth-only screen pass for hidden lines; selected-element edge highlight deferred |
| RL height markers + datum | **Shipped (MVP)** — cross-sphere markers, singleton datum, per-marker datum-relative toggle, floating measurement tools HUD, viewport edit mode with × delete on labels; BIM viewport only (`enableRlOptions`) |
| View navigator gimbal | **Shipped (MVP)** — wireframe cube gimbal top-right; right-click Home/Top/Bottom; `fitCameraToViewPreset` + footprint MBR long-edge alignment; fixed-width label; viewport-centred toolbar; right HUD stack anchors below gimbal chrome (`BimViewNavigatorGimbal.jsx`, `bimViewNavigator.js`, `bimViewportLayout.js`, `cameraFit.js`) |
| Bounding box overlay | **Shipped (MVP)** — toolbar toggle left of wireframe; footprint **OBB** edges on overlay scene (`bimBoundingBoxOverlay.js`, `buildFootprintOrientedBounds` in `cameraFit.js`) |
| Color-by IFC type | **Shipped (MVP)** — toolbar `Palette` toggle; `displayMode: colorBy` + `colorByProperty: ifcClass`; element-table swatches; BQL `colorBy` supported (`bimColorBy.js`) |
| `colorBy` display mode (BQL only) | **Superseded** — now applied in viewport (§18.7) |
| Saved BQL queries | Shipped — up to 20 persisted in workspace; save/load/delete in BQL HUD |
| Workspace state on card `version.bim` | Style settings (`version.bim.styleSettings`) read on init and debounced write-back on change; other workspace fields remain IndexedDB-only |
| IFC schema in fingerprint | Hardcoded `'unknown'` until schema detection lands |
| Element coverage | 18 common IFC classes, not full schema scan |
| Assembly-level viewer selection | BQL can match assemblies; viewport highlights physical members only |

## 29.5 Next engineering moves

1. Color-by **legend** overlay and clay-render type colouring.
2. Assembly-aware table mode and assembly-level selection/inspector.
4. Sun study geo time animation playback loop + debounced persistence while scrubbing.
5. Daylight / heat analysis modules on top of `environmentalAnalysis` (result artifacts, not viewport-only state).
6. 4D playback + future-task visibility modes (`ghostFuture` / `hideFuture`) + timeline / Gantt UI.
7. 5D rate matching UI (match-criteria editor) + export.
8. BQL query history (beyond saved named queries).
9. Extract `bim-core` / `bim-viewer-ui` packages when Canvas + standalone both need the code.
10. Standalone `desktop-bim-app` shell reusing the same core.
