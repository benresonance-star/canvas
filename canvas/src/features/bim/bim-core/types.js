import { normalizeMeasurements, normalizeMeasureUnits } from '../../threeDArtifact/utils/measureSnap.js';
import { normalizeBimLightingState } from './bimLighting.js';
import { normalizeHiddenLayerState } from './bimLayerVisibility.js';
import { normalizeBimSectionState } from './bimSectioning.js';
import { normalizeBimResultSets } from './bimResultSets.js';
import { normalizeBim4dSequences } from './bim4d.js';
import { normalizeBim5dCostPlans } from './bim5d.js';
import { normalizeTableColumns, normalizeTableSort } from './bimTableColumns.js';
import { normalizeBimViewSets, resolveActiveViewSetId } from './bimViewSets.js';
import { normalizeBimEnvironmentalAnalysisState } from './bimSunStudy.js';

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
export const WIREFRAME_OPACITY_MIN = 0;
export const WIREFRAME_OPACITY_MAX = 1;
export const WIREFRAME_OPACITY_DEFAULT = 0.88;
export const WIREFRAME_TRANSPARENCY_MIN = 0;
export const WIREFRAME_TRANSPARENCY_MAX = 1;
export const WIREFRAME_COLOR_DEFAULT = '#0f172a';
export const WIREFRAME_HIDDEN_LINES_DEFAULT = true;
/** Max per-line opacity for full (all-edges) wireframe — overlapping lines compound quickly. */
export const WIREFRAME_DENSE_OPACITY_MAX = 0.38;
export const WIREFRAME_DENSE_OPACITY_EXPONENT = 2.75;

/** Line opacity from transparency (0 = solid lines, 1 = invisible lines / clay only). */
export function wireframeLineOpacityFromTransparency(transparency, { denseEdges = false } = {}) {
  const numeric = Number(transparency);
  if (!Number.isFinite(numeric)) {
    return wireframeLineOpacityFromTransparency(WIREFRAME_TRANSPARENCY_MIN, { denseEdges });
  }
  const clamped = Math.min(
    WIREFRAME_TRANSPARENCY_MAX,
    Math.max(WIREFRAME_TRANSPARENCY_MIN, numeric),
  );
  const visibility = WIREFRAME_OPACITY_MAX - clamped;
  if (denseEdges) {
    return WIREFRAME_DENSE_OPACITY_MAX * visibility ** WIREFRAME_DENSE_OPACITY_EXPONENT;
  }
  return visibility;
}

/** Transparency from line opacity (inverse of wireframeLineOpacityFromTransparency). */
export function wireframeTransparencyFromLineOpacity(opacity, { denseEdges = false } = {}) {
  const numeric = Number(opacity);
  if (!Number.isFinite(numeric)) {
    return wireframeTransparencyFromLineOpacity(WIREFRAME_OPACITY_DEFAULT, { denseEdges });
  }
  const clamped = Math.min(
    WIREFRAME_OPACITY_MAX,
    Math.max(WIREFRAME_OPACITY_MIN, numeric),
  );
  if (denseEdges) {
    if (clamped <= 0) return WIREFRAME_TRANSPARENCY_MAX;
    const visibility = Math.min(1, clamped / WIREFRAME_DENSE_OPACITY_MAX);
    return WIREFRAME_TRANSPARENCY_MAX - visibility ** (1 / WIREFRAME_DENSE_OPACITY_EXPONENT);
  }
  return WIREFRAME_TRANSPARENCY_MAX - clamped;
}

export const BIM_RENDER_STYLES = ['standard', 'clay'];
export const BIM_VIEWER_DEFAULTS = {
  displayMode: 'highlight',
  renderStyle: 'standard',
  hiddenStoreys: [],
  hiddenLayers: [],
  isolateOnSelect: false,
};
export const DEFAULT_LEFT_PANEL_WIDTH = 320;
export const DEFAULT_RIGHT_PANEL_WIDTH = 320;
export const MIN_PANEL_WIDTH = 240;
export const MAX_PANEL_WIDTH = 720;

export function normalizeLeftPanelWidth(value) {
  return normalizePanelWidth(value, DEFAULT_LEFT_PANEL_WIDTH);
}

export function normalizeRightPanelWidth(value) {
  return normalizePanelWidth(value, DEFAULT_RIGHT_PANEL_WIDTH);
}

function normalizePanelWidth(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(numeric)));
}
export const VIEWPORT_BACKGROUND_DEFAULT = '#171412';
export const CLAY_BACKGROUND_DEFAULT = '#ffffff';
export const CLAY_SURFACE_COLOR_DEFAULT = '#f8f8f8';
export const CLAY_AO_INTENSITY_MIN = 0;
export const CLAY_AO_INTENSITY_MAX = 100;
export const CLAY_AO_INTENSITY_DEFAULT = 0;
export const CLAY_AO_RADIUS_MIN = 0.0005;
export const CLAY_AO_RADIUS_MAX = 0.05;
export const CLAY_AO_RADIUS_DEFAULT = 0.0005;
export const CLAY_SSAO_KERNEL_RADIUS_FLOOR = CLAY_AO_RADIUS_MIN;
export const CLAY_AO_BIAS_MIN = 0.05;
export const CLAY_AO_BIAS_MAX = 0.2;
export const CLAY_AO_BIAS_DEFAULT = 0.05;
export const CLAY_AO_DISTANCE_MIN = 0;
export const CLAY_AO_DISTANCE_MAX = 1;
export const CLAY_AO_DISTANCE_DEFAULT = 0.17;
export const CLAY_AO_SAMPLES_MIN = 8;
export const CLAY_AO_SAMPLES_MAX = 256;
export const CLAY_AO_SAMPLES_DEFAULT = 256;
export const CLAY_AO_RESOLUTION_MIN = 0.25;
export const CLAY_AO_RESOLUTION_MAX = 1;
export const CLAY_AO_RESOLUTION_DEFAULT = 1;
export const CLAY_LIGHT_INTENSITY_MIN = 0;
export const CLAY_LIGHT_INTENSITY_MAX = 10;
export const CLAY_LIGHT_INTENSITY_DEFAULT = 2.7;
export const CLAY_GLASS_OPACITY_MIN = 0.05;
export const CLAY_GLASS_OPACITY_MAX = 0.5;
export const CLAY_GLASS_OPACITY_DEFAULT = 0.31;
export const CLAY_ORIGINAL_COLOR_BLEND_MIN = 0;
export const CLAY_ORIGINAL_COLOR_BLEND_MAX = 1;
export const CLAY_ORIGINAL_COLOR_BLEND_DEFAULT = 1;

function clampClayValue(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeViewportStyle(state = {}) {
  const backgroundColor = String(
    state?.viewportBackgroundColor
    ?? state?.clayBackgroundColor
    ?? VIEWPORT_BACKGROUND_DEFAULT,
  );
  return {
    viewportBackgroundColor: /^#[0-9a-fA-F]{6}$/.test(backgroundColor)
      ? backgroundColor
      : VIEWPORT_BACKGROUND_DEFAULT,
  };
}

export function normalizeClayStyle(state = {}) {
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
    clayAoSamples: clampClayValue(
      state?.clayAoSamples,
      CLAY_AO_SAMPLES_MIN,
      CLAY_AO_SAMPLES_MAX,
      CLAY_AO_SAMPLES_DEFAULT,
    ),
    clayAoResolution: clampClayValue(
      state?.clayAoResolution,
      CLAY_AO_RESOLUTION_MIN,
      CLAY_AO_RESOLUTION_MAX,
      CLAY_AO_RESOLUTION_DEFAULT,
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
    clayOriginalColorBlend: clampClayValue(
      state?.clayOriginalColorBlend,
      CLAY_ORIGINAL_COLOR_BLEND_MIN,
      CLAY_ORIGINAL_COLOR_BLEND_MAX,
      CLAY_ORIGINAL_COLOR_BLEND_DEFAULT,
    ),
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
    wireframeHiddenLines: state?.wireframeHiddenLines !== false,
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
  const rawDisplayMode = BIM_DISPLAY_MODES.includes(state?.displayMode) ? state.displayMode : 'highlight';
  const displayMode = rawDisplayMode === 'isolate' ? 'highlight' : rawDisplayMode;
  const isolateOnSelect = state?.isolateOnSelect === true;
  const viewSets = normalizeBimViewSets(state?.viewSets);
  const activeViewSetId = resolveActiveViewSetId(viewSets, state?.activeViewSetId);
  const tableColumns = normalizeTableColumns(state?.tableColumns);
  return {
    selectedObjectId: state?.selectedObjectId ?? null,
    selectedObjectKind: state?.selectedObjectKind ?? 'physicalElement',
    displayMode,
    isolateOnSelect,
    hiddenStoreys: normalizeHiddenLayerState(state?.hiddenStoreys),
    hiddenLayers: normalizeHiddenLayerState(state?.hiddenLayers),
    section: normalizeBimSectionState(state?.section ?? {}),
    tableSearch: String(state?.tableSearch ?? ''),
    inspectorSearch: String(state?.inspectorSearch ?? ''),
    ifcClassFilter: String(state?.ifcClassFilter ?? ''),
    tableColumns,
    tableSort: normalizeTableSort(state?.tableSort, tableColumns),
    panels: {
      left: panels.left !== false,
      right: panels.right !== false,
    },
    leftPanelWidth: normalizeLeftPanelWidth(state?.leftPanelWidth),
    rightPanelWidth: normalizeRightPanelWidth(state?.rightPanelWidth),
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
    ...normalizeViewportStyle(state),
    ...normalizeWireframeStyle(state),
    ...normalizeClayStyle(state),
    ...normalizeBimLightingState(state),
    savedResultSets: normalizeBimResultSets(state?.savedResultSets),
    bim4dSequences: normalizeBim4dSequences(state?.bim4dSequences),
    active4dSequenceId: state?.active4dSequenceId == null ? null : String(state.active4dSequenceId),
    active4dTaskId: state?.active4dTaskId == null ? null : String(state.active4dTaskId),
    bim5dCostPlans: normalizeBim5dCostPlans(state?.bim5dCostPlans),
    active5dCostPlanId: state?.active5dCostPlanId == null ? null : String(state.active5dCostPlanId),
    environmentalAnalysis: normalizeBimEnvironmentalAnalysisState(state?.environmentalAnalysis),
    savedQueries,
    viewSets,
    activeViewSetId,
    activeViewId: state?.activeViewId == null ? null : String(state.activeViewId),
    viewCarouselOpen: state?.viewCarouselOpen === true,
    lastOpenedAt: state?.lastOpenedAt ?? null,
    updatedAt: state?.updatedAt ?? null,
  };
}

/** Reset viewport display fields to the standard open defaults (highlight, all layers on). */
export function applyBimViewerDefaults(state = {}) {
  return normalizeBimWorkspaceState({
    ...state,
    ...BIM_VIEWER_DEFAULTS,
    section: normalizeBimSectionState({
      ...(state?.section ?? {}),
      enabled: false,
    }),
  });
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
