/* eslint-disable react-refresh/only-export-components */
import React, { useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildProjectedEdgeGeometry } from '../../../lib/architecture/diagnosticsEdgeGeometry.js';
import { FLOW_TO_WORLD_SCALE } from '../../../lib/architecture/diagnosticsLayout3d.js';
import { getEmphasizedEdgeLineWidth, useDiagnosticsWebGLView } from './DiagnosticsWebGLViewContext.jsx';
import { useDiagnosticsConcentrate } from './DiagnosticsConcentrateContext.jsx';

/** Screen-space widths — Line2 honors these; native WebGL lines do not. */
const EDGE_LINE_WIDTH = {
  current: 5,
  path: 3.5,
  quiet: 1,
};

/** World-space dash pattern on the XZ diagram plane (matches 2D stroke-dasharray: 5). */
export const EDGE_DASH_SIZE = 5 * FLOW_TO_WORLD_SCALE;
export const EDGE_GAP_SIZE = 5 * FLOW_TO_WORLD_SCALE;

/** Mirrors 2D flow-preview-dashdraw: 10px offset per cycle at 0.5s (current) / 1.4s (path). */
const DASH_OFFSET_FLOW_PX = 10;
const DASH_ANIM_NORMAL_SEC = 0.5;
const DASH_ANIM_SLOW_SEC = 1.4;

export const EDGE_DASH_SPEED = {
  normal: (DASH_OFFSET_FLOW_PX / DASH_ANIM_NORMAL_SEC) * FLOW_TO_WORLD_SCALE,
  slow: (DASH_OFFSET_FLOW_PX / DASH_ANIM_SLOW_SEC) * FLOW_TO_WORLD_SCALE,
};

/**
 * @param {import('../hooks/useDiagnosticsGraphProjection.js').ReturnType<typeof import('../hooks/useDiagnosticsGraphProjection.js').useDiagnosticsGraphProjection>['projectedEdges'][number]} edge
 */
function getEdgeVisualRole(edge) {
  return edge.visualRole === 'current' || edge.visualRole === 'path'
    ? edge.visualRole
    : 'quiet';
}

/**
 * @param {import('../hooks/useDiagnosticsGraphProjection.js').ReturnType<typeof import('../hooks/useDiagnosticsGraphProjection.js').useDiagnosticsGraphProjection>['projectedEdges'][number]} edge
 */
export function getEdgeLineStyle(edge) {
  const role = getEdgeVisualRole(edge);
  const flowing = edge.flowing === true && !edge.ghosted;
  const color = edge.ghosted
    ? '#64748b'
    : role === 'current'
      ? '#f97316'
      : role === 'path'
        ? '#22d3ee'
        : '#94a3b8';
  const opacity = edge.ghosted
    ? 0.08
    : role === 'current'
      ? 0.95
      : role === 'path'
        ? 0.85
        : 0.28;

  return {
    role,
    color,
    opacity,
    lineWidth: EDGE_LINE_WIDTH[role],
    emphasized: role === 'current' || role === 'path',
    flowing,
    dashed: flowing,
    dashSize: EDGE_DASH_SIZE,
    gapSize: EDGE_GAP_SIZE,
    dashSpeed: edge.flowSpeed === 'slow' ? EDGE_DASH_SPEED.slow : EDGE_DASH_SPEED.normal,
  };
}

/**
 * @param {object} props
 * @param {import('../hooks/useDiagnosticsGraphProjection.js').ReturnType<typeof import('../hooks/useDiagnosticsGraphProjection.js').useDiagnosticsGraphProjection>['projectedEdges'][number]} props.edge
 * @param {THREE.Vector3[]} props.points
 * @param {ReturnType<typeof getEdgeLineStyle>} props.style
 */
function EmphasizedEdgeLine({ edge, points, style }) {
  const lineRef = useRef(null);
  const { camera } = useThree();
  const { diagramRadius } = useDiagnosticsWebGLView();
  const center = useMemo(() => {
    const midpoint = new THREE.Vector3();
    points.forEach((point) => midpoint.add(point));
    return midpoint.divideScalar(points.length);
  }, [points]);

  useFrame((_, delta) => {
    const material = lineRef.current?.material;
    if (!material) return;
    const distance = camera.position.distanceTo(center);
    material.linewidth = getEmphasizedEdgeLineWidth(distance, diagramRadius, style.lineWidth);
    if (style.dashed && material.dashed) {
      material.dashOffset -= delta * style.dashSpeed;
    }
  });

  const handleSelect = (event) => {
    event.stopPropagation();
    edge.onSelect?.(edge.id);
  };

  return (
    <Line
      ref={lineRef}
      points={points}
      color={style.color}
      lineWidth={style.lineWidth}
      transparent
      opacity={style.opacity}
      depthWrite={false}
      dashed={style.dashed}
      dashSize={style.dashSize}
      gapSize={style.gapSize}
      renderOrder={style.role === 'current' ? 3 : 2}
      onClick={handleSelect}
    />
  );
}
/**
 * @param {object} props
 * @param {import('../hooks/useDiagnosticsGraphProjection.js').ReturnType<typeof import('../hooks/useDiagnosticsGraphProjection.js').useDiagnosticsGraphProjection>['projectedEdges'][number]} props.edge
 * @param {THREE.Vector3[]} props.points
 * @param {ReturnType<typeof getEdgeLineStyle>} props.style
 */
function QuietEdgeLine({ edge, points, style }) {
  const vectorPoints = useMemo(
    () => points.map((point) => new THREE.Vector3(point.x, point.y, point.z)),
    [points],
  );

  const handleSelect = (event) => {
    event.stopPropagation();
    edge.onSelect?.(edge.id);
  };

  return (
    <Line
      points={vectorPoints}
      color={style.color}
      lineWidth={style.lineWidth}
      transparent
      opacity={style.opacity}
      depthWrite={false}
      onClick={handleSelect}
    />
  );
}

function EdgeLine({ edge, points }) {
  const style = useMemo(() => getEdgeLineStyle(edge), [edge]);
  const vectorPoints = useMemo(
    () => points.map((point) => new THREE.Vector3(point.x, point.y, point.z)),
    [points],
  );

  if (vectorPoints.length < 2) return null;

  if (style.emphasized) {
    return <EmphasizedEdgeLine edge={edge} points={vectorPoints} style={style} />;
  }

  return <QuietEdgeLine edge={edge} points={vectorPoints} style={style} />;
}

function EdgeVisual({ edge, layout3d }) {
  const { layoutRuntimeRef } = useDiagnosticsConcentrate();
  const lineRef = useRef(null);
  const style = useMemo(() => getEdgeLineStyle(edge), [edge]);
  const { camera } = useThree();
  const { diagramRadius } = useDiagnosticsWebGLView();

  const staticPoints = useMemo(() => {
    const { worldPoints } = buildProjectedEdgeGeometry(edge, layout3d, 24);
    return worldPoints.map((point) => new THREE.Vector3(point.x, point.y, point.z));
  }, [edge, layout3d]);

  const center = useMemo(() => {
    const midpoint = new THREE.Vector3();
    staticPoints.forEach((point) => midpoint.add(point));
    if (staticPoints.length > 0) midpoint.divideScalar(staticPoints.length);
    return midpoint;
  }, [staticPoints]);

  const applyWorldPoints = (worldPoints) => {
    const line = lineRef.current;
    if (!line?.geometry?.setPositions || worldPoints.length < 2) return;
    const flat = new Array(worldPoints.length * 3);
    for (let i = 0; i < worldPoints.length; i += 1) {
      flat[i * 3] = worldPoints[i].x;
      flat[i * 3 + 1] = worldPoints[i].y;
      flat[i * 3 + 2] = worldPoints[i].z;
    }
    line.geometry.setPositions(flat);
    line.geometry.attributes.position.needsUpdate = true;
  };

  useFrame((_, delta) => {
    const runtime = layoutRuntimeRef?.current;
    if (runtime?.animating && runtime.layout3d) {
      const { worldPoints } = buildProjectedEdgeGeometry(edge, runtime.layout3d, 24);
      applyWorldPoints(worldPoints);
    }

    if (!style.emphasized) return;
    const material = lineRef.current?.material;
    if (!material) return;
    const distance = camera.position.distanceTo(center);
    material.linewidth = getEmphasizedEdgeLineWidth(distance, diagramRadius, style.lineWidth);
    if (style.dashed && material.dashed) {
      material.dashOffset -= delta * style.dashSpeed;
    }
  });

  if (staticPoints.length < 2) return null;

  const handleSelect = (event) => {
    event.stopPropagation();
    edge.onSelect?.(edge.id);
  };

  return (
    <Line
      ref={lineRef}
      points={staticPoints}
      color={style.color}
      lineWidth={style.lineWidth}
      transparent
      opacity={style.opacity}
      depthWrite={false}
      dashed={style.dashed}
      dashSize={style.dashSize}
      gapSize={style.gapSize}
      renderOrder={style.role === 'current' ? 3 : 2}
      onClick={handleSelect}
    />
  );
}

export function DiagnosticsWebGLEdges({ edges, layout3d }) {
  return (
    <group>
      {edges.filter((edge) => !edge.hidden).map((edge) => (
        <EdgeVisual key={edge.id} edge={edge} layout3d={layout3d} />
      ))}
    </group>
  );
}

export { EDGE_LINE_WIDTH };
