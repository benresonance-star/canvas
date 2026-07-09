# BQL + BIM Executor Spec
## Deterministic Query Layer for BIM Agent and Viewer
**Version:** v0.1  
**Date:** 2026-07-04  
**Depends on:** `bim_canvas_standalone_master_spec_v1_1.md`

---

# 1. Purpose

Define the structured BIM Query Language (BQL), deterministic execution engine, and result/evidence contracts used by the BIM agent, viewer, table, and inspector.

The agent may interpret intent, but the BIM engine executes queries deterministically against the local BIM database.

---

# 2. Principles

- Natural language is not execution.
- BQL is the execution contract.
- Every result must be traceable to model evidence.
- Viewer changes happen through structured result payloads, not free-form agent commands.
- BQL must support physical IFC elements and semantic assemblies.

---

# 3. Execution flow

```text
User asks question
→ agent drafts BQL
→ BQL validator checks schema and allowed operations
→ deterministic BIM executor runs against local BIM DB
→ result payload returns ids, table rows, viewer instructions, evidence
→ UI applies result state
```

---

# 4. BQL top-level shape

```ts
interface BqlQuery {
  version: "0.1"
  select: "elements" | "assemblies" | "count" | "properties"
  from?: "physicalElements" | "semanticAssemblies" | "allBimObjects"
  where?: BqlWhere
  include?: BqlInclude[]
  view?: BqlViewInstruction
  limit?: number
}
```

---

# 5. Where clause

```ts
interface BqlWhere {
  ifcClass?: string | string[]
  semanticType?: string | string[]
  storey?: string | string[]
  nameContains?: string
  properties?: PropertyPredicate[]
  quantities?: QuantityPredicate[]
  and?: BqlWhere[]
  or?: BqlWhere[]
  not?: BqlWhere
}

interface PropertyPredicate {
  path: string
  op: "=" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | "exists"
  value?: string | number | boolean
}

interface QuantityPredicate {
  name: string
  op: "=" | "!=" | ">" | ">=" | "<" | "<=" | "exists"
  value?: number
  unit?: string
}
```

---

# 6. Viewer instruction

```ts
interface BqlViewInstruction {
  mode: "highlight" | "isolate" | "ghostOthers" | "colorBy"
  colorByProperty?: string
  focus?: boolean
}
```

---

# 7. Example queries

## 7.1 Show all windows

```json
{
  "version": "0.1",
  "select": "elements",
  "from": "allBimObjects",
  "where": {
    "or": [
      { "ifcClass": "IfcWindow" },
      { "semanticType": "WindowAssembly" }
    ]
  },
  "view": { "mode": "highlight", "focus": true }
}
```

## 7.2 Fire doors under 920 mm wide

```json
{
  "version": "0.1",
  "select": "elements",
  "from": "physicalElements",
  "where": {
    "ifcClass": "IfcDoor",
    "properties": [
      { "path": "Pset_DoorCommon.FireRating", "op": "exists" }
    ],
    "quantities": [
      { "name": "Width", "op": "<", "value": 920, "unit": "mm" }
    ]
  },
  "view": { "mode": "isolate", "focus": true }
}
```

---

# 8. Result payload

```ts
interface BqlResult {
  queryId: string
  status: "success" | "empty" | "error"
  objectRefs: BimObjectRef[]
  tableRows: BimResultRow[]
  viewerState: ViewerResultState
  evidence: EvidenceBundle[]
  summary?: string
  warnings?: string[]
}

interface BimObjectRef {
  id: string
  kind: "physicalElement" | "semanticAssembly"
  ifcGlobalId?: string
  fragmentsObjectId?: string
}
```

---

# 9. Evidence bundle

```ts
interface EvidenceBundle {
  objectId: string
  evidenceType: "ifcClass" | "property" | "quantity" | "relationship" | "semanticAssembly" | "connectorRule"
  sourcePath?: string
  value?: unknown
  ifcGlobalId?: string
  connectorRuleId?: string
}
```

---

# 10. Validator requirements

The BQL validator shall:

- reject unknown top-level fields
- reject unsupported operators
- reject direct file-system or network actions
- reject write operations in early stages
- validate that `view.mode` is allowed
- normalize units where feasible
- return clear validation errors

---

# 11. Executor requirements

The executor shall:

- run against the local BIM database
- return stable object ids
- include fragments object ids where available
- include provenance/evidence where available
- support empty results without failure
- never ask the LLM to decide final membership after query execution

---

# 12. Agent contract

The agent receives:

- user utterance
- optional current selection
- model metadata summary
- BQL schema
- available query examples

The agent returns:

- BQL candidate
- short natural-language intent summary
- optional ambiguity warning

The executor, not the agent, decides final query result membership.

---

# 13. Acceptance criteria

- The system can execute a BQL query for all `IfcWindow` elements.
- The system can execute a BQL query combining `IfcWindow` and `WindowAssembly`.
- Query results highlight in the Fragments viewer.
- Query results populate the table.
- Every result can expose evidence/provenance.
- Invalid BQL is rejected before execution.

---

# 14. Implementation status (2026-07-09, updated)

BQL **validator**, **executor**, **manual query UI**, **NL agent translation**, **saved queries**, and **`colorBy` viewport application** are shipped.

## 14.1 Shipped

| Requirement | Status | Path |
|---|---|---|
| BQL top-level shape validation | Yes | `canvas/src/features/bim/bim-core/bql.js` |
| Where clause / predicate validation | Yes | same |
| Reject unknown fields | Yes | same |
| Reject unsupported operators | Yes | same |
| Reject write/network actions | Yes | same |
| `view.mode` validation | Yes | same |
| Deterministic BIM executor (`executeBqlQuery`) | Yes | same |
| Result payload (`objectRefs`, `tableRows`, `viewerState`, `evidence`, `summary`) | Yes | same |
| `from` scopes: `physicalElements`, `semanticAssemblies`, `allBimObjects` | Yes | same |
| Where filters: class, semantic type, storey, name, properties, quantities, and/or/not | Yes | same |
| Query-driven viewer apply (highlight / isolate / ghostOthers / **colorBy**) | Yes | `BimWorkspace.jsx` → `BimViewport.jsx` |
| Query-driven table filter | Yes | `BimWorkspace.jsx` → `BimElementTable.jsx` |
| Manual query panel with presets | Yes | `BimQueryPanel.jsx` |
| Windows preset (`IfcWindow` + `WindowAssembly`) | Yes | `BimQueryPanel.jsx` |
| Invalid BQL rejected before execution | Yes | `executeBqlQuery` returns `status: 'error'` |
| Agent → BQL translation (local rules) | Yes | `bimAgent.js` |
| Agent → BQL translation (LLM connectors) | Yes | `bimLlmAgent.js`, `useBimAgentPanel.js` |
| NL BIM agent HUD | Yes | `BimAgentHud.jsx` |
| Saved queries (persist, load, delete; max 20) | Yes | `BimWorkspace.jsx`, `useBimBqlPanel.js`, `BimBqlHud.jsx` |
| `colorBy` view instruction application | Yes | `bimColorBy.js` → `applyColorByHighlight` / `refreshStandardSelectionOverlay` in `BimViewport.jsx`; `colorByProperty` + `ifcClassFilter` in workspace state |

## 14.2 Not yet shipped

| Requirement | Status |
|---|---|
| Assembly-only viewport highlight (multi-member) | Partial — physical member ids only |
| BQL query history | Not built (saved named queries only) |
| Color-by legend overlay | Not built |

## 14.3 Next move

Add assembly-level highlight for multi-member assemblies. Add query history beyond saved named queries. Add colour-by legend overlay.
