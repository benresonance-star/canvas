import * as THREE from 'three';
import {
  applySavedCameraState,
  perspectiveToOrthoViewHeight,
  setOrthographicViewHeight,
  syncOrbitControlsAfterCameraFit,
  updateOrthographicFrustum,
} from '../../threeDArtifact/utils/cameraFit.js';

export const BIM_DEFAULT_FOV = 45;
export const BIM_DEFAULT_NEAR = 0.1;
export const BIM_DEFAULT_FAR = 100000;

export function serializeBimCameraState(camera, controls, projectionMode) {
  if (!camera || !controls?.target) return null;
  const state = {
    position: camera.position.toArray(),
    target: controls.target.toArray(),
    up: camera.up.toArray(),
    near: camera.near,
    far: camera.far,
  };
  if (projectionMode === 'orthographic' || camera.isOrthographicCamera) {
    state.zoom = camera.zoom;
    state.viewHeight = camera.userData.viewHeight ?? null;
  } else {
    state.fov = camera.fov;
  }
  return state;
}

export function createBimCamera(projectionMode, aspect, savedState = null) {
  const near = savedState?.near ?? BIM_DEFAULT_NEAR;
  const far = savedState?.far ?? BIM_DEFAULT_FAR;

  if (projectionMode === 'orthographic') {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, near, far);
    camera.zoom = savedState?.zoom ?? 1;
    if (Number.isFinite(savedState?.viewHeight) && savedState.viewHeight > 0) {
      setOrthographicViewHeight(camera, savedState.viewHeight);
    } else {
      setOrthographicViewHeight(camera, 20);
    }
    updateOrthographicFrustum(camera, aspect, 1);
    if (savedState?.position) {
      camera.position.set(savedState.position[0], savedState.position[1], savedState.position[2]);
    } else {
      camera.position.set(12, 9, 12);
    }
    if (savedState?.up) {
      camera.up.set(savedState.up[0], savedState.up[1], savedState.up[2]);
    }
    return camera;
  }

  const camera = new THREE.PerspectiveCamera(savedState?.fov ?? BIM_DEFAULT_FOV, aspect, near, far);
  if (savedState?.position) {
    camera.position.set(savedState.position[0], savedState.position[1], savedState.position[2]);
  } else {
    camera.position.set(12, 9, 12);
  }
  if (savedState?.up) {
    camera.up.set(savedState.up[0], savedState.up[1], savedState.up[2]);
  }
  return camera;
}

export function resizeBimCamera(camera, width, height) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  if (camera.isPerspectiveCamera) {
    camera.aspect = safeWidth / safeHeight;
    camera.updateProjectionMatrix();
    return;
  }
  if (camera.isOrthographicCamera) {
    updateOrthographicFrustum(camera, safeWidth, safeHeight);
  }
}

export function swapBimCamera(oldCamera, controls, model, newMode, { width, height }) {
  const aspect = Math.max(width, 1) / Math.max(height, 1);
  const currentMode = oldCamera.isOrthographicCamera ? 'orthographic' : 'perspective';
  const savedState = serializeBimCameraState(oldCamera, controls, currentMode);
  const target = controls?.target?.clone?.() ?? new THREE.Vector3();

  const nextState = { ...savedState };
  if (newMode === 'orthographic' && oldCamera.isPerspectiveCamera) {
    const distance = Math.max(oldCamera.position.distanceTo(target), 1e-3);
    nextState.viewHeight = perspectiveToOrthoViewHeight(oldCamera, distance);
    nextState.zoom = 1;
  }

  const newCamera = createBimCamera(newMode, aspect, nextState);
  newCamera.position.copy(oldCamera.position);
  newCamera.quaternion.copy(oldCamera.quaternion);
  newCamera.up.copy(oldCamera.up);
  newCamera.lookAt(target);

  controls.object = newCamera;
  resizeBimCamera(newCamera, width, height);
  syncOrbitControlsAfterCameraFit(controls);

  if (model?.useCamera) {
    model.useCamera(newCamera);
  }

  return newCamera;
}

export function restoreBimCameraState(camera, controls, savedCamera, { width, height }) {
  if (!camera || !savedCamera) return false;
  applySavedCameraState(camera, controls, savedCamera, {
    viewportWidth: width,
    viewportHeight: height,
  });
  return true;
}
