const ID_CACHE_BATCH_SIZE = 500;

export function isValidFragmentsLocalId(localId) {
  return Number.isInteger(localId) && localId >= 0;
}

export function createFragmentsIdCache() {
  return {
    globalIdToLocalId: new Map(),
    localIdToGlobalId: new Map(),
  };
}

export function getCachedLocalIdByGlobalId(cache, globalId) {
  if (!cache || !globalId) return null;
  const localId = cache.globalIdToLocalId.get(globalId);
  return isValidFragmentsLocalId(localId) ? localId : null;
}

export function getCachedGlobalIdByLocalId(cache, localId) {
  if (!cache || !isValidFragmentsLocalId(localId)) return null;
  return cache.localIdToGlobalId.get(localId) ?? null;
}

export async function populateFragmentsIdCache(model, cache, localIds = []) {
  if (!model || !cache || typeof model.getGuidsByLocalIds !== 'function') return cache;
  const pending = localIds.filter((localId) => (
    isValidFragmentsLocalId(localId) && !cache.localIdToGlobalId.has(localId)
  ));
  for (let index = 0; index < pending.length; index += ID_CACHE_BATCH_SIZE) {
    const chunk = pending.slice(index, index + ID_CACHE_BATCH_SIZE);
    const guids = await model.getGuidsByLocalIds(chunk);
    chunk.forEach((localId, chunkIndex) => {
      const globalId = guids[chunkIndex];
      if (!globalId) return;
      cache.localIdToGlobalId.set(localId, globalId);
      cache.globalIdToLocalId.set(globalId, localId);
    });
  }
  return cache;
}

function getCachedLocalIdByGlobalIdVariants(cache, globalId) {
  if (!cache || !globalId) return null;
  const direct = getCachedLocalIdByGlobalId(cache, globalId);
  if (direct != null) return direct;
  const normalized = normalizeIfcGlobalId(globalId);
  if (normalized === globalId) return null;
  return getCachedLocalIdByGlobalId(cache, normalized);
}

export async function resolveFragmentsLocalIdByGlobalId(model, globalId, cache = null) {
  if (!model || !globalId || typeof model.getLocalIdsByGuids !== 'function') return null;
  const cached = getCachedLocalIdByGlobalIdVariants(cache, globalId);
  if (cached != null) return cached;
  const candidates = [...new Set([
    String(globalId).trim(),
    normalizeIfcGlobalId(globalId),
  ].filter(Boolean))];
  for (const candidate of candidates) {
    const [localId] = await model.getLocalIdsByGuids([candidate]);
    if (!isValidFragmentsLocalId(localId)) continue;
    if (cache) {
      cache.globalIdToLocalId.set(candidate, localId);
      cache.localIdToGlobalId.set(localId, candidate);
      if (candidate !== globalId) {
        cache.globalIdToLocalId.set(globalId, localId);
      }
    }
    return localId;
  }
  return null;
}

export async function resolveFragmentsLocalIdForPreparedElement(model, element, cache = null) {
  if (!model || !element) return null;
  if (element.ifcGlobalId) {
    const resolved = await resolveFragmentsLocalIdByGlobalId(model, element.ifcGlobalId, cache);
    if (isValidFragmentsLocalId(resolved)) return resolved;
  }
  const expressLocalId = Number(element.expressId);
  if (isValidFragmentsLocalId(expressLocalId)) return expressLocalId;
  return null;
}

export function normalizeIfcGlobalId(globalId) {
  return String(globalId ?? '').trim().toUpperCase();
}

export function findPreparedElementByGlobalId(elements = [], globalId) {
  if (!globalId) return null;
  const normalized = normalizeIfcGlobalId(globalId);
  return elements.find((element) => normalizeIfcGlobalId(element.ifcGlobalId) === normalized) ?? null;
}

export async function resolveFragmentsGlobalIdByLocalId(model, localId, cache = null) {
  if (!model || !isValidFragmentsLocalId(localId) || typeof model.getGuidsByLocalIds !== 'function') return null;
  const cached = getCachedGlobalIdByLocalId(cache, localId);
  if (cached) return cached;
  const [globalId] = await model.getGuidsByLocalIds([localId]);
  if (globalId) {
    if (cache) {
      cache.localIdToGlobalId.set(localId, globalId);
      cache.globalIdToLocalId.set(globalId, localId);
    }
    return globalId;
  }
  if (typeof model.getItem === 'function') {
    try {
      const itemGuid = await model.getItem(localId).getGuid();
      if (itemGuid) {
        if (cache) {
          cache.localIdToGlobalId.set(localId, itemGuid);
          cache.globalIdToLocalId.set(itemGuid, localId);
        }
        return itemGuid;
      }
    } catch {
      // Item lookup can fail for stale worker ids; fall through.
    }
  }
  return null;
}

export async function resolveFragmentsLocalIdsByGlobalIds(model, globalIds = [], cache = null) {
  const uniqueGlobalIds = [...new Set(globalIds.filter(Boolean))];
  const resolved = new Map();
  const missing = [];
  uniqueGlobalIds.forEach((globalId) => {
    const cached = getCachedLocalIdByGlobalIdVariants(cache, globalId);
    if (cached != null) resolved.set(globalId, cached);
    else missing.push(globalId);
  });
  if (missing.length === 0 || !model || typeof model.getLocalIdsByGuids !== 'function') return resolved;
  const localIds = await model.getLocalIdsByGuids(missing);
  missing.forEach((globalId, index) => {
    const localId = localIds[index];
    if (!isValidFragmentsLocalId(localId)) return;
    resolved.set(globalId, localId);
    if (cache) {
      cache.globalIdToLocalId.set(globalId, localId);
      cache.localIdToGlobalId.set(localId, globalId);
    }
  });
  return resolved;
}

export async function resolvePickGuidFromHit(model, hit, elements = [], cache = null) {
  if (!hit || typeof hit !== 'object') return { guid: null, mappingFailure: 'no-hit' };
  const localIdCandidates = [hit.itemId, hit.localId].filter(isValidFragmentsLocalId);
  for (const localId of localIdCandidates) {
    const guid = await resolveFragmentsGlobalIdByLocalId(model, localId, cache);
    if (guid) return { guid, mappingFailure: null };
  }
  const matchedElement = resolvePreparedElementFromFragmentsHit(elements, hit);
  if (matchedElement?.ifcGlobalId) {
    return { guid: matchedElement.ifcGlobalId, mappingFailure: null, usedExpressIdFallback: true };
  }
  if (localIdCandidates.length === 0) return { guid: null, mappingFailure: 'invalid-local-id' };
  return { guid: null, mappingFailure: 'guid-and-express-id-miss' };
}

export function resolvePreparedElementFromFragmentsHit(elements = [], hit = null) {
  if (!hit) return null;
  const candidates = [hit.localId, hit.itemId].filter((id) => Number.isInteger(id));
  for (const candidate of candidates) {
    const match = elements.find((element) => Number(element.expressId) === candidate);
    if (match) return match;
  }
  return null;
}
