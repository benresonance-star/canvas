import * as THREE from 'three';
import { resolveAxisViewMode } from './bimViewNavigator.js';

export const DEFAULT_MIN_POLAR_ANGLE = 0;
export const DEFAULT_MAX_POLAR_ANGLE = Math.PI;
export const AXIS_VIEW_PHI_EPSILON = 0.002;

const _offset = new THREE.Vector3();
const _spherical = new THREE.Spherical();

export function getAxisViewOrbitState(controls) {
  return controls?.userData?.bimAxisViewOrbit ?? null;
}

export function beginAxisViewOrbitLock(controls, camera, mode) {
  if (!controls || !camera || (mode !== 'top' && mode !== 'bottom')) {
    return null;
  }

  _offset.copy(camera.position).sub(controls.target);
  if (_offset.lengthSq() < 1e-12) {
    return null;
  }

  _spherical.setFromVector3(_offset);
  const lockedPhi = _spherical.phi;
  const lockedUp = camera.up.clone().normalize();

  controls.minPolarAngle = Math.max(DEFAULT_MIN_POLAR_ANGLE, lockedPhi - AXIS_VIEW_PHI_EPSILON);
  controls.maxPolarAngle = Math.min(DEFAULT_MAX_POLAR_ANGLE, lockedPhi + AXIS_VIEW_PHI_EPSILON);

  if (!controls.userData) {
    controls.userData = {};
  }

  const state = {
    active: true,
    mode,
    lockedPhi,
    lockedUp,
  };
  controls.userData.bimAxisViewOrbit = state;
  return state;
}

export function endAxisViewOrbitLock(controls) {
  if (!controls) return;
  controls.minPolarAngle = DEFAULT_MIN_POLAR_ANGLE;
  controls.maxPolarAngle = DEFAULT_MAX_POLAR_ANGLE;
  if (controls.userData) {
    delete controls.userData.bimAxisViewOrbit;
  }
}

export function maintainAxisViewOrbitOrientation(camera, controls) {
  const state = getAxisViewOrbitState(controls);
  if (!state?.active || !camera || !controls?.target) {
    return false;
  }

  if (controls._spherical && Math.abs(controls._spherical.phi - state.lockedPhi) > 1e-5) {
    controls._spherical.phi = state.lockedPhi;
  }

  if (camera.up.dot(state.lockedUp) < 0.999) {
    camera.up.copy(state.lockedUp);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld(true);
  }

  return true;
}

/** Apply or clear axis-view orbit locks for an explicit navigator preset. */
export function applyAxisViewOrbitForPreset(controls, camera, preset) {
  endAxisViewOrbitLock(controls);
  if (preset !== 'top' && preset !== 'bottom') {
    return null;
  }
  const state = beginAxisViewOrbitLock(controls, camera, preset);
  if (state) {
    maintainAxisViewOrbitOrientation(camera, controls);
  }
  return state;
}

/** Keep plan/ceiling views stable while allowing azimuth roll, pan, and zoom. */
export function syncAxisViewOrbitConstraints(camera, controls, viewDirection) {
  if (!camera || !controls?.target) return false;

  const mode = resolveAxisViewMode(viewDirection);
  const existing = getAxisViewOrbitState(controls);

  if (!mode) {
    if (existing?.active) {
      endAxisViewOrbitLock(controls);
    }
    return false;
  }

  if (!existing?.active || existing.mode !== mode) {
    endAxisViewOrbitLock(controls);
    beginAxisViewOrbitLock(controls, camera, mode);
  }

  return maintainAxisViewOrbitOrientation(camera, controls);
}

export function simulateOrbitAzimuthDelta(controls, deltaTheta) {
  if (!controls?._spherical || !Number.isFinite(deltaTheta)) {
    return false;
  }
  controls._spherical.theta += deltaTheta;
  if (typeof controls.update === 'function') {
    controls.update();
  }
  return true;
}
