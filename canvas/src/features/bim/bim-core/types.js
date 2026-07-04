export const BIM_PREPARATION_PHASES = [
  'preparing',
  'converting_ifc',
  'extracting_properties',
  'building_index',
  'ready',
];

export const BIM_DISPLAY_MODES = ['highlight', 'isolate', 'ghostOthers'];

function finiteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

export function normalizeBimCameraState(camera = null) {
  if (!camera || typeof camera !== 'object') return null;
  const position = Array.isArray(camera.position) ? camera.position.map(Number) : null;
  const target = Array.isArray(camera.target) ? camera.target.map(Number) : null;
  const up = Array.isArray(camera.up) ? camera.up.map(Number) : [0, 1, 0];
  if (
    position?.length !== 3
    || target?.length !== 3
    || up.length !== 3
    || [...position, ...target, ...up].some((value) => !Number.isFinite(value))
  ) {
    return null;
  }
  return {
    position,
    target,
    up,
    fov: finiteNumber(Number(camera.fov)) ?? 45,
    near: finiteNumber(Number(camera.near)),
    far: finiteNumber(Number(camera.far)),
  };
}

export function emptyPreparedBimModel(metadata = {}) {
  return {
    metadata,
    fragmentsBlob: null,
    elements: [],
    properties: [],
    relationships: [],
    provenance: [],
    semanticAssemblies: [],
    assemblyMembers: [],
    warnings: [],
  };
}

export function normalizeBimWorkspaceState(state = {}) {
  const panels = state?.panels && typeof state.panels === 'object' ? state.panels : {};
  return {
    selectedObjectId: state?.selectedObjectId ?? null,
    selectedObjectKind: state?.selectedObjectKind ?? 'physicalElement',
    displayMode: BIM_DISPLAY_MODES.includes(state?.displayMode) ? state.displayMode : 'highlight',
    tableSearch: String(state?.tableSearch ?? ''),
    ifcClassFilter: String(state?.ifcClassFilter ?? ''),
    panels: {
      left: panels.left !== false,
      right: panels.right !== false,
    },
    camera: normalizeBimCameraState(state?.camera),
    lastOpenedAt: state?.lastOpenedAt ?? null,
    updatedAt: state?.updatedAt ?? null,
  };
}

export function componentTypeToAssemblyKind(componentType) {
  const value = String(componentType ?? '').trim();
  if (!value) return null;
  const known = {
    Window: 'WindowAssembly',
    Door: 'DoorAssembly',
    Stair: 'StairAssembly',
    Joinery: 'JoineryAssembly',
    FacadeModule: 'FacadeModuleAssembly',
    Custom: 'CustomAssembly',
  };
  return known[value] ?? `${value.replace(/\s+/g, '')}Assembly`;
}
