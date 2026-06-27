import React, { useCallback, useEffect, useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  getArchitectureReactFlowEdges,
  getArchitectureReactFlowNodes,
  getArchitectureNodeById,
  getArchitecturePipeById,
} from '../../lib/architecture/index.js';
import { DiagnosticsNode, DiagnosticsLayerNode } from './components/DiagnosticsNode.jsx';
import { DiagnosticsEdge } from './components/DiagnosticsEdge.jsx';
import { useDiagnosticsSimulation } from './hooks/useDiagnosticsSimulation.js';
import { useEdgeRouteAnchors } from './hooks/useEdgeRouteAnchors.js';
import { DiagnosticsToolbar } from './components/DiagnosticsToolbar.jsx';
import { DiagnosticsStepPanel } from './components/DiagnosticsStepPanel.jsx';
import { DiagnosticsInspector } from './components/DiagnosticsInspector.jsx';
import { strings } from '../../content/strings.js';

const NODE_TYPES = { architecture: DiagnosticsNode, architectureLayer: DiagnosticsLayerNode };
const EDGE_TYPES = { architecture: DiagnosticsEdge };

function DiagnosticsFlowInner({ onClose, runtime }) {
  const simulation = useDiagnosticsSimulation('add_task');
  const { routeAnchors, setRouteAnchor } = useEdgeRouteAnchors();
  const { fitView } = useReactFlow();

  const baseNodes = useMemo(() => getArchitectureReactFlowNodes(), []);
  const baseEdges = useMemo(() => getArchitectureReactFlowEdges(), []);

  const nodes = useMemo(() => baseNodes.map((node) => {
    if (node.type === 'architectureLayer') {
      return { ...node, zIndex: 0 };
    }
    const nodeId = node.id;
    const isCurrent = simulation.pathHighlight.currentNodeIds.has(nodeId);
    const isPath = simulation.pathHighlight.pathNodeIds.has(nodeId);
    const visualRole = isCurrent ? 'current' : isPath ? 'path' : null;
    return {
      ...node,
      zIndex: visualRole === 'current' ? 12 : visualRole === 'path' ? 11 : 10,
      data: {
        ...node.data,
        visualRole,
        highlighted: Boolean(visualRole) || simulation.selectedNodeId === nodeId,
      },
      selected: simulation.selectedNodeId === nodeId,
    };
  }), [baseNodes, simulation.pathHighlight, simulation.selectedNodeId]);

  const edges = useMemo(() => baseEdges.map((edge) => {
    const touchesUntouched = simulation.actionTouchedNodeIds
      && (!simulation.actionTouchedNodeIds.has(edge.source)
        || !simulation.actionTouchedNodeIds.has(edge.target));
    const isVisible = !touchesUntouched;
    const isCurrent = simulation.pathHighlight.currentEdgeIds.has(edge.id);
    const isPath = simulation.pathHighlight.pathEdgeIds.has(edge.id);
    const isSelected = simulation.selectedPipeId === edge.id;
    const inActionSimulation = Boolean(simulation.actionTouchedNodeIds) && !simulation.isOverviewMode;

    let visualRole = null;
    if (isCurrent) visualRole = 'current';
    else if (isPath) visualRole = 'path';
    else if (inActionSimulation && isVisible) visualRole = 'path';

    const flowing = simulation.isOverviewMode
      ? Boolean(visualRole)
      : inActionSimulation
        ? Boolean(visualRole) && isVisible
        : Boolean(visualRole);

    const markerColor = visualRole === 'current'
      ? 'var(--color-accent)'
      : visualRole === 'path'
        ? 'var(--color-diagnostics-path)'
        : undefined;

    return {
      ...edge,
      type: 'architecture',
      hidden: Boolean(touchesUntouched),
      markerEnd: flowing && markerColor
        ? { type: MarkerType.ArrowClosed, color: markerColor }
        : undefined,
      data: {
        ...edge.data,
        visualRole,
        highlighted: Boolean(visualRole) || isSelected,
        flowing,
        flowSpeed: visualRole === 'current' ? 'normal' : 'slow',
        routeAnchor: routeAnchors[edge.id] ?? null,
        onRouteAnchorChange: setRouteAnchor,
      },
      selected: isSelected,
      zIndex: isCurrent ? 3 : isPath ? 2 : 1,
    };
  }), [
    baseEdges,
    simulation.pathHighlight,
    simulation.selectedPipeId,
    simulation.actionTouchedNodeIds,
    simulation.isOverviewMode,
    routeAnchors,
    setRouteAnchor,
  ]);

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
    return () => clearTimeout(t);
  }, [fitView]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const onNodeClick = useCallback((_, node) => {
    if (node.type === 'architectureLayer') return;
    simulation.selectNode(node.id);
  }, [simulation]);

  const onEdgeClick = useCallback((_, edge) => {
    simulation.selectPipe(edge.id);
  }, [simulation]);

  const onPaneClick = useCallback(() => {
    simulation.selectNode(null);
    simulation.selectPipe(null);
  }, [simulation]);

  const inspectorNode = simulation.selectedNodeId
    ? getArchitectureNodeById(simulation.selectedNodeId)
    : null;
  const inspectorPipe = simulation.selectedPipeId
    ? getArchitecturePipeById(simulation.selectedPipeId)
    : null;

  return (
    <div className="fixed inset-0 z-[85] bg-canvas flex flex-col pointer-events-auto">
      <DiagnosticsToolbar
        simulation={simulation}
        runtime={runtime}
        onClose={onClose}
      />
      <div className="flex flex-1 min-h-0">
        <div id="diagnostics-flow-canvas" className="flex-1 min-w-0 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            fitView
            minZoom={0.2}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="var(--color-diagnostics-grid-dot)"
            />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              className="!bg-surface !border-border"
            />
          </ReactFlow>
        </div>
        <aside className="w-80 shrink-0 border-l border-border bg-surface flex flex-col min-h-0">
          <DiagnosticsStepPanel
            step={simulation.step}
            stepIndex={simulation.stepIndex}
            stepCount={simulation.stepCount}
            actionLabel={simulation.action?.label}
            isOverviewMode={simulation.isOverviewMode}
          />
          <DiagnosticsInspector
            node={inspectorNode}
            pipe={inspectorPipe}
            activePipes={
              simulation.isOverviewMode && simulation.selectedNodeId
                ? [...simulation.pathHighlight.pathEdgeIds]
                  .map((id) => getArchitecturePipeById(id))
                  .filter(Boolean)
                : simulation.step
                  ? simulation.step.edgeIds.map((id) => getArchitecturePipeById(id)).filter(Boolean)
                  : []
            }
          />
        </aside>
      </div>
      <p className="sans text-[9px] text-muted text-center py-1 border-t border-border">
        {strings.diagnostics.footerHint}
      </p>
    </div>
  );
}

export function DiagnosticsCanvasView({ onClose, runtime }) {
  return (
    <ReactFlowProvider>
      <DiagnosticsFlowInner onClose={onClose} runtime={runtime} />
    </ReactFlowProvider>
  );
}
