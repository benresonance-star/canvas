import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildGeometryEdgePairs,
  computeMeasurementMarkerRadius,
  computeSnapRadiusWorld,
  convertMeasurementDistance,
  createEdgeMeasurementRecord,
  createMeasurementRecord,
  formatMeasurementDistance,
  normalizeMeasureUnits,
  normalizeMeasurements,
  snapToEdge,
  snapToVertex,
} from '../measureSnap.js';

function makeTriangleMesh() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      0, 0, 0,
      2, 0, 0,
      0, 2, 0,
    ], 3),
  );
  geometry.setIndex([0, 1, 2]);
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
}

describe('measureSnap', () => {
  it('builds unique triangle edges', () => {
    const mesh = makeTriangleMesh();
    const pairs = buildGeometryEdgePairs(mesh.geometry);
    expect(pairs).toHaveLength(3);
    expect(pairs).toContainEqual([0, 1]);
    expect(pairs).toContainEqual([1, 2]);
    expect(pairs).toContainEqual([0, 2]);
  });

  it('snaps to the nearest vertex within radius', () => {
    const mesh = makeTriangleMesh();
    const hit = {
      point: new THREE.Vector3(0.05, 0.05, 0),
      object: mesh,
    };
    const snapped = snapToVertex(hit, { maxDistance: 0.2 });
    expect(snapped?.kind).toBe('vertex');
    expect(snapped?.position).toEqual([0, 0, 0]);
  });

  it('snaps to the nearest edge within radius', () => {
    const mesh = makeTriangleMesh();
    const pairs = buildGeometryEdgePairs(mesh.geometry);
    const hit = {
      point: new THREE.Vector3(1, 0.05, 0),
      object: mesh,
    };
    const snapped = snapToEdge(hit, pairs, { maxDistance: 0.2 });
    expect(snapped?.kind).toBe('edge');
    expect(snapped?.position[0]).toBeCloseTo(1, 5);
    expect(snapped?.position[1]).toBeCloseTo(0, 5);
    expect(snapped?.edgeStart).toEqual([0, 0, 0]);
    expect(snapped?.edgeEnd).toEqual([2, 0, 0]);
  });

  it('converts between unit systems via meters', () => {
    expect(convertMeasurementDistance(0.15, 'm', 'mm')).toBeCloseTo(150, 5);
    expect(convertMeasurementDistance(150, 'mm', 'cm')).toBeCloseTo(15, 5);
    expect(convertMeasurementDistance(1, 'm', 'ft')).toBeCloseTo(3.2808399, 4);
  });

  it('formats using model units then display units', () => {
    expect(formatMeasurementDistance(0.15, 'mm', 'm')).toBe('150.00 mm');
    expect(formatMeasurementDistance(0.15, 'cm', 'm')).toBe('15.00 cm');
    expect(formatMeasurementDistance(0.15, 'm', 'm')).toBe('0.15 m');
    expect(formatMeasurementDistance(459.09, 'cm', 'mm')).toBe('45.91 cm');
  });

  it('defaults display to cm when units omitted', () => {
    expect(normalizeMeasureUnits(undefined)).toBe('cm');
  });

  it('scales marker radius from model bounds', () => {
    const mesh = makeTriangleMesh();
    const root = new THREE.Group();
    root.add(mesh);
    const radius = computeMeasurementMarkerRadius(root);
    expect(radius).toBeGreaterThan(0);
    expect(radius).toBeLessThan(0.04);
  });

  it('creates a measurement record with distance', () => {
    const record = createMeasurementRecord(
      { position: [0, 0, 0] },
      { position: [3, 4, 0] },
      'vertex',
    );
    expect(record.distance).toBeCloseTo(5, 5);
    expect(record.snapMode).toBe('vertex');
    expect(record.id).toBeTruthy();
  });

  it('creates an edge measurement from the full edge segment', () => {
    const record = createEdgeMeasurementRecord({
      kind: 'edge',
      edgeStart: [0, 0, 0],
      edgeEnd: [2, 0, 0],
      position: [1, 0, 0],
      meshUuid: 'mesh-1',
    });
    expect(record?.snapMode).toBe('edge');
    expect(record?.distance).toBeCloseTo(2, 5);
    expect(record?.start.position).toEqual([0, 0, 0]);
    expect(record?.end.position).toEqual([2, 0, 0]);
  });

  it('normalizes persisted measurement records', () => {
    const valid = [{
      id: 'm1',
      snapMode: 'edge',
      start: { position: [0, 0, 0] },
      end: { position: [1, 0, 0] },
      distance: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
    }];
    expect(normalizeMeasurements(valid)).toHaveLength(1);
    expect(normalizeMeasurements([{ id: 'bad' }])).toHaveLength(0);
  });

  it('scales snap radius with camera distance', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.updateProjectionMatrix();
    const near = computeSnapRadiusWorld(camera, 5, 800);
    const far = computeSnapRadiusWorld(camera, 20, 800);
    expect(far).toBeGreaterThan(near);
  });
});
