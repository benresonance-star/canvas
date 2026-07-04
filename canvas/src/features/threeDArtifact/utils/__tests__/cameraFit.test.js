import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  allBoxCornersInsideCameraView,
  applySavedCameraState,
  computeFitDistanceForBox,
  fitOrthographicCameraToDefaultView,
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

  it('frames an offset model using its bounding-sphere center', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(10, -5, 3);
    const group = new THREE.Group();
    group.add(mesh);
    group.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(group);
    const camera = new THREE.PerspectiveCamera(45, 340 / 188, 0.1, 1000);
    const controls = { target: new THREE.Vector3(), update: () => {} };

    fitPerspectiveCameraToDefaultView(camera, controls, group, { viewportAspect: 340 / 188 });

    expect(allBoxCornersInsideCameraView(camera, box)).toBe(true);
    expect(controls.target.x).toBeCloseTo(10, 3);
    expect(controls.target.y).toBeCloseTo(-5, 3);
    expect(controls.target.z).toBeCloseTo(3, 3);
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

describe('fitOrthographicCameraToDefaultView', () => {
  it('frames a mesh within the orthographic frustum', () => {
    const geometry = new THREE.BoxGeometry(2, 4, 6);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    const controls = { target: new THREE.Vector3(), update: () => {} };

    const fitted = fitOrthographicCameraToDefaultView(camera, controls, mesh, { viewportAspect: 1 });

    expect(fitted).toBe(true);
    expect(camera.top - camera.bottom).toBeGreaterThan(4);
    expect(controls.target.length()).toBe(0);
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

  it('restores orthographic zoom and view height', () => {
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    const controls = { target: new THREE.Vector3(), update: () => {} };

    applySavedCameraState(camera, controls, {
      position: [0, 0, 10],
      target: [0, 0, 0],
      up: [0, 1, 0],
      zoom: 2,
      viewHeight: 12,
      near: 0.2,
      far: 500,
    }, { viewportWidth: 800, viewportHeight: 600 });

    expect(camera.zoom).toBe(2);
    expect(camera.userData.viewHeight).toBe(12);
    expect(camera.top - camera.bottom).toBeCloseTo(6, 5);
  });
});
