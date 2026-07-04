# Archicad Connector + Semantic Assembly Spec
## Custom Component Preservation for IFC Projection
**Version:** v0.1  
**Date:** 2026-07-04  
**Depends on:** `bim_canvas_standalone_master_spec_v1_1.md`

---

# 1. Purpose

Define the Archicad metadata convention and projection rules that allow custom-authored components to retain logical BIM meaning after IFC export.

Primary example:

> A window modeled from walls, beams, slabs, and glazing elements should still be queryable as a `WindowAssembly`.

---

# 2. Core principle

Do not falsify the physical IFC class.

A wall return remains `IfcWall`.  
A sill slab remains `IfcSlab`.  
A lintel beam remains `IfcBeam`.  

The system adds a logical semantic assembly above those physical elements.

---

# 3. Minimum Archicad metadata contract

Each physical member of a custom semantic component should carry these exported properties:

| Field | Example | Required | Purpose |
|---|---|---:|---|
| `Canvas.ComponentType` | `Window` | Yes | Logical component type |
| `Canvas.AssemblyId` | `WIN-023` | Yes | Groups physical members |
| `Canvas.MemberRole` | `Head`, `Sill`, `Jamb`, `Glazing` | Recommended | Role inside assembly |
| `Canvas.ComponentName` | `Kitchen North Window` | Recommended | Human-readable label |

Optional:

- `Canvas.ComponentVariant`
- `Canvas.ComponentSubtype`
- `Canvas.HostLevel`
- `Canvas.IsPrimaryComponent`
- `Canvas.SourceDefinition`

---

# 4. Supported component types

Initial supported values:

- `Window` → `WindowAssembly`
- `Door` → `DoorAssembly`
- `Stair` → `StairAssembly`
- `Joinery` → `JoineryAssembly`
- `FacadeModule` → `FacadeModuleAssembly`
- `Custom` → `CustomAssembly`

Unknown values may be preserved as custom semantic assembly kinds.

---

# 5. Projection rule

When projection encounters multiple physical elements with the same:

- `Canvas.ComponentType`
- `Canvas.AssemblyId`

it shall create one semantic assembly.

Example:

```text
Canvas.ComponentType = Window
Canvas.AssemblyId = WIN-023
```

creates:

```text
SemanticAssembly
  kind = WindowAssembly
  id = WIN-023
  members = all matching physical elements
  confidence = explicit
```

---

# 6. Member role mapping

Initial supported roles:

- `Head`
- `Sill`
- `Jamb`
- `Frame`
- `Mullion`
- `Transom`
- `Glazing`
- `Panel`
- `Host`
- `Trim`
- `Other`

Unknown roles should be preserved as strings and not discarded.

---

# 7. Semantic assembly schema

```ts
interface SemanticAssembly {
  id: string
  modelId: string
  kind: string
  sourceSystem: "Archicad"
  sourceRule: string
  label?: string
  confidence: "explicit" | "inferred"
  properties?: Record<string, unknown>
}

interface SemanticAssemblyMember {
  assemblyId: string
  elementId: string
  memberRole?: string
  ifcGlobalId?: string
  ifcClass?: string
}
```

---

# 8. Example custom window

| Element | IFC class | ComponentType | AssemblyId | MemberRole |
|---|---|---|---|---|
| wall return A | `IfcWall` | `Window` | `WIN-023` | `Jamb` |
| wall return B | `IfcWall` | `Window` | `WIN-023` | `Jamb` |
| slab sill | `IfcSlab` | `Window` | `WIN-023` | `Sill` |
| beam head | `IfcBeam` | `Window` | `WIN-023` | `Head` |
| glazing object | `IfcPlate` | `Window` | `WIN-023` | `Glazing` |

Result:

```text
WindowAssembly / WIN-023
  members:
    IfcWall / jamb
    IfcWall / jamb
    IfcSlab / sill
    IfcBeam / head
    IfcPlate / glazing
```

---

# 9. Query behaviour

A query for windows shall return both:

- true physical `IfcWindow` elements
- semantic `WindowAssembly` records

The UI should clearly distinguish:

- physical IFC class
- logical semantic type

---

# 10. Inspector behaviour

When a user selects a member element, the inspector should show:

- physical element identity
- IFC class
- IFC GlobalId
- semantic assembly membership
- member role
- source metadata fields
- connector rule id

When a user selects the assembly, the inspector should show:

- assembly kind
- assembly id
- component name
- all members
- roles
- confidence = explicit
- provenance summary

---

# 11. Test fixtures

Create small IFC fixtures for:

1. true `IfcWindow` only
2. custom window with explicit metadata
3. custom door with explicit metadata
4. mixed file containing both true IFC windows and semantic windows
5. invalid assembly metadata missing `AssemblyId`
6. unknown component type preserved as custom assembly

---

# 12. Acceptance criteria

- The projection pipeline creates `WindowAssembly` from explicit Archicad metadata.
- Member elements keep their original IFC classes.
- Query “show all windows” includes semantic window assemblies.
- Selecting an assembly highlights all members in the Fragments viewer.
- Selecting a member reveals its semantic parent assembly.
- Invalid or incomplete metadata produces a warning rather than silent failure.

---

# 13. Implementation status (2026-07-04)

Semantic assembly **projection** and **member-level inspector** behaviour are shipped. Assembly-aware querying, assembly selection, and assembly inspector views are not.

## 13.1 Shipped

| Requirement | Status | Path |
|---|---|---|
| Read `Canvas.ComponentType`, `Canvas.AssemblyId`, `Canvas.MemberRole`, `Canvas.ComponentName` from IFC properties | Yes | `ifcProjection.js` → `buildSemanticAssemblies()` |
| Create `WindowAssembly`, `DoorAssembly`, etc. from explicit metadata | Yes | same |
| Preserve physical IFC class on members | Yes | element records unchanged |
| Member inspector shows assembly + role | Yes | `BimInspector.jsx` |
| Confidence = explicit for connector metadata | Yes | assembly records |
| Warnings for incomplete metadata | Partial | pipeline warnings array |

## 13.2 Not yet shipped

| Requirement | Status |
|---|---|
| Query “show all windows” (IfcWindow + WindowAssembly) | Blocked on BQL executor |
| Assembly-level selection in viewer | Not built |
| Assembly inspector view (select assembly, show all members) | Not built |
| Assembly table mode | Not built |
| Test IFC fixtures (§11) | Not committed |
| Inference / heuristic assembly creation | Not built (deferred by design) |

## 13.3 Supported component type mapping (shipped)

`Window` → `WindowAssembly`, `Door` → `DoorAssembly`, `Stair` → `StairAssembly`, `Joinery` → `JoineryAssembly`, `FacadeModule` → `FacadeModuleAssembly`, `Custom` → `CustomAssembly`; unknown types preserved as custom assembly kinds.
