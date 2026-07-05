import { describe, expect, it } from 'vitest';
import {
  createBimResultSetFromElements,
  normalizeBimResultSets,
} from '../bimResultSets.js';
import {
  classifyBim4dTasks,
  normalizeBim4dSequences,
  resolveBim4dTaskElementIds,
} from '../bim4d.js';
import {
  buildBim5dTakeoffRows,
  normalizeBim5dCostPlans,
  summarizeBim5dTakeoff,
} from '../bim5d.js';

describe('BIM result sets', () => {
  it('normalizes valid result sets and discards invalid entries', () => {
    const resultSets = normalizeBimResultSets([
      null,
      { id: 'empty', elementIds: [] },
      {
        id: 'walls',
        name: 'Walls',
        elementIds: ['ifc:wall-1', 'ifc:wall-1', ''],
        assemblyIds: ['ASM-1'],
        color: '#ff0000',
      },
    ]);

    expect(resultSets).toEqual([
      expect.objectContaining({
        id: 'walls',
        name: 'Walls',
        elementIds: ['ifc:wall-1'],
        assemblyIds: ['ASM-1'],
        color: '#ff0000',
      }),
    ]);
  });

  it('creates stable model-linked result sets from current elements', () => {
    const resultSet = createBimResultSetFromElements({
      name: 'Selected doors',
      elementIds: ['ifc:door-1'],
      now: '2026-01-01T00:00:00.000Z',
    });

    expect(resultSet).toMatchObject({
      name: 'Selected doors',
      createdAt: '2026-01-01T00:00:00.000Z',
      elementIds: ['ifc:door-1'],
    });
  });
});

describe('BIM 4D sequencing', () => {
  it('normalizes task and sequence fields', () => {
    const sequences = normalizeBim4dSequences([
      {
        id: 'seq-1',
        name: 'Install',
        tasks: [
          { id: 'task-b', name: 'Second', order: 2, status: 'complete', visibilityMode: 'hideFuture' },
          { id: 'task-a', name: 'First', order: 1, elementIds: ['ifc:wall-1'] },
        ],
      },
    ]);

    expect(sequences[0]).toMatchObject({ id: 'seq-1', name: 'Install' });
    expect(sequences[0].tasks.map((task) => task.id)).toEqual(['task-a', 'task-b']);
    expect(sequences[0].tasks[1]).toMatchObject({ status: 'complete', visibilityMode: 'hideFuture' });
  });

  it('resolves active task elements from direct ids, assemblies, and result sets', () => {
    const task = {
      elementIds: ['ifc:direct'],
      assemblyIds: ['ASM-1'],
      resultSetIds: ['set-1'],
    };
    const resultSets = [
      { id: 'set-1', elementIds: ['ifc:from-set'], assemblyIds: ['ASM-2'] },
    ];
    const assemblyMembers = [
      { assemblyId: 'ASM-1', elementId: 'ifc:from-assembly' },
      { assemblyId: 'ASM-2', elementId: 'ifc:from-result-set-assembly' },
    ];

    expect(resolveBim4dTaskElementIds(task, resultSets, assemblyMembers)).toEqual([
      'ifc:direct',
      'ifc:from-assembly',
      'ifc:from-set',
      'ifc:from-result-set-assembly',
    ]);
  });

  it('classifies timeline states around the active task', () => {
    const tasks = classifyBim4dTasks({
      tasks: [
        { id: 'task-1' },
        { id: 'task-2' },
        { id: 'task-3' },
      ],
    }, 'task-2');

    expect(tasks.map((task) => task.timelineState)).toEqual(['completed', 'current', 'upcoming']);
  });
});

describe('BIM 5D takeoff and cost plans', () => {
  const preparedModel = {
    elements: [
      { id: 'ifc:wall-1', ifcClass: 'IfcWall', typeName: 'External Wall', storeyId: 'Level 1' },
      { id: 'ifc:wall-2', ifcClass: 'IfcWall', typeName: 'Internal Wall', storeyId: 'Level 1' },
      { id: 'ifc:slab-1', ifcClass: 'IfcSlab', typeName: 'Floor Slab', storeyId: 'Level 2' },
      { id: 'ifc:door-1', ifcClass: 'IfcDoor', typeName: 'Single Door', storeyId: 'Level 1' },
    ],
    properties: [
      { id: 'q1', elementId: 'ifc:wall-1', source: 'ifc-quantity', propertyName: 'NetSideArea', value: 10, unit: 'm2' },
      { id: 'q2', elementId: 'ifc:wall-2', source: 'ifc-quantity', propertyName: 'NetSideArea', value: 5, unit: 'm2' },
      { id: 'q3', elementId: 'ifc:slab-1', source: 'ifc-quantity', propertyName: 'GrossVolume', value: 3, unit: 'm3' },
      { id: 'p1', elementId: 'ifc:wall-1', psetName: 'Archicad Properties', propertyName: 'Layer', value: 'Structure' },
      { id: 'p2', elementId: 'ifc:door-1', psetName: 'Classification', propertyName: 'Uniclass', value: 'Ss_25_30' },
    ],
    semanticAssemblies: [{ id: 'ASM-DOOR', kind: 'DoorAssembly' }],
    assemblyMembers: [{ assemblyId: 'ASM-DOOR', elementId: 'ifc:door-1' }],
  };

  it('normalizes cost plans and rate rows', () => {
    const plans = normalizeBim5dCostPlans([
      {
        id: 'plan-1',
        currency: 'aud',
        groupBy: 'storey',
        rateRows: [{ id: 'rate-1', label: 'Walls', quantityName: 'Area', unitCost: '125' }],
      },
    ]);

    expect(plans[0]).toMatchObject({
      id: 'plan-1',
      currency: 'AUD',
      groupBy: 'storey',
    });
    expect(plans[0].rateRows[0]).toMatchObject({ unitCost: 125, quantityName: 'Area' });
  });

  it('aggregates IFC quantities and cost by class with missing evidence counts', () => {
    const rows = buildBim5dTakeoffRows(preparedModel, {
      id: 'plan-1',
      currency: 'AUD',
      groupBy: 'ifcClass',
      rateRows: [
        { id: 'wall-rate', label: 'Wall area', match: { ifcClass: 'IfcWall' }, quantityName: 'Area', unit: 'm2', unitCost: 100 },
      ],
    });
    const wallRow = rows.find((row) => row.label === 'IfcWall');
    const doorRow = rows.find((row) => row.label === 'IfcDoor');

    expect(wallRow).toMatchObject({
      quantityName: 'Area',
      quantityValue: 15,
      unit: 'm2',
      quantitySource: 'ifc',
      confidence: 'measured',
      unitCost: 100,
      totalCost: 1500,
    });
    expect(doorRow).toMatchObject({ missingQuantityCount: 1, missingRateCount: 1 });
    expect(summarizeBim5dTakeoff(rows)).toMatchObject({
      elementCount: 4,
      totalCost: 1500,
      missingQuantityCount: 2,
      missingRateCount: 2,
    });
  });

  it('groups by result set, semantic type, layer, type, storey, and classification', () => {
    const resultSets = [{ id: 'set-walls', name: 'Wall package', elementIds: ['ifc:wall-1', 'ifc:wall-2'] }];
    const basePlan = { id: 'plan', currency: 'AUD', rateRows: [] };

    expect(buildBim5dTakeoffRows(preparedModel, { ...basePlan, groupBy: 'resultSet' }, resultSets).map((row) => row.label))
      .toContain('Wall package');
    expect(buildBim5dTakeoffRows(preparedModel, { ...basePlan, groupBy: 'semanticType' }).map((row) => row.label))
      .toContain('DoorAssembly');
    expect(buildBim5dTakeoffRows(preparedModel, { ...basePlan, groupBy: 'layer' }).map((row) => row.label))
      .toContain('Structure');
    expect(buildBim5dTakeoffRows(preparedModel, { ...basePlan, groupBy: 'typeName' }).map((row) => row.label))
      .toContain('External Wall');
    expect(buildBim5dTakeoffRows(preparedModel, { ...basePlan, groupBy: 'storey' }).map((row) => row.label))
      .toContain('Level 2');
    expect(buildBim5dTakeoffRows(preparedModel, { ...basePlan, groupBy: 'classification' }).map((row) => row.label))
      .toContain('Ss_25_30');
  });
});
