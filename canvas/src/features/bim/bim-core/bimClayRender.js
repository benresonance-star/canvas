import * as THREE from 'three';
import { RenderedFaces } from '@thatopen/fragments';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { renderWireframeOverlayPass } from './bimWireframeOverlay.js';
import {
  renderClaySelectionOverlayPass,
} from './bimClaySelectionOverlay.js';
import { chunkLocalIds } from './bimPickPipeline.js';
import { resolveFragmentsLocalIdsByGlobalIds, isValidFragmentsLocalId } from './fragmentsSelection.js';
import {
  CLAY_AO_BIAS_DEFAULT,
  CLAY_AO_BIAS_MAX,
  CLAY_AO_BIAS_MIN,
  CLAY_AO_DISTANCE_DEFAULT,
  CLAY_AO_DISTANCE_MAX,
  CLAY_AO_DISTANCE_MIN,
  CLAY_AO_INTENSITY_DEFAULT,
  CLAY_AO_INTENSITY_MAX,
  CLAY_AO_INTENSITY_MIN,
  CLAY_AO_RADIUS_DEFAULT,
  CLAY_AO_RADIUS_MAX,
  CLAY_AO_RADIUS_MIN,
  CLAY_AO_SAMPLES_DEFAULT,
  CLAY_AO_SAMPLES_MAX,
  CLAY_AO_SAMPLES_MIN,
  CLAY_AO_RESOLUTION_DEFAULT,
  CLAY_AO_RESOLUTION_MAX,
  CLAY_AO_RESOLUTION_MIN,
  CLAY_SSAO_KERNEL_RADIUS_FLOOR,
  CLAY_BACKGROUND_DEFAULT,
  CLAY_GLASS_OPACITY_DEFAULT,
  CLAY_LIGHT_INTENSITY_DEFAULT,
  CLAY_SURFACE_COLOR_DEFAULT,
  normalizeClayStyle,
} from './types.js';
import { applyBimStyleSettings } from './bimStyleSettings.js';
import { populateScreenDepthFromScene } from './bimScreenDepth.js';
import { createClayApplyStats, publishClayDebugMarker } from './bimClayDebug.js';
export { populateScreenDepthFromScene } from './bimScreenDepth.js';

export {
  CLAY_AO_BIAS_DEFAULT,
  CLAY_AO_BIAS_MAX,
  CLAY_AO_BIAS_MIN,
  CLAY_AO_DISTANCE_DEFAULT,
  CLAY_AO_DISTANCE_MAX,
  CLAY_AO_DISTANCE_MIN,
  CLAY_AO_INTENSITY_DEFAULT,
  CLAY_AO_INTENSITY_MAX,
  CLAY_AO_INTENSITY_MIN,
  CLAY_AO_RADIUS_DEFAULT,
  CLAY_AO_RADIUS_MAX,
  CLAY_AO_RADIUS_MIN,
  CLAY_SSAO_KERNEL_RADIUS_FLOOR,
  CLAY_BACKGROUND_DEFAULT,
  CLAY_GLASS_OPACITY_DEFAULT,
  CLAY_GLASS_OPACITY_MAX,
  CLAY_GLASS_OPACITY_MIN,
  CLAY_ORIGINAL_COLOR_BLEND_DEFAULT,
  CLAY_ORIGINAL_COLOR_BLEND_MAX,
  CLAY_ORIGINAL_COLOR_BLEND_MIN,
  CLAY_LIGHT_INTENSITY_DEFAULT,
  CLAY_LIGHT_INTENSITY_MAX,
  CLAY_LIGHT_INTENSITY_MIN,
  CLAY_SURFACE_COLOR_DEFAULT,
  normalizeClayStyle,
} from './types.js';

export const CLAY_WIREFRAME_LINE_WEIGHT_DEFAULT = 1.25;
export const CLAY_WIREFRAME_COLOR_DEFAULT = '#000000';
export const CLAY_WIREFRAME_OPACITY_DEFAULT = 0.45;
export const CLAY_MATERIAL_TRANSPARENT_OPACITY_THRESHOLD = 0.995;
export const CLAY_MATERIAL_GROUPS_BATCH_SIZE = 500;
export const CLAY_UNKNOWN_ORIGINAL_COLOR = '#ffffff';

export const CLAY_GLASS_IFC_CLASSES = new Set([
  'IfcWindow',
  'IfcPlate',
  'IfcCurtainWall',
  'IfcWindowStandardCase',
  'IfcDoor',
]);

export const CLAY_BASE_MATERIAL = buildClayBaseMaterial({ surfaceColor: CLAY_SURFACE_COLOR_DEFAULT });
export const CLAY_GLASS_MATERIAL = buildClayGlassMaterial({
  surfaceColor: CLAY_SURFACE_COLOR_DEFAULT,
  glassOpacity: CLAY_GLASS_OPACITY_DEFAULT,
});

export const CLAY_GHOST_MATERIAL = {
  color: new THREE.Color(CLAY_SURFACE_COLOR_DEFAULT),
  renderedFaces: RenderedFaces.TWO,
  opacity: 0.35,
  transparent: true,
  customId: 'canvas-bim-clay-ghost',
};

/** Matches standard highlight-mode selection (`SELECTED_MATERIAL` in BimViewport). */
export const BIM_SELECTION_HIGHLIGHT_COLOR = '#f59e0b';

export const CLAY_SELECTED_MATERIAL = {
  color: new THREE.Color(BIM_SELECTION_HIGHLIGHT_COLOR),
  renderedFaces: RenderedFaces.TWO,
  opacity: 1,
  transparent: false,
  customId: 'canvas-bim-clay-selected',
};

export function buildClayBaseMaterial({ surfaceColor = CLAY_SURFACE_COLOR_DEFAULT } = {}) {
  return {
    color: new THREE.Color(surfaceColor),
    renderedFaces: RenderedFaces.TWO,
    opacity: 1,
    transparent: false,
    customId: 'canvas-bim-clay-base',
  };
}

export function buildClayGlassMaterial({
  surfaceColor = CLAY_SURFACE_COLOR_DEFAULT,
  glassOpacity = CLAY_GLASS_OPACITY_DEFAULT,
} = {}) {
  return {
    color: new THREE.Color(surfaceColor),
    renderedFaces: RenderedFaces.TWO,
    opacity: glassOpacity,
    transparent: true,
    customId: 'canvas-bim-clay-glass',
  };
}

export function isClayGlassElement(element) {
  return CLAY_GLASS_IFC_CLASSES.has(String(element?.ifcClass ?? '').trim());
}

export function isTransparentMaterialDefinition(definition) {
  if (!definition) return false;
  const opacity = Number(definition.opacity);
  if (Number.isFinite(opacity) && opacity < CLAY_MATERIAL_TRANSPARENT_OPACITY_THRESHOLD) {
    return true;
  }
  return definition.transparent === true;
}

export function normalizeMaterialColorChannel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric > 1 ? numeric / 255 : numeric;
}

function toThreeColor(value, fallback = CLAY_UNKNOWN_ORIGINAL_COLOR) {
  if (value == null) {
    return fallback == null ? null : new THREE.Color(fallback);
  }
  if (typeof value.clone === 'function') return value.clone();
  if (Array.isArray(value) && value.length >= 3) {
    const r = normalizeMaterialColorChannel(value[0]);
    const g = normalizeMaterialColorChannel(value[1]);
    const b = normalizeMaterialColorChannel(value[2]);
    if (r != null && g != null && b != null) return new THREE.Color(r, g, b);
  }
  if (typeof value === 'object') {
    const r = normalizeMaterialColorChannel(value.r);
    const g = normalizeMaterialColorChannel(value.g);
    const b = normalizeMaterialColorChannel(value.b);
    if (r != null && g != null && b != null) return new THREE.Color(r, g, b);
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      return new THREE.Color(value);
    } catch {
      // fall through
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new THREE.Color(value);
  }
  return fallback == null ? null : new THREE.Color(fallback);
}

export function readMaterialDefinitionColor(definition, fallbackColor = CLAY_UNKNOWN_ORIGINAL_COLOR) {
  const color = definition?.color;
  if (color == null) {
    if (fallbackColor == null) return null;
    return new THREE.Color(fallbackColor);
  }
  const parsed = toThreeColor(color, null);
  if (parsed) return parsed;
  if (fallbackColor == null) return null;
  return new THREE.Color(fallbackColor);
}

export function hasMaterialDefinitionColor(definition) {
  if (!definition || definition.color == null) return false;
  const color = definition.color;
  if (color?.isColor) return true;
  if (Array.isArray(color) && color.length >= 3) {
    return ['r', 'g', 'b'].every((_, index) => normalizeMaterialColorChannel(color[index]) != null);
  }
  if (typeof color === 'object') {
    return ['r', 'g', 'b'].every((key) => normalizeMaterialColorChannel(color[key]) != null);
  }
  if (typeof color === 'string' && color.trim()) {
    try {
      new THREE.Color(color);
      return true;
    } catch {
      return false;
    }
  }
  return typeof color === 'number' && Number.isFinite(color);
}

export function blendClayColor(originalColor, surfaceColor, surfaceBlend = 0) {
  const t = Math.min(1, Math.max(0, Number(surfaceBlend) || 0));
  const original = toThreeColor(originalColor);
  const surface = toThreeColor(surfaceColor);
  return new THREE.Color(
    original.r + (surface.r - original.r) * t,
    original.g + (surface.g - original.g) * t,
    original.b + (surface.b - original.b) * t,
  );
}

export function blendClayScalar(originalValue, surfaceValue, surfaceBlend = 0) {
  const t = Math.min(1, Math.max(0, Number(surfaceBlend) || 0));
  const original = Number(originalValue);
  const surface = Number(surfaceValue);
  const fromOriginal = Number.isFinite(original) ? original : surface;
  const toSurface = Number.isFinite(surface) ? surface : fromOriginal;
  return fromOriginal + (toSurface - fromOriginal) * t;
}

function materialBatchKey(material) {
  const { r, g, b } = material.color;
  return `${r.toFixed(4)}:${g.toFixed(4)}:${b.toFixed(4)}:${material.opacity}:${material.transparent}:${material.customId ?? ''}`;
}

const clayMaterialGroupCache = new WeakMap();
const clayMaterialPrefetchPromises = new WeakMap();
/** IFC material definitions captured before clay highlights mutate the model. */
const clayOriginalMaterialSnapshot = new WeakMap();
const clayOriginalMaterialSnapshotPromises = new WeakMap();
const clayOriginalMaterialSnapshotFingerprint = new WeakMap();
/** Last applied Orig value per model — used to reset when leaving 100% Surf. */
const clayLastAppliedBlend = new WeakMap();

function yieldClayApplyTurn() {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

export function clearClayMaterialGroupCache(model) {
  if (model) {
    clayMaterialGroupCache.delete(model);
    clayMaterialPrefetchPromises.delete(model);
    clayOriginalMaterialSnapshot.delete(model);
    clayOriginalMaterialSnapshotPromises.delete(model);
    clayOriginalMaterialSnapshotFingerprint.delete(model);
    clayLastAppliedBlend.delete(model);
  }
}

function resolveClayBlendZone(surfaceBlend = 0) {
  if (surfaceBlend <= 0) return 'native';
  if (surfaceBlend >= 1) return 'full';
  return 'partial';
}

function shouldResetHighlightsBeforeClayApply(model, surfaceBlend, reapplyOnly = false) {
  if (surfaceBlend <= 0) return true;
  if (surfaceBlend > 0 && surfaceBlend < 1) return true;
  return false;
}

function shouldReuseClayBlendFastPath(model, allLocalIds, surfaceBlend) {
  if (!shouldReuseClayMaterialSnapshot(model, allLocalIds)) return false;
  const lastBlend = clayLastAppliedBlend.get(model);
  if (lastBlend == null || !Number.isFinite(lastBlend)) return false;
  const blend = Math.min(1, Math.max(0, Number(surfaceBlend) || 0));
  if (resolveClayBlendZone(lastBlend) !== resolveClayBlendZone(blend)) return false;
  return Math.abs(lastBlend - blend) <= 0.0001;
}

function recordClayAppliedBlend(model, surfaceBlend) {
  if (model != null && Number.isFinite(surfaceBlend)) {
    clayLastAppliedBlend.set(model, surfaceBlend);
  }
}

/** Drop cached IFC material snapshot so the next capture re-fetches definitions. */
export function invalidateClayMaterialSnapshot(model) {
  if (!model) return;
  clayOriginalMaterialSnapshot.delete(model);
  clayOriginalMaterialSnapshotPromises.delete(model);
  clayOriginalMaterialSnapshotFingerprint.delete(model);
  clayMaterialGroupCache.delete(model);
  clayMaterialPrefetchPromises.delete(model);
}

export function fingerprintClayLocalIds(localIds = []) {
  const valid = localIds.filter(isValidFragmentsLocalId);
  if (!valid.length) return '0';
  const sorted = [...valid].sort((a, b) => a - b);
  let hash = 0;
  for (const id of sorted) {
    hash = ((hash * 31) + id) | 0;
  }
  return `${sorted.length}:${sorted[0]}:${sorted[sorted.length - 1]}:${hash}`;
}

function countColoredDefinitionsInMap(map, localIds = []) {
  if (!map || !localIds.length) return 0;
  let count = 0;
  for (const localId of localIds) {
    if (hasMaterialDefinitionColor(map.get(localId))) count += 1;
  }
  return count;
}

function shouldReuseClayMaterialSnapshot(model, allLocalIds = []) {
  if (!clayOriginalMaterialSnapshot.has(model)) return false;
  const fingerprint = fingerprintClayLocalIds(allLocalIds);
  if (clayOriginalMaterialSnapshotFingerprint.get(model) !== fingerprint) return false;
  const cached = clayOriginalMaterialSnapshot.get(model);
  if (countColoredDefinitionsInMap(cached, allLocalIds) > 0) return true;
  const groups = clayMaterialGroupCache.get(model) ?? [];
  if (!groups.length) return false;
  const fromCache = buildLocalIdDefinitionMap(groups);
  return countColoredDefinitionsInMap(fromCache, allLocalIds) === 0;
}

export function invalidateClayMaterialSnapshotIfStale(model, allLocalIds = []) {
  if (!model || !clayOriginalMaterialSnapshot.has(model)) return;
  if (shouldReuseClayMaterialSnapshot(model, allLocalIds)) return;
  invalidateClayMaterialSnapshot(model);
}

export async function prefetchClayMaterialGroups(model, allLocalIds = []) {
  if (!model) return [];
  if (clayMaterialGroupCache.has(model)) return clayMaterialGroupCache.get(model);
  const groups = allLocalIds?.length
    ? await fetchClayMaterialGroups(model, allLocalIds)
    : [];
  clayMaterialGroupCache.set(model, groups);
  return groups;
}

export function scheduleClayMaterialGroupsPrefetch(model, allLocalIds = [], onComplete) {
  if (!model || !allLocalIds?.length) return;
  if (clayMaterialGroupCache.has(model)) {
    invalidateClayMaterialSnapshotIfStale(model, allLocalIds);
    onComplete?.(clayMaterialGroupCache.get(model));
    return;
  }
  const pending = clayMaterialPrefetchPromises.get(model);
  if (pending) {
    void pending.then((groups) => {
      invalidateClayMaterialSnapshotIfStale(model, allLocalIds);
      onComplete?.(groups);
    });
    return;
  }
  const promise = prefetchClayMaterialGroups(model, allLocalIds)
    .catch(() => [])
    .finally(() => {
      clayMaterialPrefetchPromises.delete(model);
    });
  clayMaterialPrefetchPromises.set(model, promise);
  void promise.then((groups) => {
    invalidateClayMaterialSnapshotIfStale(model, allLocalIds);
    onComplete?.(groups);
  });
}

function mergeClayMaterialGroupsIntoCache(model, groups = [], map = new Map()) {
  if (!groups.length) return map;
  const existing = clayMaterialGroupCache.get(model) ?? [];
  clayMaterialGroupCache.set(model, [...existing, ...groups]);
  for (const group of groups) {
    const definition = normalizeClayMaterialDefinition(group?.definition);
    for (const localId of group?.localIds ?? []) {
      if (isValidFragmentsLocalId(localId)) map.set(localId, definition);
    }
  }
  return map;
}

function normalizeClayMaterialDefinition(definition) {
  if (!definition || typeof definition !== 'object') {
    return { opacity: 1, transparent: false };
  }
  const color = readMaterialDefinitionColor(definition, null);
  return {
    ...definition,
    ...(color ? { color } : {}),
    opacity: Number.isFinite(Number(definition.opacity)) ? Number(definition.opacity) : 1,
    transparent: definition.transparent === true,
  };
}

function buildLocalIdDefinitionMap(materialGroups = []) {
  const map = new Map();
  for (const group of materialGroups) {
    const definition = normalizeClayMaterialDefinition(group?.definition);
    for (const localId of group?.localIds ?? []) {
      if (isValidFragmentsLocalId(localId)) map.set(localId, definition);
    }
  }
  return map;
}

async function fetchClayMaterialDefinitionMap(model, allLocalIds = []) {
  if (!model || !allLocalIds?.length) return new Map();

  await prefetchClayMaterialGroups(model, allLocalIds);
  const map = buildLocalIdDefinitionMap(clayMaterialGroupCache.get(model) ?? []);

  const missingColorLocalIds = allLocalIds.filter(
    (localId) => !hasMaterialDefinitionColor(map.get(localId)),
  );
  if (missingColorLocalIds.length > 0 && typeof model.getItemsMaterialDefinition === 'function') {
    mergeClayMaterialGroupsIntoCache(
      model,
      await fetchClayMaterialGroups(model, missingColorLocalIds),
      map,
    );
  }

  return map;
}

/** Capture IFC material colours once, before any clay highlight overrides are applied. */
export async function captureClayOriginalMaterialSnapshot(model, allLocalIds = []) {
  if (!model || !allLocalIds?.length) return new Map();
  if (shouldReuseClayMaterialSnapshot(model, allLocalIds)) {
    return clayOriginalMaterialSnapshot.get(model);
  }
  invalidateClayMaterialSnapshot(model);

  const pending = clayOriginalMaterialSnapshotPromises.get(model);
  if (pending) return pending;

  const promise = (async () => {
    const map = await fetchClayMaterialDefinitionMap(model, allLocalIds);
    clayOriginalMaterialSnapshot.set(model, map);
    clayOriginalMaterialSnapshotFingerprint.set(model, fingerprintClayLocalIds(allLocalIds));
    return map;
  })().finally(() => {
    clayOriginalMaterialSnapshotPromises.delete(model);
  });

  clayOriginalMaterialSnapshotPromises.set(model, promise);
  return promise;
}

export async function ensureClayMaterialDefinitionMap(model, allLocalIds = []) {
  if (shouldReuseClayMaterialSnapshot(model, allLocalIds)) {
    return clayOriginalMaterialSnapshot.get(model);
  }
  if (!model || !allLocalIds?.length) return new Map();
  const map = await fetchClayMaterialDefinitionMap(model, allLocalIds);
  clayOriginalMaterialSnapshot.set(model, map);
  clayOriginalMaterialSnapshotFingerprint.set(model, fingerprintClayLocalIds(allLocalIds));
  return map;
}

export async function fetchClayMaterialGroups(model, localIds = null) {
  if (!model || typeof model.getItemsMaterialDefinition !== 'function') {
    return [];
  }
  if (localIds == null || !localIds.length) {
    return [];
  }
  const groups = [];
  try {
    for (const chunk of chunkLocalIds(localIds, CLAY_MATERIAL_GROUPS_BATCH_SIZE)) {
      const batchGroups = await model.getItemsMaterialDefinition(chunk);
      if (Array.isArray(batchGroups)) groups.push(...batchGroups);
    }
  } catch {
    return [];
  }
  return groups;
}

export async function resolveClayGlazingLocalIds(
  model,
  preparedModel,
  cache,
  allLocalIds,
  materialGroups = null,
) {
  const glazingIds = new Set();
  const groups = materialGroups === null
    ? await fetchClayMaterialGroups(model, allLocalIds)
    : materialGroups;
  for (const group of groups) {
    if (!isTransparentMaterialDefinition(group?.definition)) continue;
    for (const localId of group?.localIds ?? []) {
      if (isValidFragmentsLocalId(localId)) glazingIds.add(localId);
    }
  }

  const classElements = (preparedModel?.elements ?? []).filter(isClayGlassElement);
  if (!classElements.length) return [...glazingIds];

  const idMap = await resolveFragmentsLocalIdsByGlobalIds(
    model,
    classElements.map((element) => element.ifcGlobalId),
    cache,
  );
  for (const element of classElements) {
    const localId = idMap.get(element.ifcGlobalId);
    if (isValidFragmentsLocalId(localId)) glazingIds.add(localId);
  }
  return [...glazingIds];
}

export function buildClayHighlightMaterial({
  color,
  opacity = 1,
  transparent = false,
  customId = 'canvas-bim-clay-base',
} = {}) {
  return {
    color: toThreeColor(color),
    renderedFaces: RenderedFaces.TWO,
    opacity,
    transparent,
    customId,
  };
}

export function resolveClayHighlightMaterial({
  definition,
  surfaceColor = CLAY_SURFACE_COLOR_DEFAULT,
  glassOpacity = CLAY_GLASS_OPACITY_DEFAULT,
  originalColorBlend = CLAY_ORIGINAL_COLOR_BLEND_DEFAULT,
  isGlazing = false,
} = {}) {
  // 0 = native IFC materials, 1 = uniform clay surface + glazing
  const surfaceBlend = Math.min(1, Math.max(0, Number(originalColorBlend) || 0));
  const surfaceColorObj = new THREE.Color(surfaceColor);
  const normalizedDefinition = normalizeClayMaterialDefinition(definition);
  const hasOriginalColor = hasMaterialDefinitionColor(normalizedDefinition);

  if (!hasOriginalColor) {
    if (surfaceBlend <= 0) return null;
    if (surfaceBlend >= 1) {
      return isGlazing
        ? buildClayGlassMaterial({ surfaceColor, glassOpacity })
        : buildClayBaseMaterial({ surfaceColor });
    }
    // Fragments highlight replaces materials — partial overlay would hide native colours.
    return null;
  }

  const originalColor = readMaterialDefinitionColor(normalizedDefinition, null);
  const originalOpacity = Number.isFinite(Number(normalizedDefinition?.opacity))
    ? Number(normalizedDefinition.opacity)
    : 1;
  const surfaceOpacity = isGlazing ? glassOpacity : 1;
  const color = blendClayColor(originalColor, surfaceColorObj, surfaceBlend);
  const opacity = blendClayScalar(originalOpacity, surfaceOpacity, surfaceBlend);
  const transparent = opacity < CLAY_MATERIAL_TRANSPARENT_OPACITY_THRESHOLD;
  return buildClayHighlightMaterial({
    color,
    opacity,
    transparent,
    customId: isGlazing ? 'canvas-bim-clay-glass' : 'canvas-bim-clay-base',
  });
}

export function resolveClayWireframeStyle(style = {}) {
  const hiddenLines = style.hiddenLines !== false;
  return {
    lineWeight: Number.isFinite(style.lineWeight)
      ? style.lineWeight
      : CLAY_WIREFRAME_LINE_WEIGHT_DEFAULT,
    opacity: Number.isFinite(style.opacity)
      ? style.opacity
      : CLAY_WIREFRAME_OPACITY_DEFAULT,
    color: style.color ?? CLAY_WIREFRAME_COLOR_DEFAULT,
    hiddenLines,
    depthTest: hiddenLines,
  };
}

/**
 * Ensures an offscreen render target has an initialized WebGL framebuffer.
 */
function ensureRenderTargetFramebuffer(renderer, target) {
  if (!renderer || !target) return null;
  let props = renderer.properties?.get(target);
  if (props?.__webglFramebuffer) return props.__webglFramebuffer;
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.setRenderTarget(previous);
  props = renderer.properties?.get(target);
  return props?.__webglFramebuffer ?? null;
}

export function resolveClayComposerDepthSource(clayComposerState) {
  return clayComposerState?.composer?.readBuffer
    ?? clayComposerState?.composer?.writeBuffer
    ?? null;
}

export function resolveClayComposerDepthSources(clayComposerState) {
  const composer = clayComposerState?.composer;
  if (!composer) return [];
  const targets = [composer.readBuffer, composer.writeBuffer];
  return targets.filter((target, index) => target && targets.indexOf(target) === index);
}

export function copyClayComposerDepthToScreen(renderer, clayComposerState, width, height) {
  const sources = resolveClayComposerDepthSources(clayComposerState);
  for (const source of sources) {
    if (copyRenderTargetDepthToScreen(renderer, source, width, height)) {
      return true;
    }
  }
  return false;
}

/**
 * Copies depth from an offscreen render target into the screen depth buffer.
 * Used after the clay composer beauty pass so wireframe edges can depth-test
 * against Fragments geometry without repainting the SSAO output.
 */
export function copyRenderTargetDepthToScreen(renderer, sourceTarget, width, height) {
  if (!renderer || !sourceTarget || !width || !height) return false;
  if (!sourceTarget.depthBuffer && !sourceTarget.depthTexture) return false;

  const gl = renderer.getContext?.();
  if (!gl || typeof gl.blitFramebuffer !== 'function') return false;

  const readFramebuffer = ensureRenderTargetFramebuffer(renderer, sourceTarget);
  if (!readFramebuffer) return false;

  const w = Math.floor(width);
  const h = Math.floor(height);
  const previousRenderTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(null);

  const blitVariants = [
    [0, h, 0, h],
    [0, h, h, 0],
  ];

  let copied = false;
  for (const [srcY0, srcY1, dstY0, dstY1] of blitVariants) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(
      0, srcY0, w, srcY1,
      0, dstY0, w, dstY1,
      gl.DEPTH_BUFFER_BIT,
      gl.NEAREST,
    );
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    copied = true;
    if (!gl.getError || gl.getError() === gl.NO_ERROR) {
      break;
    }
  }

  renderer.setRenderTarget(previousRenderTarget);
  return copied;
}

/** @deprecated Use copyRenderTargetDepthToScreen */
export const copySsaoDepthToScreen = copyRenderTargetDepthToScreen;

export function resolveClayViewDistance(camera, controlsTarget, boundsCenter) {
  if (camera?.position && controlsTarget) {
    return camera.position.distanceTo(controlsTarget);
  }
  if (camera?.position && boundsCenter) {
    return camera.position.distanceTo(boundsCenter);
  }
  return undefined;
}

/** Canonical view distance for slider tuning — AO scales from this reference. */
export const CLAY_SSAO_REFERENCE_DISTANCE_FACTOR = 1.25;
/** Floor/ceiling for zoom-responsive AO — keep full kernel when zoomed in (depth range handles precision). */
export const CLAY_SSAO_VIEW_SCALE_MIN = 1;
export const CLAY_SSAO_VIEW_SCALE_MAX = 2.75;
/** Max camera far:near ratio for SSAO depth precision (geometry still fits in frustum). */
export const CLAY_SSAO_MAX_DEPTH_RATIO = 8000;
/** Reference frustum span for scaling SSAO min/max distance thresholds. */
export const CLAY_SSAO_DEPTH_SPAN_REFERENCE = 45;

export function resolveClayCameraDepthRange({
  cameraDistance,
  modelRadius,
  cameraPosition,
  boundsCenter,
} = {}) {
  const radius = Math.max(modelRadius ?? 10, 1);
  const padding = 1.12;

  let centerDistance = Math.max(cameraDistance ?? radius * 1.5, radius * 0.005);
  if (cameraPosition?.distanceTo && boundsCenter) {
    centerDistance = Math.max(cameraPosition.distanceTo(boundsCenter), radius * 0.01);
  }

  const extent = radius * padding;
  const orbitDistance = Math.max(cameraDistance ?? centerDistance, radius * 0.01);
  const insideBounds = centerDistance < extent;

  let near;
  let far;

  if (insideBounds) {
    // Zoomed inside the padded bounds: use a local frustum so SSAO keeps depth precision.
    near = Math.max(0.02, orbitDistance * 0.04);
    far = Math.max(near + 3, orbitDistance + radius * 0.6);
    far = Math.max(far, centerDistance + extent * 0.35);
    const maxSpan = Math.max(radius * 0.85, orbitDistance + radius * 0.45);
    if (far - near > maxSpan) {
      far = near + maxSpan;
    }
  } else {
    near = Math.max(0.001, centerDistance - extent);
    far = Math.max(near + 0.1, centerDistance + extent);
  }

  const maxDepthRatio = CLAY_SSAO_MAX_DEPTH_RATIO;
  if (far / near > maxDepthRatio) {
    near = Math.max(0.001, far / maxDepthRatio);
  }

  return { near, far, distance: centerDistance, margin: extent, insideBounds };
}

export function applyClayCameraDepthRange(camera, {
  cameraDistance,
  modelRadius,
  boundsCenter,
} = {}) {
  if (!camera) return () => {};

  const saved = { near: camera.near, far: camera.far };
  const { near, far } = resolveClayCameraDepthRange({
    cameraDistance,
    modelRadius,
    cameraPosition: camera.position,
    boundsCenter,
  });

  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();

  return () => {
    camera.near = saved.near;
    camera.far = saved.far;
    camera.updateProjectionMatrix();
  };
}

export function setupClayLighting(
  scene,
  {
    backgroundColor = CLAY_BACKGROUND_DEFAULT,
    lightIntensity = CLAY_LIGHT_INTENSITY_DEFAULT,
  } = {},
) {
  if (!scene) return { lights: null, previousBackground: null };

  const previousBackground = scene.background;
  scene.background = new THREE.Color(backgroundColor);
  scene.environment = null;
  if ('environmentIntensity' in scene) {
    scene.environmentIntensity = 0;
  }

  const lights = new THREE.Group();
  lights.name = 'bim-clay-lights';

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0xe8e8e8, lightIntensity);
  const skylight = new THREE.DirectionalLight(0xffffff, lightIntensity * 0.17);
  skylight.position.set(0.12, 1, 0.08).normalize();

  lights.add(hemisphere, skylight);
  scene.add(lights);

  return { lights, previousBackground };
}

export function updateClayLightingIntensity(clayLightingState, lightIntensity = CLAY_LIGHT_INTENSITY_DEFAULT) {
  const lights = clayLightingState?.lights;
  if (!lights) return;

  lights.children.forEach((child) => {
    if (child.isHemisphereLight) {
      child.intensity = lightIntensity;
    } else if (child.isDirectionalLight) {
      child.intensity = lightIntensity * 0.17;
    }
  });
}

export function updateClaySunDirection(clayLightingState, direction) {
  const lights = clayLightingState?.lights;
  if (!lights || !direction) return;
  const vector = new THREE.Vector3(
    Number(direction.x) || 0,
    Number(direction.y) || 0,
    Number(direction.z) || 0,
  );
  if (vector.lengthSq() === 0) return;
  vector.normalize();
  lights.children.forEach((child) => {
    if (!child.isDirectionalLight) return;
    child.position.copy(vector);
  });
}

export function teardownClayLighting(scene, clayLightingState) {
  if (!scene || !clayLightingState) return;
  if (clayLightingState.lights) {
    scene.remove(clayLightingState.lights);
    clayLightingState.lights.traverse((child) => child.dispose?.());
  }
  scene.background = clayLightingState.previousBackground ?? scene.background;
}

export function createClayComposer(renderer, scene, camera, width, height) {
  if (!renderer || !scene || !camera) return null;

  const logicalWidth = Math.max(1, width);
  const logicalHeight = Math.max(1, height);
  const composer = new EffectComposer(renderer);
  composer.setSize(logicalWidth, logicalHeight);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const ssaoPass = new SSAOPass(scene, camera, logicalWidth, logicalHeight);
  ssaoPass.output = SSAOPass.OUTPUT.Default;
  composer.addPass(ssaoPass);

  const outputPass = new OutputPass();
  // Keep RenderPass depth in readBuffer — a post-swap writeBuffer is empty depth.
  outputPass.needsSwap = false;
  composer.addPass(outputPass);

  return { composer, renderPass, ssaoPass, outputPass, baseWidth: logicalWidth, baseHeight: logicalHeight };
}

export function resolveClaySsaoKernelSize(aoSamples = CLAY_AO_SAMPLES_DEFAULT) {
  const numeric = Number(aoSamples);
  if (!Number.isFinite(numeric)) return CLAY_AO_SAMPLES_DEFAULT;
  return Math.min(
    CLAY_AO_SAMPLES_MAX,
    Math.max(CLAY_AO_SAMPLES_MIN, Math.round(numeric)),
  );
}

export function resolveClaySsaoResolutionScale(aoResolution = CLAY_AO_RESOLUTION_DEFAULT) {
  const numeric = Number(aoResolution);
  if (!Number.isFinite(numeric)) return CLAY_AO_RESOLUTION_DEFAULT;
  return Math.min(
    CLAY_AO_RESOLUTION_MAX,
    Math.max(CLAY_AO_RESOLUTION_MIN, numeric),
  );
}

export function resolveClaySsaoPassSize(width, height, aoResolution = CLAY_AO_RESOLUTION_DEFAULT) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const scale = resolveClaySsaoResolutionScale(aoResolution);
  return {
    width: Math.max(1, Math.floor(safeWidth * scale)),
    height: Math.max(1, Math.floor(safeHeight * scale)),
    scale,
  };
}

export function applyClaySsaoSampleCount(ssaoPass, aoSamples = CLAY_AO_SAMPLES_DEFAULT) {
  if (!ssaoPass?.ssaoMaterial) return false;

  const kernelSize = resolveClaySsaoKernelSize(aoSamples);
  const currentSize = ssaoPass.ssaoMaterial.defines?.KERNEL_SIZE;
  if (currentSize === kernelSize && ssaoPass.kernel?.length === kernelSize) {
    return true;
  }

  const kernel = [];
  for (let index = 0; index < kernelSize; index += 1) {
    const sample = new THREE.Vector3();
    sample.x = Math.random() * 2 - 1;
    sample.y = Math.random() * 2 - 1;
    sample.z = Math.random();
    sample.normalize();
    let sampleScale = index / kernelSize;
    sampleScale = THREE.MathUtils.lerp(0.1, 1, sampleScale * sampleScale);
    sample.multiplyScalar(sampleScale);
    kernel.push(sample);
  }

  ssaoPass.kernel = kernel;
  if (!ssaoPass.ssaoMaterial.defines) {
    ssaoPass.ssaoMaterial.defines = {};
  }
  ssaoPass.ssaoMaterial.defines.KERNEL_SIZE = kernelSize;
  if (!ssaoPass.ssaoMaterial.uniforms.kernel) {
    ssaoPass.ssaoMaterial.uniforms.kernel = { value: kernel };
  } else {
    ssaoPass.ssaoMaterial.uniforms.kernel.value = kernel;
  }
  ssaoPass.ssaoMaterial.needsUpdate = true;
  return true;
}

export function updateClaySsaoQuality(clayComposerState, {
  aoSamples = CLAY_AO_SAMPLES_DEFAULT,
  aoResolution = CLAY_AO_RESOLUTION_DEFAULT,
} = {}) {
  const ssaoPass = clayComposerState?.ssaoPass;
  if (!ssaoPass) return;

  applyClaySsaoSampleCount(ssaoPass, aoSamples);

  const baseWidth = clayComposerState.baseWidth ?? ssaoPass.width ?? 1;
  const baseHeight = clayComposerState.baseHeight ?? ssaoPass.height ?? 1;
  const { width, height } = resolveClaySsaoPassSize(baseWidth, baseHeight, aoResolution);
  if (ssaoPass.width !== width || ssaoPass.height !== height) {
    if (typeof ssaoPass.setSize === 'function') {
      ssaoPass.setSize(width, height);
    } else {
      ssaoPass.width = width;
      ssaoPass.height = height;
    }
  }
}

export function resizeClayComposer(clayComposerState, width, height, quality = {}) {
  if (!clayComposerState?.composer) return;
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  clayComposerState.baseWidth = safeWidth;
  clayComposerState.baseHeight = safeHeight;
  clayComposerState.composer.setSize(safeWidth, safeHeight);
  updateClaySsaoQuality(clayComposerState, quality);
}

function clampClaySliderNorm(value, min, max) {
  if (!Number.isFinite(value) || max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/**
 * Maps clay AO slider values to Three.js SSAOPass settings (pure, unit-testable).
 */
export function resolveClaySsaoSettings({
  aoIntensity = CLAY_AO_INTENSITY_DEFAULT,
  aoRadius = CLAY_AO_RADIUS_DEFAULT,
  aoBias = CLAY_AO_BIAS_DEFAULT,
  aoDistance = CLAY_AO_DISTANCE_DEFAULT,
  cameraDistance,
  modelRadius,
  cameraNear,
  cameraFar,
} = {}) {
  const radius = Math.max(modelRadius ?? 10, 1);
  const viewDistance = Math.max(cameraDistance ?? radius * 1.5, radius * 0.005);
  const referenceDistance = radius * CLAY_SSAO_REFERENCE_DISTANCE_FACTOR;
  const rawViewScale = viewDistance / referenceDistance;
  const viewScale = Math.min(
    CLAY_SSAO_VIEW_SCALE_MAX,
    Math.max(CLAY_SSAO_VIEW_SCALE_MIN, rawViewScale),
  );

  const strength = clampClaySliderNorm(
    aoIntensity,
    CLAY_AO_INTENSITY_MIN,
    CLAY_AO_INTENSITY_MAX,
  );
  const radiusNorm = clampClaySliderNorm(aoRadius, CLAY_AO_RADIUS_MIN, CLAY_AO_RADIUS_MAX);
  const biasNorm = clampClaySliderNorm(aoBias, CLAY_AO_BIAS_MIN, CLAY_AO_BIAS_MAX);
  const distanceNorm = clampClaySliderNorm(aoDistance, CLAY_AO_DISTANCE_MIN, CLAY_AO_DISTANCE_MAX);

  const baseKernel = (0.5 + radiusNorm * 15) * (radius / 8) * (0.85 + strength * 0.35);
  const kernelRadius = Math.max(CLAY_SSAO_KERNEL_RADIUS_FLOOR, baseKernel * viewScale);
  let minDistance = 0.0005 + biasNorm * 0.08;
  const distanceBase = 0.02 + distanceNorm * 0.98;
  let maxDistance = Math.min(1, distanceBase * (0.35 + strength * 1.65));

  const depthSpan = Number.isFinite(cameraFar) && Number.isFinite(cameraNear) && cameraFar > cameraNear
    ? cameraFar - cameraNear
    : null;
  if (depthSpan) {
    const spanScale = Math.min(1, CLAY_SSAO_DEPTH_SPAN_REFERENCE / depthSpan);
    minDistance *= spanScale;
    maxDistance *= spanScale;
  }

  return { kernelRadius, minDistance, maxDistance, viewScale };
}

export function updateClayComposerSettings(clayComposerState, {
  aoIntensity = CLAY_AO_INTENSITY_DEFAULT,
  aoRadius = CLAY_AO_RADIUS_DEFAULT,
  aoBias = CLAY_AO_BIAS_DEFAULT,
  aoDistance = CLAY_AO_DISTANCE_DEFAULT,
  aoSamples = CLAY_AO_SAMPLES_DEFAULT,
  aoResolution = CLAY_AO_RESOLUTION_DEFAULT,
  camera,
  cameraDistance,
  modelRadius,
} = {}) {
  const ssaoPass = clayComposerState?.ssaoPass;
  if (!ssaoPass || !camera) return;

  updateClaySsaoQuality(clayComposerState, { aoSamples, aoResolution });

  const { kernelRadius, minDistance, maxDistance } = resolveClaySsaoSettings({
    aoIntensity,
    aoRadius,
    aoBias,
    aoDistance,
    cameraDistance,
    modelRadius,
    cameraNear: camera.near,
    cameraFar: camera.far,
  });

  ssaoPass.kernelRadius = kernelRadius;
  ssaoPass.minDistance = minDistance;
  ssaoPass.maxDistance = maxDistance;

  ssaoPass.ssaoMaterial.uniforms.cameraNear.value = camera.near;
  ssaoPass.ssaoMaterial.uniforms.cameraFar.value = camera.far;
  ssaoPass.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
  ssaoPass.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);

  ssaoPass.depthRenderMaterial.uniforms.cameraNear.value = camera.near;
  ssaoPass.depthRenderMaterial.uniforms.cameraFar.value = camera.far;

  ssaoPass.ssaoMaterial.uniforms.kernelRadius.value = ssaoPass.kernelRadius;
  ssaoPass.ssaoMaterial.uniforms.minDistance.value = ssaoPass.minDistance;
  ssaoPass.ssaoMaterial.uniforms.maxDistance.value = ssaoPass.maxDistance;
}

export function disposeClayComposer(clayComposerState) {
  if (!clayComposerState) return;
  clayComposerState.ssaoPass?.dispose?.();
  clayComposerState.composer?.dispose?.();
}

export function applyViewportBackground(scene, renderer, backgroundColor = CLAY_BACKGROUND_DEFAULT) {
  const color = new THREE.Color(backgroundColor);
  if (scene) {
    if (scene.background?.isColor) {
      scene.background.copy(color);
    } else {
      scene.background = color;
    }
  }
  if (renderer) {
    renderer.setClearColor(color, 1);
  }
}

/** @deprecated Use applyViewportBackground */
export const applyClaySceneBackground = applyViewportBackground;

export async function applyClayFastPath(
  model,
  allLocalIds,
  glazingLocalIds,
  { surfaceColor = CLAY_SURFACE_COLOR_DEFAULT, glassOpacity = CLAY_GLASS_OPACITY_DEFAULT } = {},
) {
  const baseMaterial = buildClayBaseMaterial({ surfaceColor });
  for (const chunk of chunkLocalIds(allLocalIds, CLAY_MATERIAL_GROUPS_BATCH_SIZE)) {
    await model.highlight(chunk, baseMaterial);
    await yieldClayApplyTurn();
  }
  if (!glazingLocalIds?.length) return;
  const glassMaterial = buildClayGlassMaterial({ surfaceColor, glassOpacity });
  for (const chunk of chunkLocalIds(glazingLocalIds, CLAY_MATERIAL_GROUPS_BATCH_SIZE)) {
    await model.highlight(chunk, glassMaterial);
    await yieldClayApplyTurn();
  }
}

export function resolveClayMaterialApplyParams(params = {}) {
  return {
    surfaceColor: params.surfaceColor ?? params.claySurfaceColor ?? CLAY_SURFACE_COLOR_DEFAULT,
    glassOpacity: params.glassOpacity ?? params.clayGlassOpacity ?? CLAY_GLASS_OPACITY_DEFAULT,
    originalColorBlend: params.originalColorBlend ?? params.clayOriginalColorBlend ?? CLAY_ORIGINAL_COLOR_BLEND_DEFAULT,
  };
}

function publishClayDebugMarkerUnlessCancelled(shouldCancel, marker = {}) {
  if (typeof shouldCancel === 'function' && shouldCancel()) return;
  publishClayDebugMarker(marker);
}

export function canReuseClayMaterialSnapshot(model, allLocalIds = []) {
  return shouldReuseClayMaterialSnapshot(model, allLocalIds);
}

export function canReuseClayBlendFastPath(model, allLocalIds, surfaceBlend) {
  return shouldReuseClayBlendFastPath(model, allLocalIds, surfaceBlend);
}

export async function applyClayBaseMaterials(
  model,
  preparedModel,
  cache,
  allLocalIds,
  params = {},
  { onBatchApplied, reapplyOnly = false, debugSource = 'base', shouldCancel = () => false, quietDebug = false } = {},
) {
  const stats = createClayApplyStats();
  stats.reapplyOnly = reapplyOnly;
  stats.frameReapply = reapplyOnly;
  stats.allLocalIdsCount = allLocalIds?.length ?? 0;

  const finish = (ok, marker = {}) => {
    const result = { ok: Boolean(ok) && !shouldCancel(), stats };
    if (!quietDebug) {
      publishClayDebugMarkerUnlessCancelled(shouldCancel, {
        source: debugSource,
        phase: 'applyClayBaseMaterials',
        ok: result.ok,
        ...marker,
        stats,
      });
    }
    return result;
  };

  if (!model || !allLocalIds?.length) {
    return finish(false, { ok: false, reason: 'missing-model-or-local-ids' });
  }

  const {
    surfaceColor,
    glassOpacity,
    originalColorBlend,
  } = resolveClayMaterialApplyParams(params);

  const surfaceBlend = Math.min(1, Math.max(0, Number(originalColorBlend) || 0));
  stats.surfaceBlend = surfaceBlend;
  stats.surfaceColor = surfaceColor;
  stats.glassOpacity = glassOpacity;
  stats.blendZone = resolveClayBlendZone(surfaceBlend);

  if (surfaceBlend <= 0) {
    if (shouldCancel()) return finish(false);
    await model.resetHighlight();
    stats.resetCalled = true;
    stats.resetOnly = true;
    recordClayAppliedBlend(model, 0);
    return finish(true, { ok: true });
  }

  const shouldReset = shouldResetHighlightsBeforeClayApply(model, surfaceBlend, reapplyOnly);
  const lastBlend = clayLastAppliedBlend.get(model);
  stats.lastBlend = Number.isFinite(lastBlend) ? lastBlend : null;
  stats.leavingFull = !reapplyOnly && surfaceBlend > 0 && surfaceBlend < 1 && lastBlend != null && lastBlend >= 1;
  stats.resetCalled = shouldReset;
  if (shouldReset) await model.resetHighlight();
  if (shouldCancel()) return finish(false);

  if (surfaceBlend >= 1) {
    await captureClayOriginalMaterialSnapshot(model, allLocalIds);
    if (shouldCancel()) return finish(false);
    const glazingLocalIds = await resolveClayGlazingLocalIds(
      model,
      preparedModel,
      cache,
      allLocalIds,
      clayMaterialGroupCache.get(model) ?? [],
    );
    if (shouldCancel()) return finish(false);
    stats.glazingCount = glazingLocalIds.length;
    const glazingSet = new Set(glazingLocalIds);
    for (const group of clayMaterialGroupCache.get(model) ?? []) {
      if (!isTransparentMaterialDefinition(group?.definition)) continue;
      for (const localId of group?.localIds ?? []) {
        if (isValidFragmentsLocalId(localId)) glazingSet.add(localId);
      }
    }

    const baseMaterial = buildClayBaseMaterial({ surfaceColor });
    for (const chunk of chunkLocalIds(allLocalIds, CLAY_MATERIAL_GROUPS_BATCH_SIZE)) {
      if (shouldCancel()) return finish(false);
      stats.highlightBatchCount += 1;
      stats.highlightCallCount += 1;
      stats.highlightedLocalIdCount += chunk.length;
      await model.highlight(chunk, baseMaterial);
      await yieldClayApplyTurn();
    }

    if (glazingSet.size > 0) {
      const glassMaterial = buildClayGlassMaterial({ surfaceColor, glassOpacity });
      for (const chunk of chunkLocalIds([...glazingSet], CLAY_MATERIAL_GROUPS_BATCH_SIZE)) {
        if (shouldCancel()) return finish(false);
        stats.highlightBatchCount += 1;
        stats.highlightCallCount += 1;
        stats.highlightedLocalIdCount += chunk.length;
        await model.highlight(chunk, glassMaterial);
        await yieldClayApplyTurn();
      }
    }

    stats.fallbackUniformCount = Math.max(0, allLocalIds.length - glazingSet.size);
    recordClayAppliedBlend(model, surfaceBlend);
    return finish(true, { ok: true, fastPath: true });
  }

  const definitionByLocalId = await ensureClayMaterialDefinitionMap(model, allLocalIds);
  if (shouldCancel()) return finish(false);
  stats.coloredDefinitionCount = countColoredDefinitionsInMap(definitionByLocalId, allLocalIds);
  stats.materialGroupCount = clayMaterialGroupCache.get(model)?.length ?? 0;
  stats.definitionMapSize = definitionByLocalId.size;
  const glazingLocalIds = await resolveClayGlazingLocalIds(
    model,
    preparedModel,
    cache,
    allLocalIds,
    clayMaterialGroupCache.get(model) ?? [],
  );
  stats.glazingCount = glazingLocalIds.length;
  const glazingSet = new Set(glazingLocalIds);
  for (const group of clayMaterialGroupCache.get(model) ?? []) {
    if (!isTransparentMaterialDefinition(group?.definition)) continue;
    for (const localId of group?.localIds ?? []) {
      if (isValidFragmentsLocalId(localId)) glazingSet.add(localId);
    }
  }

  let batchIndex = 0;
  for (const chunk of chunkLocalIds(allLocalIds, CLAY_MATERIAL_GROUPS_BATCH_SIZE)) {
    if (shouldCancel()) return finish(false);
    const materialBatches = new Map();
    const queueMaterial = (localId, material) => {
      const key = materialBatchKey(material);
      if (!materialBatches.has(key)) {
        materialBatches.set(key, { material, localIds: [] });
      }
      materialBatches.get(key).localIds.push(localId);
    };

    for (const localId of chunk) {
      const definition = definitionByLocalId.get(localId) ?? { opacity: 1, transparent: false };
      const isGlazing = glazingSet.has(localId) || isTransparentMaterialDefinition(definition);
      const material = resolveClayHighlightMaterial({
        definition,
        surfaceColor,
        glassOpacity,
        originalColorBlend: surfaceBlend,
        isGlazing,
      });
      if (!material) {
        if (surfaceBlend >= 1) {
          stats.fallbackUniformCount += 1;
          queueMaterial(
            localId,
            isGlazing
              ? buildClayGlassMaterial({ surfaceColor, glassOpacity })
              : buildClayBaseMaterial({ surfaceColor }),
          );
        } else {
          stats.skippedLocalIdCount += 1;
          stats.nativeLeftCount += 1;
        }
        continue;
      }
      queueMaterial(localId, material);
    }

    for (const { material, localIds } of materialBatches.values()) {
      if (shouldCancel()) return finish(false);
      stats.highlightBatchCount += 1;
      stats.highlightCallCount += 1;
      stats.highlightedLocalIdCount += localIds.length;
      await model.highlight(localIds, material);
    }
    batchIndex += 1;
    if (typeof onBatchApplied === 'function' && batchIndex % 2 === 0) {
      await onBatchApplied();
    }
    await yieldClayApplyTurn();
  }

  if (typeof onBatchApplied === 'function') await onBatchApplied();
  if (shouldCancel()) return finish(false);
  recordClayAppliedBlend(model, surfaceBlend);
  return finish(true, { ok: true });
}

/**
 * Sync fragments geometry, apply clay surface blend highlights, then sync again so
 * highlights survive fragments.update (which can clear transient highlight state).
 */
export async function applyClayViewportMaterials(
  model,
  preparedModel,
  cache,
  allLocalIds,
  params = {},
  { updateFragments, debugSource = 'viewport', blendOnly = false, shouldCancel = () => false, quietDebug = false } = {},
) {
  const buildResult = (ok, extra = {}) => ({
    ok: Boolean(ok) && !shouldCancel(),
    stats: extra.stats ?? createClayApplyStats(),
    updateBeforeOk: extra.updateBeforeOk ?? null,
    updateAfterOk: extra.updateAfterOk ?? null,
    blendOnly: extra.blendOnly ?? false,
    localIdsCount: allLocalIds?.length ?? 0,
    totalMs: extra.totalMs ?? null,
  });

  if (!model || !allLocalIds?.length) {
    const stats = createClayApplyStats();
    if (!quietDebug) {
      publishClayDebugMarkerUnlessCancelled(shouldCancel, {
        source: debugSource,
        phase: 'applyClayViewportMaterials',
        ok: false,
        reason: 'missing-model-or-local-ids',
        stats,
      });
    }
    return buildResult(false, { stats });
  }

  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { originalColorBlend } = resolveClayMaterialApplyParams(params);
  const surfaceBlend = Math.min(1, Math.max(0, Number(originalColorBlend) || 0));
  const reuseSnapshot = blendOnly && shouldReuseClayBlendFastPath(model, allLocalIds, surfaceBlend);
  if (!reuseSnapshot) {
    invalidateClayMaterialSnapshotIfStale(model, allLocalIds);
    if (surfaceBlend > 0 && surfaceBlend < 1) {
      await ensureClayMaterialDefinitionMap(model, allLocalIds);
    } else {
      await captureClayOriginalMaterialSnapshot(model, allLocalIds);
    }
  }
  if (shouldCancel()) return buildResult(false);

  let updateBeforeOk = null;
  if (!reuseSnapshot && typeof updateFragments === 'function') {
    updateBeforeOk = await updateFragments(true, { retryModelRegistration: true });
  }
  if (shouldCancel()) return buildResult(false, { updateBeforeOk, blendOnly: reuseSnapshot });

  const baseResult = await applyClayBaseMaterials(
    model,
    preparedModel,
    cache,
    allLocalIds,
    params,
    { debugSource, shouldCancel, quietDebug: true },
  );

  let updateAfterOk = null;
  if (baseResult.ok && typeof updateFragments === 'function') {
    updateAfterOk = await updateFragments(true, { retryModelRegistration: true });
  }

  if (shouldCancel()) {
    return buildResult(false, {
      stats: baseResult.stats,
      updateBeforeOk,
      updateAfterOk,
      blendOnly: reuseSnapshot,
    });
  }

  const finished = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const result = buildResult(baseResult.ok, {
    stats: baseResult.stats,
    updateBeforeOk,
    updateAfterOk,
    blendOnly: reuseSnapshot,
    totalMs: Math.round(finished - started),
  });

  if (!quietDebug) {
    publishClayDebugMarkerUnlessCancelled(shouldCancel, {
      source: debugSource,
      phase: 'applyClayViewportMaterials',
      ok: result.ok,
      stats: result.stats,
      updateBeforeOk: result.updateBeforeOk,
      updateAfterOk: result.updateAfterOk,
      blendOnly: result.blendOnly,
      totalMs: result.totalMs,
      localIdsCount: result.localIdsCount,
    });
  }

  return result;
}


export function renderClayFrame({
  renderer,
  clayComposerState,
  scene,
  overlayScene,
  camera,
  wireframeEdges,
  wireframeEnabled = false,
  wireframeOptions = {},
  selectionOverlay = null,
  backgroundColor = CLAY_BACKGROUND_DEFAULT,
  aoIntensity = CLAY_AO_INTENSITY_DEFAULT,
  aoRadius = CLAY_AO_RADIUS_DEFAULT,
  aoBias = CLAY_AO_BIAS_DEFAULT,
  aoDistance = CLAY_AO_DISTANCE_DEFAULT,
  aoSamples = CLAY_AO_SAMPLES_DEFAULT,
  aoResolution = CLAY_AO_RESOLUTION_DEFAULT,
  cameraDistance,
  modelRadius,
  boundsCenter,
} = {}) {
  if (!renderer || !clayComposerState?.composer || !scene || !camera) {
    return false;
  }

  applyViewportBackground(scene, renderer, backgroundColor);
  const restoreCameraDepth = applyClayCameraDepthRange(camera, {
    cameraDistance,
    modelRadius,
    boundsCenter,
  });
  const previousShadowMapEnabled = renderer.shadowMap?.enabled === true;
  try {
    updateClayComposerSettings(clayComposerState, {
      aoIntensity,
      aoRadius,
      aoBias,
      aoDistance,
      aoSamples,
      aoResolution,
      camera,
      cameraDistance,
      modelRadius,
    });
    // Clay SSAO uses RenderPass on the shared scene; sun cast shadows must not run here.
    if (renderer.shadowMap) {
      renderer.shadowMap.enabled = false;
    }
    clayComposerState.composer.render();

    const { width, height } = resolveClayComposerDepthSources(clayComposerState)[0] ?? {};
    const drawingSize = typeof renderer.getDrawingBufferSize === 'function'
      ? renderer.getDrawingBufferSize(new THREE.Vector2())
      : null;
    const passWidth = drawingSize?.x ?? width ?? 1;
    const passHeight = drawingSize?.y ?? height ?? 1;

    if (selectionOverlay?.parent && overlayScene) {
      renderer.setRenderTarget(null);
      const depthTest = populateScreenDepthFromScene(renderer, scene, camera);
      renderClaySelectionOverlayPass(renderer, overlayScene, camera, selectionOverlay, {
        depthTest,
      });
    }

    const wireframeOpacity = wireframeOptions.opacity;
    const shouldDrawWireframe = wireframeEnabled
      && wireframeEdges?.parent
      && overlayScene
      && (!Number.isFinite(wireframeOpacity) || wireframeOpacity > 0);
    if (shouldDrawWireframe) {
      renderer.setRenderTarget(null);
      const hiddenLines = wireframeOptions.hiddenLines !== false;
      let depthTest = hiddenLines;
      if (hiddenLines) {
        depthTest = populateScreenDepthFromScene(renderer, scene, camera);
      }
      renderWireframeOverlayPass(renderer, overlayScene, camera, wireframeEdges, {
        ...wireframeOptions,
        depthTest,
      });
      renderer.resetState?.();
    }
  } finally {
    if (renderer.shadowMap) {
      renderer.shadowMap.enabled = previousShadowMapEnabled;
    }
    restoreCameraDepth();
  }

  return true;
}

/** Saved "Rhino Arctic" style preset — applied when entering clay mode. */
export const RHINO_ARCTIC_CLAY_STYLE = {
  renderStyle: 'clay',
  viewportBackgroundColor: '#ffffff',
  clayAoIntensity: 25,
  clayAoRadius: 0.0005,
  clayAoBias: 0.05,
  clayAoDistance: 0.17,
  clayAoSamples: 256,
  clayAoResolution: 1,
  clayLightIntensity: 2.7,
  claySurfaceColor: '#f8f8f8',
  clayGlassOpacity: 0.31,
  clayOriginalColorBlend: 1,
  wireframeMode: false,
  wireframeColor: '#919191',
  wireframeOpacity: 0.5,
  wireframeLineWeight: 1.25,
  wireframeHiddenLines: true,
  showEnvironment: true,
  lightingMode: 'soft',
  environmentPreset: 'sunset',
};

export function getClayPresetWorkspacePatch() {
  return applyBimStyleSettings({}, RHINO_ARCTIC_CLAY_STYLE);
}
