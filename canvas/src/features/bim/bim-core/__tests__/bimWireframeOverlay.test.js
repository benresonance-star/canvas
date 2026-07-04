import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  attachWireframeEdges,
  attachWireframeEdgesToScene,
  ensureWireframeEdgesAttached,
  buildWireframeEdges,
  buildWireframeEdgesFromFragmentsModel,
  bufferGeometryFromMeshData,
  canBuildEdgesFromGeometry,
  createWireframeDepthMaterial,
  disposeWireframeEdges,
  edgesFromMeshData,
  renderWireframeHiddenLines,
  renderWireframeOverlay,
  WIREFRAME_DEFAULT_THRESHOLD_ANGLE,
  WIREFRAME_DEPTH_MATERIAL,
  WIREFRAME_EDGE_LAYER,
  WIREFRAME_LINE_WIDTH_PX,
  WIREFRAME_OVERLAY_DEPTH_TEST,
  getWireframeLineWidthForDistance,
} from '../bimWireframeOverlay.js';

describe('bimWireframeOverlay', () => {
  it('exports a depth-writing invisible highlight material', () => {
    expect(WIREFRAME_DEPTH_MATERIAL.opacity).toBe(0);
    expect(WIREFRAME_DEPTH_MATERIAL.transparent).toBe(true);
    expect(WIREFRAME_DEPTH_MATERIAL.depthWrite).toBe(true);
    expect(WIREFRAME_DEPTH_MATERIAL.depthTest).toBe(true);
  });

  it('returns null for an empty model root', () => {
    expect(buildWireframeEdges(null)).toBeNull();
    expect(buildWireframeEdges(new THREE.Group())).toBeNull();
  });

  it('rejects invalid geometry before EdgesGeometry runs', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex([0, 1, 2]);
    expect(canBuildEdgesFromGeometry(geometry)).toBe(false);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    expect(buildWireframeEdges(root)).toBeNull();
  });

  it('skips line and edge helper meshes while traversing', () => {
    const root = new THREE.Group();
    root.add(new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()));
    root.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial()));
    expect(buildWireframeEdges(root)).toBeNull();
  });

  it('builds merged feature edges for a cube mesh', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    root.add(mesh);

    const lines = buildWireframeEdges(root, { thresholdAngle: WIREFRAME_DEFAULT_THRESHOLD_ANGLE });
    expect(lines).toBeTruthy();
    expect(lines.isLineSegments2).toBe(true);
    expect(lines.geometry.attributes.instanceStart.count).toBe(12);
    expect(lines.material.linewidth).toBe(WIREFRAME_LINE_WIDTH_PX);

    disposeWireframeEdges(lines);
    expect(lines.parent).toBeNull();
  });

  it('copies mesh data buffers and attaches edges under the model root', () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const position = box.getAttribute('position');
    const index = box.getIndex();
    const meshData = {
      positions: position.array.slice(),
      indices: Array.from(index.array),
      transform: new THREE.Matrix4().makeTranslation(2, 0, 0),
    };
    box.dispose();

    const geometry = bufferGeometryFromMeshData(meshData);
    expect(geometry).toBeTruthy();
    expect(geometry.getAttribute('position').array).not.toBe(meshData.positions);

    const edges = edgesFromMeshData(meshData);
    expect(edges?.getAttribute('position')?.count).toBe(24);

    const modelRoot = new THREE.Group();
    const cubeRoot = new THREE.Group();
    cubeRoot.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    const lines = buildWireframeEdges(cubeRoot);
    attachWireframeEdges(modelRoot, lines);
    expect(lines?.parent).toBe(modelRoot);
    disposeWireframeEdges(lines);
    edges?.dispose();
  });

  it('applies worker-deserialized transform elements', () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const position = box.getAttribute('position');
    const index = box.getIndex();
    const meshData = {
      positions: position.array.slice(),
      indices: Array.from(index.array),
      transform: { elements: new THREE.Matrix4().makeTranslation(5, 0, 0).toArray() },
    };
    box.dispose();

    const edges = edgesFromMeshData(meshData);
    expect(edges?.getAttribute('position')?.count).toBe(24);
    expect(edges.getAttribute('position').getX(0)).toBeCloseTo(4.5, 4);
    edges?.dispose();
  });

  it('builds wireframe edges from a fragments model API', async () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const position = box.getAttribute('position');
    const index = box.getIndex();
    const meshData = {
      positions: position.array.slice(),
      indices: Array.from(index.array),
      transform: new THREE.Matrix4(),
    };
    box.dispose();

    const model = {
      getLocalIds: vi.fn(async () => [1, 2]),
      getItemsGeometry: vi.fn(async (localIds) => localIds.map(() => [meshData])),
    };

    const lines = await buildWireframeEdgesFromFragmentsModel(model, [1, 2]);
    expect(model.getItemsGeometry).toHaveBeenCalled();
    expect(lines?.geometry.attributes.instanceStart?.count).toBeGreaterThan(0);
    expect(lines?.layers.mask).toBe(1);
    disposeWireframeEdges(lines);
  });

  it('scales overlay line width up as the camera moves away', () => {
    expect(getWireframeLineWidthForDistance(10, 10, 2)).toBe(2);
    expect(getWireframeLineWidthForDistance(80, 10, 2)).toBeGreaterThan(2);
  });

  it('uses depth-tested overlay lines so solids stay visible underneath', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    ));
    const lines = buildWireframeEdges(root);
    expect(lines.material.depthTest).toBe(WIREFRAME_OVERLAY_DEPTH_TEST);
    expect(lines.material.depthWrite).toBe(false);
    expect(lines.material.opacity).toBeLessThan(1);
    disposeWireframeEdges(lines);
  });

  it('composites wireframe edges over an existing scene render', () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#171412');
    const overlayScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 5;
    const renderer = {
      autoClear: true,
      render: vi.fn(),
      getDrawingBufferSize: vi.fn(() => ({ x: 1280, y: 720 })),
    };
    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    ));
    const edges = buildWireframeEdges(root);
    scene.add(root);

    attachWireframeEdgesToScene(overlayScene, root, edges);

    expect(renderWireframeOverlay(renderer, scene, overlayScene, camera, edges)).toBe(true);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(renderer.render).toHaveBeenNthCalledWith(1, scene, camera);
    expect(renderer.render).toHaveBeenNthCalledWith(2, overlayScene, camera);
    expect(renderer.autoClear).toBe(true);

    disposeWireframeEdges(edges);
  });

  it('guards hidden-line rendering when inputs are missing', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const edges = buildWireframeEdges(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    ));
    expect(renderWireframeHiddenLines(null, scene, camera, {
      wireframeEdges: edges,
    })).toBe(false);
    disposeWireframeEdges(edges);
  });

  it('reattaches wireframe edges to the overlay scene after fragments drops them', () => {
    const overlayScene = new THREE.Scene();
    const modelRoot = new THREE.Group();
    modelRoot.position.set(3, 0, 0);

    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    ));
    const lines = buildWireframeEdges(root);
    attachWireframeEdgesToScene(overlayScene, modelRoot, lines);
    expect(lines.parent).toBe(overlayScene);
    expect(lines.matrix.elements[12]).toBeCloseTo(3, 4);

    lines.removeFromParent();
    expect(lines.parent).toBeNull();

    ensureWireframeEdgesAttached(overlayScene, modelRoot, lines);
    expect(lines.parent).toBe(overlayScene);
    expect(lines.matrix.elements[12]).toBeCloseTo(3, 4);

    disposeWireframeEdges(lines);
  });

  it('disposes edge geometry and materials safely', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    ));
    const lines = buildWireframeEdges(root);

    disposeWireframeEdges(lines);
    expect(() => disposeWireframeEdges(null)).not.toThrow();
  });
});
