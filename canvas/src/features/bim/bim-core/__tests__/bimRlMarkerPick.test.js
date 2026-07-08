import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pickRlMarkerFromOverlay } from '../bimRlMarkerPick.js';

describe('pickRlMarkerFromOverlay', () => {
  it('returns the nearest RL marker pick metadata under the pointer', () => {
    const group = new THREE.Group();
    const geometry = new THREE.SphereGeometry(0.2, 8, 8);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 2, 0);
    mesh.userData.bimRlPick = { kind: 'rl', id: 'rl-1' };
    group.add(mesh);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 2, 5);
    camera.lookAt(0, 2, 0);
    camera.updateMatrixWorld(true);
    group.updateMatrixWorld(true);

    const canvas = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 200,
        height: 200,
        right: 200,
        bottom: 200,
      }),
    };

    const pick = pickRlMarkerFromOverlay(group, {
      raycaster: new THREE.Raycaster(),
      camera,
      canvas,
      clientX: 100,
      clientY: 100,
    });

    expect(pick).toEqual({ kind: 'rl', id: 'rl-1' });
  });
});
