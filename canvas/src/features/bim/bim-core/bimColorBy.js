import * as THREE from 'three';
import { RenderedFaces } from '@thatopen/fragments';
import { chunkLocalIds } from './bimPickPipeline.js';
import { isValidFragmentsLocalId, resolveFragmentsLocalIdsByGlobalIds } from './fragmentsSelection.js';
import { BIM_SELECTION_HIGHLIGHT_COLOR } from './bimClayRender.js';

/** Palette colours kept distinct from selection orange (`#f59e0b`). */
export const BIM_COLOR_BY_PALETTE = [
  '#38bdf8',
  '#34d399',
  '#a78bfa',
  '#fb7185',
  '#22c55e',
  '#6366f1',
  '#14b8a6',
  '#ec4899',
];

/** Minimum Euclidean distance in normalised RGB for a colour-by swatch vs selection orange. */
export const BIM_COLOR_BY_SELECTION_MIN_DISTANCE = 0.2;

const BIM_COLOR_BY_SELECTION_FALLBACKS = [
  '#38bdf8',
  '#6366f1',
  '#14b8a6',
  '#a78bfa',
  '#34d399',
  '#fb7185',
  '#ec4899',
  '#22c55e',
];

function normalizeHexColor(color) {
  const value = String(color ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
}

function hexToRgbNormalized(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16) / 255,
    g: parseInt(normalized.slice(3, 5), 16) / 255,
    b: parseInt(normalized.slice(5, 7), 16) / 255,
  };
}

export function colorDistanceRgb(hexA, hexB) {
  const a = hexToRgbNormalized(hexA);
  const b = hexToRgbNormalized(hexB);
  if (!a || !b) return 1;
  return Math.sqrt(
    (a.r - b.r) ** 2
    + (a.g - b.g) ** 2
    + (a.b - b.b) ** 2,
  );
}

export function isColorTooCloseToSelectionColor(
  color,
  {
    selectionColor = BIM_SELECTION_HIGHLIGHT_COLOR,
    minDistance = BIM_COLOR_BY_SELECTION_MIN_DISTANCE,
  } = {},
) {
  const normalized = normalizeHexColor(color);
  const selection = normalizeHexColor(selectionColor);
  if (!normalized || !selection) return false;
  if (normalized === selection) return true;
  return colorDistanceRgb(normalized, selection) < minDistance;
}

export function resolveSafeColorByHex(
  color,
  {
    selectionColor = BIM_SELECTION_HIGHLIGHT_COLOR,
    minDistance = BIM_COLOR_BY_SELECTION_MIN_DISTANCE,
  } = {},
) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return BIM_COLOR_BY_PALETTE[0];
  if (!isColorTooCloseToSelectionColor(normalized, { selectionColor, minDistance })) {
    return normalized;
  }
  for (const candidate of BIM_COLOR_BY_SELECTION_FALLBACKS) {
    if (!isColorTooCloseToSelectionColor(candidate, { selectionColor, minDistance })) {
      return candidate;
    }
  }
  return BIM_COLOR_BY_PALETTE[0];
}

export const BIM_COLOR_BY_DEFAULT_PROPERTY = 'ifcClass';

export function elementMatchesColorByIfcClassFilter(element, ifcClassFilter) {
  const filter = String(ifcClassFilter ?? '').trim();
  if (!filter) return true;
  return element?.ifcClass === filter;
}

export function filterElementsForColorByDisplay(elements = [], { ifcClassFilter } = {}) {
  const filter = String(ifcClassFilter ?? '').trim();
  if (!filter) return elements;
  return elements.filter((element) => elementMatchesColorByIfcClassFilter(element, filter));
}

export function shouldShowElementColorBySwatch(
  element,
  { colorByActive = false, ifcClassFilter } = {},
) {
  if (!colorByActive) return false;
  return elementMatchesColorByIfcClassFilter(element, ifcClassFilter);
}

export function resolveColorByGroupKey(element, property, preparedModel = null) {
  const normalizedProperty = String(property ?? '').trim();
  if (!normalizedProperty || normalizedProperty === 'ifcClass' || normalizedProperty === 'class') {
    return element?.ifcClass ?? 'Unclassified';
  }
  if (normalizedProperty === 'storey') return element?.storeyId ?? 'No storey';
  if (normalizedProperty === 'type' || normalizedProperty === 'typeName') {
    return element?.typeName ?? 'No type';
  }
  if (normalizedProperty === 'name') return element?.name ?? 'Unnamed';
  const properties = preparedModel?.properties ?? [];
  const match = properties.find((entry) => (
    entry.elementId === element?.id
    && (`${entry.psetName}.${entry.propertyName}` === normalizedProperty || entry.propertyName === normalizedProperty)
  ));
  return match?.value ?? `No ${normalizedProperty}`;
}

export function resolveStablePaletteIndex(groupKey) {
  const value = String(groupKey ?? '');
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 31) + value.charCodeAt(index)) >>> 0;
  }
  return hash % BIM_COLOR_BY_PALETTE.length;
}

export function resolveColorByPaletteColor(groupKey) {
  const base = BIM_COLOR_BY_PALETTE[resolveStablePaletteIndex(groupKey)];
  return resolveSafeColorByHex(base);
}

export function resolveElementColorByPaletteColor(
  element,
  property = BIM_COLOR_BY_DEFAULT_PROPERTY,
  preparedModel = null,
) {
  const groupKey = resolveColorByGroupKey(element, property, preparedModel);
  return resolveColorByPaletteColor(groupKey);
}

export function groupElementsByColorKey(elements = [], property = BIM_COLOR_BY_DEFAULT_PROPERTY, preparedModel = null) {
  const groups = new Map();
  for (const element of elements) {
    const groupKey = String(resolveColorByGroupKey(element, property, preparedModel));
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey).push(element);
  }
  return groups;
}

export function buildColorByHighlightMaterial(groupKey, paletteIndex = resolveStablePaletteIndex(groupKey)) {
  const color = resolveColorByPaletteColor(groupKey);
  return {
    color: new THREE.Color(color),
    renderedFaces: RenderedFaces.TWO,
    opacity: 0.92,
    transparent: true,
    customId: `canvas-bim-color-${paletteIndex}-${groupKey}`,
  };
}

export async function applyColorByHighlight(
  model,
  preparedModel,
  cache,
  {
    elements = [],
    property = BIM_COLOR_BY_DEFAULT_PROPERTY,
    chunkSize,
    shouldCancel = () => false,
  } = {},
) {
  if (!model || !Array.isArray(elements) || elements.length === 0) {
    return { groupCount: 0, localIdCount: 0 };
  }

  const idMap = await resolveFragmentsLocalIdsByGlobalIds(
    model,
    elements.map((element) => element.ifcGlobalId),
    cache,
  );
  if (shouldCancel()) {
    return { groupCount: 0, localIdCount: 0 };
  }

  const groups = groupElementsByColorKey(elements, property, preparedModel);
  let localIdCount = 0;

  for (const [groupKey, groupedElements] of groups) {
    if (shouldCancel()) break;
    const groupLocalIds = groupedElements
      .map((element) => idMap.get(element.ifcGlobalId))
      .filter(isValidFragmentsLocalId);
    if (groupLocalIds.length === 0) continue;

    const material = buildColorByHighlightMaterial(groupKey);
    for (const chunk of chunkLocalIds(groupLocalIds, chunkSize)) {
      if (shouldCancel()) break;
      await model.highlight(chunk, material);
    }
    localIdCount += groupLocalIds.length;
  }

  return { groupCount: groups.size, localIdCount };
}
