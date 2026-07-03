import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  NODE_WORLD_HEIGHT,
  NODE_WORLD_WIDTH,
} from '../../../lib/architecture/diagnosticsLayout3d.js';
import {
  NODE_CARD_RADIUS,
  NODE_EXTRUDE_DEPTH,
  resolveNodeCardVisual,
} from './diagnosticsNodeCard.js';
import {
  getDiagnosticsNodeLabelTexture,
  resolveNodeVisualRole,
} from './diagnosticsNodeLabelTexture.js';
import { getNodeLabelOpacity, useDiagnosticsWebGLView } from './DiagnosticsWebGLViewContext.jsx';
import { useDiagnosticsConcentrate } from './DiagnosticsConcentrateContext.jsx';
import { screenPixelsToFlowDelta } from './diagnosticsWebGLProjection.js';
import { disableRaycast } from './diagnosticsWebGLRaycast.js';

const FLAT_ROTATION = [-Math.PI / 2, 0, 0];
const NODE_Y_OFFSET = 0.01;
const HIT_LIFT = 0.028;
const DRAG_CLICK_THRESHOLD_PX = 4;

function DiagnosticsWebGLNodeComponent({
  node,
  worldPosition,
  flowCenter,
  onSelect,
  draggable = false,
  onFlowCenterChange,
  onDragStart,
  onDragEnd,
}) {
  const { camera, size } = useThree();
  const { labelViewScale } = useDiagnosticsWebGLView();
  const { layoutRuntimeRef } = useDiagnosticsConcentrate();
  const role = resolveNodeVisualRole(node);
  const emphasis = role !== 'quiet';

  const labelTexture = useMemo(
    () => getDiagnosticsNodeLabelTexture({
      nodeId: node.id,
      layer: node.layer,
      layerLabel: node.nodeDef.layer.replace('client-', ''),
      title: node.nodeDef.label,
      purpose: node.nodeDef.purpose,
      ghosted: node.ghosted,
    }),
    [node.id, node.layer, node.nodeDef.layer, node.nodeDef.label, node.nodeDef.purpose, node.ghosted],
  );

  const cardMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
  }), []);

  const labelMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    map: labelTexture,
    transparent: true,
    opacity: 0,
    alphaTest: 0.04,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [labelTexture]);

  const hitMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);

  useEffect(() => () => {
    cardMaterial.dispose();
    labelMaterial.dispose();
    hitMaterial.dispose();
  }, [cardMaterial, hitMaterial, labelMaterial]);

  const worldVector = useRef(new THREE.Vector3());
  const groupRef = useRef(null);
  const roleRef = useRef(role);
  roleRef.current = role;

  const handlePointerDown = useCallback((event) => {
    event.stopPropagation();

    if (!draggable || !onFlowCenterChange || !flowCenter) {
      onSelect(node.id);
      return;
    }

    const nativeEvent = event.nativeEvent;
    const pointerId = nativeEvent.pointerId;
    const captureTarget = nativeEvent.target;
    if (captureTarget?.setPointerCapture) {
      captureTarget.setPointerCapture(pointerId);
    }

    const startClientX = nativeEvent.clientX;
    const startClientY = nativeEvent.clientY;
    const startCenter = { ...flowCenter };
    let moved = false;
    onDragStart?.();

    const onPointerMove = (moveEvent) => {
      const dx = moveEvent.clientX - startClientX;
      const dy = moveEvent.clientY - startClientY;
      if (!moved && Math.hypot(dx, dy) < DRAG_CLICK_THRESHOLD_PX) return;
      moved = true;

      const flowDelta = screenPixelsToFlowDelta(
        dx,
        dy,
        camera,
        size.height,
        worldPosition,
      );
      onFlowCenterChange(node.id, {
        centerX: startCenter.centerX + flowDelta.x,
        centerY: startCenter.centerY + flowDelta.y,
      });
    };

    const onPointerUp = () => {
      if (captureTarget?.releasePointerCapture) {
        captureTarget.releasePointerCapture(pointerId);
      }
      if (!moved) {
        onSelect(node.id);
      }
      onDragEnd?.();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [
    camera,
    draggable,
    flowCenter,
    node.id,
    onDragEnd,
    onDragStart,
    onFlowCenterChange,
    onSelect,
    size.height,
    worldPosition,
  ]);

  useFrame(({ camera: activeCamera }) => {
    const runtime = layoutRuntimeRef?.current;
    const animatedWorld = runtime?.animating && runtime.layout3d
      ? runtime.layout3d.byNodeId.get(node.id)?.world
      : null;
    const resolvedWorld = animatedWorld ?? worldPosition;

    if (groupRef.current) {
      groupRef.current.position.set(
        resolvedWorld.x,
        resolvedWorld.y + NODE_Y_OFFSET,
        resolvedWorld.z,
      );
    }

    worldVector.current.set(
      resolvedWorld.x,
      resolvedWorld.y + NODE_Y_OFFSET,
      resolvedWorld.z,
    );
    const distance = activeCamera.position.distanceTo(worldVector.current);
    const labelOpacity = getNodeLabelOpacity(distance, labelViewScale, emphasis);
    const ghostScale = node.ghosted ? 0.35 : 1;
    const showCard = Number.isFinite(labelOpacity) ? labelOpacity > 0.02 : true;
    const resolvedOpacity = Number.isFinite(labelOpacity) ? labelOpacity : 1;

    labelMaterial.opacity = showCard ? resolvedOpacity * ghostScale : 0;
    labelMaterial.visible = showCard;

    const cardVisual = resolveNodeCardVisual(
      node.layer,
      roleRef.current,
      node.ghosted,
      showCard,
    );
    cardMaterial.color.copy(cardVisual.fillColor);
    cardMaterial.opacity = cardVisual.fillOpacity * (showCard ? ghostScale : 1);
  });

  return (
    <group
      ref={groupRef}
      position={[worldPosition.x, worldPosition.y + NODE_Y_OFFSET, worldPosition.z]}
    >
      <mesh
        rotation={FLAT_ROTATION}
        position={[0, HIT_LIFT, 0]}
        material={hitMaterial}
        renderOrder={4}
        userData={{ nodePick: true, nodeId: node.id }}
        onPointerDown={handlePointerDown}
      >
        <planeGeometry args={[NODE_WORLD_WIDTH, NODE_WORLD_HEIGHT]} />
      </mesh>

      <RoundedBox
        args={[NODE_WORLD_WIDTH, NODE_EXTRUDE_DEPTH, NODE_WORLD_HEIGHT]}
        radius={NODE_CARD_RADIUS}
        smoothness={4}
        position={[0, -NODE_EXTRUDE_DEPTH / 2, 0]}
        renderOrder={2}
        raycast={disableRaycast}
      >
        <primitive object={cardMaterial} attach="material" />
      </RoundedBox>

      <mesh
        rotation={FLAT_ROTATION}
        position={[0, 0.001, 0]}
        material={labelMaterial}
        renderOrder={3}
        raycast={disableRaycast}
      >
        <planeGeometry args={[NODE_WORLD_WIDTH, NODE_WORLD_HEIGHT]} />
      </mesh>
    </group>
  );
}

function nodePropsAreEqual(prev, next) {
  return prev.node.id === next.node.id
    && prev.node.selected === next.node.selected
    && prev.node.visualRole === next.node.visualRole
    && prev.node.ghosted === next.node.ghosted
    && prev.worldPosition.x === next.worldPosition.x
    && prev.worldPosition.y === next.worldPosition.y
    && prev.worldPosition.z === next.worldPosition.z
    && prev.flowCenter?.centerX === next.flowCenter?.centerX
    && prev.flowCenter?.centerY === next.flowCenter?.centerY
    && prev.draggable === next.draggable
    && prev.onSelect === next.onSelect
    && prev.onFlowCenterChange === next.onFlowCenterChange
    && prev.onDragStart === next.onDragStart
    && prev.onDragEnd === next.onDragEnd;
}

export const DiagnosticsWebGLNode = memo(DiagnosticsWebGLNodeComponent, nodePropsAreEqual);
