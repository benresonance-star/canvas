import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  computeMeasurementMarkerRadius,
  createEdgeMeasurementRecord,
  createMeasurementRecord,
  formatMeasurementDistance,
  pickSurfaceHit,
  snapPickPoint,
} from '../utils/measureSnap.js';

const HOVER_COLOR = '#34d399';
const DRAFT_COLOR = '#60a5fa';
const SAVED_COLOR = '#fbbf24';

function MeasurementMarker({
  start,
  end,
  label,
  color = SAVED_COLOR,
  markerRadius = 0.008,
  showEndMarker = true,
}) {
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
      {showEndMarker && (
        <mesh position={end}>
          <sphereGeometry args={[markerRadius, 10, 10]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
      <Html position={midpoint} center style={{ pointerEvents: 'none' }}>
        <div className="sans px-1.5 py-0.5 rounded bg-surface/90 border border-border text-[10px] text-primary whitespace-nowrap">
          {label}
        </div>
      </Html>
    </>
  );
}

function SnapHoverPreview({ hoverSnap, markerRadius }) {
  const previewRadius = markerRadius * 0.2;
  if (!hoverSnap) return null;

  if (hoverSnap.kind === 'edge' && hoverSnap.edgeStart && hoverSnap.edgeEnd) {
    return (
      <>
        <Line
          points={[hoverSnap.edgeStart, hoverSnap.edgeEnd]}
          color={HOVER_COLOR}
          lineWidth={2.5}
        />
        <mesh position={hoverSnap.position}>
          <sphereGeometry args={[previewRadius, 10, 10]} />
          <meshBasicMaterial color={HOVER_COLOR} />
        </mesh>
      </>
    );
  }

  return (
    <mesh position={hoverSnap.position}>
      <sphereGeometry args={[previewRadius, 10, 10]} />
      <meshBasicMaterial color={HOVER_COLOR} />
    </mesh>
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
  const pendingPointerRef = useRef(null);
  const rafRef = useRef(0);
  const [draftStart, setDraftStart] = useState(null);
  const [previewEnd, setPreviewEnd] = useState(null);
  const [hoverSnap, setHoverSnap] = useState(null);
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

  const applyHoverFromPointer = useCallback((clientX, clientY, hasDraftStart) => {
    const snapped = resolvePointerSnap(clientX, clientY);
    setHoverSnap(snapped);
    if (hasDraftStart) {
      setPreviewEnd(snapped?.position ?? null);
    }
    invalidate();
  }, [invalidate, resolvePointerSnap]);

  useEffect(() => {
    if (!active) {
      clearDraft();
      setHoverSnap(null);
    }
  }, [active, clearDraft]);

  useEffect(() => {
    if (!cancelDraftNonce) return;
    clearDraft();
  }, [cancelDraftNonce, clearDraft]);

  useEffect(() => {
    clearDraft();
  }, [clearDraft, snapMode]);

  useEffect(() => {
    if (!active || !modelRoot) return undefined;

    const canvas = gl.domElement;
    canvas.style.cursor = 'crosshair';
    const isVertexMode = snapMode === 'vertex';

    const flushPendingPointer = () => {
      rafRef.current = 0;
      const pending = pendingPointerRef.current;
      if (!pending) return;
      applyHoverFromPointer(
        pending.clientX,
        pending.clientY,
        isVertexMode && pending.hasDraftStart,
      );
    };

    const handlePointerMove = (event) => {
      pendingPointerRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        hasDraftStart: isVertexMode && Boolean(draftStart),
      };
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(flushPendingPointer);
      }
    };

    const handlePointerLeave = () => {
      pendingPointerRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      setHoverSnap(null);
      if (draftStart) {
        setPreviewEnd(null);
      }
      invalidate();
    };

    const handlePointerDown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const snapped = resolvePointerSnap(event.clientX, event.clientY);
      if (!snapped) return;

      if (snapMode === 'edge') {
        const record = createEdgeMeasurementRecord(snapped);
        if (!record) return;
        onCompleteMeasurement?.(record);
        setHoverSnap(snapped);
        invalidate();
        return;
      }

      if (!draftStart) {
        setDraftStart(snapped);
        setPreviewEnd(snapped.position);
        setHoverSnap(snapped);
        onDraftChange?.(true);
        invalidate();
        return;
      }

      const record = createMeasurementRecord(draftStart, snapped, snapMode);
      onCompleteMeasurement?.(record);
      clearDraft();
      setHoverSnap(null);
      invalidate();
    };

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('pointerdown', handlePointerDown);

    return () => {
      canvas.style.cursor = '';
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      pendingPointerRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [
    active,
    applyHoverFromPointer,
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
      {draftStart && previewEnd && snapMode === 'vertex' && (
        <MeasurementMarker
          start={draftStart.position}
          end={previewEnd}
          label={previewLabel ?? '…'}
          color={DRAFT_COLOR}
          markerRadius={markerRadius}
          showEndMarker={!hoverSnap}
        />
      )}
      {active && hoverSnap && (
        <SnapHoverPreview hoverSnap={hoverSnap} markerRadius={markerRadius} />
      )}
    </>
  );
}
