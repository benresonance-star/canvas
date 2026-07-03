import React, { useCallback, useRef } from 'react';
import { EdgeLabelRenderer, useReactFlow } from '@xyflow/react';
import { strings } from '../../../content/strings.js';
import { useDiagnosticsFlowInteraction } from './DiagnosticsFlowInteractionContext.jsx';

export function DiagnosticsEdgeLabel({
  edgeId,
  labelX,
  labelY,
  label,
  className,
  zIndex = 1000,
  onAnchorChange,
  onEdgeLabelDragStart,
  onEdgeLabelDragEnd,
}) {
  const { screenToFlowPosition } = useReactFlow();
  const flowInteraction = useDiagnosticsFlowInteraction();
  const dragRef = useRef(null);

  const onPointerDown = useCallback((event) => {
    event.stopPropagation();
    event.preventDefault();
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    dragRef.current = {
      pointerFlow: screenToFlowPosition({ x: startClientX, y: startClientY }),
      anchor: { x: labelX, y: labelY },
      latestAnchor: { x: labelX, y: labelY },
      moved: false,
    };

    const onPointerMove = (moveEvent) => {
      if (!dragRef.current) return;
      const flow = screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
      const { pointerFlow, anchor } = dragRef.current;
      const nextAnchor = {
        x: anchor.x + (flow.x - pointerFlow.x),
        y: anchor.y + (flow.y - pointerFlow.y),
      };
      if (!dragRef.current.moved) {
        const dx = moveEvent.clientX - startClientX;
        const dy = moveEvent.clientY - startClientY;
        if (Math.hypot(dx, dy) > 3) {
          dragRef.current.moved = true;
          if (flowInteraction?.isDraggingEdgeLabelRef) {
            flowInteraction.isDraggingEdgeLabelRef.current = true;
          }
          onEdgeLabelDragStart?.();
        }
      }

      dragRef.current.latestAnchor = nextAnchor;

      if (flowInteraction?.setFlowEdges) {
        flowInteraction.setFlowEdges((edges) => edges.map((edge) => {
          if (edge.id !== edgeId) return edge;
          return {
            ...edge,
            data: {
              ...edge.data,
              routeAnchor: nextAnchor,
            },
          };
        }));
        return;
      }

      onAnchorChange(edgeId, nextAnchor);
    };

    const onPointerUp = () => {
      const dragState = dragRef.current;
      if (dragState?.moved) {
        onAnchorChange(edgeId, dragState.latestAnchor);
        onEdgeLabelDragEnd?.();
      }
      if (flowInteraction?.isDraggingEdgeLabelRef) {
        flowInteraction.isDraggingEdgeLabelRef.current = false;
      }
      dragRef.current = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [
    edgeId,
    flowInteraction,
    labelX,
    labelY,
    onAnchorChange,
    onEdgeLabelDragEnd,
    onEdgeLabelDragStart,
    screenToFlowPosition,
  ]);

  const onDoubleClick = useCallback((event) => {
    event.stopPropagation();
    onAnchorChange(edgeId, null);
  }, [edgeId, onAnchorChange]);

  return (
    <EdgeLabelRenderer>
      <div
        role="button"
        tabIndex={0}
        title={strings.diagnostics.dragEdgeLabelHint}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          pointerEvents: 'all',
          zIndex,
          touchAction: 'none',
        }}
        className={`diagnostics-edge-label diagnostics-edge-label--draggable ${className}`}
      >
        {label}
      </div>
    </EdgeLabelRenderer>
  );
}
