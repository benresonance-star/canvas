import { describe, expect, it } from 'vitest';
import { computeBimModelFingerprint } from '../fingerprint.js';
import { createMemoryBimRepository } from '../bimRepository.js';
import { prepareBimModel } from '../prepareBimModel.js';
import {
  buildBimStoreyCatalog,
  draftBqlFromNaturalLanguage,
  maybeClarifyBimStoreyReference,
  resolveBimStoreyClarificationAnswer,
} from '../bimAgent.js';
import { buildBimAgentResponse, formatBimAgentAnswer } from '../bimAgentResponse.js';
import {
  buildBimLlmAgentRepairPrompt,
  buildBimLlmAgentUserPrompt,
  compactBimModelSummaryForAgent,
  parseBimLlmAgentReply,
  summarizeBimModelForAgent,
} from '../bimLlmAgent.js';
import { executeBqlQuery, validateBqlQuery } from '../bql.js';
import {
  CLAY_AO_BIAS_DEFAULT,
  CLAY_AO_DISTANCE_DEFAULT,
  CLAY_AO_INTENSITY_DEFAULT,
  CLAY_AO_RADIUS_DEFAULT,
  CLAY_GLASS_OPACITY_DEFAULT,
  CLAY_ORIGINAL_COLOR_BLEND_DEFAULT,
  CLAY_LIGHT_INTENSITY_DEFAULT,
  CLAY_SURFACE_COLOR_DEFAULT,
  normalizeBimWorkspaceState,
  applyBimViewerDefaults,
  BIM_VIEWER_DEFAULTS,
  wireframeLineOpacityFromTransparency,
  wireframeTransparencyFromLineOpacity,
} from '../types.js';
import {
  resolveFragmentsGlobalIdByLocalId,
  resolveFragmentsLocalIdByGlobalId,
  resolvePreparedElementFromFragmentsHit,
} from '../fragmentsSelection.js';
import { applyIfcRelationshipEvidence, buildSemanticAssemblies } from '../ifcProjection.js';
import {
  applySemanticResolutionToBql,
  buildSemanticModelVocabulary,
  resolveBimQuestionSemantics,
} from '../bimSemanticResolver.js';

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
      zoom: 1.5,
      viewHeight: 24,
    };
    await repository.putWorkspaceState('model-1', {
      selectedObjectId: 'ifc:wall-1',
      tableSearch: 'wall',
      ifcClassFilter: 'IfcWall',
      displayMode: 'isolate',
      projectionMode: 'orthographic',
      camera,
      lastOpenedAt: '2026-07-04T00:00:00.000Z',
    });

    const restored = await repository.getWorkspaceState('model-1');

    expect(restored.selectedObjectId).toBe('ifc:wall-1');
    expect(restored.camera).toMatchObject(camera);
    expect(restored.projectionMode).toBe('orthographic');
    expect(restored.lastOpenedAt).toBe('2026-07-04T00:00:00.000Z');
  });

  it('normalizes projection mode and clamps camera fov', () => {
    const state = normalizeBimWorkspaceState({
      projectionMode: 'orthographic',
      camera: {
        position: [0, 0, 0],
        target: [1, 0, 0],
        up: [0, 1, 0],
        fov: 200,
        zoom: 0,
      },
    });

    expect(state.projectionMode).toBe('orthographic');
    expect(state.camera.fov).toBe(120);
    expect(state.camera.zoom).toBe(1);
  });

  it('defaults projection mode to perspective', () => {
    expect(normalizeBimWorkspaceState({}).projectionMode).toBe('perspective');
  });

  it('migrates legacy displayMode isolate without enabling isolate on select', () => {
    expect(normalizeBimWorkspaceState({ displayMode: 'isolate' })).toMatchObject({
      displayMode: 'highlight',
      isolateOnSelect: false,
    });
    expect(normalizeBimWorkspaceState({ displayMode: 'isolate', isolateOnSelect: true })).toMatchObject({
      displayMode: 'highlight',
      isolateOnSelect: true,
    });
  });

  it('normalizes lighting workspace fields with HDRI off by default', () => {
    expect(normalizeBimWorkspaceState({})).toMatchObject({
      displayMode: 'highlight',
      showEnvironment: false,
      environmentPreset: 'studio',
      lightingMode: 'studio',
      wireframeMode: false,
      wireframeLineWeight: 2,
      wireframeOpacity: 0.88,
      wireframeColor: '#0f172a',
      renderStyle: 'standard',
      clayAoIntensity: CLAY_AO_INTENSITY_DEFAULT,
      clayAoRadius: CLAY_AO_RADIUS_DEFAULT,
      clayAoBias: CLAY_AO_BIAS_DEFAULT,
      clayAoDistance: CLAY_AO_DISTANCE_DEFAULT,
      clayAoSamples: 256,
      clayAoResolution: 1,
      clayLightIntensity: CLAY_LIGHT_INTENSITY_DEFAULT,
      claySurfaceColor: '#f8f8f8',
      clayGlassOpacity: CLAY_GLASS_OPACITY_DEFAULT,
      clayOriginalColorBlend: CLAY_ORIGINAL_COLOR_BLEND_DEFAULT,
      viewportBackgroundColor: '#171412',
      hiddenStoreys: [],
      hiddenLayers: [],
      isolateOnSelect: false,
    });

    const state = normalizeBimWorkspaceState({
      showEnvironment: true,
      environmentPreset: 'city',
      lightingMode: 'bright',
      wireframeMode: true,
    });
    expect(state.showEnvironment).toBe(true);
    expect(state.environmentPreset).toBe('city');
    expect(state.lightingMode).toBe('bright');
    expect(state.wireframeMode).toBe(true);
  });

  it('applyBimViewerDefaults resets display mode, render style, and layer visibility', () => {
    expect(applyBimViewerDefaults({
      displayMode: 'ghostOthers',
      renderStyle: 'clay',
      hiddenStoreys: ['Level 01'],
      hiddenLayers: ['Structure'],
      isolateOnSelect: true,
      section: { enabled: true, fillColor: '#abcdef' },
      camera: { position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0], fov: 45, zoom: 1 },
    })).toMatchObject({
      ...BIM_VIEWER_DEFAULTS,
      section: expect.objectContaining({
        enabled: false,
        fillColor: '#abcdef',
      }),
      camera: { position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0], fov: 45, zoom: 1 },
    });
  });

  it('normalizes clay style workspace fields', () => {
    const state = normalizeBimWorkspaceState({ renderStyle: 'clay', clayAoIntensity: 99, clayAoRadius: 99 });
    expect(state.renderStyle).toBe('clay');
    expect(state.clayAoIntensity).toBe(99);
    expect(state.clayAoRadius).toBe(0.05);
  });

  it('normalizes viewport background and migrates legacy clayBackgroundColor', () => {
    expect(normalizeBimWorkspaceState({}).viewportBackgroundColor).toBe('#171412');
    expect(normalizeBimWorkspaceState({
      clayBackgroundColor: '#112233',
    }).viewportBackgroundColor).toBe('#112233');
    expect(normalizeBimWorkspaceState({
      viewportBackgroundColor: '#abcdef',
    }).viewportBackgroundColor).toBe('#abcdef');
  });

  it('normalizes wireframe style workspace fields', () => {
    const state = normalizeBimWorkspaceState({
      wireframeLineWeight: 12,
      wireframeOpacity: 2,
      wireframeColor: 'not-a-color',
    });
    expect(state.wireframeLineWeight).toBe(6);
    expect(state.wireframeOpacity).toBe(1);
    expect(state.wireframeColor).toBe('#0f172a');

    const custom = normalizeBimWorkspaceState({
      wireframeLineWeight: 1.5,
      wireframeOpacity: 0.4,
      wireframeColor: '#ff5500',
    });
    expect(custom.wireframeLineWeight).toBe(1.5);
    expect(custom.wireframeOpacity).toBe(0.4);
    expect(custom.wireframeColor).toBe('#ff5500');
    expect(custom.wireframeHiddenLines).toBe(true);
  });

  it('maps wireframe transparency to line opacity', () => {
    expect(wireframeLineOpacityFromTransparency(0)).toBe(1);
    expect(wireframeLineOpacityFromTransparency(1)).toBe(0);
    expect(wireframeLineOpacityFromTransparency(0.5)).toBe(0.5);
    expect(wireframeTransparencyFromLineOpacity(0.88)).toBeCloseTo(0.12, 5);
  });

  it('remaps dense full wireframe transparency with a lower opacity ceiling', () => {
    expect(wireframeLineOpacityFromTransparency(0, { denseEdges: true })).toBeCloseTo(0.38, 5);
    expect(wireframeLineOpacityFromTransparency(1, { denseEdges: true })).toBe(0);
    expect(wireframeLineOpacityFromTransparency(0.5, { denseEdges: true })).toBeLessThan(0.08);
    expect(wireframeTransparencyFromLineOpacity(0.38, { denseEdges: true })).toBeCloseTo(0, 5);
  });

  it('allows fully transparent wireframe lines', () => {
    const state = normalizeBimWorkspaceState({ wireframeOpacity: -1 });
    expect(state.wireframeOpacity).toBe(0);
  });

  it('normalizes measurement workspace fields', () => {
    const state = normalizeBimWorkspaceState({
      measurements: [{
        id: 'm-1',
        snapMode: 'vertex',
        start: { position: [0, 0, 0] },
        end: { position: [1, 0, 0] },
        distance: 1,
      }],
      measureUnits: 'ft',
      measureSnapMode: 'edge',
    });

    expect(state.measurements).toHaveLength(1);
    expect(state.measureUnits).toBe('ft');
    expect(state.measureSnapMode).toBe('edge');
    expect(state.measureKind).toBe('segment');
  });

  it('normalizes polyline measurement workspace fields', () => {
    const state = normalizeBimWorkspaceState({
      measurements: [{
        id: 'm-2',
        kind: 'polyline',
        snapMode: 'vertex',
        points: [{ position: [0, 0, 0] }, { position: [1, 0, 0] }, { position: [1, 1, 0] }],
        closed: true,
        distance: 3,
      }],
      measureKind: 'polyline',
    });

    expect(state.measurements).toHaveLength(1);
    expect(state.measurements[0].kind).toBe('polyline');
    expect(state.measurements[0].area).toBeCloseTo(0.5, 5);
    expect(state.measureKind).toBe('polyline');
  });

  it('stores and restores measurement workspace state', async () => {
    const repository = createMemoryBimRepository();
    const measurements = [{
      id: 'm-1',
      kind: 'segment',
      snapMode: 'vertex',
      start: { position: [0, 0, 0] },
      end: { position: [2, 0, 0] },
      distance: 2,
    }];
    await repository.putWorkspaceState('model-1', {
      measurements,
      measureUnits: 'm',
      measureSnapMode: 'vertex',
    });

    const restored = await repository.getWorkspaceState('model-1');
    expect(restored.measurements).toEqual(measurements);
    expect(restored.measureUnits).toBe('m');
    expect(restored.measureSnapMode).toBe('vertex');
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

  it('normalizes persisted saved BQL queries', () => {
    const state = normalizeBimWorkspaceState({
      savedQueries: [
        {
          id: 'saved-1',
          label: 'Walls',
          query: { version: '0.1', select: 'elements' },
          createdAt: 'now',
        },
        { id: null, label: 'bad', query: null },
      ],
    });

    expect(state.savedQueries).toEqual([
      expect.objectContaining({
        id: 'saved-1',
        label: 'Walls',
        query: { version: '0.1', select: 'elements' },
      }),
    ]);
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

  it('resolves prepared elements from Fragments hit express IDs', () => {
    const elements = [
      { id: 'ifc:wall-1', expressId: 10, ifcGlobalId: 'wall-guid' },
      { id: 'ifc:slab-1', expressId: 20, ifcGlobalId: 'slab-guid' },
    ];

    expect(resolvePreparedElementFromFragmentsHit(elements, { localId: 20, itemId: 200 })).toMatchObject({
      id: 'ifc:slab-1',
      ifcGlobalId: 'slab-guid',
    });
    expect(resolvePreparedElementFromFragmentsHit(elements, { localId: 999, itemId: 10 })).toMatchObject({
      id: 'ifc:wall-1',
      ifcGlobalId: 'wall-guid',
    });
    expect(resolvePreparedElementFromFragmentsHit(elements, { localId: 999, itemId: 888 })).toBeNull();
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

  it('validates grouped count queries', () => {
    const valid = validateBqlQuery({
      version: '0.1',
      select: 'groupedCount',
      from: 'physicalElements',
      groupBy: 'storey',
      where: { ifcClass: 'IfcSlab' },
    });
    const invalid = validateBqlQuery({
      version: '0.1',
      select: 'groupedCount',
      from: 'physicalElements',
      groupBy: 'levelName',
    });

    expect(valid.ok).toBe(true);
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.map((error) => error.path)).toContain('groupBy');
  });

  it('validates semantic alias predicates', () => {
    const valid = validateBqlQuery({
      version: '0.1',
      select: 'count',
      from: 'physicalElements',
      where: {
        semanticAliases: [{ term: 'top rails', aliases: ['toprail', 'TOPRAIL'] }],
      },
    });
    const invalid = validateBqlQuery({
      version: '0.1',
      select: 'count',
      where: { semanticAliases: [{ term: 'bad', aliases: [] }] },
    });

    expect(valid.ok).toBe(true);
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.map((error) => error.path)).toContain('where.semanticAliases[0].aliases');
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
      {
        id: 'ifc:slab-1',
        ifcClass: 'IfcSlab',
        ifcGlobalId: 'slab-guid',
        fragmentsObjectId: 'slab-guid',
        name: 'Slab-001',
        typeName: 'Concrete Slab',
        storeyId: 'GROUND FLOOR',
      },
      {
        id: 'ifc:toprail-1',
        ifcClass: 'IfcBuildingElementProxy',
        ifcGlobalId: 'toprail-guid',
        fragmentsObjectId: 'toprail-guid',
        name: 'TOPRAIL - 001',
        typeName: 'Archicad Layer',
        storeyId: null,
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
      {
        id: 'q2',
        elementId: 'ifc:slab-1',
        psetName: 'BaseQuantities',
        propertyName: 'NetArea',
        value: 42.5,
        unit: 'm2',
        source: 'ifc-quantity',
      },
      {
        id: 'p-toprail',
        elementId: 'ifc:toprail-1',
        psetName: 'Archicad Properties',
        propertyName: 'Element ID',
        value: 'TOPRAIL - 001',
        source: 'ifc-property',
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

  it('returns colorBy viewer instructions', () => {
    const result = executeBqlQuery(preparedModel, {
      version: '0.1',
      select: 'elements',
      from: 'physicalElements',
      view: { mode: 'colorBy', colorByProperty: 'storey', focus: true },
    });

    expect(result.viewerState).toMatchObject({
      mode: 'colorBy',
      colorByProperty: 'storey',
      objectIds: ['ifc:beam-1', 'ifc:door-1', 'ifc:slab-1', 'ifc:toprail-1'],
    });
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

  it('count queries still return object refs for table and viewer focus', () => {
    const result = executeBqlQuery(preparedModel, {
      version: '0.1',
      select: 'count',
      from: 'physicalElements',
      where: { ifcClass: 'IfcSlab' },
      view: { mode: 'highlight', focus: true },
    });

    expect(result.summary).toBe('1 matching BIM objects');
    expect(result.objectRefs).toEqual([
      expect.objectContaining({ id: 'ifc:slab-1', ifcGlobalId: 'slab-guid' }),
    ]);
  });

  it('matches compact BIM names for spaced plural name searches', () => {
    const result = executeBqlQuery(preparedModel, {
      version: '0.1',
      select: 'count',
      from: 'physicalElements',
      where: { nameContains: 'top rails' },
      view: { mode: 'highlight', focus: true },
    });

    expect(result.status).toBe('success');
    expect(result.objectRefs).toEqual([
      expect.objectContaining({ id: 'ifc:toprail-1', ifcGlobalId: 'toprail-guid' }),
    ]);
  });

  it('matches semantic aliases across BIM identity and property evidence', () => {
    const result = executeBqlQuery(preparedModel, {
      version: '0.1',
      select: 'count',
      from: 'physicalElements',
      where: {
        semanticAliases: [{ term: 'top rails', aliases: ['toprail', 'top rail'] }],
      },
      view: { mode: 'highlight', focus: true },
    });

    expect(result.status).toBe('success');
    expect(result.objectRefs).toEqual([
      expect.objectContaining({ id: 'ifc:toprail-1' }),
    ]);
  });

  it('groups matching objects for grouped count queries', () => {
    const result = executeBqlQuery(preparedModel, {
      version: '0.1',
      select: 'groupedCount',
      from: 'physicalElements',
      groupBy: 'storey',
      view: { mode: 'highlight', focus: true },
    });

    expect(result.status).toBe('success');
    expect(result.select).toBe('groupedCount');
    expect(result.summary).toBe('4 matching BIM objects grouped by storey');
    expect(result.groups).toEqual([
      { value: 'GROUND FLOOR', count: 2, objectIds: ['ifc:beam-1', 'ifc:slab-1'] },
      { value: 'LEVEL 01', count: 1, objectIds: ['ifc:door-1'] },
      { value: 'Unknown', count: 1, objectIds: ['ifc:toprail-1'] },
    ]);
    expect(result.tableRows).toHaveLength(4);
  });

  it('sums quantity aggregates for matching physical elements', () => {
    const result = executeBqlQuery(preparedModel, {
      version: '0.1',
      select: 'aggregate',
      from: 'physicalElements',
      where: { ifcClass: 'IfcSlab' },
      aggregate: { op: 'sum', field: 'quantity', name: 'area' },
      view: { mode: 'highlight', focus: true },
    });

    expect(result.aggregate).toMatchObject({
      op: 'sum',
      field: 'quantity',
      name: 'area',
      value: 42.5,
      matchedValueCount: 1,
      objectCount: 1,
      unit: 'm2',
    });
    expect(result.summary).toBe('42.5 total area m2 across 1 matching BIM object');
  });
});

describe('BIM natural-language agent drafting', () => {
  const storeyPreparedModel = {
    elements: [
      { id: 'ifc:ground-slab', ifcClass: 'IfcSlab', storeyId: 'GROUND FLOOR' },
      { id: 'ifc:level-1-slab', ifcClass: 'IfcSlab', storeyId: 'LEVEL 1' },
      { id: 'ifc:roof-slab', ifcClass: 'IfcSlab', storeyId: 'ROOF' },
    ],
  };

  it('builds a model-backed storey catalog for clarification choices', () => {
    expect(buildBimStoreyCatalog(storeyPreparedModel)).toEqual([
      expect.objectContaining({ value: 'GROUND FLOOR', label: 'Ground Floor', count: 1 }),
      expect.objectContaining({ value: 'LEVEL 1', label: 'Level 1', count: 1 }),
      expect.objectContaining({ value: 'ROOF', label: 'Roof', count: 1 }),
    ]);
  });

  it('asks for clarification before treating first floor as level 1', () => {
    const clarification = maybeClarifyBimStoreyReference('How many slabs on first floor?', storeyPreparedModel);

    expect(clarification).toMatchObject({
      kind: 'storey',
      status: 'probable',
      originalUtterance: 'How many slabs on first floor?',
      suggestedValue: 'LEVEL 1',
    });
    expect(clarification.question).toBe('I found Ground Floor, Level 1 and Roof. Do you mean Level 1?');
    expect(clarification.choices.map((choice) => choice.value)).toEqual(['GROUND FLOOR', 'LEVEL 1', 'ROOF']);
  });

  it('resolves storey clarification answers from yes, labels, ordinals, and alternatives', () => {
    const clarification = maybeClarifyBimStoreyReference('How many slabs on first floor?', storeyPreparedModel);

    expect(resolveBimStoreyClarificationAnswer('yes', clarification)).toMatchObject({ value: 'LEVEL 1' });
    expect(resolveBimStoreyClarificationAnswer('level 1', clarification)).toMatchObject({ value: 'LEVEL 1' });
    expect(resolveBimStoreyClarificationAnswer('the middle one', clarification)).toMatchObject({ value: 'LEVEL 1' });
    expect(resolveBimStoreyClarificationAnswer('roof', clarification)).toMatchObject({ value: 'ROOF' });
    expect(resolveBimStoreyClarificationAnswer('not sure', clarification)).toBe(null);
  });

  it('does not clarify exact level 1 or roof storey wording', () => {
    expect(maybeClarifyBimStoreyReference('How many slabs on level 1?', storeyPreparedModel)).toBe(null);
    expect(maybeClarifyBimStoreyReference('How many slabs on roof?', storeyPreparedModel)).toBe(null);

    const levelDraft = draftBqlFromNaturalLanguage('How many slabs on level 1?');
    const roofDraft = draftBqlFromNaturalLanguage('How many slabs on roof?');
    expect(levelDraft.query.where).toMatchObject({ and: [{ ifcClass: 'IfcSlab' }, { storey: 'level 1' }] });
    expect(roofDraft.query.where).toMatchObject({ and: [{ ifcClass: 'IfcSlab' }, { storey: 'roof' }] });
  });

  it('uses resolved clarification storey as the executed BQL filter', () => {
    const draft = draftBqlFromNaturalLanguage('How many slabs on first floor?', { storeyOverride: 'LEVEL 1' });

    expect(draft.ok).toBe(true);
    expect(draft.query).toMatchObject({
      select: 'count',
      where: {
        and: [
          { ifcClass: 'IfcSlab' },
          { storey: 'LEVEL 1' },
        ],
      },
    });
  });

  it('drafts a focused BQL query for beams on a storey', () => {
    const draft = draftBqlFromNaturalLanguage('show beams on ground floor');

    expect(draft.ok).toBe(true);
    expect(draft.query).toMatchObject({
      select: 'elements',
      from: 'physicalElements',
      where: {
        and: [
          { ifcClass: 'IfcBeam' },
          { storey: 'ground floor' },
        ],
      },
      view: { mode: 'highlight', focus: true },
    });
  });

  it('drafts count queries for physical IFC classes', () => {
    const draft = draftBqlFromNaturalLanguage('how many doors are in the model');

    expect(draft.ok).toBe(true);
    expect(draft.query).toMatchObject({
      select: 'count',
      from: 'physicalElements',
      where: { ifcClass: 'IfcDoor' },
    });
  });

  it('drafts count queries for slabs', () => {
    const draft = draftBqlFromNaturalLanguage('how many slabs are there in this file?');

    expect(draft.ok).toBe(true);
    expect(draft.query).toMatchObject({
      select: 'count',
      from: 'physicalElements',
      where: { ifcClass: 'IfcSlab' },
    });
  });

  it('drafts grouped count queries by storey', () => {
    const draft = draftBqlFromNaturalLanguage('how many slabs by storey?');

    expect(draft.ok).toBe(true);
    expect(draft.query).toMatchObject({
      select: 'groupedCount',
      from: 'physicalElements',
      groupBy: 'storey',
      where: { ifcClass: 'IfcSlab' },
    });
    expect(draft.intentSummary).toContain('count slabs by storey');
  });

  it('treats roof storey wording as a slab storey filter', () => {
    const draft = draftBqlFromNaturalLanguage('How many slabs on the roof storey?');

    expect(draft.ok).toBe(true);
    expect(draft.query).toMatchObject({
      select: 'count',
      from: 'physicalElements',
      where: {
        and: [
          { ifcClass: 'IfcSlab' },
          { storey: 'roof' },
        ],
      },
    });

    const answer = formatBimAgentAnswer({
      query: draft.query,
      result: {
        select: 'count',
        status: 'empty',
        objectRefs: [],
      },
    });
    expect(answer).toBe('No slabs on roof found.');
  });


  it('drafts tree count queries as name evidence searches', () => {
    const draft = draftBqlFromNaturalLanguage('How many trees are there?');

    expect(draft.ok).toBe(true);
    expect(draft.query).toMatchObject({
      select: 'count',
      from: 'physicalElements',
      where: {
        or: [
          { nameContains: 'tree' },
          { nameContains: 'plant' },
          { nameContains: 'vegetation' },
        ],
      },
    });
    expect(draft.intentSummary).toContain('count trees');
  });

  it('drafts unknown visible object requests as name evidence searches', () => {
    const draft = draftBqlFromNaturalLanguage('how many top rails are there?');

    expect(draft.ok).toBe(true);
    expect(draft.query).toMatchObject({
      select: 'count',
      from: 'physicalElements',
      where: { nameContains: 'top rail' },
    });
    expect(draft.intentSummary).toContain('count top rails');
  });


  it('drafts aggregate area queries for slabs', () => {
    const draft = draftBqlFromNaturalLanguage('What is the total area of slabs?');

    expect(draft.ok).toBe(true);
    expect(draft.query).toMatchObject({
      select: 'aggregate',
      from: 'physicalElements',
      where: { ifcClass: 'IfcSlab' },
      aggregate: { op: 'sum', field: 'quantity', name: 'area' },
    });
    expect(draft.intentSummary).toContain('total area slabs');
  });

  it('routes window requests through physical and semantic BIM objects', () => {
    const draft = draftBqlFromNaturalLanguage('isolate all windows');

    expect(draft.ok).toBe(true);
    expect(draft.query).toMatchObject({
      from: 'allBimObjects',
      where: {
        or: [
          { ifcClass: 'IfcWindow' },
          { semanticType: 'WindowAssembly' },
        ],
      },
      view: { mode: 'isolate', focus: true },
    });
  });

  it('returns a warning when a request cannot be mapped to evidence', () => {
    const draft = draftBqlFromNaturalLanguage('make it beautiful');

    expect(draft.ok).toBe(false);
    expect(draft.warnings[0]).toContain('Could not map');
  });

  it('drafts colorBy queries for model grouping requests', () => {
    const draft = draftBqlFromNaturalLanguage('color by storey');

    expect(draft.ok).toBe(true);
    expect(draft.query).toMatchObject({
      select: 'elements',
      from: 'physicalElements',
      where: {},
      view: { mode: 'colorBy', colorByProperty: 'storey', focus: true },
    });
  });
});

describe('BIM semantic resolver', () => {
  const preparedModel = {
    elements: [
      {
        id: 'ifc:toprail-1',
        ifcClass: 'IfcBuildingElementProxy',
        ifcGlobalId: 'toprail-guid',
        name: 'TOPRAIL - 001',
        typeName: 'Archicad Layer',
      },
      {
        id: 'ifc:slab-1',
        ifcClass: 'IfcSlab',
        name: 'Slab-001',
        typeName: 'Concrete Slab',
      },
    ],
    properties: [
      {
        id: 'p-toprail',
        elementId: 'ifc:toprail-1',
        psetName: 'Archicad Properties',
        propertyName: 'Element ID',
        value: 'TOPRAIL - 001',
      },
    ],
  };

  it('resolves top rails to evidence-backed aliases and applies them to BQL', () => {
    const vocabulary = buildSemanticModelVocabulary(preparedModel);
    const draft = draftBqlFromNaturalLanguage('how many top rails are there?');
    const resolution = resolveBimQuestionSemantics({ utterance: 'how many top rails are there?', draft, vocabulary });
    const resolvedDraft = applySemanticResolutionToBql(draft, resolution);

    expect(resolution.confidence).toBeGreaterThanOrEqual(0.45);
    expect(resolution.aliases).toContain('TOPRAIL - 001');
    expect(resolvedDraft.query.where.semanticAliases[0].aliases).toContain('TOPRAIL - 001');
  });

  it('reuses aliases from session memory', () => {
    const draft = draftBqlFromNaturalLanguage('how many toprails are there?');
    const resolution = resolveBimQuestionSemantics({
      utterance: 'how many toprails are there?',
      draft,
      vocabulary: buildSemanticModelVocabulary({ elements: [] }),
      aliasMemory: {
        toprail: {
          term: 'toprail',
          aliases: ['TOPRAIL - 001'],
          confidence: 0.9,
          explanation: 'Remembered from this model session.',
        },
      },
    });

    expect(resolution.source).toBe('session');
    expect(resolution.aliases).toEqual(['TOPRAIL - 001']);
  });

  it('does not apply low-confidence aliases as factual BQL filters', () => {
    const draft = draftBqlFromNaturalLanguage('how many mystery widgets are there?');
    const resolution = resolveBimQuestionSemantics({
      utterance: 'how many mystery widgets are there?',
      draft,
      vocabulary: buildSemanticModelVocabulary(preparedModel),
    });
    const resolvedDraft = applySemanticResolutionToBql(draft, resolution);

    expect(resolution.confidence).toBeLessThan(0.45);
    expect(resolvedDraft.query.where).toEqual({ nameContains: 'mystery widget' });
  });
});

describe('BIM agent response formatting', () => {
  it('formats count answers with class and storey filters', () => {
    const answer = formatBimAgentAnswer({
      query: {
        version: '0.1',
        select: 'count',
        where: {
          and: [
            { ifcClass: 'IfcSlab' },
            { storey: 'ground floor' },
          ],
        },
      },
      result: {
        select: 'count',
        status: 'success',
        objectRefs: [{ id: 'ifc:1' }, { id: 'ifc:2' }],
      },
    });

    expect(answer).toBe('2 slabs on ground floor found.');
  });

  it('formats name-evidence answers with object labels', () => {
    const answer = formatBimAgentAnswer({
      query: {
        version: '0.1',
        select: 'count',
        where: {
          or: [
            { nameContains: 'tree' },
            { nameContains: 'plant' },
          ],
        },
      },
      result: {
        select: 'count',
        status: 'success',
        objectRefs: [{ id: 'ifc:tree-1' }, { id: 'ifc:tree-2' }],
      },
    });

    expect(answer).toBe('2 trees found.');
  });


  it('formats aggregate answers with quantity evidence', () => {
    const response = buildBimAgentResponse({
      question: 'total slab area',
      selectedResponder: 'Local BIM Rules/local/bim-bql-rules-v0.1',
      actualResponder: 'Local BIM Rules/local/bim-bql-rules-v0.1',
      workSummary: 'Local rules drafted BQL',
      query: {
        version: '0.1',
        select: 'aggregate',
        where: { ifcClass: 'IfcSlab' },
        aggregate: { op: 'sum', field: 'quantity', name: 'area' },
      },
      result: {
        select: 'aggregate',
        status: 'success',
        objectRefs: [{ id: 'ifc:slab-1' }],
        aggregate: {
          name: 'area',
          value: 42.5,
          unit: 'm2',
          matchedValueCount: 1,
          objectCount: 1,
        },
      },
    });

    expect(response.answer).toBe('42.5 m2 total slab area from 1 IFC quantity value.');
    expect(response.evidenceSummary).toBe('1 IFC quantity value across 1 slabs.');
  });

  it('formats grouped count answers with a breakdown', () => {
    const response = buildBimAgentResponse({
      question: 'count slabs by storey',
      selectedResponder: 'Local BIM Rules/local/bim-bql-rules-v0.1',
      query: {
        version: '0.1',
        select: 'groupedCount',
        groupBy: 'storey',
        where: { ifcClass: 'IfcSlab' },
      },
      result: {
        select: 'groupedCount',
        status: 'success',
        objectRefs: [{ id: 'ifc:1' }, { id: 'ifc:2' }, { id: 'ifc:3' }],
        groups: [
          { value: 'GROUND FLOOR', count: 2, objectIds: ['ifc:1', 'ifc:2'] },
          { value: 'ROOF', count: 1, objectIds: ['ifc:3'] },
        ],
      },
    });

    expect(response.answer).toBe('3 slabs grouped by storey: GROUND FLOOR: 2, ROOF: 1.');
    expect(response.evidenceSummary).toBe('3 slabs in 2 storey groups.');
    expect(response.result.groups).toHaveLength(2);
  });

  it('formats empty answers clearly', () => {
    const answer = formatBimAgentAnswer({
      query: {
        version: '0.1',
        select: 'count',
        where: { ifcClass: 'IfcDoor' },
      },
      result: {
        select: 'count',
        status: 'empty',
        objectRefs: [],
      },
    });

    expect(answer).toBe('No doors found.');
  });
});

describe('BIM LLM agent contract', () => {
  it('summarizes model evidence for the provider prompt', () => {
    const summary = summarizeBimModelForAgent({
      metadata: { filename: 'villa.ifc', ifcSchema: 'IFC4' },
      elements: [
        { id: 'ifc:1', ifcClass: 'IfcWall', storeyId: 'GROUND FLOOR', typeName: 'Basic Wall' },
        { id: 'ifc:2', ifcClass: 'IfcWall', storeyId: 'LEVEL 01', typeName: 'Basic Wall' },
        { id: 'ifc:3', ifcClass: 'IfcDoor', storeyId: 'GROUND FLOOR', typeName: 'Door Type' },
      ],
      properties: [
        { psetName: 'Pset_DoorCommon', propertyName: 'FireRating' },
      ],
    });

    expect(summary.metadata).toMatchObject({ filename: 'villa.ifc', elementCount: 3 });
    expect(summary.classes[0]).toEqual({ value: 'IfcWall', count: 2 });
    expect(summary.names[0]).toEqual({ value: 'Unknown', count: 3 });
    expect(summary.propertyPaths).toContain('Pset_DoorCommon.FireRating');
    expect(summary.elementSamples).toContainEqual({
      name: null,
      ifcClass: 'IfcWall',
      storeyId: 'GROUND FLOOR',
      typeName: 'Basic Wall',
    });
  });

  it('builds compact model summaries for local provider retries', () => {
    const summary = {
      metadata: { filename: 'villa.ifc' },
      classes: Array.from({ length: 30 }, (_, index) => ({ value: `Ifc${index}`, count: index })),
      storeys: Array.from({ length: 30 }, (_, index) => ({ value: `LEVEL ${index}`, count: index })),
      typeNames: Array.from({ length: 20 }, (_, index) => ({ value: `Type ${index}`, count: index })),
      names: Array.from({ length: 20 }, (_, index) => ({ value: `Name ${index}`, count: index })),
      nameTypeVocabulary: Array.from({ length: 50 }, (_, index) => ({ value: `Alias ${index}`, count: index })),
      elementSamples: [{ name: 'Heavy sample' }],
      propertyPaths: ['Many.Properties'],
      selectedElement: { id: 'ifc:1' },
    };

    const compact = compactBimModelSummaryForAgent(summary);

    expect(compact.classes).toHaveLength(20);
    expect(compact.storeys).toHaveLength(20);
    expect(compact.typeNames).toHaveLength(12);
    expect(compact.names).toHaveLength(16);
    expect(compact.nameTypeVocabulary).toHaveLength(40);
    expect(compact.elementSamples).toBeUndefined();
    expect(compact.propertyPaths).toBeUndefined();
    expect(compact.selectedElement).toEqual({ id: 'ifc:1' });
  });

  it('builds a JSON prompt and parses fenced provider JSON', () => {
    const prompt = buildBimLlmAgentUserPrompt({
      utterance: 'show doors',
      modelSummary: { metadata: { elementCount: 1 } },
    });
    const parsedPrompt = JSON.parse(prompt);
    expect(parsedPrompt.userRequest).toBe('show doors');
    expect(parsedPrompt.responseShape.query.select).toContain('aggregate');
    expect(parsedPrompt.responseShape.query.select).toContain('groupedCount');
    expect(parsedPrompt.responseShape.query.groupBy).toContain('storey');
    expect(parsedPrompt.responseShape.query.where.semanticAliases[0].aliases).toEqual(['evidence-backed alias strings']);
    expect(parsedPrompt.responseShape.query.aggregate).toMatchObject({
      op: ['sum'],
      field: ['quantity', 'property'],
    });
    expect(parsedPrompt.examples[0].request).toContain('roof level');
    expect(parsedPrompt.examples.some((example) => example.response.query.select === 'groupedCount')).toBe(true);

    const draft = parseBimLlmAgentReply(`\`\`\`json
{
  "intentSummary": "Show doors.",
  "query": {
    "version": "0.1",
    "select": "elements",
    "from": "physicalElements",
    "where": { "ifcClass": "IfcDoor" },
    "view": { "mode": "highlight", "focus": true }
  }
}
\`\`\``);

    expect(draft.intentSummary).toBe('Show doors.');
    expect(draft.query.where).toEqual({ ifcClass: 'IfcDoor' });
  });
});
