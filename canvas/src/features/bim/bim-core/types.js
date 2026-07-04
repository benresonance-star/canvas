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

export const BIM_RENDER_STYLES = ['standard', 'clay'];
export const CLAY_BACKGROUND_DEFAULT = '#ffffff';
export const CLAY_SURFACE_COLOR_DEFAULT = '#f8f8f8';
export const CLAY_AO_INTENSITY_MIN = 0;
export const CLAY_AO_INTENSITY_MAX = 20;
export const CLAY_AO_INTENSITY_DEFAULT = 2;
export const CLAY_AO_RADIUS_MIN = 0.05;
export const CLAY_AO_RADIUS_MAX = 10;
export const CLAY_AO_RADIUS_DEFAULT = 2;
export const CLAY_AO_BIAS_MIN = 0.01;
export const CLAY_AO_BIAS_MAX = 1;
export const CLAY_AO_BIAS_DEFAULT = 0.01;
export const CLAY_AO_DISTANCE_MIN = 0.005;
export const CLAY_AO_DISTANCE_MAX = 0.3;
export const CLAY_AO_DISTANCE_DEFAULT = 0.1;
export const CLAY_LIGHT_INTENSITY_MIN = 0;
export const CLAY_LIGHT_INTENSITY_MAX = 10;
export const CLAY_LIGHT_INTENSITY_DEFAULT = 0.55;
export const CLAY_GLASS_OPACITY_MIN = 0.05;
export const CLAY_GLASS_OPACITY_MAX = 0.5;
export const CLAY_GLASS_OPACITY_DEFAULT = 0.18;

function clampClayValue(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeClayStyle(state = {}) {
  const backgroundColor = String(state?.clayBackgroundColor ?? CLAY_BACKGROUND_DEFAULT);
  const surfaceColor = String(state?.claySurfaceColor ?? CLAY_SURFACE_COLOR_DEFAULT);
  return {
    renderStyle: BIM_RENDER_STYLES.includes(state?.renderStyle) ? state.renderStyle : 'standard',
    clayAoIntensity: clampClayValue(
      state?.clayAoIntensity,
      CLAY_AO_INTENSITY_MIN,
      CLAY_AO_INTENSITY_MAX,
      CLAY_AO_INTENSITY_DEFAULT,
    ),
    clayAoRadius: clampClayValue(
      state?.clayAoRadius,
      CLAY_AO_RADIUS_MIN,
      CLAY_AO_RADIUS_MAX,
      CLAY_AO_RADIUS_DEFAULT,
    ),
    clayAoBias: clampClayValue(
      state?.clayAoBias,
      CLAY_AO_BIAS_MIN,
      CLAY_AO_BIAS_MAX,
      CLAY_AO_BIAS_DEFAULT,
    ),
    clayAoDistance: clampClayValue(
      state?.clayAoDistance,
      CLAY_AO_DISTANCE_MIN,
      CLAY_AO_DISTANCE_MAX,
      CLAY_AO_DISTANCE_DEFAULT,
    ),
    clayLightIntensity: clampClayValue(
      state?.clayLightIntensity,
      CLAY_LIGHT_INTENSITY_MIN,
      CLAY_LIGHT_INTENSITY_MAX,
      CLAY_LIGHT_INTENSITY_DEFAULT,
    ),
    clayGlassOpacity: clampClayValue(
      state?.clayGlassOpacity,
      CLAY_GLASS_OPACITY_MIN,
      CLAY_GLASS_OPACITY_MAX,
      CLAY_GLASS_OPACITY_DEFAULT,
    ),
    clayBackgroundColor: /^#[0-9a-fA-F]{6}$/.test(backgroundColor) ? backgroundColor : CLAY_BACKGROUND_DEFAULT,
    claySurfaceColor: /^#[0-9a-fA-F]{6}$/.test(surfaceColor) ? surfaceColor : CLAY_SURFACE_COLOR_DEFAULT,
  };
}

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
    ...normalizeClayStyle(state),
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
