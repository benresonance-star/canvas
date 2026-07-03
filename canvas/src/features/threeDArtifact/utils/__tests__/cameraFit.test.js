import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  allBoxCornersInsideCameraView,
  applySavedCameraState,
  computeFitDistanceForBox,
  fitPerspectiveCameraToCurrentView,
  fitPerspectiveCameraToDefaultView,
} from '../cameraFit.js';

describe('fitPerspectiveCameraToDefaultView', () => {
  it('frames a mesh within the camera view', () => {
    const geometry = new THREE.BoxGeometry(2, 4, 6);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const controls = { target: new THREE.Vector3(), update: () => {} };

    const fitted = fitPerspectiveCameraToDefaultView(camera, controls, mesh, { viewportAspect: 1 });

    expect(fitted).toBe(true);
    expect(controls.target.length()).toBe(0);
    expect(camera.position.length()).toBeGreaterThan(3);
  });

  it('keeps a tall thin model inside the frustum for widescreen viewports', () => {
    const geometry = new THREE.BoxGeometry(0.4, 5, 0.4);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
    const controls = { target: new THREE.Vector3(), update: () => {} };

    fitPerspectiveCameraToDefaultView(camera, controls, mesh, { viewportAspect: 16 / 9 });

    expect(allBoxCornersInsideCameraView(camera, box)).toBe(true);
    expect(computeFitDistanceForBox(box, center, camera, new THREE.Vector3(1, 0.65, 1).normalize()))
      .toBeGreaterThan(2);
  });

  it('returns false when the object has no bounds', () => {
    const group = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

    expect(fitPerspectiveCameraToDefaultView(camera, null, group)).toBe(false);
  });
});

describe('fitPerspectiveCameraToCurrentView', () => {
  it('preserves orbit angle while fitting distance', () => {
    const geometry = new THREE.BoxGeometry(0.4, 5, 0.4);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(mesh);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(10, 5, 2);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const controls = { target: new THREE.Vector3(0, 0, 0), update: () => {} };
    const viewDirBefore = camera.position.clone().sub(controls.target).normalize();

    fitPerspectiveCameraToCurrentView(camera, controls, mesh, { viewportAspect: 1 });

    const viewDirAfter = camera.position.clone().sub(controls.target).normalize();
    expect(viewDirAfter.dot(viewDirBefore)).toBeCloseTo(1, 5);
    expect(allBoxCornersInsideCameraView(camera, box)).toBe(true);
  });
});

describe('applySavedCameraState', () => {
  it('restores camera position and orbit target', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const controls = { target: new THREE.Vector3(), update: () => {} };

    applySavedCameraState(camera, controls, {
      position: [8, 6, 10],
      target: [1, 2, 3],
      up: [0, 1, 0],
      fov: 50,
      near: 0.2,
      far: 500,
    });

    expect(camera.position.toArray()).toEqual([8, 6, 10]);
    expect(controls.target.toArray()).toEqual([1, 2, 3]);
    expect(camera.fov).toBe(50);
  });
});
