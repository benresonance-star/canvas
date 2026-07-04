import { describe, expect, it, vi } from 'vitest';
import {
  createFragmentsIdCache,
  findPreparedElementByGlobalId,
  getCachedGlobalIdByLocalId,
  getCachedLocalIdByGlobalId,
  normalizeIfcGlobalId,
  populateFragmentsIdCache,
  resolveFragmentsGlobalIdByLocalId,
  resolveFragmentsLocalIdsByGlobalIds,
  resolvePickGuidFromHit,
} from '../fragmentsSelection.js';

describe('Fragments ID cache and batched lookups', () => {
  it('populates and reads bidirectional cache entries', async () => {
    const model = {
      async getGuidsByLocalIds(localIds) {
        return localIds.map((localId) => (localId === 42 ? 'wall-guid' : null));
      },
    };
    const cache = createFragmentsIdCache();
    await populateFragmentsIdCache(model, cache, [42, 99]);

    expect(getCachedGlobalIdByLocalId(cache, 42)).toBe('wall-guid');
    expect(getCachedLocalIdByGlobalId(cache, 'wall-guid')).toBe(42);
    expect(getCachedGlobalIdByLocalId(cache, 99)).toBeNull();
  });

  it('batch-resolves GlobalIds with cache fill on miss', async () => {
    const getLocalIdsByGuids = vi.fn(async (guids) => (
      guids.map((guid) => (guid === 'slab-guid' ? 20 : guid === 'wall-guid' ? 42 : null))
    ));
    const model = { getLocalIdsByGuids };
    const cache = createFragmentsIdCache();
    cache.globalIdToLocalId.set('wall-guid', 42);
    cache.localIdToGlobalId.set(42, 'wall-guid');

    const resolved = await resolveFragmentsLocalIdsByGlobalIds(model, ['wall-guid', 'slab-guid'], cache);

    expect(resolved.get('wall-guid')).toBe(42);
    expect(resolved.get('slab-guid')).toBe(20);
    expect(getLocalIdsByGuids).toHaveBeenCalledTimes(1);
    expect(getLocalIdsByGuids).toHaveBeenCalledWith(['slab-guid']);
    expect(getCachedLocalIdByGlobalId(cache, 'slab-guid')).toBe(20);
  });

  it('resolves pick GUID from hit using cache and expressId fallback', async () => {
    const model = {
      async getGuidsByLocalIds(localIds) {
        return localIds.map((localId) => (localId === 42 ? 'wall-guid' : null));
      },
    };
    const cache = createFragmentsIdCache();
    await populateFragmentsIdCache(model, cache, [42]);

    await expect(resolvePickGuidFromHit(model, { localId: 42, itemId: 42 }, [], cache)).resolves.toMatchObject({
      guid: 'wall-guid',
      mappingFailure: null,
    });

    const elements = [{ id: 'ifc:wall-1', expressId: 10, ifcGlobalId: 'express-wall-guid' }];
    await expect(resolvePickGuidFromHit(model, { localId: 999, itemId: 10 }, elements, cache)).resolves.toMatchObject({
      guid: 'express-wall-guid',
      usedExpressIdFallback: true,
    });

    await expect(resolvePickGuidFromHit(model, { localId: 999, itemId: 888 }, elements, cache)).resolves.toMatchObject({
      guid: null,
      mappingFailure: 'guid-and-express-id-miss',
    });
  });

  it('falls back to Item.getGuid when bulk lookup misses', async () => {
    const getGuid = vi.fn(async () => 'item-guid');
    const model = {
      async getGuidsByLocalIds() {
        return [null];
      },
      getItem(localId) {
        return { getGuid };
      },
    };

    await expect(resolveFragmentsGlobalIdByLocalId(model, 7)).resolves.toBe('item-guid');
    expect(getGuid).toHaveBeenCalledTimes(1);
  });

  it('matches prepared elements with case-insensitive GlobalIds', () => {
    const elements = [{ id: 'ifc:1', ifcGlobalId: 'abc123XYZ' }];
    expect(normalizeIfcGlobalId(' abc123xyz ')).toBe('ABC123XYZ');
    expect(findPreparedElementByGlobalId(elements, 'abc123xyz')).toMatchObject({ id: 'ifc:1' });
  });
});
