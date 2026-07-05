import { normalizeBimLightingState } from './bimLighting.js';
import { normalizeHiddenLayerState } from './bimLayerVisibility.js';
import { BIM_DISPLAY_MODES, normalizeClayStyle, normalizeViewportStyle, normalizeWireframeStyle } from './types.js';

export const BIM_STYLE_SETTINGS_SCHEMA_VERSION = 1;

function normalizeStyleDisplayMode(mode) {
  return mode === 'ghostOthers' ? 'ghostOthers' : 'highlight';
}

function normalizeStyleIsolateOnSelect(state = {}) {
  return state?.isolateOnSelect === true;
}

/** Normalized BIM viewport style payload stored in Postgres JSONB. */
export function normalizeBimStyleSettings(state = {}) {
  const clay = normalizeClayStyle(state);
  return {
    schemaVersion: BIM_STYLE_SETTINGS_SCHEMA_VERSION,
    renderStyle: clay.renderStyle,
    wireframeMode: state?.wireframeMode === true,
    displayMode: normalizeStyleDisplayMode(
      BIM_DISPLAY_MODES.includes(state?.displayMode) ? state.displayMode : 'highlight',
    ),
    isolateOnSelect: normalizeStyleIsolateOnSelect(state),
    ...normalizeViewportStyle(state),
    ...normalizeWireframeStyle(state),
    clayAoIntensity: clay.clayAoIntensity,
    clayAoRadius: clay.clayAoRadius,
    clayAoBias: clay.clayAoBias,
    clayAoDistance: clay.clayAoDistance,
    clayAoSamples: clay.clayAoSamples,
    clayAoResolution: clay.clayAoResolution,
    clayLightIntensity: clay.clayLightIntensity,
    claySurfaceColor: clay.claySurfaceColor,
    clayGlassOpacity: clay.clayGlassOpacity,
    clayOriginalColorBlend: clay.clayOriginalColorBlend,
    ...normalizeBimLightingState(state),
  };
}

export function extractBimStyleSettings(state = {}) {
  return normalizeBimStyleSettings(state);
}

/** Merge a saved style preset into workspace state (style fields only). */
export function applyBimStyleSettings(workspaceState = {}, styleSettings = {}) {
  const normalized = normalizeBimStyleSettings({ ...workspaceState, ...styleSettings });
  const { schemaVersion, ...patch } = normalized;
  return patch;
}
