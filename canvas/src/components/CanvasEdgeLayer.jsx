import React, { useState, useCallback } from 'react';
import { Box, X } from 'lucide-react';
import { strings } from '../content/strings.js';
import {
  edgePath,
  edgeMidpoint,
  isDeletableCanvasEdge,
} from '../lib/graph/canvasEdgeGeometry.js';

function collectEdges(canvasEdges, linkDrag) {
  const all = [...(canvasEdges || [])];
  if (linkDrag?.active) {
    all.push({
      id: '__drag__',
      fromX: linkDrag.fromX,
      fromY: linkDrag.fromY,
      toX: linkDrag.toX,
      toY: linkDrag.toY,
      type: 'references',
      dashed: true,
    });
  }
  return all;
}

function edgeStrokeClass(e) {
  if (e.dashed) return 'stroke-muted stroke-dasharray-[6,4]';
  if (e.type === 'supersedes') return 'stroke-secondary/60';
  return 'stroke-accent/70';
}

function openLabelForEdge(edge) {
  return edge.kind === 'note_attachment'
    ? strings.graph.openNoteLink
    : strings.graph.openRelationship;
}

export function CanvasEdgeLayer({
  canvasEdges,
  linkDrag,
  variant = 'paths',
  zoom = 1,
  onDeleteEdge,
  onOpenEdgePrimitive,
}) {
  const all = collectEdges(canvasEdges, linkDrag);
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null);
  const [deletingEdgeId, setDeletingEdgeId] = useState(null);

  const stopEvent = (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
  };

  const handleOpen = useCallback(
    (e, ev) => {
      stopEvent(ev);
      if (deletingEdgeId === e.id) return;
      onOpenEdgePrimitive?.(e);
    },
    [onOpenEdgePrimitive, deletingEdgeId],
  );

  const handleDelete = useCallback(
    async (e, ev) => {
      stopEvent(ev);
      if (!onDeleteEdge || deletingEdgeId) return;
      setDeletingEdgeId(e.id);
      try {
        await onDeleteEdge(e);
      } finally {
        setDeletingEdgeId(null);
        setHoveredEdgeId(null);
      }
    },
    [onDeleteEdge, deletingEdgeId],
  );

  if (all.length === 0) return null;

  const hitStroke = Math.max(8, 12 / (zoom || 1));
  const deletable = all.filter(isDeletableCanvasEdge);

  return (
    <svg
      className={`absolute left-0 top-0 overflow-visible ${variant === 'interactive' ? 'z-10' : ''}`}
      style={{ width: 1, height: 1, pointerEvents: 'none' }}
      aria-hidden={variant === 'paths'}
    >
      {variant === 'paths' && (
        <defs>
          <marker
            id="canvas-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" className="fill-accent/70" />
          </marker>
        </defs>
      )}

      {variant === 'paths' &&
        all.map((e) => (
          <g key={e.id}>
            <path
              d={edgePath(e.fromX, e.fromY, e.toX, e.toY)}
              fill="none"
              strokeWidth={e.id === '__drag__' ? 2 : 1.5}
              className={edgeStrokeClass(e)}
              markerEnd={
                e.dashed && e.id === '__drag__' ? undefined : 'url(#canvas-arrow)'
              }
            />
          </g>
        ))}

      {variant === 'interactive' &&
        deletable.map((e) => {
          const d = edgePath(e.fromX, e.fromY, e.toX, e.toY);
          const mid = edgeMidpoint(e.fromX, e.fromY, e.toX, e.toY);
          const showControls = hoveredEdgeId === e.id;
          const isDeleting = deletingEdgeId === e.id;
          const openLabel = openLabelForEdge(e);

          return (
            <g key={`hit-${e.id}`}>
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={hitStroke}
                pointerEvents="stroke"
                onMouseEnter={() => setHoveredEdgeId(e.id)}
                onMouseLeave={() => {
                  if (deletingEdgeId !== e.id) {
                    setHoveredEdgeId((id) => (id === e.id ? null : id));
                  }
                }}
              />
              {showControls && (
                <g
                  transform={`translate(${mid.x}, ${mid.y})`}
                  pointerEvents="auto"
                  onMouseEnter={() => setHoveredEdgeId(e.id)}
                  onMouseLeave={() => {
                    if (!isDeleting) {
                      setHoveredEdgeId((id) => (id === e.id ? null : id));
                    }
                  }}
                >
                  <foreignObject
                    x={-28}
                    y={-12}
                    width={56}
                    height={24}
                    className="overflow-visible"
                  >
                    <div className="flex items-center justify-center gap-1 pointer-events-auto">
                      {onOpenEdgePrimitive && (
                        <button
                          type="button"
                          disabled={isDeleting}
                          title={openLabel}
                          aria-label={openLabel}
                          className="w-6 h-6 rounded-full bg-surface border border-border shadow flex items-center justify-center text-accent hover:bg-accent/10 disabled:opacity-50"
                          onMouseDown={stopEvent}
                          onClick={(ev) => handleOpen(e, ev)}
                        >
                          <Box size={12} strokeWidth={1.5} />
                        </button>
                      )}
                      {onDeleteEdge && (
                        <button
                          type="button"
                          disabled={isDeleting}
                          title={strings.graph.deleteLink}
                          aria-label={strings.graph.deleteLink}
                          className="w-6 h-6 rounded-full bg-surface border border-border shadow flex items-center justify-center text-danger hover:bg-danger-muted disabled:opacity-50"
                          onMouseDown={stopEvent}
                          onClick={(ev) => void handleDelete(e, ev)}
                        >
                          <X size={12} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  </foreignObject>
                </g>
              )}
            </g>
          );
        })}
    </svg>
  );
}
