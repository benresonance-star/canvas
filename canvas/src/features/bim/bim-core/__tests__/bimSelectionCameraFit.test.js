import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  expandBox3FromItemsGeometry,
  fitCameraToSelectionBox,
} from '../bimSelectionCameraFit.js';

describe('bimSelectionCameraFit', () => {
  it('expands a world-space box from fragment mesh data', () => {
    const box = expandBox3FromItemsGeometry([[
      {
        positions: new Float32Array([
          0, 0, 0,
          2, 0, 0,
          0, 2, 0,
        ]),
        indices: new Uint32Array([0, 1, 2]),
        transform: {
          elements: new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            5, 0, 0, 1,
          ]),
        },
      },
    ]]);

    expect(box.isEmpty()).toBe(false);
    expect(box.min.x).toBeCloseTo(5);
    expect(box.max.x).toBeCloseTo(7);
    expect(box.max.y).toBeCloseTo(2);
  });

  it('frames a selection box from the current camera view', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(10, 8, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const controls = {
      target: new THREE.Vector3(0, 0, 0),
      update: () => {},
    };

    const box = new THREE.Box3(
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(1, 1, 1),
    );

    const fitted = fitCameraToSelectionBox(camera, controls, box, {
      margin: 1.35,
      viewportAspect: 1,
    });

    expect(fitted).toBe(true);
    expect(controls.target.x).toBeCloseTo(0, 5);
    expect(controls.target.y).toBeCloseTo(0, 5);
    expect(controls.target.z).toBeCloseTo(0, 5);
    expect(camera.position.distanceTo(controls.target)).toBeGreaterThan(2);
  });
});
