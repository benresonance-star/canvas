import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  bimCameraSnapshotsDiffer,
  bimCameraSnapshotsMeaningfullyDiffer,
  captureBimCameraHistorySnapshot,
  createBimCameraHistory,
  orbitRadiusFromSnapshot,
} from '../bimCameraHistory.js';

function createMockCameraAndControls({
  position = [10, 8, 10],
  target = [0, 0, 0],
  fov = 45,
} = {}) {
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1000);
  camera.position.set(position[0], position[1], position[2]);
  const controls = {
    target: new THREE.Vector3(target[0], target[1], target[2]),
  };
  return { camera, controls };
}

function makeSnapshot(position, target, fov = 45) {
  const { camera, controls } = createMockCameraAndControls({ position, target, fov });
  return captureBimCameraHistorySnapshot(camera, controls, 'perspective');
}

describe('bimCameraSnapshotsDiffer', () => {
  it('returns false for identical snapshots', () => {
    const a = makeSnapshot([1, 2, 3], [0, 0, 0]);
    const b = makeSnapshot([1, 2, 3], [0, 0, 0]);
    expect(bimCameraSnapshotsDiffer(a, b)).toBe(false);
  });

  it('returns true when position changes meaningfully', () => {
    const a = makeSnapshot([1, 2, 3], [0, 0, 0]);
    const b = makeSnapshot([2, 2, 3], [0, 0, 0]);
    expect(bimCameraSnapshotsDiffer(a, b)).toBe(true);
  });

  it('returns false for sub-epsilon moves', () => {
    const a = makeSnapshot([1, 2, 3], [0, 0, 0]);
    const b = makeSnapshot([1.00001, 2, 3], [0, 0, 0]);
    expect(bimCameraSnapshotsDiffer(a, b)).toBe(false);
  });
});

describe('bimCameraSnapshotsMeaningfullyDiffer', () => {
  it('returns false for sub-threshold orbit wiggle', () => {
    const a = makeSnapshot([10, 8, 10], [0, 0, 0]);
    const radius = orbitRadiusFromSnapshot(a);
    const delta = radius * 0.001;
    const b = makeSnapshot([10 + delta, 8, 10], [0, 0, 0]);
    expect(bimCameraSnapshotsMeaningfullyDiffer(a, b)).toBe(false);
  });

  it('returns true for orbit moves above the relative threshold', () => {
    const a = makeSnapshot([10, 8, 10], [0, 0, 0]);
    const b = makeSnapshot([12, 8, 10], [0, 0, 0]);
    expect(bimCameraSnapshotsMeaningfullyDiffer(a, b)).toBe(true);
  });

  it('returns false for sub-threshold fov changes', () => {
    const a = makeSnapshot([10, 8, 10], [0, 0, 0], 45);
    const b = makeSnapshot([10, 8, 10], [0, 0, 0], 45.001);
    expect(bimCameraSnapshotsMeaningfullyDiffer(a, b)).toBe(false);
  });
});

describe('createBimCameraHistory', () => {
  it('records a session when the camera changes', () => {
    const { camera, controls } = createMockCameraAndControls();
    const history = createBimCameraHistory({
      getCamera: () => camera,
      getControls: () => controls,
      getProjectionMode: () => 'perspective',
    });

    history.beginSession();
    camera.position.x += 2;
    history.commitSession();

    expect(history.pastCount).toBe(1);
    expect(history.canGoBack).toBe(true);
  });

  it('does not record when the camera does not change', () => {
    const { camera, controls } = createMockCameraAndControls();
    const history = createBimCameraHistory({
      getCamera: () => camera,
      getControls: () => controls,
      getProjectionMode: () => 'perspective',
    });

    history.beginSession();
    history.commitSession();

    expect(history.pastCount).toBe(0);
  });

  it('trims past entries to maxEntries', () => {
    const { camera, controls } = createMockCameraAndControls();
    const history = createBimCameraHistory({
      getCamera: () => camera,
      getControls: () => controls,
      getProjectionMode: () => 'perspective',
      maxEntries: 3,
    });

    for (let index = 0; index < 5; index += 1) {
      history.beginSession();
      camera.position.x += 1;
      history.commitSession();
    }

    expect(history.pastCount).toBe(3);
  });

  it('supports goBack and goForward', () => {
    const { camera, controls } = createMockCameraAndControls();
    const history = createBimCameraHistory({
      getCamera: () => camera,
      getControls: () => controls,
      getProjectionMode: () => 'perspective',
    });

    const startX = camera.position.x;
    history.beginSession();
    camera.position.x += 5;
    history.commitSession();

    const backTarget = history.goBack();
    expect(backTarget?.camera.position[0]).toBeCloseTo(startX, 4);
    expect(history.canGoForward).toBe(true);
    expect(history.pastCount).toBe(0);

    const forwardTarget = history.goForward();
    expect(forwardTarget?.camera.position[0]).toBeCloseTo(startX + 5, 4);
    expect(history.pastCount).toBe(1);
    expect(history.futureCount).toBe(0);
  });

  it('clears future when a new navigation is recorded after undo', () => {
    const { camera, controls } = createMockCameraAndControls();
    const history = createBimCameraHistory({
      getCamera: () => camera,
      getControls: () => controls,
      getProjectionMode: () => 'perspective',
    });

    history.beginSession();
    camera.position.x += 1;
    history.commitSession();

    history.goBack();
    expect(history.canGoForward).toBe(true);

    history.beginSession();
    camera.position.y += 1;
    history.commitSession();

    expect(history.canGoForward).toBe(false);
  });

  it('ignores commits while restoring', () => {
    const { camera, controls } = createMockCameraAndControls();
    const history = createBimCameraHistory({
      getCamera: () => camera,
      getControls: () => controls,
      getProjectionMode: () => 'perspective',
    });

    history.setRestoring(true);
    history.beginSession();
    camera.position.x += 3;
    history.commitSession();

    expect(history.pastCount).toBe(0);
  });

  it('settles wheel changes via handleControlsChange', () => {
    vi.useFakeTimers();
    const { camera, controls } = createMockCameraAndControls();
    const history = createBimCameraHistory({
      getCamera: () => camera,
      getControls: () => controls,
      getProjectionMode: () => 'perspective',
      settleMs: 750,
    });

    history.handleControlsChange();
    camera.position.z += 2;
    expect(history.pastCount).toBe(0);

    vi.advanceTimersByTime(750);
    expect(history.pastCount).toBe(1);

    vi.useRealTimers();
  });

  it('coalesces pointer drag and damping tail into one history entry', () => {
    vi.useFakeTimers();
    const { camera, controls } = createMockCameraAndControls();
    const history = createBimCameraHistory({
      getCamera: () => camera,
      getControls: () => controls,
      getProjectionMode: () => 'perspective',
      settleMs: 750,
    });

    history.handleControlsStart();
    camera.position.x += 5;
    history.handleControlsChange();
    history.handleControlsEnd();
    camera.position.x += 2;
    history.handleControlsChange();

    expect(history.pastCount).toBe(0);

    vi.advanceTimersByTime(750);
    expect(history.pastCount).toBe(1);

    vi.useRealTimers();
  });

  it('coalesces wheel bursts into one history entry', () => {
    vi.useFakeTimers();
    const { camera, controls } = createMockCameraAndControls();
    const history = createBimCameraHistory({
      getCamera: () => camera,
      getControls: () => controls,
      getProjectionMode: () => 'perspective',
      settleMs: 750,
    });

    history.handleControlsChange();
    camera.position.z += 1;
    vi.advanceTimersByTime(200);
    history.handleControlsChange();
    camera.position.z += 1;
    vi.advanceTimersByTime(200);
    history.handleControlsChange();
    camera.position.z += 1;

    expect(history.pastCount).toBe(0);

    vi.advanceTimersByTime(750);
    expect(history.pastCount).toBe(1);

    vi.useRealTimers();
  });

  it('records separate entries when wheel pauses longer than settleMs', () => {
    vi.useFakeTimers();
    const { camera, controls } = createMockCameraAndControls();
    const history = createBimCameraHistory({
      getCamera: () => camera,
      getControls: () => controls,
      getProjectionMode: () => 'perspective',
      settleMs: 750,
    });

    history.handleControlsChange();
    camera.position.z += 2;
    vi.advanceTimersByTime(750);
    expect(history.pastCount).toBe(1);

    history.handleControlsChange();
    camera.position.z += 2;
    vi.advanceTimersByTime(750);
    expect(history.pastCount).toBe(2);

    vi.useRealTimers();
  });

  it('does not record sub-threshold wiggle after settle', () => {
    vi.useFakeTimers();
    const { camera, controls } = createMockCameraAndControls();
    const history = createBimCameraHistory({
      getCamera: () => camera,
      getControls: () => controls,
      getProjectionMode: () => 'perspective',
      settleMs: 750,
    });

    const radius = orbitRadiusFromSnapshot(
      captureBimCameraHistorySnapshot(camera, controls, 'perspective'),
    );
    const delta = radius * 0.001;

    history.handleControlsChange();
    camera.position.x += delta;
    vi.advanceTimersByTime(750);

    expect(history.pastCount).toBe(0);

    vi.useRealTimers();
  });

  it('does not commit on pointer end before settle', () => {
    vi.useFakeTimers();
    const { camera, controls } = createMockCameraAndControls();
    const history = createBimCameraHistory({
      getCamera: () => camera,
      getControls: () => controls,
      getProjectionMode: () => 'perspective',
      settleMs: 750,
    });

    history.handleControlsStart();
    camera.position.x += 5;
    history.handleControlsChange();
    history.handleControlsEnd();

    expect(history.pastCount).toBe(0);

    vi.useRealTimers();
  });

  it('dispose clears history without throwing', () => {
    const { camera, controls } = createMockCameraAndControls();
    const history = createBimCameraHistory({
      getCamera: () => camera,
      getControls: () => controls,
      getProjectionMode: () => 'perspective',
    });

    history.beginSession();
    camera.position.x += 2;
    history.commitSession();
    expect(history.pastCount).toBe(1);

    expect(() => history.dispose()).not.toThrow();
    expect(history.pastCount).toBe(0);
    expect(history.canGoBack).toBe(false);
  });
});
