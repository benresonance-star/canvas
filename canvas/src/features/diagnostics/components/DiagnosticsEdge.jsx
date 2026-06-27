import React from 'react';
import { BaseEdge } from '@xyflow/react';
import { buildRelativeEdgePath } from '../../../lib/architecture/architectureEdgeRouting.js';
import { DiagnosticsEdgeLabel } from './DiagnosticsEdgeLabel.jsx';

const EDGE_STROKE = {
  current: 'var(--color-accent)',
  path: 'var(--color-diagnostics-path)',
  quiet: 'var(--color-diagnostics-edge)',
};

const EDGE_WIDTH = {
  current: 2,
  path: 1.5,
  quiet: 0.875,
};

function edgeVisualRole(data) {
  if (data?.visualRole === 'current' || data?.visualRole === 'path') return data.visualRole;
  return 'quiet';
}

export function DiagnosticsEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  label,
  markerEnd,
  style,
}) {
  const { path: edgePath, labelX, labelY } = buildRelativeEdgePath({
    routeStyle: data?.routeStyle ?? 'relative-diagonal',
    sourceX,
    sourceY,
    targetX,
    targetY,
    routeAnchor: data?.routeAnchor ?? null,
    bulgeSide: data?.bulgeSide ?? 1,
    archSide: data?.archSide ?? 'above',
    parallelIndex: data?.parallelIndex ?? 0,
    parallelTotal: data?.parallelTotal ?? 1,
    laneOffset: data?.laneOffset ?? 0,
    busSide: data?.busSide ?? 'left',
    busLane: data?.busLane ?? 0,
    maxRightX: data?.maxRightX,
  });

  const role = edgeVisualRole(data);
  const flowing = data?.flowing === true;
  const activeEdgeClass = flowing
    ? [
      'flow-preview-edge--animated',
      'diagnostics-edge-active',
      data?.flowSpeed === 'slow' ? 'diagnostics-edge-path-slow' : null,
    ].filter(Boolean).join(' ')
    : 'diagnostics-edge-quiet';

  const labelRoleClass = role === 'current'
    ? 'diagnostics-edge-label--current'
    : role === 'path'
      ? 'diagnostics-edge-label--path'
      : 'diagnostics-edge-label--quiet';

  return (
    <>
      {role === 'quiet' && (
        <BaseEdge
          id={`${id}-halo`}
          path={edgePath}
          style={{
            stroke: EDGE_STROKE.quiet,
            strokeWidth: 2,
            opacity: 0.14,
          }}
          className="diagnostics-edge-halo"
        />
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={flowing ? markerEnd : undefined}
        style={{
          ...style,
          stroke: EDGE_STROKE[role],
          strokeWidth: EDGE_WIDTH[role],
          opacity: role === 'quiet' ? 0.72 : 1,
        }}
        className={activeEdgeClass}
      />
      {label && data?.onRouteAnchorChange && (
        <DiagnosticsEdgeLabel
          edgeId={id}
          labelX={labelX}
          labelY={labelY}
          label={label}
          className={labelRoleClass}
          zIndex={1000 + (data?.busLane ?? 0)}
          onAnchorChange={data.onRouteAnchorChange}
        />
      )}
    </>
  );
}
