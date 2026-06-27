import { audioSkinUsesDarkText, normalizeAudioSkinColor } from '../../../lib/audioSkin.js';
import {
  FLOW_LOCAL_NODE_TYPE_ARTIFACT,
  FLOW_LOCAL_NODE_TYPES,
  normalizeFlowLocalNodeType,
} from './flowLocalNodeTypes.js';

/** @type {Record<string, string>} */
export const FLOW_LOCAL_NODE_TYPE_DEFAULT_COLORS = Object.freeze(
  Object.fromEntries(FLOW_LOCAL_NODE_TYPES.map((type) => {
    switch (type.id) {
      case 'artifact': return [type.id, '#2563eb'];
      case 'decision': return [type.id, '#059669'];
      case 'external_resource': return [type.id, '#dc2626'];
      default: return [type.id, '#2563eb'];
    }
  })),
);

/**
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
export function normalizeFlowLocalNodeTypeColors(value) {
  let source = value;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    source = { ...source };
    if (source.step != null && source.decision == null) {
      source.decision = source.step;
    }
    delete source.step;
  }
  const normalized = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { ...FLOW_LOCAL_NODE_TYPE_DEFAULT_COLORS };
  }
  for (const type of FLOW_LOCAL_NODE_TYPES) {
    const raw = /** @type {Record<string, unknown>} */ (source)[type.id];
    const hex = normalizeAudioSkinColor(raw);
    normalized[type.id] = hex ?? FLOW_LOCAL_NODE_TYPE_DEFAULT_COLORS[type.id];
  }
  return normalized;
}

/**
 * @param {unknown} colors
 * @param {unknown} typeId
 */
export function resolveFlowLocalNodeTypeColor(colors, typeId) {
  const normalized = normalizeFlowLocalNodeTypeColors(colors);
  const id = normalizeFlowLocalNodeType(typeId);
  return normalized[id] ?? FLOW_LOCAL_NODE_TYPE_DEFAULT_COLORS[FLOW_LOCAL_NODE_TYPE_ARTIFACT];
}

/**
 * @param {unknown} colors
 * @param {string} typeId
 * @param {unknown} nextColor
 */
export function patchFlowLocalNodeTypeColor(colors, typeId, nextColor) {
  const id = normalizeFlowLocalNodeType(typeId);
  const hex = normalizeAudioSkinColor(nextColor);
  if (!hex) return normalizeFlowLocalNodeTypeColors(colors);
  return {
    ...normalizeFlowLocalNodeTypeColors(colors),
    [id]: hex,
  };
}

/**
 * @param {string} hex
 */
export function flowLocalNodeHeaderUsesDarkText(hex) {
  return audioSkinUsesDarkText(hex);
}

/**
 * @param {unknown} value
 */
export function validateFlowLocalNodeTypeColors(value) {
  if (value == null) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('flow localNodeTypeColors must be an object');
  }
  for (const [key, raw] of Object.entries(value)) {
    if (!FLOW_LOCAL_NODE_TYPE_DEFAULT_COLORS[key]) continue;
    if (normalizeAudioSkinColor(raw) == null) {
      throw new Error(`invalid flow local node type color for ${key}`);
    }
  }
}
