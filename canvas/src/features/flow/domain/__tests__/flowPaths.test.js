import { describe, expect, it, vi } from 'vitest';
import {
  addStepsToFlowPath,
  applyDeltaToPathSteps,
  buildFlowPathHulls,
  createFlowPathFromSelection,
  defaultFlowPathName,
  deleteFlowPath,
  duplicateFlowPath,
  flowNodeBounds,
  normalizeFlowPaths,
  orderPathStepIdsByFlowSequence,
  patchFlowPathName,
  patchPathStepRunState,
  removeStepsFromFlowPath,
  validateFlowPaths,
} from '../flowPaths.js';

describe('flowPaths', () => {
  it('defaultFlowPathName increments with existing paths', () => {
    expect(defaultFlowPathName([])).toBe('Path 1');
    expect(defaultFlowPathName([{ id: 'p1' }])).toBe('Path 2');
  });

  it('normalizeFlowPaths drops missing steps and enforces one path per step', () => {
    const normalized = normalizeFlowPaths([
      { id: 'p1', name: 'Alpha', stepIds: ['a', 'b', 'missing'] },
      { id: 'p2', name: 'Beta', stepIds: ['b', 'c'] },
    ], ['a', 'b', 'c']);

    expect(normalized).toHaveLength(2);
    expect(normalized[0].stepIds).toEqual(['a', 'b']);
    expect(normalized[1].stepIds).toEqual(['c']);
  });

  it('createFlowPathFromSelection wraps selected steps', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'path-new') });
    const result = createFlowPathFromSelection({
      paths: [{ id: 'p1', name: 'Path 1', stepIds: ['old'] }],
      selectedStepIds: ['s1', 's2'],
    });

    expect(result.pathId).toBe('path-new');
    expect(result.paths).toHaveLength(2);
    expect(result.paths[1]).toMatchObject({
      id: 'path-new',
      name: 'Path 2',
      stepIds: ['s1', 's2'],
    });
    vi.unstubAllGlobals();
  });

  it('duplicateFlowPath clones internal steps and edges with offset', () => {
    let counter = 0;
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => {
        counter += 1;
        return `id-${counter}`;
      }),
    });

    const path = { id: 'p1', name: 'Path 1', stepIds: ['n1', 'n2'] };
    const nodes = [
      { id: 'n1', position: { x: 10, y: 20 }, data: { title: 'A' } },
      { id: 'n2', position: { x: 100, y: 40 }, data: { title: 'B' } },
      { id: 'n3', position: { x: 0, y: 0 }, data: { title: 'C' } },
    ];
    const edges = [
      { id: 'e1', source: 'n1', target: 'n2', data: {} },
      { id: 'e2', source: 'n2', target: 'n3', data: {} },
    ];

    const result = duplicateFlowPath({ path, nodes, edges, paths: [path] });

    expect(result.paths).toHaveLength(2);
    expect(result.pathId).toBe(result.paths.at(-1)?.id);
    expect(result.nodes).toHaveLength(5);
    expect(result.edges).toHaveLength(3);

    const clonedNodes = result.nodes.filter((node) => !['n1', 'n2', 'n3'].includes(node.id));
    expect(clonedNodes).toHaveLength(2);
    expect(clonedNodes[0].position).toEqual({ x: 90, y: 100 });
    expect(clonedNodes[1].position).toEqual({ x: 180, y: 120 });

    const clonedStepIds = new Set(result.paths.at(-1)?.stepIds ?? []);
    const internalEdge = result.edges.find(
      (edge) => clonedStepIds.has(edge.source) && clonedStepIds.has(edge.target),
    );
    expect(internalEdge).toBeTruthy();
    expect(result.edges.some((edge) => edge.id === 'e2')).toBe(true);
    vi.unstubAllGlobals();
  });

  it('addStepsToFlowPath merges steps and removes them from other paths', () => {
    const next = addStepsToFlowPath({
      paths: [
        { id: 'p1', name: 'Path 1', stepIds: ['a'] },
        { id: 'p2', name: 'Path 2', stepIds: ['b'] },
      ],
      pathId: 'p1',
      stepIds: ['b', 'c'],
    });

    expect(next).toHaveLength(1);
    expect(next[0].stepIds).toEqual(['a', 'b', 'c']);
  });

  it('applyDeltaToPathSteps moves only member nodes from start positions', () => {
    const nodes = [
      { id: 'n1', position: { x: 0, y: 0 } },
      { id: 'n2', position: { x: 50, y: 50 } },
    ];
    const startPositions = new Map([
      ['n1', { x: 0, y: 0 }],
      ['n2', { x: 50, y: 50 }],
    ]);
    const next = applyDeltaToPathSteps(nodes, ['n1'], 10, 5, startPositions);
    expect(next[0].position).toEqual({ x: 10, y: 5 });
    expect(next[1].position).toEqual({ x: 50, y: 50 });
  });

  it('buildFlowPathHulls returns drawable hull metadata', () => {
    const hulls = buildFlowPathHulls({
      paths: [{ id: 'p1', name: 'Path 1', stepIds: ['n1', 'n2'] }],
      nodes: [
        { id: 'n1', position: { x: 0, y: 0 }, data: {} },
        { id: 'n2', position: { x: 200, y: 100 }, data: {} },
      ],
    });

    expect(hulls).toHaveLength(1);
    expect(hulls[0].pathId).toBe('p1');
    expect(hulls[0].pathD).toBeTruthy();
    expect(hulls[0].centerX).toBeTypeOf('number');
  });

  it('flowNodeBounds uses measured size when expanded', () => {
    expect(flowNodeBounds({
      position: { x: 1, y: 2 },
      data: { showContent: true },
      width: 300,
      height: 180,
    })).toEqual({ x: 1, y: 2, w: 300, h: 180 });
  });

  it('patchFlowPathName updates matching path', () => {
    const paths = [{ id: 'p1', name: 'Old', stepIds: ['n1'] }];
    const next = patchFlowPathName(paths, 'p1', 'Renamed');
    expect(next[0].name).toBe('Renamed');
  });

  it('validateFlowPaths rejects duplicate step membership', () => {
    expect(() => validateFlowPaths([
      { id: 'p1', name: 'A', stepIds: ['n1'] },
      { id: 'p2', name: 'B', stepIds: ['n1'] },
    ], ['n1'])).toThrow(/only one path/);
  });

  it('normalizeFlowPaths normalizes stepRunStates for members only', () => {
    const normalized = normalizeFlowPaths([
      {
        id: 'p1',
        name: 'Alpha',
        stepIds: ['a', 'b'],
        stepRunStates: { a: 'complete', b: 'bogus', missing: 'failed' },
      },
    ], ['a', 'b']);

    expect(normalized[0].stepRunStates).toEqual({ a: 'complete' });
  });

  it('patchPathStepRunState updates member state and omits default not_started', () => {
    const paths = [{ id: 'p1', name: 'Path', stepIds: ['a'], stepRunStates: { a: 'complete' } }];
    const updated = patchPathStepRunState(paths, 'p1', 'a', 'current');
    expect(updated[0].stepRunStates).toEqual({ a: 'current' });

    const cleared = patchPathStepRunState(updated, 'p1', 'a', 'not_started');
    expect(cleared[0].stepRunStates).toEqual({});
  });

  it('duplicateFlowPath copies stepRunStates to cloned step ids', () => {
    let counter = 0;
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => {
        counter += 1;
        return `id-${counter}`;
      }),
    });

    const path = {
      id: 'p1',
      name: 'Path 1',
      stepIds: ['n1'],
      stepRunStates: { n1: 'current' },
    };
    const nodes = [{ id: 'n1', position: { x: 0, y: 0 }, data: { title: 'A' } }];
    const result = duplicateFlowPath({ path, nodes, edges: [], paths: [path] });
    const clonedPath = result.paths.at(-1);
    const clonedStepId = clonedPath?.stepIds?.[0];
    expect(clonedPath?.stepRunStates?.[clonedStepId]).toBe('current');
    vi.unstubAllGlobals();
  });

  it('validateFlowPaths rejects invalid stepRunStates', () => {
    expect(() => validateFlowPaths([
      { id: 'p1', name: 'A', stepIds: ['n1'], stepRunStates: { n1: 'bogus' } },
    ], ['n1'])).toThrow(/invalid run state/);
  });

  it('orderPathStepIdsByFlowSequence follows internal edges from starts', () => {
    const nodesById = new Map([
      ['idea', { id: 'idea', position: { x: 0, y: 0 } }],
      ['approval', { id: 'approval', position: { x: 200, y: 0 } }],
      ['research', { id: 'research', position: { x: 400, y: 0 } }],
      ['report', { id: 'report', position: { x: 600, y: 0 } }],
    ]);
    const edges = [
      { source: 'idea', target: 'approval' },
      { source: 'approval', target: 'research' },
      { source: 'research', target: 'report' },
    ];
    const ordered = orderPathStepIdsByFlowSequence(
      ['report', 'idea', 'research', 'approval'],
      edges,
      nodesById,
    );
    expect(ordered).toEqual(['idea', 'approval', 'research', 'report']);
  });

  it('orderPathStepIdsByFlowSequence respects reversed edge direction', () => {
    const nodesById = new Map([
      ['a', { id: 'a', position: { x: 0, y: 0 } }],
      ['b', { id: 'b', position: { x: 200, y: 0 } }],
    ]);
    const edges = [{
      source: 'b',
      target: 'a',
      data: { flowDirection: 'reverse' },
    }];
    expect(orderPathStepIdsByFlowSequence(['b', 'a'], edges, nodesById)).toEqual(['a', 'b']);
  });

  it('deleteFlowPath removes path metadata only', () => {
    const paths = [
      { id: 'p1', name: 'Path 1', stepIds: ['a'] },
      { id: 'p2', name: 'Path 2', stepIds: ['b'] },
    ];
    expect(deleteFlowPath(paths, 'p1')).toEqual([paths[1]]);
    expect(() => deleteFlowPath(paths, 'missing')).toThrow(/not found/);
  });

  it('removeStepsFromFlowPath drops path when last member is removed', () => {
    const paths = [{ id: 'p1', name: 'Path 1', stepIds: ['a', 'b'], stepRunStates: { b: 'current' } }];
    expect(removeStepsFromFlowPath({ paths, pathId: 'p1', stepIds: ['a'] })).toEqual([{
      id: 'p1',
      name: 'Path 1',
      stepIds: ['b'],
      stepRunStates: { b: 'current' },
      updatedAt: expect.any(String),
    }]);
    expect(removeStepsFromFlowPath({
      paths: [{ id: 'p1', name: 'Path 1', stepIds: ['a'] }],
      pathId: 'p1',
      stepIds: ['a'],
    })).toEqual([]);
  });

  it('removeStepsFromFlowPath rejects steps outside the path', () => {
    const paths = [{ id: 'p1', name: 'Path 1', stepIds: ['a'] }];
    expect(() => removeStepsFromFlowPath({ paths, pathId: 'p1', stepIds: ['b'] }))
      .toThrow(/not in this path/);
  });
});
