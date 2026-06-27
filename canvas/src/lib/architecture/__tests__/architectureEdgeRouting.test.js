import { describe, expect, it } from 'vitest';
import {
  ARCHITECTURE_NODES,
  ARCHITECTURE_PIPES,
  getArchitectureReactFlowEdges,
} from '../architectureGraph.js';
import {
  applyParallelRoutingOverrides,
  buildAnchoredCurvePath,
  buildEdgeRoutingMetadata,
  buildHorizontalArchPath,
  buildRelativeEdgePath,
  classifyEdgeTopology,
  computeArchitectureNodeLayouts,
  resolveCounterBulgeSide,
  resolveEdgeHandles,
  resolveRelativeEdgeRouting,
  spreadAlongNode,
} from '../architectureEdgeRouting.js';

describe('architectureEdgeRouting', () => {
  const layouts = computeArchitectureNodeLayouts(ARCHITECTURE_NODES);
  const layoutList = [...layouts.values()];

  it('classifies same-row edges as horizontal', () => {
    const source = layouts.get('addMenu');
    const target = layouts.get('newTaskDialog');
    expect(classifyEdgeTopology(source, target)).toBe('horizontal');
    const routing = resolveEdgeHandles(source, target, layoutList);
    expect(routing.routeStyle).toBe('relative-horizontal');
    expect(routing.sourceHandle).toBe('top-source');
    expect(routing.targetHandle).toBe('top');
    const arch = buildHorizontalArchPath(source.centerX, source.y, target.centerX, target.y, 'above', 0, 0);
    expect(arch.labelY).toBeLessThan(source.y - 40);
    expect(arch.path).toContain('C');
  });

  it('classifies offset adjacent layers as diagonal with port handles', () => {
    const source = layouts.get('newTaskDialog');
    const target = layouts.get('useCanvasDocument');
    expect(classifyEdgeTopology(source, target)).toBe('diagonal');
    const routing = resolveEdgeHandles(source, target, layoutList);
    expect(routing.routeStyle).toBe('relative-diagonal');
    expect(routing.sourceHandle).toBe('bottom');
    expect(routing.targetHandle).toBe('top');
    expect([-1, 1]).toContain(routing.bulgeSide);
  });

  it('uses exterior bus only for multi-layer spans', () => {
    const source = layouts.get('addMenu');
    const target = layouts.get('apiArtifacts');
    const routing = resolveRelativeEdgeRouting(source, target, { layoutList });
    expect(routing.routeStyle).toBe('exterior-bus');
    expect(routing.sourceHandle).toBe('bottom');
    expect(routing.targetHandle).toBe('top');
  });

  it('assigns distinct exterior bus lanes per side', () => {
    const meta = buildEdgeRoutingMetadata(ARCHITECTURE_PIPES, layouts)
      .filter((entry) => entry.routing.routeStyle === 'exterior-bus');
    expect(meta.length).toBeGreaterThan(1);
    const lanes = new Set(meta.map((entry) => `${entry.busSide}:${entry.busLane}`));
    expect(lanes.size).toBeGreaterThan(1);
  });

  it('fans multiple edges into the same target across separate entry points', () => {
    const target = layouts.get('idbProjects');
    expect(target).toBeTruthy();
    const a = spreadAlongNode(target, 0, 3);
    const b = spreadAlongNode(target, 1, 3);
    const c = spreadAlongNode(target, 2, 3);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('gives idbProjects inbound edges distinct bus lanes or entry points', () => {
    const inbound = buildEdgeRoutingMetadata(ARCHITECTURE_PIPES, layouts)
      .filter((meta) => meta.pipe.target === 'idbProjects');
    expect(inbound.length).toBeGreaterThan(1);
    const entryPoints = new Set(inbound.map((meta) => meta.targetEntryX));
    expect(entryPoints.size).toBeGreaterThan(1);
  });

  it('buildRelativeEdgePath returns label on curve for each topology', () => {
    const source = layouts.get('addMenu');
    const target = layouts.get('newTaskDialog');
    const horizontal = buildRelativeEdgePath({
      routeStyle: 'relative-horizontal',
      sourceX: source.centerX,
      sourceY: source.y,
      targetX: target.centerX,
      targetY: target.y,
      archSide: 'above',
    });
    expect(horizontal.labelX).toBeCloseTo((source.centerX + target.centerX) / 2, 0);
    expect(horizontal.path.startsWith('M')).toBe(true);
  });

  it('buildRelativeEdgePath uses dragged anchor when provided', () => {
    const anchored = buildRelativeEdgePath({
      routeStyle: 'relative-diagonal',
      sourceX: 100,
      sourceY: 100,
      targetX: 300,
      targetY: 280,
      routeAnchor: { x: 180, y: 40 },
    });
    expect(anchored.labelX).toBe(180);
    expect(anchored.labelY).toBe(40);
    expect(anchored.path).toContain('180 40');
  });

  it('buildAnchoredCurvePath connects source and target through anchor', () => {
    const result = buildAnchoredCurvePath(0, 0, 200, 100, 100, -30);
    expect(result.path.startsWith('M 0 0')).toBe(true);
    expect(result.path).toContain('200 100');
    expect(result.labelY).toBe(-30);
  });

  it('counter-curves sibling edges on the same node pair', () => {
    const meta = buildEdgeRoutingMetadata(ARCHITECTURE_PIPES, layouts)
      .filter((entry) => entry.pipe.source === 'projectSyncDocument' && entry.pipe.target === 'apiCanvasProjects');
    expect(meta.length).toBe(2);
    const left = meta.find((entry) => entry.routing.bulgeSide < 0);
    const right = meta.find((entry) => entry.routing.bulgeSide > 0);
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    expect(resolveCounterBulgeSide(0, 2)).toBe(-1);
    expect(resolveCounterBulgeSide(1, 2)).toBe(1);
  });

  it('layout edges include handles and topology for every pipe', () => {
    const edges = getArchitectureReactFlowEdges();
    for (const edge of edges) {
      expect(edge.sourceHandle, edge.id).toBeTruthy();
      expect(edge.targetHandle, edge.id).toBeTruthy();
      expect(edge.data.routeStyle, edge.id).toBeTruthy();
      expect(edge.data.topology, edge.id).toBeTruthy();
      expect(edge.data.bulgeSide, edge.id).toBeTruthy();
    }
    expect(edges.length).toBe(ARCHITECTURE_PIPES.length);
  });
});
