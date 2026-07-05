import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildSectionGeometriesFromModelSection,
  buildViewportBoundsFromBox3,
  createSectionOverlayGroup,
  estimateStoreyPlaneHeights,
  flipPrimaryPlaneNormal,
  getPrimaryPlaneHeight,
  normalizeBimSectionState,
  offsetGeometryAlongNormal,
  patchPrimaryPlaneHeight,
  patchSectionStyle,
  planeDefinitionToThreePlane,
  sectionHeightRangeFromBounds,
  sectionPlanesToThreePlanes,
} from '../bimSectioning.js';
import {
  SECTION_EDGE_COLOR_DEFAULT,
  SECTION_EDGE_LINE_WEIGHT_DEFAULT,
  SECTION_FILL_COLOR_DEFAULT,
  SECTION_STOREY_PLANE_OFFSET,
} from '../bimSectioning.js';

describe('bimSectioning', () => {
  it('normalizes section defaults and clamps edge weight', () => {
    const normalized = normalizeBimSectionState({
      enabled: true,
      edgeLineWeight: 99,
      fillColor: 'bad',
      edgeColor: '#112233',
    }, { defaultPlaneY: 4.5 });

    expect(normalized.enabled).toBe(true);
    expect(normalized.showFills).toBe(true);
    expect(normalized.showEdges).toBe(true);
    expect(normalized.fillColor).toBe(SECTION_FILL_COLOR_DEFAULT);
    expect(normalized.edgeColor).toBe('#112233');
    expect(normalized.edgeLineWeight).toBeLessThanOrEqual(6);
    expect(normalized.planes[0].point[1]).toBe(4.5);
  });

  it('converts plane definitions to THREE.Plane instances', () => {
    const [plane] = sectionPlanesToThreePlanes({
      enabled: true,
      planes: [{ normal: [0, -1, 0], point: [0, 2, 0], enabled: true }],
    });
    expect(plane).toBeInstanceOf(THREE.Plane);
    expect(planeDefinitionToThreePlane({ normal: [0, 1, 0], point: [0, 2, 0] }).normal.y).toBeCloseTo(1);
  });

  it('returns no planes when section is disabled', () => {
    expect(sectionPlanesToThreePlanes({ enabled: false })).toEqual([]);
  });

  it('patches primary plane height using model bounds center on xz', () => {
    const base = normalizeBimSectionState({ enabled: true }, { defaultPlaneY: 1 });
    const raised = patchPrimaryPlaneHeight(base, 6.25, {
      center: { x: 12, y: 5, z: -3 },
    });
    expect(raised.planes[0].point).toEqual([12, 6.25, -3]);
  });

  it('flips primary plane direction', () => {
    const base = normalizeBimSectionState({ enabled: true }, { defaultPlaneY: 1 });
    const flipped = flipPrimaryPlaneNormal(base);
    expect(flipped.planes[0].normal[1]).toBeGreaterThan(0);
  });

  it('derives height range from model bounding box', () => {
    const range = sectionHeightRangeFromBounds({
      radius: 10,
      center: { x: 0, y: 5, z: 0 },
      min: { x: -4, y: 1.2, z: -6 },
      max: { x: 4, y: 18.6, z: 6 },
    });
    expect(range.min).toBe(1.2);
    expect(range.max).toBe(18.6);
    expect(range.defaultY).toBeCloseTo(9.9);
  });

  it('builds viewport bounds from a THREE.Box3', () => {
    const box = new THREE.Box3(
      new THREE.Vector3(-2, 3, -1),
      new THREE.Vector3(2, 9, 1),
    );
    const bounds = buildViewportBoundsFromBox3(box);
    expect(bounds.min.y).toBe(3);
    expect(bounds.max.y).toBe(9);
    expect(bounds.center.y).toBeCloseTo(6);
  });

  it('offsets section geometry along the plane normal', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0]), 3));
    const offset = offsetGeometryAlongNormal(
      geometry,
      new THREE.Vector3(0, 1, 0),
      0.5,
    );
    const positions = offset.getAttribute('position').array;
    expect(positions[1]).toBeCloseTo(0.5);
    expect(positions[4]).toBeCloseTo(0.5);
  });

  it('builds fill and edge geometries from ModelSection payload', () => {
    const buffer = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      1, 1, 0,
    ]);
    const { fillGeometry, edgeGeometry } = buildSectionGeometriesFromModelSection({
      buffer,
      index: 4,
      fillsIndices: [0, 1, 2, 1, 3, 2],
    });
    expect(fillGeometry?.getAttribute('position')?.count).toBe(4);
    expect(edgeGeometry?.getIndex()?.count).toBe(4);
  });

  it('accepts typed-array fill indices from the fragments worker', () => {
    const buffer = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]);
    const { fillGeometry } = buildSectionGeometriesFromModelSection({
      buffer,
      index: 3,
      fillsIndices: new Uint32Array([0, 1, 2]),
    });
    expect(fillGeometry?.getIndex()?.count).toBe(3);
  });

  it('patches section style fields', () => {
    const styled = patchSectionStyle({}, {
      fillColor: '#abcdef',
      edgeColor: '#010101',
      edgeLineWeight: SECTION_EDGE_LINE_WEIGHT_DEFAULT,
    });
    expect(styled.fillColor).toBe('#abcdef');
    expect(styled.edgeColor).toBe('#010101');
  });

  it('creates section fill meshes with DoubleSide material for cut faces', () => {
    const buffer = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      1, 1, 0,
    ]);
    const { fillGeometry } = buildSectionGeometriesFromModelSection({
      buffer,
      index: 4,
      fillsIndices: [0, 1, 2, 1, 3, 2],
    });
    const group = createSectionOverlayGroup(
      { fillGeometry, edgeGeometry: null },
      { enabled: true, showFills: true, fillColor: '#336699' },
    );
    const fillMesh = group.children.find((child) => child.name === 'bim-section-fill');
    expect(fillMesh?.material?.side).toBe(THREE.DoubleSide);
    expect(fillMesh?.material?.depthTest).toBe(false);
  });

  it('places storey presets at IFC elevation plus 1 m', () => {
    const preparedModel = {
      elements: [
        { id: 'ifc:s1', ifcClass: 'IfcBuildingStorey', name: 'Ground Floor' },
        { id: 'ifc:s2', ifcClass: 'IfcBuildingStorey', name: 'Level 01' },
      ],
      properties: [
        { elementId: 'ifc:s1', propertyName: 'Elevation', value: 0 },
        { elementId: 'ifc:s2', propertyName: 'Elevation', value: 3.2 },
      ],
    };
    const presets = estimateStoreyPlaneHeights(
      preparedModel,
      { min: { y: 0 }, max: { y: 10 } },
      [
        { id: 'Ground Floor', label: 'Ground Floor', count: 10 },
        { id: 'Level 01', label: 'Level 01', count: 5 },
      ],
    );
    expect(presets.find((preset) => preset.id === 'Ground Floor')?.y)
      .toBeCloseTo(SECTION_STOREY_PLANE_OFFSET);
    expect(presets.find((preset) => preset.id === 'Level 01')?.y)
      .toBeCloseTo(3.2 + SECTION_STOREY_PLANE_OFFSET);
  });

  it('falls back to even bounds spacing when storey elevations are unavailable', () => {
    const presets = estimateStoreyPlaneHeights(null, {
      min: { y: 0 },
      max: { y: 10 },
      center: { y: 5 },
      radius: 5,
    }, [
      { id: 'A', label: 'A', count: 1 },
      { id: 'B', label: 'B', count: 1 },
    ]);
    expect(presets[0].y).toBeCloseTo(2.5);
    expect(presets[1].y).toBeCloseTo(7.5);
  });
});
