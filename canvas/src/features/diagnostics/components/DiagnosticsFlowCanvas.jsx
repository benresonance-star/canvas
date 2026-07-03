import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import { DiagnosticsNode, DiagnosticsLayerNode } from './DiagnosticsNode.jsx';
import { DiagnosticsEdge } from './DiagnosticsEdge.jsx';
import { DiagnosticsFlowInteractionContext } from './DiagnosticsFlowInteractionContext.jsx';

const NODE_TYPES = { architecture: DiagnosticsNode, architectureLayer: DiagnosticsLayerNode };
const EDGE_TYPES = { architecture: DiagnosticsEdge };

function InitialFitView() {
  const { fitView } = useReactFlow();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (fittedRef.current) return;
    fittedRef.current = true;
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
    return () => clearTimeout(t);
  }, [fitView]);

  return null;
}

export function DiagnosticsFlowCanvas({
  reactFlowNodes,
  reactFlowEdges,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
}) {
  const [edges, setEdges] = useState(reactFlowEdges);
  const isDraggingEdgeLabelRef = useRef(false);

  useEffect(() => {
    if (isDraggingEdgeLabelRef.current) return;
    setEdges(reactFlowEdges);
  }, [reactFlowEdges]);

  const setFlowEdges = useCallback((updater) => {
    setEdges((current) => updater(current));
  }, []);

  const interactionContext = useMemo(
    () => ({ isDraggingEdgeLabelRef, setFlowEdges }),
    [setFlowEdges],
  );

  return (
    <DiagnosticsFlowInteractionContext.Provider value={interactionContext}>
      <ReactFlow
        nodes={reactFlowNodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <InitialFitView />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--color-diagnostics-grid-dot)"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </DiagnosticsFlowInteractionContext.Provider>
  );
}
