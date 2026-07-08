import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  allBoxCornersInsideCameraView,
  applySavedCameraState,
  computeFitDistanceForBox,
  fitCameraToViewPreset,
  fitOrthographicCameraToDefaultView,
  fitPerspectiveCameraToCurrentView,
  fitPerspectiveCameraToDefaultView,
  resolveFootprintHorizontalAxis,
  resolveViewPresetDirection,
  syncOrbitControlsAfterCameraFit,
} from '../cameraFit.js';
import {
  simulateOrbitAzimuthDelta,
} from '../../../bim/bim-core/bimAxisViewOrbit.js';

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
    update() {},
  };
}

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

describe('fitCameraToViewPreset', () => {
  it('frames a mesh from each world-axis preset direction', () => {
    const geometry = new THREE.BoxGeometry(2, 4, 6);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(mesh);

    for (const preset of ['home', 'top', 'bottom']) {
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      const controls = createMockOrbitControls(camera);
      const fitted = fitCameraToViewPreset(camera, controls, mesh, preset, { viewportAspect: 1 });
      expect(fitted).toBe(true);
      expect(allBoxCornersInsideCameraView(camera, box)).toBe(true);
      const viewDir = camera.position.clone().sub(controls.target).normalize();
      const expectedDir = resolveViewPresetDirection(preset);
      expect(viewDir.dot(expectedDir)).toBeCloseTo(1, 5);
    }
  });

  it('uses world up for top and bottom presets so orbit controls stay stable', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 4), new THREE.MeshBasicMaterial());
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const controls = createMockOrbitControls(camera);
    fitCameraToViewPreset(camera, controls, mesh, 'top', { viewportAspect: 1 });
    expect(camera.up.x).toBeCloseTo(0, 5);
    expect(camera.up.y).toBeCloseTo(1, 5);
    expect(camera.up.z).toBeCloseTo(0, 5);
  });

  it('offsets top and bottom presets slightly off the orbit pole for controls', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 6), new THREE.MeshBasicMaterial());
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const controls = createMockOrbitControls(camera);
    fitCameraToViewPreset(camera, controls, mesh, 'top', { viewportAspect: 1 });
    syncOrbitControlsAfterCameraFit(controls);

    expect(controls._spherical.phi).toBeGreaterThan(0);
    expect(controls._spherical.phi).toBeLessThan(0.2);
    expect(controls.minPolarAngle).toBe(0);
    expect(controls.maxPolarAngle).toBe(Math.PI);
  });

  it('resets orbit spherical state after preset fit', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const controls = createMockOrbitControls(camera);
    controls._spherical.set(2.4, 1.1, 0.8);

    fitCameraToViewPreset(camera, controls, mesh, 'top', { viewportAspect: 1 });
    syncOrbitControlsAfterCameraFit(controls);

    const offset = camera.position.clone().sub(controls.target);
    const synced = new THREE.Spherical().setFromVector3(offset);
    expect(controls._spherical.radius).toBeCloseTo(synced.radius, 5);
    expect(controls._spherical.phi).toBeCloseTo(synced.phi, 5);
    expect(controls._spherical.theta).toBeCloseTo(synced.theta, 5);
    expect(controls._sphericalDelta.radius).toBe(0);
  });

  it('preserves top view alignment after azimuth orbit deltas without roll locks', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 6), new THREE.MeshBasicMaterial());
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const controls = createMockOrbitControls(camera);
    fitCameraToViewPreset(camera, controls, mesh, 'top', { viewportAspect: 1 });
    syncOrbitControlsAfterCameraFit(controls);

    expect(camera.up.y).toBeCloseTo(1, 5);
    const beforeTheta = controls._spherical.theta;
    simulateOrbitAzimuthDelta(controls, 0.8);
    expect(controls._spherical.theta).not.toBeCloseTo(beforeTheta, 3);
    expect(camera.up.y).toBeCloseTo(1, 5);
  });

  it('returns false for unknown presets', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    expect(fitCameraToViewPreset(camera, null, mesh, 'left')).toBe(false);
  });

  it('aligns top view roll to the longer footprint axis for axis-aligned models', () => {
    const geometry = new THREE.BoxGeometry(20, 1, 5);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateWorldMatrix(true, true);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const controls = createMockOrbitControls(camera);
    const fitted = fitCameraToViewPreset(camera, controls, mesh, 'top', { viewportAspect: 1 });
    expect(fitted).toBe(true);

    camera.updateMatrixWorld(true);
    const cameraRight = new THREE.Vector3(
      camera.matrixWorld.elements[0],
      camera.matrixWorld.elements[1],
      camera.matrixWorld.elements[2],
    ).normalize();
    expect(Math.abs(cameraRight.dot(new THREE.Vector3(1, 0, 0)))).toBeCloseTo(1, 5);
  });

  it('aligns top view roll to a rotated footprint instead of world axes', () => {
    const geometry = new THREE.BoxGeometry(20, 1, 5);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.y = Math.PI / 4;
    mesh.updateWorldMatrix(true, true);

    const footprintRight = resolveFootprintHorizontalAxis(mesh);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const controls = createMockOrbitControls(camera);
    const fitted = fitCameraToViewPreset(camera, controls, mesh, 'top', { viewportAspect: 1 });
    expect(fitted).toBe(true);

    camera.updateMatrixWorld(true);
    const cameraRight = new THREE.Vector3(
      camera.matrixWorld.elements[0],
      camera.matrixWorld.elements[1],
      camera.matrixWorld.elements[2],
    ).normalize();
    expect(Math.abs(cameraRight.dot(footprintRight))).toBeCloseTo(1, 5);
    expect(Math.abs(cameraRight.dot(new THREE.Vector3(1, 0, 0)))).toBeLessThan(0.95);
  });

  it('aligns top view for meshes without readable vertex buffers', () => {
    const geometry = new THREE.BoxGeometry(20, 1, 5);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.y = Math.PI / 4;
    mesh.geometry.setAttribute('position', {
      count: geometry.attributes.position.count,
      itemSize: 3,
      getX: geometry.attributes.position.getX.bind(geometry.attributes.position),
      getY: geometry.attributes.position.getY.bind(geometry.attributes.position),
      getZ: geometry.attributes.position.getZ.bind(geometry.attributes.position),
    });
    mesh.updateWorldMatrix(true, true);

    const footprintRight = resolveFootprintHorizontalAxis(mesh);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const controls = createMockOrbitControls(camera);
    expect(() => fitCameraToViewPreset(camera, controls, mesh, 'top', { viewportAspect: 1 })).not.toThrow();
    expect(fitCameraToViewPreset(camera, controls, mesh, 'top', { viewportAspect: 1 })).toBe(true);

    camera.updateMatrixWorld(true);
    const cameraRight = new THREE.Vector3(
      camera.matrixWorld.elements[0],
      camera.matrixWorld.elements[1],
      camera.matrixWorld.elements[2],
    ).normalize();
    expect(Math.abs(cameraRight.dot(footprintRight))).toBeCloseTo(1, 5);
  });
});
