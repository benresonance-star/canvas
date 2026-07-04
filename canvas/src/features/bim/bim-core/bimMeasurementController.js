import * as THREE from 'three';
import {
  computeMeasurementMarkerRadius,
  createEdgeMeasurementRecord,
  createMeasurementRecord,
  createPolylineMeasurementRecord,
} from '../../threeDArtifact/utils/measureSnap.js';
import { pickBimMeasurementSnap } from './bimMeasurementPick.js';

const CLOSE_POLYLINE_SCALE = 2.5;
const DOUBLE_CLICK_MS = 350;

export function createBimMeasurementController({
  canvas,
  getCamera,
  getModelRoot,
  getFragmentsModel,
  snapMode: initialSnapMode = 'vertex',
  measureKind: initialMeasureKind = 'segment',
  onComplete,
  onDraftChange,
  onVisualStateChange,
}) {
  const raycaster = new THREE.Raycaster();
  let active = false;
  let snapMode = initialSnapMode;
  let measureKind = initialMeasureKind;
  let draftStart = null;
  let draftPoints = [];
  let previewEnd = null;
  let hoverSnap = null;
  let pendingPointer = null;
  let rafId = 0;
  let hoverPickSeq = 0;
  let lastClickAt = 0;
  let lastClickPosition = null;

  const notifyVisualChange = () => {
    onVisualStateChange?.({
      draftStart,
      draftPoints,
      previewEnd,
      hoverSnap,
      snapMode,
      measureKind,
    });
  };

  const clearDraft = () => {
    draftStart = null;
    draftPoints = [];
    previewEnd = null;
    lastClickAt = 0;
    lastClickPosition = null;
    onDraftChange?.(false);
    notifyVisualChange();
  };

  const getCloseThreshold = () => {
    const modelRoot = getModelRoot?.() ?? null;
    return computeMeasurementMarkerRadius(modelRoot) * CLOSE_POLYLINE_SCALE;
  };

  const isNearFirstPoint = (position) => {
    if (draftPoints.length < 3 || !position) return false;
    const first = new THREE.Vector3(...draftPoints[0].position);
    const next = new THREE.Vector3(...position);
    return first.distanceTo(next) <= getCloseThreshold();
  };

  const resolveHoverSnap = async (clientX, clientY, seq) => {
    const snap = await pickBimMeasurementSnap({
      raycaster,
      camera: getCamera(),
      canvas,
      clientX,
      clientY,
      fragmentsModel: getFragmentsModel?.() ?? null,
      modelRoot: getModelRoot?.() ?? null,
      snapMode,
    });
    return seq === hoverPickSeq ? snap : null;
  };

  const resolveClickSnap = (clientX, clientY) => pickBimMeasurementSnap({
    raycaster,
    camera: getCamera(),
    canvas,
    clientX,
    clientY,
    fragmentsModel: getFragmentsModel?.() ?? null,
    modelRoot: getModelRoot?.() ?? null,
    snapMode,
  });

  const hasDraft = () => {
    if (measureKind === 'polyline') return draftPoints.length > 0;
    return Boolean(draftStart);
  };

  const applyHoverFromPointer = (clientX, clientY) => {
    const seq = ++hoverPickSeq;
    void resolveHoverSnap(clientX, clientY, seq).then((snapped) => {
      if (seq !== hoverPickSeq) return;
      hoverSnap = snapped;
      if (hasDraft()) {
        previewEnd = snapped?.position ?? null;
      }
      notifyVisualChange();
    });
  };

  const flushPendingPointer = () => {
    rafId = 0;
    const pending = pendingPointer;
    if (!pending) return;
    applyHoverFromPointer(pending.clientX, pending.clientY);
  };

  const handlePointerMove = (event) => {
    pendingPointer = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
    if (!rafId) {
      rafId = requestAnimationFrame(flushPendingPointer);
    }
  };

  const handlePointerLeave = () => {
    pendingPointer = null;
    hoverPickSeq += 1;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    hoverSnap = null;
    if (hasDraft()) {
      previewEnd = null;
    }
    notifyVisualChange();
  };

  const finishPolyline = (closed = false) => {
    if (draftPoints.length < 2) return false;
    const record = createPolylineMeasurementRecord(draftPoints, {
      closed,
      snapMode,
    });
    if (!record) return false;
    onComplete?.(record);
    clearDraft();
    hoverSnap = null;
    notifyVisualChange();
    return true;
  };

  const addPolylinePoint = (snapped, { closed = false } = {}) => {
    if (!snapped) return;
    if (closed) {
      finishPolyline(true);
      return;
    }
    draftPoints = [...draftPoints, {
      position: snapped.position,
      meshUuid: snapped.meshUuid,
    }];
    previewEnd = snapped.position;
    hoverSnap = snapped;
    onDraftChange?.(true);
    notifyVisualChange();
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    void resolveClickSnap(event.clientX, event.clientY).then((snapped) => {
      if (!snapped) return;

      if (snapMode === 'edge') {
        const record = createEdgeMeasurementRecord(snapped);
        if (!record) return;
        onComplete?.(record);
        hoverSnap = snapped;
        notifyVisualChange();
        return;
      }

      if (measureKind === 'polyline') {
        const now = Date.now();
        const isDoubleClick = now - lastClickAt <= DOUBLE_CLICK_MS
          && lastClickPosition
          && new THREE.Vector3(...snapped.position).distanceTo(new THREE.Vector3(...lastClickPosition)) <= getCloseThreshold();

        if (isDoubleClick && draftPoints.length >= 2) {
          finishPolyline(false);
          return;
        }

        if (draftPoints.length >= 3 && isNearFirstPoint(snapped.position)) {
          finishPolyline(true);
          return;
        }

        lastClickAt = now;
        lastClickPosition = snapped.position;
        addPolylinePoint(snapped);
        return;
      }

      if (!draftStart) {
        draftStart = snapped;
        previewEnd = snapped.position;
        hoverSnap = snapped;
        onDraftChange?.(true);
        notifyVisualChange();
        return;
      }

      const record = createMeasurementRecord(draftStart, snapped, snapMode);
      onComplete?.(record);
      clearDraft();
      hoverSnap = null;
      notifyVisualChange();
    });
  };

  const attachListeners = () => {
    if (!canvas) return;
    canvas.style.cursor = 'crosshair';
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('pointerdown', handlePointerDown);
  };

  const detachListeners = () => {
    if (!canvas) return;
    canvas.style.cursor = '';
    canvas.removeEventListener('pointermove', handlePointerMove);
    canvas.removeEventListener('pointerleave', handlePointerLeave);
    canvas.removeEventListener('pointerdown', handlePointerDown);
    pendingPointer = null;
    hoverPickSeq += 1;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  return {
    setActive(nextActive) {
      if (active === nextActive) return;
      active = nextActive;
      if (active) {
        attachListeners();
      } else {
        detachListeners();
        clearDraft();
        hoverSnap = null;
        notifyVisualChange();
      }
    },
    setSnapMode(nextSnapMode) {
      if (snapMode === nextSnapMode) return;
      snapMode = nextSnapMode;
      if (snapMode === 'edge') {
        measureKind = 'segment';
      }
      clearDraft();
      hoverSnap = null;
      notifyVisualChange();
    },
    setMeasureKind(nextMeasureKind) {
      const normalized = nextMeasureKind === 'polyline' ? 'polyline' : 'segment';
      if (measureKind === normalized) return;
      measureKind = snapMode === 'edge' ? 'segment' : normalized;
      clearDraft();
      hoverSnap = null;
      notifyVisualChange();
    },
    finishPolyline(closed = false) {
      return finishPolyline(closed);
    },
    cancelDraft() {
      clearDraft();
      hoverSnap = null;
      notifyVisualChange();
    },
    getVisualState() {
      return {
        draftStart,
        draftPoints,
        previewEnd,
        hoverSnap,
        snapMode,
        measureKind,
      };
    },
    dispose() {
      detachListeners();
      active = false;
      draftStart = null;
      draftPoints = [];
      previewEnd = null;
      hoverSnap = null;
    },
  };
}
