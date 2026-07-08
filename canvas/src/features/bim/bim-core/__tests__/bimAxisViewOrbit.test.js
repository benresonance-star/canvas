import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyAxisViewOrbitForPreset,
  beginAxisViewOrbitLock,
  AXIS_VIEW_PHI_EPSILON,
  endAxisViewOrbitLock,
  getAxisViewOrbitState,
  maintainAxisViewOrbitOrientation,
  simulateOrbitAzimuthDelta,
  syncAxisViewOrbitConstraints,
} from '../bimAxisViewOrbit.js';
import {
  fitCameraToViewPreset,
  syncOrbitControlsAfterCameraFit,
} from '../../../threeDArtifact/utils/cameraFit.js';

function createMockOrbitControls(camera, target = new THREE.Vector3()) {
  return {
    object: camera,
    target,
    minPolarAngle: 0,
    maxPolarAngle: Math.PI,
    userData: {},
    _spherical: new THREE.Spherical(),
    _sphericalDelta: new THREE.Spherical(),
    _panOffset: new THREE.Vector3(),
    _scale: 1,
    enableDamping: false,
    update() {
      const offset = new THREE.Vector3().setFromSpherical(this._spherical);
      camera.position.copy(this.target).add(offset);
      camera.lookAt(this.target);
    },
  };
}

describe('bimAxisViewOrbit', () => {
  it('locks polar angle and up vector for top view presets', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(10, 2, 4),
      new THREE.MeshBasicMaterial(),
    );
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const controls = createMockOrbitControls(camera);
    const fitted = fitCameraToViewPreset(camera, controls, mesh, 'top', { viewportAspect: 1 });
    expect(fitted).toBe(true);
    syncOrbitControlsAfterCameraFit(controls);

    const lockedUp = camera.up.clone();
    const state = beginAxisViewOrbitLock(controls, camera, 'top');
    expect(state?.active).toBe(true);
    expect(controls.minPolarAngle).toBeLessThanOrEqual(state.lockedPhi);
    expect(controls.maxPolarAngle).toBeGreaterThanOrEqual(state.lockedPhi);
    expect(controls.maxPolarAngle - controls.minPolarAngle).toBeLessThanOrEqual(AXIS_VIEW_PHI_EPSILON * 2);
    expect(state.lockedUp.dot(lockedUp)).toBeCloseTo(1, 5);
  });

  it('keeps phi stable while applying azimuth rotation deltas', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(8, 2, 8),
      new THREE.MeshBasicMaterial(),
    );
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const controls = createMockOrbitControls(camera);
    fitCameraToViewPreset(camera, controls, mesh, 'top', { viewportAspect: 1 });
    syncOrbitControlsAfterCameraFit(controls);
    beginAxisViewOrbitLock(controls, camera, 'top');

    const lockedPhi = getAxisViewOrbitState(controls).lockedPhi;
    simulateOrbitAzimuthDelta(controls, 0.45);
    maintainAxisViewOrbitOrientation(camera, controls);
    expect(controls._spherical.phi).toBeCloseTo(lockedPhi, 5);

    const viewDir = camera.position.clone().sub(controls.target).normalize();
    expect(viewDir.dot(new THREE.Vector3(0, 1, 0))).toBeGreaterThan(0.82);
  });

  it('clears orbit locks when leaving axis alignment', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(10, 20, 10);
    const controls = createMockOrbitControls(camera);
    beginAxisViewOrbitLock(controls, camera, 'top');

    const isoDirection = new THREE.Vector3(1, 0.65, 1).normalize();
    syncAxisViewOrbitConstraints(camera, controls, isoDirection);

    expect(getAxisViewOrbitState(controls)).toBeNull();
    expect(controls.minPolarAngle).toBe(0);
    expect(controls.maxPolarAngle).toBe(Math.PI);
  });

  it('restores default polar limits when ending the lock', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 10, 0);
    const controls = createMockOrbitControls(camera);
    beginAxisViewOrbitLock(controls, camera, 'top');
    endAxisViewOrbitLock(controls);
    expect(getAxisViewOrbitState(controls)).toBeNull();
    expect(controls.maxPolarAngle).toBe(Math.PI);
  });

  it('ends the lock safely when controls.userData is missing', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const controls = createMockOrbitControls(camera);
    controls.userData = null;
    controls.minPolarAngle = 0.5;
    controls.maxPolarAngle = 0.5;
    expect(() => endAxisViewOrbitLock(controls)).not.toThrow();
    expect(controls.minPolarAngle).toBe(0);
    expect(controls.maxPolarAngle).toBe(Math.PI);
  });

  it('clears polar clamps when applying the home preset', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(8, 2, 8),
      new THREE.MeshBasicMaterial(),
    );
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const controls = createMockOrbitControls(camera);
    fitCameraToViewPreset(camera, controls, mesh, 'top', { viewportAspect: 1 });
    syncOrbitControlsAfterCameraFit(controls);
    applyAxisViewOrbitForPreset(controls, camera, 'top');
    expect(getAxisViewOrbitState(controls)?.mode).toBe('top');

    fitCameraToViewPreset(camera, controls, mesh, 'home', { viewportAspect: 1 });
    syncOrbitControlsAfterCameraFit(controls);
    applyAxisViewOrbitForPreset(controls, camera, 'home');

    expect(getAxisViewOrbitState(controls)).toBeNull();
    expect(controls.minPolarAngle).toBe(0);
    expect(controls.maxPolarAngle).toBe(Math.PI);
  });

  it('relocks to the opposite pole when switching between top and bottom presets', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(8, 2, 8),
      new THREE.MeshBasicMaterial(),
    );
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const controls = createMockOrbitControls(camera);

    fitCameraToViewPreset(camera, controls, mesh, 'top', { viewportAspect: 1 });
    syncOrbitControlsAfterCameraFit(controls);
    applyAxisViewOrbitForPreset(controls, camera, 'top');
    const topPhi = getAxisViewOrbitState(controls).lockedPhi;

    fitCameraToViewPreset(camera, controls, mesh, 'bottom', { viewportAspect: 1 });
    syncOrbitControlsAfterCameraFit(controls);
    applyAxisViewOrbitForPreset(controls, camera, 'bottom');
    const bottomPhi = getAxisViewOrbitState(controls).lockedPhi;

    expect(topPhi).toBeLessThan(0.2);
    expect(bottomPhi).toBeGreaterThan(Math.PI - 0.2);
    expect(bottomPhi).toBeGreaterThan(topPhi);
  });
});
