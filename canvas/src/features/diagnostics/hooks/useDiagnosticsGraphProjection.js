import { useMemo, useRef } from 'react';
import { MarkerType } from '@xyflow/react';
import {
  getArchitectureReactFlowEdges,
  getArchitectureReactFlowNodes,
  getArchitecturePipeById,
} from '../../../lib/architecture/index.js';

function anchorsEqual(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.x === right.x && left.y === right.y;
}

/**
 * @param {ReturnType<typeof buildDiagnosticsGraphProjection>['reactFlowEdges']} baseEdges
 * @param {Record<string, { x: number, y: number } | null>} routeAnchors
 * @param {object} handlers
 */
export function mergeRouteAnchorsIntoReactFlowEdges(baseEdges, routeAnchors, handlers) {
  return baseEdges.map((edge) => {
    const routeAnchor = routeAnchors[edge.id] ?? null;
    return {
      ...edge,
      data: {
        ...edge.data,
        routeAnchor,
        ...handlers,
      },
    };
  });
}

/**
 * Preserve edge object identity when only another edge's anchor changes.
 *
 * @param {ReturnType<typeof buildDiagnosticsGraphProjection>['reactFlowEdges']} baseEdges
 * @param {Record<string, { x: number, y: number } | null>} routeAnchors
 * @param {object} handlers
 * @param {Map<string, object>} stableEdgesById
 */
function mergeRouteAnchorsIntoReactFlowEdgesStable(baseEdges, routeAnchors, handlers, stableEdgesById) {
  return baseEdges.map((edge) => {
    const routeAnchor = routeAnchors[edge.id] ?? null;
    const previous = stableEdgesById.get(edge.id);
    if (
      previous
      && previous.hidden === edge.hidden
      && previous.selected === edge.selected
      && previous.zIndex === edge.zIndex
      && previous.data.visualRole === edge.data.visualRole
      && previous.data.ghosted === edge.data.ghosted
      && previous.data.flowing === edge.data.flowing
      && previous.data.flowSpeed === edge.data.flowSpeed
      && previous.data.overviewMode === handlers.overviewMode
      && anchorsEqual(previous.data.routeAnchor ?? null, routeAnchor)
    ) {
      return previous;
    }

    const next = {
      ...edge,
      data: {
        ...edge.data,
        routeAnchor,
        ...handlers,
      },
    };
    stableEdgesById.set(edge.id, next);
    return next;
  });
}
/**
 * @param {object} simulation
 * @param {Record<string, { x: number, y: number } | null>} routeAnchors
 * @param {ReturnType<typeof getArchitectureReactFlowNodes>} baseNodes
 * @param {ReturnType<typeof getArchitectureReactFlowEdges>} baseEdges
 */
export function buildDiagnosticsGraphProjection(simulation, routeAnchors, baseNodes, baseEdges) {
  const hasOverviewSelection = simulation.isOverviewMode
    && (simulation.selectedNodeId || simulation.selectedPipeId);
  const ghostInactive = simulation.ghostInactiveRelationships && hasOverviewSelection;

  const projectedNodes = baseNodes
    .filter((node) => node.type === 'architecture')
    .map((node) => {
      const nodeId = node.id;
      const nodeDef = node.data.nodeDef;
      const isCurrent = simulation.pathHighlight.currentNodeIds.has(nodeId);
      const isPath = simulation.pathHighlight.pathNodeIds.has(nodeId);
      const visualRole = isCurrent ? 'current' : isPath ? 'path' : 'quiet';
      const selectedPipe = simulation.selectedPipeId
        ? getArchitecturePipeById(simulation.selectedPipeId)
        : null;
      const isPipeEndpoint = selectedPipe
        && (nodeId === selectedPipe.source || nodeId === selectedPipe.target);
      const isActive = visualRole !== 'quiet' || Boolean(isPipeEndpoint);

      return {
        id: nodeId,
        nodeDef,
        position2d: {
          x: node.position.x,
          y: node.position.y,
          parentId: node.parentId,
        },
        visualRole,
        ghosted: ghostInactive && !isActive,
        selected: simulation.selectedNodeId === nodeId,
        layer: nodeDef.layer,
      };
    });

  const projectedEdges = baseEdges.map((edge) => {
    const touchesUntouched = simulation.actionTouchedNodeIds
      && (!simulation.actionTouchedNodeIds.has(edge.source)
        || !simulation.actionTouchedNodeIds.has(edge.target));
    const isVisible = !touchesUntouched;
    const isCurrent = simulation.pathHighlight.currentEdgeIds.has(edge.id);
    const isPath = simulation.pathHighlight.pathEdgeIds.has(edge.id);
    const isSelected = simulation.selectedPipeId === edge.id;
    const inActionSimulation = Boolean(simulation.actionTouchedNodeIds) && !simulation.isOverviewMode;

    let visualRole = 'quiet';
    if (isCurrent) visualRole = 'current';
    else if (isPath) visualRole = 'path';
    else if (inActionSimulation && isVisible) visualRole = 'path';

    const isActive = visualRole !== 'quiet' || isSelected;
    const ghosted = ghostInactive && !isActive;

    const flowing = simulation.isOverviewMode
      ? visualRole !== 'quiet'
      : inActionSimulation
        ? visualRole !== 'quiet' && isVisible
        : visualRole !== 'quiet';

    return {
      id: edge.id,
      pipeDef: edge.data.pipeDef,
      sourceId: edge.source,
      targetId: edge.target,
      routingMeta: {
        routeStyle: edge.data.routeStyle,
        topology: edge.data.topology,
        bulgeSide: edge.data.bulgeSide,
        archSide: edge.data.archSide,
        parallelIndex: edge.data.parallelIndex,
        parallelTotal: edge.data.parallelTotal,
        laneOffset: edge.data.laneOffset,
        busSide: edge.data.busSide,
        busLane: edge.data.busLane,
        targetEntryX: edge.data.targetEntryX,
        sourceEntryX: edge.data.sourceEntryX,
        targetFanIndex: edge.data.targetFanIndex,
        targetFanTotal: edge.data.targetFanTotal,
        maxRightX: edge.data.maxRightX,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      },
      label: edge.label,
      routeAnchor: routeAnchors[edge.id] ?? null,
      visualRole,
      ghosted,
      flowing,
      flowSpeed: visualRole === 'current' ? 'normal' : 'slow',
      hidden: Boolean(touchesUntouched),
      selected: isSelected,
    };
  });

  const projectionByNodeId = new Map(projectedNodes.map((node) => [node.id, node]));
  const quietZIndex = simulation.isOverviewMode ? 4 : 10;
  const reactFlowNodes = baseNodes.map((node) => {
    if (node.type === 'architectureLayer') {
      return { ...node, zIndex: 0 };
    }

    const projection = projectionByNodeId.get(node.id);
    if (!projection) return node;

    const { visualRole, ghosted } = projection;

    return {
      ...node,
      zIndex: visualRole === 'current' ? 12 : visualRole === 'path' ? 11 : quietZIndex,
      data: {
        ...node.data,
        visualRole: visualRole === 'quiet' ? null : visualRole,
        ghosted,
        highlighted: visualRole !== 'quiet' || projection.selected,
      },
      selected: projection.selected,
    };
  });

  const projectionByEdgeId = new Map(projectedEdges.map((edge) => [edge.id, edge]));
  const reactFlowEdges = baseEdges.map((edge) => {
    const projection = projectionByEdgeId.get(edge.id);
    if (!projection) return edge;

    const {
      visualRole,
      ghosted,
      flowing,
      flowSpeed,
      hidden,
      selected,
      routeAnchor,
    } = projection;

    const markerColor = ghosted
      ? undefined
      : visualRole === 'current'
        ? 'var(--color-accent)'
        : visualRole === 'path'
          ? 'var(--color-diagnostics-path)'
          : 'var(--color-diagnostics-edge)';

    return {
      ...edge,
      type: 'architecture',
      hidden,
      markerEnd: markerColor
        ? { type: MarkerType.ArrowClosed, color: markerColor }
        : undefined,
      data: {
        ...edge.data,
        visualRole: visualRole === 'quiet' ? null : visualRole,
        ghosted,
        highlighted: visualRole !== 'quiet' || selected,
        flowing,
        flowSpeed,
        routeAnchor,
      },
      selected,
      zIndex: visualRole === 'current' ? 3 : visualRole === 'path' ? 2 : ghosted ? 0 : 1,
    };
  });

  const projectedLayers = baseNodes
    .filter((node) => node.type === 'architectureLayer')
    .map((node) => ({
      id: node.id,
      layer: node.data.layer,
      label: node.data.label,
      position2d: node.position,
      size: {
        width: node.style?.width ?? 0,
        height: node.style?.height ?? 0,
      },
    }));

  return {
    projectedNodes,
    projectedEdges,
    projectedLayers,
    reactFlowNodes,
    reactFlowEdges,
  };
}

/**
 * @param {import('./useDiagnosticsSimulation.js').ReturnType<typeof import('./useDiagnosticsSimulation.js').useDiagnosticsSimulation>} simulation
 * @param {Record<string, { x: number, y: number } | null>} routeAnchors
 * @param {(edgeId: string, anchor: { x: number, y: number } | null) => void} setRouteAnchor
 * @param {() => void} lockEdgeLabelInteraction
 * @param {() => void} releaseEdgeLabelInteractionLock
 */
export function useDiagnosticsGraphProjection({
  simulation,
  routeAnchors,
  setRouteAnchor,
  lockEdgeLabelInteraction,
  releaseEdgeLabelInteractionLock,
}) {
  const baseNodes = useMemo(() => getArchitectureReactFlowNodes(), []);
  const baseEdges = useMemo(() => getArchitectureReactFlowEdges(), []);
  const stableEdgesByIdRef = useRef(new Map());

  const {
    isOverviewMode,
    selectedNodeId,
    selectedPipeId,
    pathHighlight,
    actionTouchedNodeIds,
    ghostInactiveRelationships,
  } = simulation;

  const {
    projectedNodes,
    projectedEdges: projectedEdgesBase,
    projectedLayers,
    reactFlowNodes,
    reactFlowEdges: reactFlowEdgesBase,
  } = useMemo(() => {
    stableEdgesByIdRef.current.clear();
    return buildDiagnosticsGraphProjection(simulation, {}, baseNodes, baseEdges);
  }, [
    actionTouchedNodeIds,
    baseEdges,
    baseNodes,
    ghostInactiveRelationships,
    isOverviewMode,
    pathHighlight,
    selectedNodeId,
    selectedPipeId,
  ]);

  const projectedEdges = useMemo(
    () => projectedEdgesBase.map((edge) => ({
      ...edge,
      routeAnchor: routeAnchors[edge.id] ?? null,
    })),
    [projectedEdgesBase, routeAnchors],
  );

  const edgeHandlers = useMemo(
    () => ({
      onRouteAnchorChange: setRouteAnchor,
      onEdgeLabelDragStart: lockEdgeLabelInteraction,
      onEdgeLabelDragEnd: releaseEdgeLabelInteractionLock,
      overviewMode: simulation.isOverviewMode,
    }),
    [
      lockEdgeLabelInteraction,
      releaseEdgeLabelInteractionLock,
      setRouteAnchor,
      simulation.isOverviewMode,
    ],
  );

  const reactFlowEdges = useMemo(
    () => mergeRouteAnchorsIntoReactFlowEdgesStable(
      reactFlowEdgesBase,
      routeAnchors,
      edgeHandlers,
      stableEdgesByIdRef.current,
    ),
    [edgeHandlers, reactFlowEdgesBase, routeAnchors],
  );

  return {
    projectedNodes,
    projectedEdges,
    projectedLayers,
    reactFlowNodes,
    reactFlowEdges,
  };
}
