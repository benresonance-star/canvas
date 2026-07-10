import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  buildGeometryRepairPatch,
  buildShellStatesFromMeshData,
  collectGeometryCandidateLocalIds,
  flipTriangleIndices,
  isFragmentsGeometryRetryError,
  loadElementMeshShells,
  loadElementMeshShellsWithRetry,
  loadMeshShellsForPreparedElement,
  loadMeshShellsForPreparedElementWithRetry,
  loadMeshShellsFromGeometryItems,
  collectGeometryItemIdsForLocalIds,
  normalizeGeometryRepairs,
  resolveElementGeometryLocalIds,
  resolveGeometrySourceLocalIdsForElement,
  extractMeshShellsFromSceneByItemIds,
  setFragmentsVisibilityWithRetry,
  shouldMaintainGeometryRepairOverlay,
  toggleShellFlip,
} from '../bimGeometryRepair.js';

describe('bimGeometryRepair', () => {
  it('flips triangle winding order', () => {
    expect(Array.from(flipTriangleIndices([0, 1, 2, 3, 4, 5]))).toEqual([0, 2, 1, 3, 5, 4]);
  });

  it('normalizes persisted geometry repairs by element id', () => {
    const repairs = normalizeGeometryRepairs({
      'ifc:car-1': {
        elementId: 'ifc:car-1',
        ifcGlobalId: 'car-1',
        flippedShellIndexes: [2, 0, 0],
      },
      empty: {
        elementId: 'ifc:empty',
        flippedShellIndexes: [],
      },
    });
    expect(repairs['ifc:car-1']).toEqual({
      elementId: 'ifc:car-1',
      ifcGlobalId: 'car-1',
      flippedShellIndexes: [0, 2],
      updatedAt: null,
    });
    expect(repairs['ifc:empty']).toBeUndefined();
  });

  it('builds shell states with flipped indices applied', () => {
    const shells = buildShellStatesFromMeshData([
      { positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: Uint16Array.from([0, 1, 2]) },
      { positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: Uint16Array.from([0, 1, 2]) },
    ], [1]);
    expect(shells[0].flipped).toBe(false);
    expect(shells[1].flipped).toBe(true);
    expect(Array.from(shells[1].meshData.indices)).toEqual([0, 2, 1]);
  });

  it('toggles shell flip membership and writes repair patches', () => {
    const element = { id: 'ifc:car-1', ifcGlobalId: 'car-1' };
    const first = buildGeometryRepairPatch({
      element,
      flippedShellIndexes: toggleShellFlip([], 1),
      previousRepairs: {},
    });
    expect(first['ifc:car-1'].flippedShellIndexes).toEqual([1]);

    const second = buildGeometryRepairPatch({
      element,
      flippedShellIndexes: toggleShellFlip(first['ifc:car-1'].flippedShellIndexes, 1),
      previousRepairs: first,
    });
    expect(second['ifc:car-1']).toBeUndefined();
  });

  it('keeps repair overlay only while actively editing the selected element', () => {
    const element = { id: 'ifc:car-1' };
    const repairs = {
      'ifc:car-1': {
        elementId: 'ifc:car-1',
        flippedShellIndexes: [1],
      },
    };

    expect(shouldMaintainGeometryRepairOverlay({
      geometryEditMode: true,
      selectedElement: element,
    })).toBe(true);
    expect(shouldMaintainGeometryRepairOverlay({
      geometryEditMode: false,
      selectedElement: element,
    })).toBe(false);
    expect(shouldMaintainGeometryRepairOverlay({
      geometryEditMode: false,
      geometryRepairs: repairs,
      selectedElement: element,
    })).toBe(false);
  });

  it('retries fragments visibility writes when the worker model is temporarily missing', async () => {
    const model = {
      setVisible: vi.fn()
        .mockRejectedValueOnce(new Error('Fragments: Model not found: canvas-bim-model'))
        .mockResolvedValueOnce(undefined),
    };

    const visible = await setFragmentsVisibilityWithRetry(model, [12, 13], false, {
      attempts: 2,
      onBeforeRetry: async () => {},
    });

    expect(model.setVisible).toHaveBeenCalledTimes(2);
    expect(visible).toBe(true);
  });

  it('retries fragments geometry reads when the worker model is temporarily missing', async () => {
    const meshData = {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: Uint16Array.from([0, 1, 2]),
    };
    const model = {
      getItemsGeometry: vi.fn()
        .mockRejectedValueOnce(new Error('Fragments: Model not found: canvas-bim-model'))
        .mockResolvedValueOnce([[meshData]]),
      getItemsChildren: vi.fn(async () => []),
    };

    const shells = await loadElementMeshShellsWithRetry(model, 42, {
      attempts: 2,
      onBeforeRetry: async () => {},
    });

    expect(model.getItemsGeometry).toHaveBeenCalledTimes(2);
    expect(model.getItemsGeometry).toHaveBeenCalledWith([42]);
    expect(shells).toHaveLength(1);
    expect(isFragmentsGeometryRetryError(new Error('Fragments: Model not found: canvas-bim-model'))).toBe(true);
  });

  it('loads geometry shells from spatial-structure children when the parent has none', async () => {
    const parentShell = {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: Uint16Array.from([0, 1, 2]),
    };
    const childShell = {
      positions: Float32Array.from([1, 0, 0, 2, 0, 0, 1, 1, 0]),
      indices: Uint16Array.from([0, 1, 2]),
    };
    const model = {
      getItemsChildren: vi.fn(async () => [11, 12]),
      getItemsGeometry: vi.fn(async (localIds) => (
        localIds.map((localId) => {
          if (localId === 10) return [];
          if (localId === 11) return [parentShell];
          if (localId === 12) return [childShell];
          return [];
        })
      )),
    };

    await expect(resolveElementGeometryLocalIds(model, 10)).resolves.toEqual([10, 11, 12]);
    await expect(loadElementMeshShells(model, 10)).resolves.toHaveLength(2);
    expect(model.getItemsGeometry).toHaveBeenCalledWith([10, 11, 12]);
  });

  it('prefers viewport picked local ids over proxy ids without geometry', async () => {
    const shell = {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: Uint16Array.from([0, 1, 2]),
    };
    const element = {
      id: 'ifc:car-1',
      ifcGlobalId: 'car-guid',
      expressId: 44,
    };
    const model = {
      getLocalIdsByGuids: vi.fn(async () => [10]),
      getItemsChildren: vi.fn(async () => []),
      getItemsWithGeometry: vi.fn(async () => []),
      getItemsGeometry: vi.fn(async (localIds) => (
        localIds.map((localId) => (localId === 200 ? [shell] : []))
      )),
    };

    const localIds = await resolveGeometrySourceLocalIdsForElement(model, {
      element,
      pickedLocalIds: [200],
    });
    expect(localIds).toEqual([200]);
    await expect(loadMeshShellsForPreparedElement(model, {
      element,
      pickedLocalIds: [200],
    })).resolves.toHaveLength(1);
  });

  it('extracts mesh shells from rendered scene meshes by item id', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(
      Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      3,
    ));
    geometry.setIndex([0, 1, 2]);
    const mesh = new THREE.Mesh(geometry);
    mesh.userData = { itemId: 55, tileId: 1 };
    const group = new THREE.Group();
    group.add(mesh);

    const shells = extractMeshShellsFromSceneByItemIds(group, [55]);
    expect(shells).toHaveLength(1);
    expect(shells[0].positions).toHaveLength(9);
    geometry.dispose();
  });

  it('loads one shell per geometry item for a local id', async () => {
    const shellA = {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: Uint16Array.from([0, 1, 2]),
    };
    const shellB = {
      positions: Float32Array.from([1, 0, 0, 2, 0, 0, 1, 1, 0]),
      indices: Uint16Array.from([0, 1, 2]),
    };
    const model = {
      getItemsWithGeometry: vi.fn(async () => ([
        {
          getLocalId: async () => 200,
          getGeometry: async () => ({ get: async () => [shellA] }),
        },
        {
          getLocalId: async () => 200,
          getGeometry: async () => ({ get: async () => [shellB] }),
        },
      ])),
    };

    await expect(loadMeshShellsFromGeometryItems(model, [200])).resolves.toHaveLength(2);
  });

  it('collects geometry item ids for local ids from the fragments model', async () => {
    const model = {
      getItemsIdsWithGeometry: vi.fn(async () => [10, 11, 12]),
      getItem: vi.fn((localId) => ({
        getLocalId: async () => localId,
      })),
    };

    await expect(collectGeometryItemIdsForLocalIds(model, [11, 99])).resolves.toEqual([11]);
  });

  it('falls back to scanning geometry items by GlobalId when proxy lookup misses', async () => {
    const shell = {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: Uint16Array.from([0, 1, 2]),
    };
    const element = {
      id: 'ifc:car-1',
      ifcGlobalId: 'car-guid',
      expressId: 44,
    };
    const model = {
      getLocalIdsByGuids: vi.fn(async () => [10]),
      getItemsChildren: vi.fn(async () => []),
      getItemsWithGeometry: vi.fn(async () => ([{
        getLocalId: async () => 200,
        getGuid: async () => 'car-guid',
      }])),
      getItemsGeometry: vi.fn(async (localIds) => (
        localIds.map((localId) => (localId === 200 ? [shell] : []))
      )),
    };

    expect(collectGeometryCandidateLocalIds({ element, primaryLocalId: 10 })).toEqual([10, 44]);
    await expect(resolveGeometrySourceLocalIdsForElement(model, { element })).resolves.toEqual([200]);
  });
});
