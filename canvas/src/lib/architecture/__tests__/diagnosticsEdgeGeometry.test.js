import { describe, expect, it } from 'vitest';
import { ARCHITECTURE_NODES, getArchitectureReactFlowEdges } from '../architectureGraph.js';
import {
  buildDiagnosticsLayout3d,
} from '../diagnosticsLayout3d.js';
import {
  buildProjectedEdgeGeometry,
  prepareConcentratedEdgeProjection,
  sampleSvgPath,
} from '../diagnosticsEdgeGeometry.js';
import { buildRelativeEdgePath } from '../architectureEdgeRouting.js';
import { getArchitectureActionById } from '../architectureActions.js';
import { buildConcentratedActionLayout } from '../diagnosticsConcentrateLayout.js';
import { ARCHITECTURE_PIPES } from '../architectureGraph.js';

describe('diagnosticsEdgeGeometry', () => {
  const layout3d = buildDiagnosticsLayout3d(ARCHITECTURE_NODES);
  const baseEdges = getArchitectureReactFlowEdges();

  it('samples svg paths to a reasonable point count', () => {
    const { path } = buildRelativeEdgePath({
      routeStyle: 'relative-diagonal',
      sourceX: 100,
      sourceY: 100,
      targetX: 300,
      targetY: 260,
      bulgeSide: 1,
      parallelIndex: 0,
      parallelTotal: 1,
      laneOffset: 0,
    });
    const points = sampleSvgPath(path, 32);
    expect(points.length).toBeGreaterThan(10);
    expect(points[0]).toEqual({ x: 100, y: 100 });
  });

  it('builds world polylines for architecture edges', () => {
    const edge = baseEdges[0];
    const projection = {
      id: edge.id,
      sourceId: edge.source,
      targetId: edge.target,
      routingMeta: {
        routeStyle: edge.data.routeStyle,
        bulgeSide: edge.data.bulgeSide,
        archSide: edge.data.archSide,
        parallelIndex: edge.data.parallelIndex,
        parallelTotal: edge.data.parallelTotal,
        laneOffset: edge.data.laneOffset,
        busSide: edge.data.busSide,
        busLane: edge.data.busLane,
        maxRightX: edge.data.maxRightX,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      },
      routeAnchor: null,
    };

    const geometry = buildProjectedEdgeGeometry(projection, layout3d);
    expect(geometry.worldPoints.length).toBeGreaterThan(8);
    expect(geometry.label2d).toBeTruthy();
    expect(geometry.labelWorld).toBeTruthy();
  });

  it('reprojects concentrated edges locally when anchors are far from the cluster', () => {
    const action = getArchitectureActionById('add_note');
    const concentrateLayout = buildConcentratedActionLayout({
      action,
      graphNodes: ARCHITECTURE_NODES,
      pipes: ARCHITECTURE_PIPES,
    });
    const edge = baseEdges.find((entry) => entry.id === 'pipe-addMenu-newNoteDialog');
    expect(edge).toBeTruthy();

    const projection = {
      id: edge.id,
      sourceId: edge.source,
      targetId: edge.target,
      routingMeta: {
        routeStyle: edge.data.routeStyle,
        bulgeSide: edge.data.bulgeSide,
        archSide: edge.data.archSide,
        parallelIndex: edge.data.parallelIndex,
        parallelTotal: edge.data.parallelTotal,
        laneOffset: edge.data.laneOffset,
        busSide: edge.data.busSide,
        busLane: edge.data.busLane,
        maxRightX: edge.data.maxRightX,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      },
      routeAnchor: { x: 900, y: 1400 },
    };

    const anchored = buildProjectedEdgeGeometry(projection, concentrateLayout);
    const stripped = buildProjectedEdgeGeometry(
      prepareConcentratedEdgeProjection(projection, concentrateLayout),
      concentrateLayout,
    );

    const polylineExtent = (points) => {
      const xs = points.map((point) => point.x);
      const zs = points.map((point) => point.z);
      return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    };

    const anchoredExtent = polylineExtent(anchored.worldPoints);
    const strippedExtent = polylineExtent(stripped.worldPoints);

    expect(strippedExtent).toBeLessThan(anchoredExtent);
    expect(strippedExtent).toBeLessThan(4);
  });

  it('keeps concentrated anchors that sit near the edge segment', () => {
    const action = getArchitectureActionById('add_note');
    const concentrateLayout = buildConcentratedActionLayout({
      action,
      graphNodes: ARCHITECTURE_NODES,
      pipes: ARCHITECTURE_PIPES,
    });
    const edge = baseEdges.find((entry) => entry.id === 'pipe-addMenu-newNoteDialog');
    expect(edge).toBeTruthy();

    const source = concentrateLayout.byNodeId.get(edge.source);
    const target = concentrateLayout.byNodeId.get(edge.target);
    expect(source).toBeTruthy();
    expect(target).toBeTruthy();

    const localAnchor = {
      x: (source.flow.centerX + target.flow.centerX) / 2,
      y: (source.flow.centerY + target.flow.centerY) / 2 + 40,
    };

    const projection = {
      id: edge.id,
      sourceId: edge.source,
      targetId: edge.target,
      routingMeta: {
        routeStyle: 'relative-diagonal',
        bulgeSide: 1,
        archSide: 'above',
        parallelIndex: 0,
        parallelTotal: 1,
        laneOffset: 0,
        busSide: 'left',
        busLane: 0,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      },
      routeAnchor: localAnchor,
    };

    const prepared = prepareConcentratedEdgeProjection(projection, concentrateLayout);
    expect(prepared.routeAnchor).toEqual(localAnchor);
  });
});
