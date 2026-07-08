import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createModelBoundingBoxEdges,
  disposeModelBoundingBoxEdges,
  syncModelBoundingBoxEdges,
} from '../bimBoundingBoxOverlay.js';

describe('bimBoundingBoxOverlay', () => {
  it('creates line segments sized to viewport bounds', () => {
    const lines = createModelBoundingBoxEdges({
      min: { x: -2, y: 0, z: -4 },
      max: { x: 6, y: 10, z: 2 },
    });
    expect(lines).toBeTruthy();
    expect(lines.position.x).toBe(2);
    expect(lines.position.y).toBe(5);
    expect(lines.position.z).toBe(-1);
    disposeModelBoundingBoxEdges(lines);
  });

  it('syncs edges into the overlay scene', () => {
    const overlayScene = new THREE.Scene();
    const bounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 4, y: 8, z: 2 },
    };
    const lines = syncModelBoundingBoxEdges(null, bounds, overlayScene);
    expect(lines).toBeTruthy();
    expect(overlayScene.children).toHaveLength(1);
    const next = syncModelBoundingBoxEdges(lines, {
      min: { x: -1, y: -1, z: -1 },
      max: { x: 1, y: 1, z: 1 },
    }, overlayScene);
    expect(next).toBeTruthy();
    expect(overlayScene.children).toHaveLength(1);
    disposeModelBoundingBoxEdges(next);
  });
});
