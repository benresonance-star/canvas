import { normalizeMeasurements, normalizeMeasureUnits } from '../../threeDArtifact/utils/measureSnap.js';
import { normalizeBimLightingState } from './bimLighting.js';

export const BIM_PREPARATION_PHASES = [
  'preparing',
  'converting_ifc',
  'extracting_properties',
  'building_index',
  'ready',
];

export const BIM_DISPLAY_MODES = ['highlight', 'isolate', 'ghostOthers', 'colorBy'];

export const BIM_PROJECTION_MODES = ['perspective', 'orthographic'];

export const WIREFRAME_LINE_WEIGHT_MIN = 0.5;
export const WIREFRAME_LINE_WEIGHT_MAX = 6;
export const WIREFRAME_LINE_WEIGHT_DEFAULT = 2;
export const WIREFRAME_OPACITY_MIN = 0.05;
export const WIREFRAME_OPACITY_MAX = 1;
export const WIREFRAME_OPACITY_DEFAULT = 0.88;
export const WIREFRAME_COLOR_DEFAULT = '#0f172a';

function clampWireframeValue(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeWireframeStyle(state = {}) {
  const color = String(state?.wireframeColor ?? WIREFRAME_COLOR_DEFAULT);
  return {
    wireframeLineWeight: clampWireframeValue(
      state?.wireframeLineWeight,
      WIREFRAME_LINE_WEIGHT_MIN,
      WIREFRAME_LINE_WEIGHT_MAX,
      WIREFRAME_LINE_WEIGHT_DEFAULT,
    ),
    wireframeOpacity: clampWireframeValue(
      state?.wireframeOpacity,
      WIREFRAME_OPACITY_MIN,
      WIREFRAME_OPACITY_MAX,
      WIREFRAME_OPACITY_DEFAULT,
    ),
    wireframeColor: /^#[0-9a-fA-F]{6}$/.test(color) ? color : WIREFRAME_COLOR_DEFAULT,
  };
}

const BIM_FOV_MIN = 10;
const BIM_FOV_MAX = 120;
const BIM_FOV_DEFAULT = 45;

function finiteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function clampBimFov(value) {
  const numeric = finiteNumber(Number(value));
  if (numeric == null) return BIM_FOV_DEFAULT;
  return Math.min(BIM_FOV_MAX, Math.max(BIM_FOV_MIN, numeric));
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
  const zoom = finiteNumber(Number(camera.zoom));
  return {
    position,
    target,
    up,
    fov: clampBimFov(camera.fov),
    zoom: zoom != null && zoom > 0 ? zoom : 1,
    viewHeight: finiteNumber(Number(camera.viewHeight)),
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
  const savedQueries = Array.isArray(state?.savedQueries)
    ? state.savedQueries
      .filter((entry) => entry?.id && entry?.query && typeof entry.query === 'object')
      .slice(0, 20)
      .map((entry) => ({
        id: String(entry.id),
        label: String(entry.label ?? 'Saved query'),
        query: entry.query,
        createdAt: entry.createdAt ?? null,
        lastRunAt: entry.lastRunAt ?? null,
      }))
    : [];
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
    projectionMode: BIM_PROJECTION_MODES.includes(state?.projectionMode)
      ? state.projectionMode
      : 'perspective',
    measurements: normalizeMeasurements(state?.measurements),
    measureUnits: normalizeMeasureUnits(state?.measureUnits ?? 'm'),
    measureSnapMode: state?.measureSnapMode === 'edge' ? 'edge' : 'vertex',
    measureKind: state?.measureKind === 'polyline' ? 'polyline' : 'segment',
    measurementsVisible: state?.measurementsVisible !== false,
    wireframeMode: state?.wireframeMode === true,
    ...normalizeWireframeStyle(state),
    ...normalizeBimLightingState(state),
    savedQueries,
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
