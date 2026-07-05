import { chunkLocalIds } from './bimPickPipeline.js';
import { resolveElementLayer } from './bimElementLayers.js';
import { isValidFragmentsLocalId, resolveFragmentsLocalIdsByGlobalIds } from './fragmentsSelection.js';

export const UNASSIGNED_STOREY_LABEL = 'Unassigned';
export const UNASSIGNED_LAYER_LABEL = 'Unassigned';

function buildPropertiesByElement(preparedModel) {
  const map = new Map();
  for (const property of preparedModel?.properties ?? []) {
    if (!map.has(property.elementId)) map.set(property.elementId, []);
    map.get(property.elementId).push(property);
  }
  return map;
}

export function elementStoreyKey(element) {
  const storey = String(element?.storeyId ?? '').trim();
  return storey || UNASSIGNED_STOREY_LABEL;
}

export function elementLayerKey(element, properties = []) {
  return resolveElementLayer(properties) || UNASSIGNED_LAYER_LABEL;
}

function sortCatalogEntries(entries) {
  return entries.sort((left, right) => {
    if (left.id === UNASSIGNED_STOREY_LABEL || left.id === UNASSIGNED_LAYER_LABEL) return 1;
    if (right.id === UNASSIGNED_STOREY_LABEL || right.id === UNASSIGNED_LAYER_LABEL) return -1;
    return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' });
  });
}

export function buildBimLayerCatalog(preparedModel) {
  const propertiesByElement = buildPropertiesByElement(preparedModel);
  const storeyCounts = new Map();
  const layerCounts = new Map();

  for (const element of preparedModel?.elements ?? []) {
    const storeyKey = elementStoreyKey(element);
    storeyCounts.set(storeyKey, (storeyCounts.get(storeyKey) ?? 0) + 1);
    const layerKey = elementLayerKey(element, propertiesByElement.get(element.id) ?? []);
    layerCounts.set(layerKey, (layerCounts.get(layerKey) ?? 0) + 1);
  }

  const toEntries = (counts) => sortCatalogEntries(
    [...counts.entries()].map(([id, count]) => ({ id, label: id, count })),
  );

  return {
    storeys: toEntries(storeyCounts),
    layers: toEntries(layerCounts),
  };
}

export function normalizeHiddenLayerState(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

export function isElementHiddenByLayerFilter(element, properties, hiddenStoreys, hiddenLayers) {
  const hiddenStoreySet = new Set(normalizeHiddenLayerState(hiddenStoreys));
  const hiddenLayerSet = new Set(normalizeHiddenLayerState(hiddenLayers));
  if (hiddenStoreySet.size === 0 && hiddenLayerSet.size === 0) return false;
  return hiddenStoreySet.has(elementStoreyKey(element))
    || hiddenLayerSet.has(elementLayerKey(element, properties));
}

export async function applyBimLayerStoreyVisibility(
  model,
  preparedModel,
  cache,
  { hiddenStoreys = [], hiddenLayers = [] } = {},
) {
  const normalizedStoreys = normalizeHiddenLayerState(hiddenStoreys);
  const normalizedLayers = normalizeHiddenLayerState(hiddenLayers);
  if (!model || (normalizedStoreys.length === 0 && normalizedLayers.length === 0)) return;

  const hiddenStoreySet = new Set(normalizedStoreys);
  const hiddenLayerSet = new Set(normalizedLayers);
  const propertiesByElement = buildPropertiesByElement(preparedModel);
  const elementsToHide = (preparedModel?.elements ?? []).filter((element) => (
    hiddenStoreySet.has(elementStoreyKey(element))
    || hiddenLayerSet.has(elementLayerKey(element, propertiesByElement.get(element.id) ?? []))
  ));
  if (elementsToHide.length === 0) return;

  const idMap = await resolveFragmentsLocalIdsByGlobalIds(
    model,
    elementsToHide.map((element) => element.ifcGlobalId),
    cache,
  );
  const localIds = [...idMap.values()].filter(isValidFragmentsLocalId);
  for (const chunk of chunkLocalIds(localIds)) {
    await model.setVisible(chunk, false);
  }
}
