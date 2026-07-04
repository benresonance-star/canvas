import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { fragmentsResultToSnap } from '../bimMeasurementPick.js';

describe('fragmentsResultToSnap', () => {
  it('maps a point snap from a fragments raycast result', () => {
    const snap = fragmentsResultToSnap({
      point: new THREE.Vector3(1, 2, 3),
      object: { uuid: 'mesh-1' },
    }, 'vertex');

    expect(snap).toEqual({
      kind: 'vertex',
      position: [1, 2, 3],
      meshUuid: 'mesh-1',
    });
  });

  it('maps edge endpoints when fragments returns snapped edge data', () => {
    const snap = fragmentsResultToSnap({
      point: new THREE.Vector3(0, 0, 0),
      snappedEdgeP1: new THREE.Vector3(0, 0, 0),
      snappedEdgeP2: new THREE.Vector3(4, 0, 0),
      object: { uuid: 'mesh-2' },
    }, 'edge');

    expect(snap).toMatchObject({
      kind: 'edge',
      position: [0, 0, 0],
      edgeStart: [0, 0, 0],
      edgeEnd: [4, 0, 0],
      meshUuid: 'mesh-2',
    });
  });
});
