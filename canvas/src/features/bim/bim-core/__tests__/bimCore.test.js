import { describe, expect, it } from 'vitest';
import { computeBimModelFingerprint } from '../fingerprint.js';
import { createMemoryBimRepository } from '../bimRepository.js';
import { prepareBimModel } from '../prepareBimModel.js';
import { executeBqlQuery, validateBqlQuery } from '../bql.js';
import { normalizeBimWorkspaceState } from '../types.js';
import {
  resolveFragmentsGlobalIdByLocalId,
  resolveFragmentsLocalIdByGlobalId,
} from '../fragmentsSelection.js';
import { applyIfcRelationshipEvidence, buildSemanticAssemblies } from '../ifcProjection.js';

describe('BIM core fingerprinting and cache', () => {
  it('changes fingerprints when pipeline versions change', () => {
    const base = computeBimModelFingerprint({
      sourceFileHash: 'abc',
      versions: {
        fragmentsConverterVersion: 'frags-1',
        projectionSchemaVersion: 'projection-1',
        connectorRuleVersion: 'connectors-1',
      },
    });
    const changed = computeBimModelFingerprint({
      sourceFileHash: 'abc',
      versions: {
        fragmentsConverterVersion: 'frags-1',
        projectionSchemaVersion: 'projection-2',
        connectorRuleVersion: 'connectors-1',
      },
    });
    expect(changed).not.toBe(base);
  });

  it('reuses a prepared model when the fingerprint matches', async () => {
    const fingerprint = computeBimModelFingerprint({ sourceFileHash: 'ifc-hash' });
    const cached = {
      metadata: { fingerprint },
      elements: [{ id: 'ifc:1', ifcClass: 'IfcWall' }],
      properties: [],
      relationships: [],
      provenance: [],
    };
    const repository = createMemoryBimRepository({
      prepared: { [fingerprint]: cached },
    });
    const result = await prepareBimModel({
      arrayBuffer: new ArrayBuffer(8),
      version: { content_hash: 'ifc-hash', filename: 'model.ifc' },
      repository,
    });
    expect(result.reused).toBe(true);
    expect(result.preparedModel).toBe(cached);
  });

  it('stores and restores workspace camera state', async () => {
    const repository = createMemoryBimRepository();
    const camera = {
      position: [1, 2, 3],
      target: [4, 5, 6],
      up: [0, 1, 0],
      fov: 50,
    };
    await repository.putWorkspaceState('model-1', {
      selectedObjectId: 'ifc:wall-1',
      tableSearch: 'wall',
      ifcClassFilter: 'IfcWall',
      displayMode: 'isolate',
      camera,
      lastOpenedAt: '2026-07-04T00:00:00.000Z',
    });

    const restored = await repository.getWorkspaceState('model-1');

    expect(restored.selectedObjectId).toBe('ifc:wall-1');
    expect(restored.camera).toMatchObject(camera);
    expect(restored.lastOpenedAt).toBe('2026-07-04T00:00:00.000Z');
  });

  it('drops invalid camera state during normalization', () => {
    const state = normalizeBimWorkspaceState({
      camera: { position: [1, 2], target: [3, 4, 5], up: [0, 1, 0] },
    });

    expect(state.camera).toBeNull();
  });

  it('normalizes persisted side panel state', () => {
    expect(normalizeBimWorkspaceState({}).panels).toEqual({ left: true, right: true });
    expect(normalizeBimWorkspaceState({ panels: { left: false } }).panels).toEqual({ left: false, right: true });
  });
});

describe('Fragments selection adapter', () => {
  it('resolves found and missing GlobalId mappings', async () => {
    const model = {
      async getLocalIdsByGuids(guids) {
        return guids[0] === 'found-guid' ? [42] : [null];
      },
      async getGuidsByLocalIds(localIds) {
        return localIds[0] === 42 ? ['found-guid'] : [null];
      },
    };

    await expect(resolveFragmentsLocalIdByGlobalId(model, 'found-guid')).resolves.toBe(42);
    await expect(resolveFragmentsLocalIdByGlobalId(model, 'missing-guid')).resolves.toBeNull();
    await expect(resolveFragmentsGlobalIdByLocalId(model, 42)).resolves.toBe('found-guid');
    await expect(resolveFragmentsGlobalIdByLocalId(model, -1)).resolves.toBeNull();
  });
});

describe('IFC projection helpers', () => {
  function makeIds(ids) {
    return {
      size: () => ids.length,
      get: (index) => ids[index],
    };
  }

  it('applies storey, type, quantity, relationship, and provenance evidence', () => {
    const lines = new Map([
      [10, { Name: { value: 'Level 01' } }],
      [11, { Name: { value: 'Wall Type A' } }],
      [12, { Name: { value: 'BaseQuantities' }, Quantities: [{ value: 13 }] }],
      [13, { Name: { value: 'NetVolume' }, VolumeValue: { value: 12.5 } }],
      [100, { RelatingStructure: { value: 10 }, RelatedElements: [{ value: 1 }] }],
      [101, { RelatingType: { value: 11 }, RelatedObjects: [{ value: 1 }] }],
      [102, { RelatingPropertyDefinition: { value: 12 }, RelatedObjects: [{ value: 1 }] }],
    ]);
    const ifcApi = {
      GetLineIDsWithType(_modelId, typeCode) {
        if (typeCode === 1) return makeIds([100]);
        if (typeCode === 2) return makeIds([101]);
        if (typeCode === 3) return makeIds([102]);
        return makeIds([]);
      },
      GetLine(_modelId, expressId) {
        return lines.get(expressId);
      },
    };
    const elements = [{
      id: 'ifc:wall-1',
      modelId: 'model-1',
      expressId: 1,
      ifcGlobalId: 'wall-1',
      ifcClass: 'IfcWall',
      name: 'Wall 1',
      typeName: null,
      storeyId: null,
    }];
    const properties = [];
    const relationships = [];
    const provenance = [];

    applyIfcRelationshipEvidence({
      WebIFC: {
        IFCRELCONTAINEDINSPATIALSTRUCTURE: 1,
        IFCRELDEFINESBYTYPE: 2,
        IFCRELDEFINESBYPROPERTIES: 3,
      },
      ifcApi,
      modelId: 0,
      elements,
      properties,
      relationships,
      provenance,
      metadata: {
        fingerprint: 'model-1',
        sourceFileHash: 'hash-1',
        createdAt: 'now',
      },
    });

    expect(elements[0].storeyId).toBe('Level 01');
    expect(elements[0].typeName).toBe('Wall Type A');
    expect(properties).toContainEqual(expect.objectContaining({
      propertyName: 'NetVolume',
      value: 12.5,
      source: 'ifc-quantity',
    }));
    expect(relationships.map((relationship) => relationship.relationshipType)).toEqual([
      'containedInSpatialStructure',
      'definedByType',
      'definedByProperties',
    ]);
    expect(provenance[0]).toMatchObject({ extractionRule: 'web-ifc-rel-defines-by-properties' });
  });

  it('warns on incomplete Archicad semantic metadata', () => {
    const semantic = buildSemanticAssemblies(
      [{ id: 'ifc:1', modelId: 'm', name: 'Part', ifcGlobalId: 'g1', ifcClass: 'IfcWall' }],
      [{ elementId: 'ifc:1', psetName: 'Canvas', propertyName: 'ComponentType', value: 'Window' }],
    );

    expect(semantic.semanticAssemblies).toEqual([]);
    expect(semantic.warnings[0]).toContain('Canvas.ComponentType requires Canvas.AssemblyId');
  });
});

describe('BQL validation', () => {
  it('accepts a basic elements query', () => {
    const result = validateBqlQuery({
      version: '0.1',
      select: 'elements',
      from: 'physicalElements',
      where: { ifcClass: 'IfcWindow' },
      view: { mode: 'highlight', focus: true },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects unknown fields and unsupported operators', () => {
    const result = validateBqlQuery({
      version: '0.1',
      select: 'elements',
      deleteFiles: true,
      where: {
        properties: [{ path: 'Pset.Value', op: 'startsWith', value: 'x' }],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.path)).toContain('deleteFiles');
    expect(result.errors.map((error) => error.path)).toContain('where.properties[0].op');
  });
});

describe('BQL execution', () => {
  const preparedModel = {
    elements: [
      {
        id: 'ifc:beam-1',
        ifcClass: 'IfcBeam',
        ifcGlobalId: 'beam-guid',
        fragmentsObjectId: 'beam-guid',
        name: 'Beam-001',
        typeName: 'Timber Beam',
        storeyId: 'GROUND FLOOR',
      },
      {
        id: 'ifc:door-1',
        ifcClass: 'IfcDoor',
        ifcGlobalId: 'door-guid',
        fragmentsObjectId: 'door-guid',
        name: 'Door-001',
        typeName: 'Fire Door',
        storeyId: 'LEVEL 01',
      },
    ],
    properties: [
      {
        id: 'p1',
        elementId: 'ifc:door-1',
        psetName: 'Pset_DoorCommon',
        propertyName: 'FireRating',
        value: '60',
        source: 'ifc-property',
      },
      {
        id: 'q1',
        elementId: 'ifc:beam-1',
        psetName: 'BaseQuantities',
        propertyName: 'Length',
        value: 1200,
        source: 'ifc-quantity',
      },
    ],
    provenance: [
      {
        id: 'prov1',
        recordId: 'ifc:beam-1',
        extractionRule: 'web-ifc-line',
        ifcGlobalId: 'beam-guid',
      },
    ],
    semanticAssemblies: [
      {
        id: 'WIN-001',
        modelId: 'model-1',
        kind: 'WindowAssembly',
        label: 'Kitchen Window',
      },
    ],
  };

  it('returns deterministic element result rows and viewer instructions', () => {
    const result = executeBqlQuery(preparedModel, {
      version: '0.1',
      select: 'elements',
      from: 'physicalElements',
      where: { ifcClass: 'IfcBeam', storey: 'GROUND FLOOR' },
      view: { mode: 'ghostOthers', focus: true },
    });

    expect(result.status).toBe('success');
    expect(result.objectRefs).toEqual([
      expect.objectContaining({ id: 'ifc:beam-1', fragmentsObjectId: 'beam-guid' }),
    ]);
    expect(result.tableRows[0]).toMatchObject({ name: 'Beam-001', storeyId: 'GROUND FLOOR' });
    expect(result.viewerState).toMatchObject({ mode: 'ghostOthers', focus: true });
    expect(result.evidence[0]).toMatchObject({ objectId: 'ifc:beam-1', evidenceType: 'ifcClass' });
  });

  it('filters by property and quantity predicates', () => {
    const fireDoors = executeBqlQuery(preparedModel, {
      version: '0.1',
      select: 'elements',
      from: 'physicalElements',
      where: { properties: [{ path: 'Pset_DoorCommon.FireRating', op: 'exists' }] },
    });
    const longBeams = executeBqlQuery(preparedModel, {
      version: '0.1',
      select: 'elements',
      from: 'physicalElements',
      where: { quantities: [{ name: 'Length', op: '>=', value: 1000 }] },
    });

    expect(fireDoors.objectRefs.map((ref) => ref.id)).toEqual(['ifc:door-1']);
    expect(longBeams.objectRefs.map((ref) => ref.id)).toEqual(['ifc:beam-1']);
  });

  it('counts physical and semantic objects from allBimObjects', () => {
    const result = executeBqlQuery(preparedModel, {
      version: '0.1',
      select: 'count',
      from: 'allBimObjects',
      where: {
        or: [
          { ifcClass: 'IfcDoor' },
          { semanticType: 'WindowAssembly' },
        ],
      },
    });

    expect(result.summary).toBe('2 matching BIM objects');
    expect(result.tableRows).toEqual([]);
  });
});
