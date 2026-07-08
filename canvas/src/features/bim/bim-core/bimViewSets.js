import { normalizeBimViewCameraState } from './bimCamera.js';
import { extractBimStyleSettings } from './bimStyleSettings.js';
import { normalizeHiddenLayerState } from './bimLayerVisibility.js';
import { normalizeBimSectionState } from './bimSectioning.js';
import {
  BIM_DISPLAY_MODES,
  BIM_PROJECTION_MODES,
} from './types.js';

export const BIM_VIEW_STATE_SCHEMA_VERSION = 1;
export const BIM_VIEW_SET_LIMIT = 12;
export const BIM_VIEW_LIMIT = 40;
export const BIM_VIEW_PER_SET_LIMIT = 40;
export const BIM_VIEW_SET_NAME_MAX = 40;
export const BIM_VIEW_LABEL_MAX = 60;
export const DEFAULT_VIEW_SET_NAME = 'Views';

function safeIsoDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function createId(prefix) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function resolveViewProjectionMode(state = {}) {
  if (BIM_PROJECTION_MODES.includes(state?.projectionMode)) {
    return state.projectionMode;
  }
  if (state?.isPerspective === false) return 'orthographic';
  if (state?.isPerspective === true) return 'perspective';
  return 'perspective';
}

function normalizeViewState(state = {}) {
  const style = extractBimStyleSettings(state);
  const { schemaVersion: styleSchemaVersion, ...stylePatch } = style;
  const rawDisplayMode = BIM_DISPLAY_MODES.includes(state?.displayMode) ? state.displayMode : 'highlight';
  const projectionMode = resolveViewProjectionMode(state);
  const isPerspective = projectionMode === 'perspective';
  const cameraInput = isPerspective && Number.isFinite(Number(state?.fieldOfView))
    ? { ...state?.camera, fov: state.fieldOfView }
    : state?.camera;
  const camera = normalizeBimViewCameraState(cameraInput, projectionMode);
  const fieldOfView = isPerspective ? (camera?.fov ?? null) : null;
  return {
    schemaVersion: BIM_VIEW_STATE_SCHEMA_VERSION,
    camera,
    projectionMode,
    isPerspective,
    fieldOfView,
    section: normalizeBimSectionState(state?.section ?? {}),
    hiddenStoreys: normalizeHiddenLayerState(state?.hiddenStoreys),
    hiddenLayers: normalizeHiddenLayerState(state?.hiddenLayers),
    displayMode: rawDisplayMode === 'isolate' ? 'highlight' : rawDisplayMode,
    isolateOnSelect: state?.isolateOnSelect === true,
    ...stylePatch,
  };
}

export function normalizeBimView(entry, index = 0) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const id = String(entry.id ?? `bim-view-${index}`);
  const createdAt = safeIsoDate(entry.createdAt, new Date(0).toISOString());
  const state = normalizeViewState(entry.state ?? {});
  if (!state.camera) return null;
  return {
    id,
    label: String(entry.label ?? `View ${index + 1}`).slice(0, BIM_VIEW_LABEL_MAX),
    thumbnailKey: String(entry.thumbnailKey ?? id),
    createdAt,
    updatedAt: safeIsoDate(entry.updatedAt, createdAt),
    state,
  };
}

export function normalizeBimViewSet(entry, index = 0) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const views = Array.isArray(entry.views)
    ? entry.views
      .map((view, viewIndex) => normalizeBimView(view, viewIndex))
      .filter(Boolean)
      .slice(0, BIM_VIEW_PER_SET_LIMIT)
    : [];
  return {
    id: String(entry.id ?? `bim-view-set-${index}`),
    name: String(entry.name ?? DEFAULT_VIEW_SET_NAME).slice(0, BIM_VIEW_SET_NAME_MAX),
    order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : index,
    views,
  };
}

export function normalizeBimViewSets(values) {
  if (!Array.isArray(values)) return [];
  const sets = values
    .map((entry, index) => normalizeBimViewSet(entry, index))
    .filter(Boolean)
    .slice(0, BIM_VIEW_SET_LIMIT);
  let totalViews = 0;
  return sets.map((set) => {
    const remaining = BIM_VIEW_LIMIT - totalViews;
    const views = set.views.slice(0, Math.max(0, remaining));
    totalViews += views.length;
    return { ...set, views };
  });
}

export function extractViewStateFromWorkspace(workspaceState = {}, liveSnapshot = {}) {
  return normalizeViewState({
    ...workspaceState,
    ...liveSnapshot,
    camera: liveSnapshot?.camera ?? workspaceState?.camera,
    projectionMode: liveSnapshot?.projectionMode ?? workspaceState?.projectionMode,
  });
}

export function createBimViewWorkspaceSnapshot(workspaceState = {}, liveSnapshot = {}) {
  return extractViewStateFromWorkspace(workspaceState, liveSnapshot);
}

export function createBimViewSet({
  name = DEFAULT_VIEW_SET_NAME,
  order = 0,
  now = new Date().toISOString(),
} = {}) {
  return normalizeBimViewSet({
    id: createId('bim-view-set'),
    name,
    order,
    views: [],
    createdAt: now,
    updatedAt: now,
  });
}

export function createBimViewFromWorkspaceState({
  label = 'View',
  workspaceState = {},
  liveSnapshot = null,
  thumbnailKey = null,
  now = new Date().toISOString(),
} = {}) {
  const id = createId('bim-view');
  return normalizeBimView({
    id,
    label,
    thumbnailKey: thumbnailKey ?? id,
    createdAt: now,
    updatedAt: now,
    state: extractViewStateFromWorkspace(workspaceState, liveSnapshot ?? {}),
  });
}

export function findBimView(viewSets = [], viewId) {
  const wanted = String(viewId ?? '');
  if (!wanted) return { view: null, viewSet: null };
  for (const viewSet of viewSets) {
    const view = viewSet.views.find((entry) => entry.id === wanted);
    if (view) return { view, viewSet };
  }
  return { view: null, viewSet: null };
}

export function findBimViewSet(viewSets = [], setId) {
  const wanted = String(setId ?? '');
  if (!wanted) return null;
  return viewSets.find((entry) => entry.id === wanted) ?? null;
}

export function upsertBimViewSet(viewSets = [], viewSet) {
  const normalized = normalizeBimViewSet(viewSet);
  if (!normalized) return viewSets;
  const index = viewSets.findIndex((entry) => entry.id === normalized.id);
  if (index === -1) return [...viewSets, normalized].slice(0, BIM_VIEW_SET_LIMIT);
  const next = [...viewSets];
  next[index] = normalized;
  return next;
}

export function addBimViewToSet(viewSets = [], setId, view) {
  const normalizedView = normalizeBimView(view);
  if (!normalizedView) return viewSets;
  return viewSets.map((set) => {
    if (set.id !== setId) return set;
    const withoutDuplicate = set.views.filter((entry) => entry.id !== normalizedView.id);
    return {
      ...set,
      views: [normalizedView, ...withoutDuplicate].slice(0, BIM_VIEW_PER_SET_LIMIT),
    };
  });
}

export function updateBimViewInSets(viewSets = [], viewId, patch = {}) {
  const wanted = String(viewId ?? '');
  if (!wanted) return viewSets;
  const now = new Date().toISOString();
  return viewSets.map((set) => ({
    ...set,
    views: set.views.map((view) => {
      if (view.id !== wanted) return view;
      const next = {
        ...view,
        ...patch,
        label: patch.label != null
          ? String(patch.label).slice(0, BIM_VIEW_LABEL_MAX)
          : view.label,
        updatedAt: now,
        state: patch.state ? normalizeViewState({ ...view.state, ...patch.state }) : view.state,
      };
      return normalizeBimView(next) ?? view;
    }),
  }));
}

export function deleteBimViewFromSets(viewSets = [], viewId) {
  const wanted = String(viewId ?? '');
  if (!wanted) return viewSets;
  return viewSets.map((set) => ({
    ...set,
    views: set.views.filter((view) => view.id !== wanted),
  }));
}

export function deleteBimViewSetFromSets(viewSets = [], setId) {
  const wanted = String(setId ?? '');
  if (!wanted) return viewSets;
  return viewSets.filter((set) => set.id !== wanted);
}

export function renameBimViewSet(viewSets = [], setId, name) {
  const wanted = String(setId ?? '');
  if (!wanted) return viewSets;
  return viewSets.map((set) => (
    set.id === wanted
      ? { ...set, name: String(name ?? set.name).slice(0, BIM_VIEW_SET_NAME_MAX) }
      : set
  ));
}

export function ensureDefaultViewSet(viewSets = []) {
  const normalized = normalizeBimViewSets(viewSets);
  if (normalized.length > 0) return normalized;
  const created = createBimViewSet({ name: DEFAULT_VIEW_SET_NAME, order: 0 });
  return created ? [created] : [];
}

export function resolveActiveViewSetId(viewSets = [], activeViewSetId = null) {
  const normalized = normalizeBimViewSets(viewSets);
  if (normalized.length === 0) return null;
  if (activeViewSetId && normalized.some((set) => set.id === activeViewSetId)) {
    return activeViewSetId;
  }
  return normalized[0].id;
}

export function applyBimViewStatePatch(viewState = {}) {
  const normalized = normalizeViewState(viewState);
  const {
    camera,
    projectionMode,
    section,
    hiddenStoreys,
    hiddenLayers,
    displayMode,
    isolateOnSelect,
    schemaVersion,
    isPerspective,
    fieldOfView,
    ...stylePatch
  } = normalized;
  return {
    camera,
    projectionMode,
    section,
    hiddenStoreys,
    hiddenLayers,
    displayMode,
    isolateOnSelect,
    ...stylePatch,
  };
}
