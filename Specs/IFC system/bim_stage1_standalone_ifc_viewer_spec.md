# Stage 1 Implementation Spec
## Standalone IFC Evidence Viewer MVP
**Version:** v0.1  
**Date:** 2026-07-04  
**Depends on:** `bim_canvas_standalone_master_spec_v1_1.md`

---

# 1. Goal

Build the first working standalone BIM viewer that can open large IFC files, convert them to That Open / Fragments, create a local BIM index, inspect elements/properties, and synchronize selection between the viewer, table, and inspector.

This stage proves the foundation before adding the full BIM agent.

---

# 2. In scope

- standalone desktop shell
- open local IFC file
- automatic first-open preparation
- IFC fingerprinting and cache reuse
- That Open / Fragments conversion
- embedded local BIM database
- raw element extraction
- property/quantity extraction
- storey/spatial structure extraction where available
- viewer rendering
- picking/selection
- element table
- properties inspector
- viewer ↔ table selection sync
- local workspace state persistence

---

# 3. Out of scope

- full natural language BIM agent
- advanced BQL
- BCF export
- IFC write-back
- model editing
- Revit connector
- cloud collaboration
- multi-user state

---

# 4. Architecture

```text
IFC file
↓
First-open preparation
├─ compute fingerprint
├─ convert to That Open Fragments
├─ extract IFC evidence via web-ifc
├─ build local BIM database
└─ persist cache metadata
↓
Standalone workspace
├─ Fragments viewer
├─ element table
├─ properties inspector
└─ local state store
```

---

# 5. Package targets

```text
/apps/desktop-bim-app
/packages/bim-core
/packages/bim-viewer-ui
```

`desktop-bim-app` owns the shell.  
`bim-core` owns ingestion, DB, fingerprinting, and element records.  
`bim-viewer-ui` owns viewer/table/inspector components.

---

# 6. First-open preparation flow

1. User selects an IFC file.
2. App computes a file hash.
3. App computes a preparation fingerprint from:
   - IFC file hash
   - IFC schema version
   - Fragments converter version
   - projection schema version
   - connector rule version
4. App checks local cache for matching prepared artifacts.
5. If missing or stale, app prepares the model:
   - convert IFC geometry to Fragments
   - extract IFC elements and properties
   - create local BIM index
   - store provenance and mapping records
6. App opens the workspace using cached prepared artifacts.

---

# 7. Local cache artifacts

For each prepared model, cache at least:

```text
/model-cache/<modelFingerprint>/
  model.fragments
  bim-index.db
  metadata.json
  workspace-state.json
```

`metadata.json` should include:

- source file path
- source file hash
- IFC schema version
- converter version
- projection schema version
- created timestamp
- last opened timestamp

---

# 8. Local BIM database minimum schema

The embedded DB should support records equivalent to:

## 8.1 `models`
- `id`
- `sourceFilePath`
- `sourceFileHash`
- `fingerprint`
- `ifcSchema`
- `createdAt`
- `updatedAt`

## 8.2 `elements`
- `id`
- `modelId`
- `ifcGlobalId`
- `ifcClass`
- `name`
- `typeName`
- `storeyId`
- `fragmentsObjectId`
- `nativeAuthoringId`

## 8.3 `properties`
- `id`
- `elementId`
- `psetName`
- `propertyName`
- `value`
- `unit`
- `source`

## 8.4 `relationships`
- `id`
- `modelId`
- `fromElementId`
- `toElementId`
- `relationshipType`

## 8.5 `provenance`
- `id`
- `recordType`
- `recordId`
- `ifcGlobalId`
- `ifcClass`
- `sourceFileHash`
- `extractionRule`
- `createdAt`

---

# 9. Viewer requirements

The viewer shall support:

- load Fragments model from cache
- orbit/pan/zoom
- fit to model
- select object
- highlight selected object
- isolate selected objects
- ghost non-selected objects
- reset visibility
- expose selected object id to the workspace state

---

# 10. Table requirements

The element table shall support:

- one row per physical IFC element
- columns: name, IFC class, GlobalId, storey, type
- search/filter by text
- filter by IFC class
- selecting a row selects/highlights the viewer object
- viewer selection scrolls/focuses matching table row

---

# 11. Inspector requirements

The inspector shall show:

- element name
- IFC class
- IFC GlobalId
- type name
- storey
- property sets grouped by Pset
- quantities where available
- provenance summary

---

# 12. Workspace state

Persist locally:

- camera position/target
- selected element ids
- active table filters
- active display mode
- opened panels
- last opened timestamp

---

# 13. Acceptance criteria

- An IFC file can be opened from disk.
- The app automatically prepares Fragments + BIM index on first open.
- Reopening the same unchanged IFC reuses cached artifacts.
- The model renders from Fragments.
- Selecting in the viewer updates the table and inspector.
- Selecting a table row highlights the viewer object.
- IFC properties are visible in the inspector.
- The app works without cloud services or a user-managed DB.

---

# 14. Implementation status (2026-07-04, updated)

Stage 1 capabilities are **shipped inside Canvas** as the first host, before the standalone `desktop-bim-app` shell exists.

## 14.1 Shipped in Canvas

| Requirement | Status |
|---|---|
| Open IFC | Yes — `.ifc` → `bim-model` artifact via drag/drop, folder sync, or reload |
| Automatic first-open preparation | Yes — `prepareBimModel()` in modal open |
| Fingerprinting and cache reuse | Yes — `computeBimModelFingerprint()` + IndexedDB store |
| Cache rebuild | Yes — `deletePreparedModel()` via `BimQueryPanel` rebuild control |
| That Open / Fragments conversion | Yes — `convertIfcToFragmentsBlob()` |
| Local BIM index | Yes — elements, properties, relationships, provenance in IndexedDB (not SQL) |
| Raw element extraction | Yes — 18 common IFC classes via web-ifc |
| Property/quantity extraction | Yes — `rel-defines-by-properties` + quantity sets |
| Storey extraction | Yes — `storeyId` on element records and shown in table column |
| Viewer rendering | Yes — `BimViewport.jsx` (Fragments + Three.js) |
| Wireframe overlay | Yes — feature-edge overlay over lit/ghost/highlight; toolbar style controls when enabled (weight, transparency, colour); persisted in workspace state |
| Perspective / orthographic | Yes — toolbar toggle + camera state persistence |
| Measurements | Yes — vertex/edge snap, segment + polyline, units toggle; shared `MeasurementUi` with 3D artifact viewer |
| HDRI lighting | Yes — environment preset cycle (off / studio / city / …) |
| Picking/selection | Yes — raycast + GlobalId mapping |
| Element table | Yes — name, class, GlobalId, type, storey; search + class filter |
| Properties inspector | Yes — grouped Psets, provenance, assembly membership |
| Viewer ↔ table sync | Yes — bidirectional via `ifcGlobalId` |
| Workspace state persistence | Yes — IndexedDB per fingerprint (camera, panels, filters, display mode, projection, measurements, wireframe mode + style, lighting) |
| Live extraction feed | Yes — progress events during first-open preparation |
| Folder sync → dock | Yes — `.ifc` scanned as `bim-model`; stages to sync holding tray after Sync → Apply (or auto-apply on folder connect). See master spec §29.3 *Folder sync, dock, and artifact ingest* |
| Workspace tree visibility | Yes — after 2026-07-04 ingest fix (`project_id` + cluster membership on `/artifacts/ingest`) |

## 14.2 Not yet shipped (Stage 1 gaps)

| Requirement | Status |
|---|---|
| Standalone desktop shell | Not built |
| Filesystem cache layout (`model-cache/<fingerprint>/`) | Not built — IndexedDB instead |
| Embedded SQL database | Not built |
| `colorBy` display mode | Validated in BQL but not applied in viewport |
| Package split (`bim-core`, `bim-viewer-ui`) | Deferred — monolithic `features/bim/` |

## 14.3 Key paths

| Layer | Path |
|---|---|
| Prep pipeline | `canvas/src/features/bim/bim-core/prepareBimModel.js` |
| IFC projection | `canvas/src/features/bim/bim-core/ifcProjection.js` |
| Fragments conversion | `canvas/src/features/bim/bim-core/fragmentsConversion.js` |
| Repository | `canvas/src/features/bim/bim-core/bimRepository.js` |
| Workspace UI | `canvas/src/features/bim/components/BimWorkspace.jsx` |
| Wireframe overlay | `canvas/src/features/bim/bim-core/bimWireframeOverlay.js` |
| Query panel | `canvas/src/features/bim/components/BimQueryPanel.jsx` |
| Canvas routing | `canvas/src/components/ModalContent.jsx`, `CardPreview.jsx` |
| Tests | `canvas/src/features/bim/bim-core/__tests__/`, `canvas/src/components/__tests__/BimArtifactRoutes.test.js` |

## 14.4 Pipeline versions

- Projection: `bim-projection-v0.3`
- Connectors: `bim-connectors-v0.1`
- Fragments converter: `thatopen-fragments-v0.2`
