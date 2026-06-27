import React, { useCallback, useRef } from 'react';
import { EdgeLabelRenderer, useReactFlow } from '@xyflow/react';
import { strings } from '../../../content/strings.js';

export function DiagnosticsEdgeLabel({
  edgeId,
  labelX,
  labelY,
  label,
  className,
  zIndex = 1000,
  onAnchorChange,
}) {
  const { screenToFlowPosition } = useReactFlow();
  const dragRef = useRef(null);

  const onPointerDown = useCallback((event) => {
    event.stopPropagation();
    event.preventDefault();
    dragRef.current = {
      pointerFlow: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      anchor: { x: labelX, y: labelY },
    };

    const onPointerMove = (moveEvent) => {
      if (!dragRef.current) return;
      const flow = screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
      const { pointerFlow, anchor } = dragRef.current;
      onAnchorChange(edgeId, {
        x: anchor.x + (flow.x - pointerFlow.x),
        y: anchor.y + (flow.y - pointerFlow.y),
      });
    };

    const onPointerUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [edgeId, labelX, labelY, onAnchorChange, screenToFlowPosition]);

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
