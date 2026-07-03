import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  computeMeasurementMarkerRadius,
  createMeasurementRecord,
  formatMeasurementDistance,
  pickSurfaceHit,
  snapPickPoint,
} from '../utils/measureSnap.js';

function MeasurementMarker({ start, end, label, color = '#fbbf24', markerRadius = 0.008 }) {
  const midpoint = useMemo(() => {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    return a.add(b).multiplyScalar(0.5).toArray();
  }, [start, end]);

  return (
    <>
      <Line points={[start, end]} color={color} lineWidth={1.5} />
      <mesh position={start}>
        <sphereGeometry args={[markerRadius, 10, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={end}>
        <sphereGeometry args={[markerRadius, 10, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Html position={midpoint} center style={{ pointerEvents: 'none' }}>
        <div className="sans px-1.5 py-0.5 rounded bg-surface/90 border border-border text-[10px] text-primary whitespace-nowrap">
          {label}
        </div>
      </Html>
    </>
  );
}

export function ThreeDMeasurementLayer({
  modelRoot,
  measurements = [],
  snapMode = 'vertex',
  active = false,
  units = 'cm',
  modelUnits = 'cm',
  onCompleteMeasurement,
  onDraftChange,
  cancelDraftNonce = 0,
}) {
  const { camera, raycaster, gl, invalidate } = useThree();
  const pointer = useRef(new THREE.Vector2());
  const [draftStart, setDraftStart] = useState(null);
  const [previewEnd, setPreviewEnd] = useState(null);
  const markerRadius = useMemo(
    () => computeMeasurementMarkerRadius(modelRoot),
    [modelRoot],
  );

  const clearDraft = useCallback(() => {
    setDraftStart(null);
    setPreviewEnd(null);
    onDraftChange?.(false);
  }, [onDraftChange]);

  const resolvePointerSnap = useCallback((clientX, clientY) => {
    const rect = gl.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    pointer.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );

    const hit = pickSurfaceHit(
      raycaster,
      pointer.current,
      camera,
      modelRoot,
      { width: rect.width, height: rect.height },
    );
    if (!hit) return null;

    return snapPickPoint(snapMode, hit, { maxDistance: hit.snapRadius });
  }, [camera, gl.domElement, modelRoot, raycaster, snapMode]);

  useEffect(() => {
    if (!active) {
      clearDraft();
    }
  }, [active, clearDraft]);

  useEffect(() => {
    if (!cancelDraftNonce) return;
    clearDraft();
  }, [cancelDraftNonce, clearDraft]);

  useEffect(() => {
    if (!active || !modelRoot) return undefined;

    const canvas = gl.domElement;

    const handlePointerMove = (event) => {
      if (!draftStart) return;
      const snapped = resolvePointerSnap(event.clientX, event.clientY);
      setPreviewEnd(snapped?.position ?? null);
      invalidate();
    };

    const handlePointerDown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const snapped = resolvePointerSnap(event.clientX, event.clientY);
      if (!snapped) return;

      if (!draftStart) {
        setDraftStart(snapped);
        setPreviewEnd(snapped.position);
        onDraftChange?.(true);
        invalidate();
        return;
      }

      const record = createMeasurementRecord(draftStart, snapped, snapMode);
      onCompleteMeasurement?.(record);
      clearDraft();
      invalidate();
    };

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerdown', handlePointerDown);

    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [
    active,
    clearDraft,
    draftStart,
    gl.domElement,
    invalidate,
    modelRoot,
    onCompleteMeasurement,
    onDraftChange,
    resolvePointerSnap,
    snapMode,
  ]);

  const previewLabel = previewEnd && draftStart
    ? formatMeasurementDistance(
      new THREE.Vector3(...draftStart.position).distanceTo(new THREE.Vector3(...previewEnd)),
      units,
      modelUnits,
    )
    : null;

  return (
    <>
      {measurements.map((measurement) => (
        <MeasurementMarker
          key={measurement.id}
          start={measurement.start.position}
          end={measurement.end.position}
          label={formatMeasurementDistance(measurement.distance, units, modelUnits)}
          markerRadius={markerRadius}
        />
      ))}
      {draftStart && previewEnd && (
        <MeasurementMarker
          start={draftStart.position}
          end={previewEnd}
          label={previewLabel ?? '…'}
          color="#60a5fa"
          markerRadius={markerRadius}
        />
      )}
    </>
  );
}
