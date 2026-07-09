import * as THREE from 'three';
import { syncOrbitControlsAfterCameraFit } from '../../threeDArtifact/utils/cameraFit.js';
import { restoreBimCameraState, serializeBimCameraState } from './bimCamera.js';

export const BIM_CAMERA_HISTORY_MAX_ENTRIES = 10;
/** @deprecated Use BIM_CAMERA_HISTORY_SETTLE_MS */
export const BIM_CAMERA_HISTORY_IDLE_MS = 400;
export const BIM_CAMERA_HISTORY_SETTLE_MS = 750;
export const BIM_CAMERA_HISTORY_EPSILON = 1e-4;
export const BIM_CAMERA_HISTORY_MIN_ORBIT_FRACTION = 0.002;
export const BIM_CAMERA_HISTORY_MIN_ZOOM_FRACTION = 0.01;
export const BIM_CAMERA_HISTORY_ANIMATION_MS = 300;

function cloneCameraSnapshot(snapshot) {
  if (!snapshot?.camera) return null;
  return {
    projectionMode: snapshot.projectionMode,
    camera: {
      ...snapshot.camera,
      position: [...snapshot.camera.position],
      target: [...snapshot.camera.target],
      up: [...snapshot.camera.up],
    },
  };
}

export function captureBimCameraHistorySnapshot(camera, controls, projectionMode) {
  const cameraState = serializeBimCameraState(camera, controls, projectionMode);
  if (!cameraState) return null;
  return {
    camera: cameraState,
    projectionMode,
  };
}

export function bimCameraSnapshotsDiffer(
  a,
  b,
  epsilon = BIM_CAMERA_HISTORY_EPSILON,
) {
  if (!a?.camera || !b?.camera) return Boolean(a) !== Boolean(b);
  if (a.projectionMode !== b.projectionMode) return true;

  const posA = a.camera.position;
  const posB = b.camera.position;
  const targetA = a.camera.target;
  const targetB = b.camera.target;

  for (let index = 0; index < 3; index += 1) {
    if (Math.abs(posA[index] - posB[index]) > epsilon) return true;
    if (Math.abs(targetA[index] - targetB[index]) > epsilon) return true;
  }

  if (a.projectionMode === 'orthographic' || a.camera.zoom != null) {
    const zoomA = a.camera.zoom ?? 1;
    const zoomB = b.camera.zoom ?? 1;
    if (Math.abs(zoomA - zoomB) > epsilon) return true;
    const viewHeightA = a.camera.viewHeight ?? 0;
    const viewHeightB = b.camera.viewHeight ?? 0;
    if (Math.abs(viewHeightA - viewHeightB) > epsilon) return true;
  } else {
    const fovA = a.camera.fov ?? 0;
    const fovB = b.camera.fov ?? 0;
    if (Math.abs(fovA - fovB) > epsilon) return true;
  }

  return false;
}

export function orbitRadiusFromSnapshot(snapshot) {
  const pos = snapshot?.camera?.position;
  const target = snapshot?.camera?.target;
  if (!pos || !target) return 1;
  let sumSq = 0;
  for (let index = 0; index < 3; index += 1) {
    const delta = pos[index] - target[index];
    sumSq += delta * delta;
  }
  return Math.sqrt(sumSq) || 1;
}

export function bimCameraSnapshotsMeaningfullyDiffer(
  a,
  b,
  {
    minOrbitFraction = BIM_CAMERA_HISTORY_MIN_ORBIT_FRACTION,
    minZoomFraction = BIM_CAMERA_HISTORY_MIN_ZOOM_FRACTION,
  } = {},
) {
  if (!a?.camera || !b?.camera) return Boolean(a) !== Boolean(b);
  if (a.projectionMode !== b.projectionMode) return true;

  const radius = Math.max(orbitRadiusFromSnapshot(a), orbitRadiusFromSnapshot(b), 1e-6);
  const orbitEpsilon = radius * minOrbitFraction;

  const posA = a.camera.position;
  const posB = b.camera.position;
  const targetA = a.camera.target;
  const targetB = b.camera.target;

  for (let index = 0; index < 3; index += 1) {
    if (Math.abs(posA[index] - posB[index]) > orbitEpsilon) return true;
    if (Math.abs(targetA[index] - targetB[index]) > orbitEpsilon) return true;
  }

  if (a.projectionMode === 'orthographic' || a.camera.zoom != null) {
    const zoomA = a.camera.zoom ?? 1;
    const zoomB = b.camera.zoom ?? 1;
    const zoomDenom = Math.max(Math.abs(zoomA), Math.abs(zoomB), 1e-6);
    if (Math.abs(zoomA - zoomB) / zoomDenom > minZoomFraction) return true;
    const viewHeightA = a.camera.viewHeight ?? 0;
    const viewHeightB = b.camera.viewHeight ?? 0;
    const viewHeightDenom = Math.max(Math.abs(viewHeightA), Math.abs(viewHeightB), 1e-6);
    if (Math.abs(viewHeightA - viewHeightB) / viewHeightDenom > minZoomFraction) return true;
  } else {
    const fovA = a.camera.fov ?? 45;
    const fovB = b.camera.fov ?? 45;
    const fovDenom = Math.max(Math.abs(fovA), Math.abs(fovB), 1e-6);
    if (Math.abs(fovA - fovB) / fovDenom > minZoomFraction) return true;
  }

  return false;
}

function lerpArray(from, to, alpha, out) {
  for (let index = 0; index < from.length; index += 1) {
    out[index] = from[index] + (to[index] - from[index]) * alpha;
  }
  return out;
}

export function createBimCameraHistoryAnimator({
  getCamera,
  getControls,
  getViewportSize,
  onComplete,
} = {}) {
  let active = false;
  let elapsedMs = 0;
  let durationMs = BIM_CAMERA_HISTORY_ANIMATION_MS;
  let fromSnapshot = null;
  let toSnapshot = null;
  let fromPosition = new THREE.Vector3();
  let toPosition = new THREE.Vector3();
  let fromTarget = new THREE.Vector3();
  let toTarget = new THREE.Vector3();
  let fromUp = new THREE.Vector3();
  let toUp = new THREE.Vector3();
  let fromScalar = 0;
  let toScalar = 0;
  let scalarKey = 'fov';

  const easeOutCubic = (t) => 1 - (1 - t) ** 3;

  const reset = () => {
    active = false;
    elapsedMs = 0;
    fromSnapshot = null;
    toSnapshot = null;
  };

  return {
    get isAnimating() {
      return active;
    },
    start(targetSnapshot, { durationMs: nextDurationMs = BIM_CAMERA_HISTORY_ANIMATION_MS } = {}) {
      const camera = getCamera?.();
      const controls = getControls?.();
      if (!camera || !controls?.target || !targetSnapshot?.camera) return false;

      fromSnapshot = captureBimCameraHistorySnapshot(
        camera,
        controls,
        targetSnapshot.projectionMode,
      );
      toSnapshot = cloneCameraSnapshot(targetSnapshot);
      if (!fromSnapshot || !toSnapshot) return false;

      fromPosition.set(fromSnapshot.camera.position[0], fromSnapshot.camera.position[1], fromSnapshot.camera.position[2]);
      toPosition.set(toSnapshot.camera.position[0], toSnapshot.camera.position[1], toSnapshot.camera.position[2]);
      fromTarget.set(fromSnapshot.camera.target[0], fromSnapshot.camera.target[1], fromSnapshot.camera.target[2]);
      toTarget.set(toSnapshot.camera.target[0], toSnapshot.camera.target[1], toSnapshot.camera.target[2]);
      fromUp.set(fromSnapshot.camera.up[0], fromSnapshot.camera.up[1], fromSnapshot.camera.up[2]);
      toUp.set(toSnapshot.camera.up[0], toSnapshot.camera.up[1], toSnapshot.camera.up[2]);

      if (camera.isOrthographicCamera) {
        scalarKey = 'zoom';
        fromScalar = fromSnapshot.camera.zoom ?? camera.zoom ?? 1;
        toScalar = toSnapshot.camera.zoom ?? 1;
      } else {
        scalarKey = 'fov';
        fromScalar = fromSnapshot.camera.fov ?? camera.fov ?? 45;
        toScalar = toSnapshot.camera.fov ?? 45;
      }

      durationMs = Math.max(1, nextDurationMs);
      elapsedMs = 0;
      active = true;
      return true;
    },
    update(deltaSeconds = 0) {
      if (!active) return false;

      const camera = getCamera?.();
      const controls = getControls?.();
      if (!camera || !controls?.target || !toSnapshot?.camera) {
        reset();
        return false;
      }

      elapsedMs += deltaSeconds * 1000;
      const rawT = Math.min(1, elapsedMs / durationMs);
      const t = easeOutCubic(rawT);

      camera.position.lerpVectors(fromPosition, toPosition, t);
      controls.target.lerpVectors(fromTarget, toTarget, t);
      camera.up.lerpVectors(fromUp, toUp, t).normalize();
      camera.lookAt(controls.target);

      if (scalarKey === 'zoom') {
        camera.zoom = fromScalar + (toScalar - fromScalar) * t;
        if (Number.isFinite(toSnapshot.camera.viewHeight) && toSnapshot.camera.viewHeight > 0) {
          const fromViewHeight = fromSnapshot.camera.viewHeight ?? toSnapshot.camera.viewHeight;
          camera.userData.viewHeight = fromViewHeight + (toSnapshot.camera.viewHeight - fromViewHeight) * t;
        }
      } else {
        camera.fov = fromScalar + (toScalar - fromScalar) * t;
      }

      const { width, height } = getViewportSize?.() ?? {};
      if (width && height) {
        if (camera.isOrthographicCamera) {
          camera.updateProjectionMatrix();
        } else {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }
      } else {
        camera.updateProjectionMatrix();
      }

      syncOrbitControlsAfterCameraFit(controls);

      if (rawT >= 1) {
        restoreBimCameraState(camera, controls, toSnapshot.camera, {
          width,
          height,
        });
        syncOrbitControlsAfterCameraFit(controls);
        reset();
        onComplete?.();
      }

      return true;
    },
    cancel() {
      reset();
    },
  };
}

export function createBimCameraHistory({
  getCamera,
  getControls,
  getProjectionMode,
  onStackChange,
  maxEntries = BIM_CAMERA_HISTORY_MAX_ENTRIES,
  settleMs = BIM_CAMERA_HISTORY_SETTLE_MS,
  idleMs,
} = {}) {
  const resolvedSettleMs = idleMs ?? settleMs;
  let past = [];
  let future = [];
  let sessionActive = false;
  let sessionSnapshot = null;
  let settleTimer = null;
  let recordingEnabled = true;
  let isRestoring = false;

  const notifyChange = () => {
    onStackChange?.({
      pastCount: past.length,
      futureCount: future.length,
      canGoBack: past.length > 0,
      canGoForward: future.length > 0,
    });
  };

  const captureCurrent = () => {
    const camera = getCamera?.();
    const controls = getControls?.();
    const projectionMode = getProjectionMode?.() ?? 'perspective';
    return captureBimCameraHistorySnapshot(camera, controls, projectionMode);
  };

  const clearSettleTimer = () => {
    if (settleTimer != null) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
  };

  const pushPast = (snapshot) => {
    if (!snapshot || isRestoring || !recordingEnabled) return;
    const current = captureCurrent();
    if (current && !bimCameraSnapshotsMeaningfullyDiffer(snapshot, current)) return;
    if (past.length > 0) {
      const last = past[past.length - 1];
      if (!bimCameraSnapshotsMeaningfullyDiffer(last, snapshot)) return;
    }
    past.push(cloneCameraSnapshot(snapshot));
    while (past.length > maxEntries) past.shift();
    future = [];
    notifyChange();
  };

  const beginSession = () => {
    if (isRestoring || !recordingEnabled) return;
    clearSettleTimer();
    if (!sessionActive) {
      sessionSnapshot = captureCurrent();
      sessionActive = true;
    }
  };

  const commitSession = () => {
    clearSettleTimer();
    if (!sessionActive || isRestoring || !recordingEnabled) {
      sessionActive = false;
      sessionSnapshot = null;
      return;
    }
    const before = sessionSnapshot;
    const after = captureCurrent();
    sessionActive = false;
    sessionSnapshot = null;
    if (before && after && bimCameraSnapshotsMeaningfullyDiffer(before, after)) {
      pushPast(before);
    }
  };

  const scheduleSettleCommit = () => {
    clearSettleTimer();
    if (!sessionActive || isRestoring || !recordingEnabled) return;
    settleTimer = setTimeout(() => {
      settleTimer = null;
      commitSession();
    }, resolvedSettleMs);
  };

  const resetStack = () => {
    past = [];
    future = [];
    sessionActive = false;
    sessionSnapshot = null;
    clearSettleTimer();
  };

  return {
    get pastCount() {
      return past.length;
    },
    get futureCount() {
      return future.length;
    },
    get canGoBack() {
      return past.length > 0;
    },
    get canGoForward() {
      return future.length > 0;
    },
    get isRestoring() {
      return isRestoring;
    },
    setRecordingEnabled(enabled) {
      recordingEnabled = Boolean(enabled);
    },
    setRestoring(restoring) {
      isRestoring = Boolean(restoring);
    },
    beginSession,
    commitSession,
    handleControlsStart() {
      beginSession();
    },
    handleControlsEnd() {
      scheduleSettleCommit();
    },
    handleControlsChange() {
      if (isRestoring || !recordingEnabled) return;
      if (!sessionActive) {
        sessionSnapshot = captureCurrent();
        sessionActive = true;
      }
      scheduleSettleCommit();
    },
    goBack() {
      if (past.length === 0 || isRestoring) return null;
      const current = captureCurrent();
      const target = past.pop();
      if (current) {
        future.push(cloneCameraSnapshot(current));
      }
      notifyChange();
      return cloneCameraSnapshot(target);
    },
    goForward() {
      if (future.length === 0 || isRestoring) return null;
      const current = captureCurrent();
      const target = future.pop();
      if (current) {
        past.push(cloneCameraSnapshot(current));
        while (past.length > maxEntries) past.shift();
      }
      notifyChange();
      return cloneCameraSnapshot(target);
    },
    clear() {
      resetStack();
      notifyChange();
    },
    dispose() {
      resetStack();
      notifyChange();
      recordingEnabled = false;
    },
  };
}
