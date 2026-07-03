import { describe, expect, it } from 'vitest';
import { MarkerType } from '@xyflow/react';
import {
  getArchitectureReactFlowEdges,
  getArchitectureReactFlowNodes,
  getOverviewHighlight,
  ARCHITECTURE_PIPES,
} from '../../../../lib/architecture/index.js';
import { buildDiagnosticsGraphProjection } from '../useDiagnosticsGraphProjection.js';

function buildSimulationState(overrides = {}) {
  return {
    isOverviewMode: true,
    ghostInactiveRelationships: false,
    pathHighlight: getOverviewHighlight('addMenu', ARCHITECTURE_PIPES, { extendedFeedIn: false }),
    selectedNodeId: 'addMenu',
    selectedPipeId: null,
    actionTouchedNodeIds: null,
    ...overrides,
  };
}

describe('buildDiagnosticsGraphProjection', () => {
  const baseNodes = getArchitectureReactFlowNodes();
  const baseEdges = getArchitectureReactFlowEdges();

  it('marks selected node as current and neighbors as path', () => {
    const simulation = buildSimulationState();
    const projection = buildDiagnosticsGraphProjection(simulation, {}, baseNodes, baseEdges);

    const selected = projection.projectedNodes.find((node) => node.id === 'addMenu');
    expect(selected?.visualRole).toBe('current');
    expect(projection.projectedNodes.some((node) => node.visualRole === 'path')).toBe(true);
  });

  it('ghosts inactive nodes when ghost mode is enabled', () => {
    const simulation = buildSimulationState({
      ghostInactiveRelationships: true,
    });
    const projection = buildDiagnosticsGraphProjection(simulation, {}, baseNodes, baseEdges);

    const inactive = projection.projectedNodes.find((node) => node.id === 'flowEditor');
    expect(inactive?.ghosted).toBe(true);
  });

  it('hides untouched edges during action simulation', () => {
    const simulation = buildSimulationState({
      isOverviewMode: false,
      selectedNodeId: null,
      pathHighlight: {
        currentNodeIds: new Set(),
        pathNodeIds: new Set(),
        currentEdgeIds: new Set(),
        pathEdgeIds: new Set(baseEdges.slice(0, 2).map((edge) => edge.id)),
      },
      actionTouchedNodeIds: new Set(['addMenu', 'newTaskDialog']),
    });

    const projection = buildDiagnosticsGraphProjection(simulation, {}, baseNodes, baseEdges);
    expect(projection.projectedEdges.some((edge) => edge.hidden)).toBe(true);
  });

  it('adds arrow markers to quiet edges', () => {
    const simulation = buildSimulationState();
    const projection = buildDiagnosticsGraphProjection(simulation, {}, baseNodes, baseEdges);

    const quietEdge = projection.reactFlowEdges.find(
      (edge) => !edge.data.ghosted && !edge.data.visualRole,
    );
    expect(quietEdge?.markerEnd).toEqual({
      type: MarkerType.ArrowClosed,
      color: 'var(--color-diagnostics-edge)',
    });
  });

  it('omits arrow markers on ghosted edges', () => {
    const simulation = buildSimulationState({
      ghostInactiveRelationships: true,
    });
    const projection = buildDiagnosticsGraphProjection(simulation, {}, baseNodes, baseEdges);

    const ghostedEdge = projection.reactFlowEdges.find((edge) => edge.data.ghosted);
    expect(ghostedEdge?.markerEnd).toBeUndefined();
  });

  it('uses merged route anchors when action-scoped anchors override globals', () => {
    const simulation = buildSimulationState();
    const routeAnchors = {
      'pipe-addMenu-newTaskDialog': { x: 10, y: 20 },
      'pipe-addMenu-newNoteDialog': { x: 99, y: 88 },
    };
    const projection = buildDiagnosticsGraphProjection(simulation, routeAnchors, baseNodes, baseEdges);

    const edge = projection.projectedEdges.find((entry) => entry.id === 'pipe-addMenu-newNoteDialog');
    expect(edge?.routeAnchor).toEqual({ x: 99, y: 88 });
  });
});
