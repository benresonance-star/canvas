import * as THREE from 'three';
import { RenderedFaces } from '@thatopen/fragments';
import { chunkLocalIds } from './bimPickPipeline.js';
import { isValidFragmentsLocalId, resolveFragmentsLocalIdsByGlobalIds } from './fragmentsSelection.js';

export const BIM_COLOR_BY_PALETTE = [
  '#eab308',
  '#38bdf8',
  '#fb7185',
  '#34d399',
  '#a78bfa',
  '#f97316',
  '#f472b6',
  '#22c55e',
];

export const BIM_COLOR_BY_DEFAULT_PROPERTY = 'ifcClass';

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
  return BIM_COLOR_BY_PALETTE[resolveStablePaletteIndex(groupKey)];
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
  const color = BIM_COLOR_BY_PALETTE[paletteIndex % BIM_COLOR_BY_PALETTE.length];
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
