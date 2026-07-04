import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBimMeasurementController } from '../bimMeasurementController.js';
import { pickBimMeasurementSnap } from '../bimMeasurementPick.js';

vi.mock('../bimMeasurementPick.js', () => ({
  pickBimMeasurementSnap: vi.fn(),
}));

function createMockCanvas(width = 200, height = 200) {
  const listeners = new Map();
  return {
    style: {},
    clientWidth: width,
    clientHeight: height,
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent: (event) => {
      listeners.get(event.type)?.forEach((handler) => handler(event));
      return true;
    },
  };
}

function createVisibleBoxRoot() {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  const root = new THREE.Group();
  root.add(mesh);
  root.updateWorldMatrix(true, true);
  return root;
}

describe('createBimMeasurementController', () => {
  beforeEach(() => {
    vi.mocked(pickBimMeasurementSnap).mockReset();
  });

  it('activates and deactivates pointer listeners', () => {
    const canvas = createMockCanvas();
    const addSpy = vi.spyOn(canvas, 'addEventListener');
    const removeSpy = vi.spyOn(canvas, 'removeEventListener');
    const controller = createBimMeasurementController({
      canvas,
      getCamera: () => null,
      getModelRoot: () => null,
    });

    controller.setActive(true);
    expect(addSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(canvas.style.cursor).toBe('crosshair');

    controller.setActive(false);
    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(canvas.style.cursor).toBe('');
  });

  it('creates a vertex measurement after two center clicks', async () => {
    vi.mocked(pickBimMeasurementSnap)
      .mockResolvedValueOnce({ kind: 'vertex', position: [0, 0, 0], meshUuid: 'mesh-1' })
      .mockResolvedValueOnce({ kind: 'vertex', position: [2, 0, 0], meshUuid: 'mesh-1' });

    const canvas = createMockCanvas();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const modelRoot = createVisibleBoxRoot();
    const completed = [];

    const controller = createBimMeasurementController({
      canvas,
      getCamera: () => camera,
      getModelRoot: () => modelRoot,
      snapMode: 'vertex',
      onComplete: (record) => completed.push(record),
    });

    controller.setActive(true);

    canvas.dispatchEvent({
      type: 'pointerdown',
      clientX: 100,
      clientY: 100,
      button: 0,
      preventDefault: () => {},
      stopPropagation: () => {},
    });
    await Promise.resolve();
    canvas.dispatchEvent({
      type: 'pointerdown',
      clientX: 120,
      clientY: 120,
      button: 0,
      preventDefault: () => {},
      stopPropagation: () => {},
    });
    await Promise.resolve();

    expect(completed).toHaveLength(1);
    expect(completed[0].kind).toBe('segment');
    expect(completed[0].snapMode).toBe('vertex');
    expect(Number.isFinite(completed[0].distance)).toBe(true);
  });

  it('creates a polyline after multiple clicks and finishPolyline', async () => {
    vi.mocked(pickBimMeasurementSnap)
      .mockResolvedValueOnce({ kind: 'vertex', position: [0, 0, 0], meshUuid: 'mesh-1' })
      .mockResolvedValueOnce({ kind: 'vertex', position: [2, 0, 0], meshUuid: 'mesh-1' })
      .mockResolvedValueOnce({ kind: 'vertex', position: [2, 2, 0], meshUuid: 'mesh-1' });

    const canvas = createMockCanvas();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const modelRoot = createVisibleBoxRoot();
    const completed = [];

    const controller = createBimMeasurementController({
      canvas,
      getCamera: () => camera,
      getModelRoot: () => modelRoot,
      snapMode: 'vertex',
      measureKind: 'polyline',
      onComplete: (record) => completed.push(record),
    });

    controller.setActive(true);

    for (const coords of [[100, 100], [120, 100], [120, 120]]) {
      canvas.dispatchEvent({
        type: 'pointerdown',
        clientX: coords[0],
        clientY: coords[1],
        button: 0,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
      await Promise.resolve();
    }

    expect(completed).toHaveLength(0);
    expect(controller.getVisualState().draftPoints).toHaveLength(3);

    controller.finishPolyline(false);
    expect(completed).toHaveLength(1);
    expect(completed[0].kind).toBe('polyline');
    expect(completed[0].points).toHaveLength(3);
    expect(completed[0].area).toBeNull();

    completed.length = 0;
    controller.setActive(true);
    vi.mocked(pickBimMeasurementSnap)
      .mockResolvedValueOnce({ kind: 'vertex', position: [0, 0, 0], meshUuid: 'mesh-1' })
      .mockResolvedValueOnce({ kind: 'vertex', position: [3, 0, 0], meshUuid: 'mesh-1' })
      .mockResolvedValueOnce({ kind: 'vertex', position: [3, 4, 0], meshUuid: 'mesh-1' })
      .mockResolvedValueOnce({ kind: 'vertex', position: [0, 0, 0], meshUuid: 'mesh-1' });

    for (const coords of [[100, 100], [120, 100], [120, 120], [100, 100]]) {
      canvas.dispatchEvent({
        type: 'pointerdown',
        clientX: coords[0],
        clientY: coords[1],
        button: 0,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
      await Promise.resolve();
    }

    expect(completed).toHaveLength(1);
    expect(completed[0].closed).toBe(true);
    expect(completed[0].area).toBeCloseTo(6, 5);
  });

  it('clears draft state on cancelDraft', () => {
    const canvas = createMockCanvas();
    const onDraftChange = vi.fn();
    const controller = createBimMeasurementController({
      canvas,
      getCamera: () => null,
      getModelRoot: () => null,
      onDraftChange,
    });

    controller.setActive(true);
    controller.cancelDraft();

    expect(controller.getVisualState().draftStart).toBeNull();
    expect(onDraftChange).toHaveBeenCalledWith(false);
  });
});
