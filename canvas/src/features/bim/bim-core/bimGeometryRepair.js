import {
  isValidFragmentsLocalId,
  normalizeIfcGlobalId,
  resolveFragmentsLocalIdForPreparedElement,
} from './fragmentsSelection.js';

export function normalizeGeometryGroups(geometryGroups) {
  if (!geometryGroups) return [];
  if (Array.isArray(geometryGroups)) {
    return geometryGroups.map((group) => (Array.isArray(group) ? group : [group]));
  }
  if (typeof geometryGroups === 'object') {
    return Object.values(geometryGroups).map((group) => (Array.isArray(group) ? group : [group]));
  }
  return [];
}

export function flattenItemsGeometry(geometryGroups) {
  const shells = [];
  normalizeGeometryGroups(geometryGroups).forEach((meshGroup) => {
    meshGroup.forEach((meshData) => {
      if (!meshData?.positions?.length) return;
      shells.push(meshData);
    });
  });
  return shells;
}

export function cloneNumericArray(values) {
  if (!values?.length) return null;
  if (values instanceof Float32Array) return new Float32Array(values);
  if (values instanceof Uint32Array) return new Uint32Array(values);
  if (values instanceof Uint16Array) return new Uint16Array(values);
  return Float32Array.from(values);
}

export function cloneMeshData(meshData) {
  if (!meshData?.positions?.length) return null;
  return {
    ...meshData,
    positions: cloneNumericArray(meshData.positions),
    indices: cloneNumericArray(meshData.indices),
  };
}

export function flipTriangleIndices(indices) {
  if (!indices?.length) return indices;
  const flipped = indices instanceof Uint32Array || indices instanceof Uint16Array
    ? new indices.constructor(indices)
    : Array.from(indices);
  for (let index = 0; index + 2 < flipped.length; index += 3) {
    const second = flipped[index + 1];
    flipped[index + 1] = flipped[index + 2];
    flipped[index + 2] = second;
  }
  return flipped;
}

export function meshDataWithFlipState(meshData, flipped = false) {
  const cloned = cloneMeshData(meshData);
  if (!cloned) return null;
  if (flipped && cloned.indices?.length) {
    cloned.indices = flipTriangleIndices(cloned.indices);
  }
  return cloned;
}

export function normalizeFlippedShellIndexes(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value.filter((entry) => Number.isInteger(entry) && entry >= 0),
  )].sort((left, right) => left - right);
}

export function normalizeGeometryRepairEntry(entry, fallbackId = '') {
  if (!entry || typeof entry !== 'object') return null;
  const elementId = String(entry.elementId ?? fallbackId ?? '').trim();
  if (!elementId) return null;
  const flippedShellIndexes = normalizeFlippedShellIndexes(entry.flippedShellIndexes);
  if (flippedShellIndexes.length === 0) return null;
  const ifcGlobalId = String(entry.ifcGlobalId ?? elementId.replace(/^ifc:/i, '')).trim();
  return {
    elementId,
    ifcGlobalId,
    flippedShellIndexes,
    updatedAt: entry.updatedAt ?? null,
  };
}

export function normalizeGeometryRepairs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const repairs = {};
  Object.entries(value).forEach(([key, entry]) => {
    const normalized = normalizeGeometryRepairEntry(entry, key);
    if (normalized) repairs[normalized.elementId] = normalized;
  });
  return repairs;
}

export function getGeometryRepairForElement(geometryRepairs, elementId) {
  if (!elementId) return null;
  return normalizeGeometryRepairEntry(geometryRepairs?.[elementId], elementId);
}

export function resolveFlippedShellIndexes(geometryRepairs, elementId) {
  return getGeometryRepairForElement(geometryRepairs, elementId)?.flippedShellIndexes ?? [];
}

export function buildGeometryRepairPatch({
  element,
  flippedShellIndexes,
  previousRepairs = {},
}) {
  const elementId = element?.id;
  if (!elementId) return previousRepairs;
  const nextRepairs = { ...normalizeGeometryRepairs(previousRepairs) };
  const normalizedIndexes = normalizeFlippedShellIndexes(flippedShellIndexes);
  if (normalizedIndexes.length === 0) {
    delete nextRepairs[elementId];
    return nextRepairs;
  }
  nextRepairs[elementId] = {
    elementId,
    ifcGlobalId: element.ifcGlobalId ?? elementId.replace(/^ifc:/i, ''),
    flippedShellIndexes: normalizedIndexes,
    updatedAt: new Date().toISOString(),
  };
  return nextRepairs;
}

export function toggleShellFlip(flippedShellIndexes, shellIndex) {
  const next = new Set(normalizeFlippedShellIndexes(flippedShellIndexes));
  if (next.has(shellIndex)) next.delete(shellIndex);
  else next.add(shellIndex);
  return normalizeFlippedShellIndexes([...next]);
}

export function shouldMaintainGeometryRepairOverlay({
  geometryEditMode = false,
  selectedElement = null,
} = {}) {
  return geometryEditMode && Boolean(selectedElement?.id);
}

export function isFragmentsGeometryRetryError(error) {
  const message = String(error?.message ?? error);
  return message.includes('Fragments: Model not found')
    || message.includes('Worker was terminated')
    || message.includes('Worker has been terminated');
}

export function collectGeometryCandidateLocalIds({
  element = null,
  primaryLocalId = null,
  pickedLocalIds = [],
} = {}) {
  const candidates = new Set();
  const addCandidate = (localId) => {
    if (isValidFragmentsLocalId(localId)) candidates.add(localId);
  };

  pickedLocalIds.forEach(addCandidate);
  addCandidate(primaryLocalId);
  if (element) addCandidate(Number(element.expressId));
  return [...candidates];
}

export async function expandGeometryCandidateLocalIds(model, candidateLocalIds = []) {
  const expanded = new Set(candidateLocalIds.filter(isValidFragmentsLocalId));
  if (!expanded.size || typeof model?.getItemsChildren !== 'function') {
    return [...expanded];
  }

  for (const localId of [...expanded]) {
    try {
      const children = await model.getItemsChildren([localId]);
      for (const childId of children ?? []) {
        if (isValidFragmentsLocalId(childId)) expanded.add(childId);
      }
    } catch {
      // Children lookup can fail while the fragments worker is reloading.
    }
  }
  return [...expanded];
}

export async function loadMeshShellsForItemLocalId(model, localId) {
  if (!model || !isValidFragmentsLocalId(localId)) return [];

  if (typeof model.getItem === 'function') {
    try {
      const geometry = await model.getItem(localId).getGeometry?.();
      const meshDataList = await geometry?.get?.();
      const directShells = (meshDataList ?? []).filter((meshData) => meshData?.positions?.length);
      if (directShells.length) return directShells;
    } catch {
      // Direct item lookup can fail while the worker is reloading.
    }
  }

  if (typeof model.getItemsWithGeometry !== 'function') return [];

  try {
    const items = await model.getItemsWithGeometry();
    for (const item of items ?? []) {
      const itemLocalId = await item.getLocalId?.();
      if (itemLocalId !== localId) continue;
      const geometry = await item.getGeometry?.();
      const meshDataList = await geometry?.get?.();
      return (meshDataList ?? []).filter((meshData) => meshData?.positions?.length);
    }
  } catch {
    // Item geometry lookup can fail while the worker is reloading.
  }

  return [];
}

export async function loadMeshShellsFromGeometryItems(model, localIds = []) {
  const targetLocalIds = new Set(localIds.filter(isValidFragmentsLocalId));
  if (!model || !targetLocalIds.size || typeof model.getItemsWithGeometry !== 'function') {
    return [];
  }

  const shells = [];
  try {
    const items = await model.getItemsWithGeometry();
    for (const item of items ?? []) {
      const itemLocalId = await item.getLocalId?.();
      if (!targetLocalIds.has(itemLocalId)) continue;
      const geometry = await item.getGeometry?.();
      const meshDataList = await geometry?.get?.();
      for (const meshData of meshDataList ?? []) {
        if (meshData?.positions?.length) shells.push(meshData);
      }
    }
  } catch {
    // Full-model geometry scan can fail while the worker is reloading.
  }
  return shells;
}

export async function collectGeometryItemIdsForLocalIds(model, localIds = []) {
  const targetLocalIds = new Set(localIds.filter(isValidFragmentsLocalId));
  if (!model || !targetLocalIds.size) return [];

  const itemIds = new Set();
  if (typeof model.getItemsIdsWithGeometry === 'function') {
    try {
      const geometryItemIds = await model.getItemsIdsWithGeometry();
      for (const geometryItemId of geometryItemIds ?? []) {
        if (!isValidFragmentsLocalId(geometryItemId)) continue;
        if (targetLocalIds.has(geometryItemId)) {
          itemIds.add(geometryItemId);
          continue;
        }
        if (typeof model.getItem !== 'function') continue;
        try {
          const itemLocalId = await model.getItem(geometryItemId).getLocalId?.();
          if (targetLocalIds.has(itemLocalId)) itemIds.add(geometryItemId);
        } catch {
          // Item lookup can fail while the worker is reloading.
        }
      }
      if (itemIds.size) return [...itemIds];
    } catch {
      // Geometry item id lookup can fail while the worker is reloading.
    }
  }

  if (typeof model.getItemsWithGeometry !== 'function') return [];

  try {
    const items = await model.getItemsWithGeometry();
    for (const item of items ?? []) {
      const itemLocalId = await item.getLocalId?.();
      if (!targetLocalIds.has(itemLocalId)) continue;
      if (isValidFragmentsLocalId(itemLocalId)) itemIds.add(itemLocalId);
    }
  } catch {
    // Full-model geometry scan can fail while the worker is reloading.
  }
  return [...itemIds];
}

function meshToShellData(mesh) {
  const position = mesh.geometry?.getAttribute?.('position');
  if (!position?.array?.length) return null;

  const positions = position.array instanceof Float32Array
    ? new Float32Array(position.array)
    : Float32Array.from(position.array);
  const indexAttribute = mesh.geometry.getIndex();
  let indices;
  if (indexAttribute?.array?.length) {
    indices = indexAttribute.array instanceof Uint32Array || indexAttribute.array instanceof Uint16Array
      ? new indexAttribute.array.constructor(indexAttribute.array)
      : Uint32Array.from(indexAttribute.array);
  }

  return {
    positions,
    indices,
    transform: mesh.matrix.clone(),
  };
}

export function extractMeshShellsFromSceneByItemIds(modelRoot, itemIds = []) {
  const itemIdSet = new Set(itemIds.filter(isValidFragmentsLocalId));
  if (!modelRoot || itemIdSet.size === 0) return [];

  const shells = [];
  modelRoot.traverse((child) => {
    if (!child?.isMesh || !child.geometry || !itemIdSet.has(child.userData?.itemId)) return;
    const shell = meshToShellData(child);
    if (shell) shells.push(shell);
  });

  return shells;
}

export function extractMeshShellsFromSceneSubtree(root) {
  if (!root) return [];

  const shells = [];
  root.traverse((child) => {
    if (!child?.isMesh || !child.geometry) return;
    const shell = meshToShellData(child);
    if (shell) shells.push(shell);
  });
  return shells;
}

export async function loadMeshShellsFromSceneForPick(model, {
  itemIds = [],
  localIds = [],
} = {}) {
  const modelRoot = model?.object;
  if (!modelRoot) return [];

  const uniqueLocalIds = [...new Set(localIds.filter(isValidFragmentsLocalId))];
  const resolvedItemIds = [
    ...new Set([
      ...itemIds.filter(isValidFragmentsLocalId),
      ...(await collectGeometryItemIdsForLocalIds(model, uniqueLocalIds)),
    ]),
  ];

  const sceneShells = extractMeshShellsFromSceneByItemIds(modelRoot, resolvedItemIds);
  if (sceneShells.length) return sceneShells;

  const shells = [];
  for (const localId of uniqueLocalIds) {
    shells.push(...await loadMeshShellsForItemLocalId(model, localId));
  }
  return shells;
}

async function localIdHasMeshShells(model, localId) {
  if (!model || !isValidFragmentsLocalId(localId)) return false;
  try {
    const geometryGroups = await model.getItemsGeometry?.([localId]);
    if (flattenItemsGeometry(geometryGroups).length > 0) return true;
  } catch {
    // Fall through to item/scene lookups below.
  }
  if ((await loadMeshShellsFromGeometryItems(model, [localId])).length > 0) return true;
  return (await loadMeshShellsForItemLocalId(model, localId)).length > 0;
}

export async function filterLocalIdsWithMeshShells(model, localIds = []) {
  if (!model) return [];
  const uniqueLocalIds = [...new Set(localIds.filter(isValidFragmentsLocalId))];
  const geometryLocalIds = [];

  for (const localId of uniqueLocalIds) {
    if (await localIdHasMeshShells(model, localId)) {
      geometryLocalIds.push(localId);
    }
  }

  return geometryLocalIds;
}

export async function findGeometryLocalIdsFromItemsWithGeometry(model, element, {
  pickedLocalIds = [],
} = {}) {
  if (!model || !element || typeof model.getItemsWithGeometry !== 'function') return [];

  const targetGuid = normalizeIfcGlobalId(element.ifcGlobalId);
  const expressLocalId = Number(element.expressId);
  const pickedSet = new Set(pickedLocalIds.filter(isValidFragmentsLocalId));
  const matches = new Set();

  try {
    const items = await model.getItemsWithGeometry();
    for (const item of items ?? []) {
      const localId = await item.getLocalId?.();
      if (!isValidFragmentsLocalId(localId)) continue;
      if (pickedSet.has(localId)) {
        matches.add(localId);
        continue;
      }
      if (isValidFragmentsLocalId(expressLocalId) && localId === expressLocalId) {
        matches.add(localId);
        continue;
      }
      if (!targetGuid) continue;
      const guid = await item.getGuid?.();
      if (guid && normalizeIfcGlobalId(guid) === targetGuid) {
        matches.add(localId);
      }
    }
  } catch {
    // Full-model geometry scan can fail while the worker is reloading.
  }

  return [...matches];
}

export async function resolveElementGeometryLocalIds(model, primaryLocalId) {
  if (!isValidFragmentsLocalId(primaryLocalId)) return [];
  return expandGeometryCandidateLocalIds(model, [primaryLocalId]);
}

export async function resolveGeometrySourceLocalIdsForElement(model, {
  element = null,
  cache = null,
  pickedLocalIds = [],
} = {}) {
  if (!model) return [];

  const primaryLocalId = element
    ? await resolveFragmentsLocalIdForPreparedElement(model, element, cache)
    : null;
  const candidateLocalIds = await expandGeometryCandidateLocalIds(
    model,
    collectGeometryCandidateLocalIds({
      element,
      primaryLocalId,
      pickedLocalIds,
    }),
  );

  let geometryLocalIds = await filterLocalIdsWithMeshShells(model, candidateLocalIds);
  const geometryMatches = element
    ? await findGeometryLocalIdsFromItemsWithGeometry(model, element, { pickedLocalIds })
    : [];
  if (!geometryLocalIds.length && geometryMatches.length) {
    geometryLocalIds = await filterLocalIdsWithMeshShells(model, geometryMatches);
    if (!geometryLocalIds.length) geometryLocalIds = [...new Set(geometryMatches)];
  }
  if (!geometryLocalIds.length && pickedLocalIds.length) {
    geometryLocalIds = [...new Set(pickedLocalIds.filter(isValidFragmentsLocalId))];
  }

  return geometryLocalIds;
}

export async function loadMeshShellsForGeometryLocalIds(model, geometryLocalIds = [], {
  itemIds = [],
  localIds = [],
} = {}) {
  const ids = [...new Set(geometryLocalIds.filter(isValidFragmentsLocalId))];
  const fallbackLocalIds = [...new Set([
    ...ids,
    ...localIds.filter(isValidFragmentsLocalId),
  ])];
  if (!model) return [];

  if (ids.length && typeof model.getItemsGeometry === 'function') {
    try {
      const geometryGroups = await model.getItemsGeometry(ids);
      const shells = flattenItemsGeometry(geometryGroups);
      if (shells.length) return shells;
    } catch {
      // Fall through to per-item and scene lookups below.
    }
  }

  const geometryItemShells = await loadMeshShellsFromGeometryItems(model, fallbackLocalIds);
  if (geometryItemShells.length) return geometryItemShells;

  const shells = [];
  for (const localId of ids) {
    shells.push(...await loadMeshShellsForItemLocalId(model, localId));
  }
  if (shells.length) return shells;

  return loadMeshShellsFromSceneForPick(model, {
    itemIds,
    localIds: fallbackLocalIds,
  });
}

export async function loadMeshShellsForPreparedElement(model, {
  element = null,
  cache = null,
  pickedLocalIds = [],
  pickedItemIds = [],
} = {}) {
  const geometryLocalIds = await resolveGeometrySourceLocalIdsForElement(model, {
    element,
    cache,
    pickedLocalIds,
  });
  return loadMeshShellsForGeometryLocalIds(model, geometryLocalIds, {
    itemIds: pickedItemIds,
    localIds: pickedLocalIds,
  });
}

export async function resolveHideLocalIdsForGeometryRepair(model, {
  element = null,
  cache = null,
  pickedLocalIds = [],
  geometryLocalIds = [],
} = {}) {
  const hideLocalIds = [...new Set([
    ...geometryLocalIds.filter(isValidFragmentsLocalId),
    ...pickedLocalIds.filter(isValidFragmentsLocalId),
  ])];
  if (hideLocalIds.length) return hideLocalIds;

  const resolved = await resolveGeometrySourceLocalIdsForElement(model, {
    element,
    cache,
    pickedLocalIds,
  });
  if (resolved.length) return resolved;

  return [...new Set(pickedLocalIds.filter(isValidFragmentsLocalId))];
}

export async function loadMeshShellsAcrossRuntimeModels(runtimeContexts = [], {
  element = null,
  cache = null,
  pickedLocalIds = [],
  pickedItemIds = [],
  preferredModel = null,
} = {}) {
  const orderedContexts = [];
  const seenModels = new Set();
  const pushContext = (context) => {
    if (!context?.model || seenModels.has(context.model)) return;
    seenModels.add(context.model);
    orderedContexts.push(context);
  };

  if (preferredModel) {
    pushContext(runtimeContexts.find((entry) => entry.model === preferredModel) ?? { model: preferredModel, idCache: cache });
  }
  runtimeContexts.forEach(pushContext);

  for (const context of orderedContexts) {
    if (!context?.model) continue;
    const geometryLocalIds = await resolveGeometrySourceLocalIdsForElement(context.model, {
      element,
      cache: context.idCache ?? cache,
      pickedLocalIds,
    });
    const shells = await loadMeshShellsForGeometryLocalIds(context.model, geometryLocalIds, {
      itemIds: pickedItemIds,
      localIds: pickedLocalIds,
    });
    if (shells.length) {
      const hideLocalIds = await resolveHideLocalIdsForGeometryRepair(context.model, {
        element,
        cache: context.idCache ?? cache,
        pickedLocalIds,
        geometryLocalIds,
      });
      return {
        model: context.model,
        geometryLocalIds: hideLocalIds,
        shells,
      };
    }
  }
  return null;
}

export async function loadElementMeshShells(model, localId) {
  if (!model || localId == null || typeof model.getItemsGeometry !== 'function') return [];
  const geometryLocalIds = await resolveElementGeometryLocalIds(model, localId);
  return loadMeshShellsForGeometryLocalIds(model, geometryLocalIds);
}

export async function loadMeshShellsForPreparedElementWithRetry(model, {
  element = null,
  cache = null,
  pickedLocalIds = [],
  pickedItemIds = [],
  runtimeContexts = null,
  attempts = 8,
  ensureReady,
  onBeforeRetry,
  shouldAbort = () => false,
} = {}) {
  if (!model && !runtimeContexts?.length) return [];

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (shouldAbort()) return [];
    if (attempt === 0) {
      await ensureReady?.();
      if (shouldAbort()) return [];
    } else {
      await onBeforeRetry?.(attempt);
      if (shouldAbort()) return [];
    }
    try {
      const resolved = runtimeContexts?.length
        ? await loadMeshShellsAcrossRuntimeModels(runtimeContexts, {
          element,
          cache,
          pickedLocalIds,
          pickedItemIds,
          preferredModel: model,
        })
        : {
          model,
          shells: await loadMeshShellsForPreparedElement(model, {
            element,
            cache,
            pickedLocalIds,
            pickedItemIds,
          }),
        };
      if (resolved?.shells?.length) return resolved;
    } catch (error) {
      if (!isFragmentsGeometryRetryError(error)) throw error;
    }
  }
  return null;
}

export async function loadElementMeshShellsWithRetry(model, localId, {
  attempts = 8,
  ensureReady,
  onBeforeRetry,
  shouldAbort = () => false,
} = {}) {
  if (!model || localId == null || typeof model.getItemsGeometry !== 'function') return [];

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (shouldAbort()) return [];
    if (attempt === 0) {
      await ensureReady?.();
      if (shouldAbort()) return [];
    } else {
      await onBeforeRetry?.(attempt);
      if (shouldAbort()) return [];
    }
    try {
      const shells = await loadElementMeshShells(model, localId);
      if (shells.length) return shells;
    } catch (error) {
      if (!isFragmentsGeometryRetryError(error)) throw error;
    }
  }
  return [];
}

export async function setFragmentsVisibilityWithRetry(model, localIds, visible, {
  attempts = 8,
  ensureReady,
  onBeforeRetry,
  shouldAbort = () => false,
} = {}) {
  if (!model || !localIds?.length || typeof model.setVisible !== 'function') return false;
  const ids = [...new Set(localIds.filter((localId) => localId != null))];
  if (!ids.length) return false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (shouldAbort()) return false;
    if (attempt === 0) {
      await ensureReady?.();
      if (shouldAbort()) return false;
    } else if (attempt > 0) {
      await onBeforeRetry?.(attempt);
      if (shouldAbort()) return false;
    }
    try {
      await model.setVisible(ids, visible);
      return true;
    } catch (error) {
      if (!isFragmentsGeometryRetryError(error)) throw error;
    }
  }
  return false;
}

export function buildShellStatesFromMeshData(meshShells, flippedShellIndexes = []) {
  const flipped = new Set(normalizeFlippedShellIndexes(flippedShellIndexes));
  return meshShells.map((meshData, index) => ({
    index,
    meshData: meshDataWithFlipState(meshData, flipped.has(index)),
    flipped: flipped.has(index),
  }));
}
