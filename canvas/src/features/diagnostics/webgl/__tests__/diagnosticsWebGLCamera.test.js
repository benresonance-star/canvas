import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  computeDiagnosticsSceneBounds,
  fitDiagnosticsCameraToExtent,
  getDiagnosticsOrbitDistanceLimits,
  lerpDiagnosticsCameraToExtent,
  stepDiagnosticsCameraZoom,
} from '../diagnosticsWebGLCamera.js';

function createMockControls(target = new THREE.Vector3(0, 0, 0)) {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 10, 0);
  return {
    target,
    object: camera,
    _scale: 1,
    _sphericalDelta: new THREE.Spherical(),
    _panOffset: new THREE.Vector3(),
    update: vi.fn(),
    getDistance() {
      return this.object.position.distanceTo(this.target);
    },
  };
}

describe('diagnosticsWebGLCamera', () => {
  it('computes bounds from layout nodes', () => {
    const layout3d = {
      byNodeId: new Map([
        ['a', { world: { x: -2, y: 0.04, z: 0 } }],
        ['b', { world: { x: 2, y: 0.04, z: 4 } }],
      ]),
    };
    const bounds = computeDiagnosticsSceneBounds(layout3d);
    expect(bounds.center.x).toBe(0);
    expect(bounds.center.z).toBe(2);
    expect(bounds.radius).toBeGreaterThan(2);
  });

  it('fits the camera to diagram extent with padding', () => {
    const camera = new THREE.PerspectiveCamera();
    const controls = createMockControls();
    const bounds = { center: new THREE.Vector3(1, 0, 2), radius: 6 };

    fitDiagnosticsCameraToExtent(camera, controls, bounds);

    expect(controls.target.x).toBe(1);
    expect(controls.target.z).toBe(2);
    expect(camera.position.y).toBeGreaterThan(6);
    expect(camera.position.x).toBeCloseTo(1);
    expect(camera.position.z).toBeCloseTo(2.01);
  });

  it('keeps the camera top-down after zoom even if offset drifts', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(2, 10, 4);
    const controls = createMockControls(new THREE.Vector3(1, 0, 2));
    const limits = getDiagnosticsOrbitDistanceLimits(6);

    stepDiagnosticsCameraZoom(camera, controls, 'in', limits);

    expect(camera.position.x).toBeCloseTo(1);
    expect(camera.position.z).toBeCloseTo(2.01);
    expect(camera.position.y).toBeLessThan(10);
  });

  it('steps camera distance for zoom in and out', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 10, 0);
    const controls = createMockControls(new THREE.Vector3(0, 0, 0));
    const limits = getDiagnosticsOrbitDistanceLimits(6);

    stepDiagnosticsCameraZoom(camera, controls, 'in', limits);
    expect(camera.position.y).toBeLessThan(10);
    expect(camera.position.y).toBeGreaterThanOrEqual(limits.minDistance);

    const zoomedIn = camera.position.y;
    stepDiagnosticsCameraZoom(camera, controls, 'out', limits);
    expect(camera.position.y).toBeGreaterThan(zoomedIn);
  });

  it('lerps the camera back to the full diagram when concentrate progress returns to zero', () => {
    const camera = new THREE.PerspectiveCamera();
    const controls = createMockControls();
    const fullBounds = { center: new THREE.Vector3(0, 0, 4), radius: 12 };
    const clusterBounds = { center: new THREE.Vector3(2, 0, 1), radius: 3 };

    lerpDiagnosticsCameraToExtent(camera, controls, fullBounds, clusterBounds, 1);
    const concentratedY = camera.position.y;

    lerpDiagnosticsCameraToExtent(camera, controls, fullBounds, clusterBounds, 0);

    expect(camera.position.x).toBeCloseTo(fullBounds.center.x);
    expect(camera.position.z).toBeCloseTo(fullBounds.center.z + 0.01);
    expect(camera.position.y).toBeGreaterThan(concentratedY);
    expect(controls.target.x).toBeCloseTo(fullBounds.center.x);
    expect(controls.target.z).toBeCloseTo(fullBounds.center.z);
  });
});
