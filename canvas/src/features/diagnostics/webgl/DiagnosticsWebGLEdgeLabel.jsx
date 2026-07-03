import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildProjectedEdgeGeometry } from '../../../lib/architecture/diagnosticsEdgeGeometry.js';
import {
  EDGE_LABEL_WORLD_HEIGHT,
  measureEdgeLabelWorldWidth,
  getDiagnosticsEdgeLabelTexture,
} from './diagnosticsEdgeLabelTexture.js';
import { screenPixelsToFlowDelta } from './diagnosticsWebGLProjection.js';
import {
  getEdgeLabelOpacity,
  getEdgeLabelYOffset,
  useDiagnosticsWebGLView,
} from './DiagnosticsWebGLViewContext.jsx';
import { bindConditionalMeshRaycast, unbindConditionalMeshRaycast } from './diagnosticsWebGLRaycast.js';

const FLAT_ROTATION = [-Math.PI / 2, 0, 0];

/**
 * @param {object} props
 * @param {import('../hooks/useDiagnosticsGraphProjection.js').ReturnType<typeof import('../hooks/useDiagnosticsGraphProjection.js').useDiagnosticsGraphProjection>['projectedEdges'][number]} props.edge
 * @param {ReturnType<typeof import('../../../lib/architecture/diagnosticsLayout3d.js').buildDiagnosticsLayout3d>} props.layout3d
 * @param {(edgeId: string, anchor: { x: number, y: number } | null) => void} props.onAnchorChange
 * @param {() => void} [props.onEdgeLabelDragStart]
 * @param {() => void} [props.onEdgeLabelDragEnd]
 */
export function DiagnosticsWebGLEdgeLabel({
  edge,
  layout3d,
  onAnchorChange,
  onEdgeLabelDragStart,
  onEdgeLabelDragEnd,
}) {
  const { camera, size } = useThree();
  const { labelViewScale } = useDiagnosticsWebGLView();
  const groupRef = useRef(null);
  const meshRef = useRef(null);
  const dragRef = useRef(null);
  const worldVector = useRef(new THREE.Vector3());
  const labelOpacityRef = useRef(0);

  const role = edge.visualRole === 'current' || edge.visualRole === 'path'
    ? edge.visualRole
    : 'quiet';
  const emphasis = role !== 'quiet' || edge.selected;

  const geometry = useMemo(
    () => buildProjectedEdgeGeometry(edge, layout3d, 20),
    [edge, layout3d],
  );

  const labelWorld = geometry.labelWorld;
  const label2d = geometry.label2d;
  const labelWidth = useMemo(
    () => measureEdgeLabelWorldWidth(edge.label),
    [edge.label],
  );

  const labelTexture = useMemo(
    () => getDiagnosticsEdgeLabelTexture({
      edgeId: edge.id,
      label: edge.label,
      role,
      ghosted: edge.ghosted,
    }),
    [edge.id, edge.label, role, edge.ghosted],
  );

  const labelMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    map: labelTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [labelTexture]);

  useEffect(() => () => labelMaterial.dispose(), [labelMaterial]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return undefined;
    bindConditionalMeshRaycast(mesh, () => labelOpacityRef.current >= 0.12);
    return () => unbindConditionalMeshRaycast(mesh);
  }, []);

  useFrame(() => {
    if (!labelWorld || !groupRef.current) return;
    const yOffset = getEdgeLabelYOffset(emphasis);
    groupRef.current.position.set(labelWorld.x, labelWorld.y + yOffset, labelWorld.z);
    worldVector.current.set(labelWorld.x, labelWorld.y + yOffset, labelWorld.z);
    const distance = camera.position.distanceTo(worldVector.current);
    const opacity = getEdgeLabelOpacity(distance, labelViewScale, emphasis);
    labelMaterial.opacity = opacity;
    labelOpacityRef.current = opacity;
    groupRef.current.visible = opacity > 0.08;
  });

  const onPointerDown = useCallback((event) => {
    if (!labelWorld || !label2d || labelOpacityRef.current < 0.12) return;
    event.stopPropagation();
    onEdgeLabelDragStart?.();

    const nativeEvent = event.nativeEvent;
    const pointerId = nativeEvent.pointerId;
    const captureTarget = nativeEvent.target;
    if (captureTarget?.setPointerCapture) {
      captureTarget.setPointerCapture(pointerId);
    }

    const startClientX = nativeEvent.clientX;
    const startClientY = nativeEvent.clientY;
    dragRef.current = {
      anchor: { ...label2d },
    };

    const onPointerMove = (moveEvent) => {
      if (!dragRef.current || !labelWorld) return;
      const dx = moveEvent.clientX - startClientX;
      const dy = moveEvent.clientY - startClientY;
      const flowDelta = screenPixelsToFlowDelta(
        dx,
        dy,
        camera,
        size.height,
        labelWorld,
      );
      onAnchorChange(edge.id, {
        x: dragRef.current.anchor.x + flowDelta.x,
        y: dragRef.current.anchor.y + flowDelta.y,
      });
    };

    const onPointerUp = () => {
      if (captureTarget?.releasePointerCapture) {
        captureTarget.releasePointerCapture(pointerId);
      }
      dragRef.current = null;
      onEdgeLabelDragEnd?.();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [
    camera,
    edge.id,
    label2d,
    labelWorld,
    onAnchorChange,
    onEdgeLabelDragEnd,
    onEdgeLabelDragStart,
    size.height,
  ]);

  const onDoubleClick = useCallback((event) => {
    event.stopPropagation();
    onAnchorChange(edge.id, null);
  }, [edge.id, onAnchorChange]);

  if (!labelWorld || !label2d || !edge.label) return null;

  return (
    <group ref={groupRef} visible={false}>
      <mesh
        ref={meshRef}
        rotation={FLAT_ROTATION}
        material={labelMaterial}
        renderOrder={6}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      >
        <planeGeometry args={[labelWidth, EDGE_LABEL_WORLD_HEIGHT]} />
      </mesh>
    </group>
  );
}

/**
 * @param {object} props
 * @param {import('../hooks/useDiagnosticsGraphProjection.js').ReturnType<typeof import('../hooks/useDiagnosticsGraphProjection.js').useDiagnosticsGraphProjection>['projectedEdges']} props.edges
 * @param {ReturnType<typeof import('../../../lib/architecture/diagnosticsLayout3d.js').buildDiagnosticsLayout3d>} props.layout3d
 * @param {(edgeId: string, anchor: { x: number, y: number } | null) => void} props.onAnchorChange
 * @param {() => void} [props.onEdgeLabelDragStart]
 * @param {() => void} [props.onEdgeLabelDragEnd]
 */
export function DiagnosticsWebGLWireLabels({
  edges,
  layout3d,
  onAnchorChange,
  onEdgeLabelDragStart,
  onEdgeLabelDragEnd,
}) {
  return (
    <group>
      {edges
        .filter((edge) => !edge.hidden && edge.label)
        .map((edge) => (
          <DiagnosticsWebGLEdgeLabel
            key={edge.id}
            edge={edge}
            layout3d={layout3d}
            onAnchorChange={onAnchorChange}
            onEdgeLabelDragStart={onEdgeLabelDragStart}
            onEdgeLabelDragEnd={onEdgeLabelDragEnd}
          />
        ))}
    </group>
  );
}
