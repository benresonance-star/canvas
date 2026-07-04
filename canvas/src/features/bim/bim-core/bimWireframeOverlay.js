import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { RenderedFaces } from '@thatopen/fragments';

export const WIREFRAME_EDGE_COLOR = 0x0f172a;
export const WIREFRAME_SCENE_BACKGROUND = '#1e1b18';
export const WIREFRAME_DEFAULT_THRESHOLD_ANGLE = 40;
export const WIREFRAME_GEOMETRY_BATCH_SIZE = 100;
export const WIREFRAME_EDGE_LAYER = 1;
export const WIREFRAME_LINE_WIDTH_PX = 2;
export const WIREFRAME_LINE_OPACITY = 0.88;
export const WIREFRAME_OVERLAY_DEPTH_TEST = false;

export const WIREFRAME_DEPTH_MATERIAL = {
  color: new THREE.Color('#ffffff'),
  renderedFaces: RenderedFaces.TWO,
  opacity: 0,
  transparent: true,
  depthWrite: true,
  depthTest: true,
  customId: 'canvas-bim-wireframe-depth',
};

function isWireframeSourceMesh(child) {
  return Boolean(
    child?.isMesh
    && child.geometry?.isBufferGeometry
    && !child.geometry?.isEdgesGeometry
    && !child.geometry?.isWireframeGeometry
  );
}

export function canBuildEdgesFromGeometry(geometry) {
  if (!geometry?.isBufferGeometry) return false;
  const position = geometry.getAttribute('position');
  if (!position?.array || position.count < 3) return false;

  const index = geometry.getIndex();
  if (!index) return true;
  if (!index.array || index.count < 3 || index.count % 3 !== 0) return false;

  let maxIndex = 0;
  for (let i = 0; i < index.count; i += 1) {
    const value = index.getX(i);
    if (!Number.isFinite(value) || value < 0) return false;
    maxIndex = Math.max(maxIndex, value);
  }
  return maxIndex < position.count;
}

function createEdgesGeometrySafely(geometry, thresholdAngle) {
  if (!canBuildEdgesFromGeometry(geometry)) return null;
  try {
    const edgesGeometry = new THREE.EdgesGeometry(geometry, thresholdAngle);
    if (!edgesGeometry.getAttribute('position')?.count) {
      edgesGeometry.dispose();
      return null;
    }
    return edgesGeometry;
  } catch {
    return null;
  }
}

function copyNumericArray(values) {
  if (!values?.length) return null;
  return values instanceof Float32Array ? new Float32Array(values) : Float32Array.from(values);
}

function resolveMeshDataTransform(transform) {
  if (!transform) return null;
  if (transform.isMatrix4) return transform.clone();
  const elements = transform.elements;
  if (Array.isArray(elements) || elements instanceof Float32Array) {
    const matrix = new THREE.Matrix4();
    matrix.fromArray(elements);
    return matrix;
  }
  if (Array.isArray(transform) || transform instanceof Float32Array) {
    const matrix = new THREE.Matrix4();
    matrix.fromArray(transform);
    return matrix;
  }
  return null;
}

function normalizeMeshData(meshData) {
  if (!meshData || typeof meshData !== 'object') return null;
  const positions = copyNumericArray(meshData.positions);
  if (!positions?.length) return null;
  const indices = copyNumericArray(meshData.indices);
  const transform = resolveMeshDataTransform(meshData.transform);
  return {
    positions,
    indices: indices?.length ? indices : undefined,
    transform,
  };
}

function normalizeGeometryGroups(geometryGroups) {
  if (!geometryGroups) return [];
  if (Array.isArray(geometryGroups)) {
    return geometryGroups.map((group) => (Array.isArray(group) ? group : [group]));
  }
  if (typeof geometryGroups === 'object') {
    return Object.values(geometryGroups).map((group) => (Array.isArray(group) ? group : [group]));
  }
  return [];
}

export function bufferGeometryFromMeshData(meshData) {
  const normalized = normalizeMeshData(meshData);
  if (!normalized) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(normalized.positions, 3));
  if (normalized.indices?.length) {
    geometry.setIndex(Array.from(normalized.indices));
  }
  return canBuildEdgesFromGeometry(geometry) ? geometry : null;
}

export function edgesFromMeshData(meshData, thresholdAngle = WIREFRAME_DEFAULT_THRESHOLD_ANGLE) {
  const normalized = normalizeMeshData(meshData);
  if (!normalized) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(normalized.positions, 3));
  if (normalized.indices?.length) {
    geometry.setIndex(Array.from(normalized.indices));
  }
  if (!canBuildEdgesFromGeometry(geometry)) {
    geometry.dispose();
    return null;
  }

  const edgesGeometry = createEdgesGeometrySafely(geometry, thresholdAngle);
  geometry.dispose();
  if (!edgesGeometry) return null;
  if (normalized.transform) {
    edgesGeometry.applyMatrix4(normalized.transform);
  }
  return edgesGeometry;
}

function mergeEdgeGeometries(edgeGeometries) {
  if (edgeGeometries.length === 0) return null;
  if (edgeGeometries.length === 1) return edgeGeometries[0];

  const merged = new THREE.BufferGeometry();
  const positions = [];
  edgeGeometries.forEach((geometry) => {
    const position = geometry.getAttribute('position');
    if (!position) return;
    for (let index = 0; index < position.count; index += 1) {
      positions.push(position.getX(index), position.getY(index), position.getZ(index));
    }
    geometry.dispose();
  });
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return merged;
}

function edgePositionsArray(mergedGeometry) {
  const position = mergedGeometry?.getAttribute('position');
  if (!position?.count) return null;
  const positions = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    positions[index * 3] = position.getX(index);
    positions[index * 3 + 1] = position.getY(index);
    positions[index * 3 + 2] = position.getZ(index);
  }
  return positions;
}

function createLineSegmentsFromEdgeGeometries(edgeGeometries, options = {}) {
  const mergedGeometry = mergeEdgeGeometries(edgeGeometries);
  const positions = edgePositionsArray(mergedGeometry);
  mergedGeometry?.dispose();
  if (!positions?.length) return null;

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);

  const material = new LineMaterial({
    color: options.color ?? WIREFRAME_EDGE_COLOR,
    linewidth: options.linewidth ?? WIREFRAME_LINE_WIDTH_PX,
    worldUnits: false,
    transparent: true,
    opacity: options.opacity ?? WIREFRAME_LINE_OPACITY,
    depthTest: options.depthTest ?? WIREFRAME_OVERLAY_DEPTH_TEST,
    depthWrite: false,
  });
  material.resolution.set(
    Math.max(1, options.resolutionWidth ?? 1),
    Math.max(1, options.resolutionHeight ?? 1),
  );

  const lines = new LineSegments2(geometry, material);
  lines.name = 'bim-wireframe-edges';
  lines.renderOrder = 100;
  lines.frustumCulled = false;
  lines.matrixAutoUpdate = false;
  return lines;
}

export function getWireframeLineWidthForDistance(distance, modelRadius, baseWidth = WIREFRAME_LINE_WIDTH_PX) {
  const radius = Math.max(modelRadius, 1);
  const normalized = distance / radius;
  if (normalized <= 1.2) return baseWidth;
  if (normalized >= 8) return baseWidth * 2.75;
  const t = (normalized - 1.2) / (8 - 1.2);
  return baseWidth * (1 + t * 1.75);
}

export function updateWireframeEdgeResolution(lines, width, height) {
  updateWireframeEdgeVisuals(lines, { width, height });
}

export function updateWireframeEdgeVisuals(lines, {
  width,
  height,
  cameraDistance,
  modelRadius,
  lineWeight,
  opacity,
  color,
} = {}) {
  const material = lines?.material;
  if (!material) return;
  if (Number.isFinite(width) && Number.isFinite(height)) {
    material.resolution.set(Math.max(1, width), Math.max(1, height));
  }
  const baseWidth = Number.isFinite(lineWeight) ? lineWeight : WIREFRAME_LINE_WIDTH_PX;
  if (Number.isFinite(cameraDistance) && Number.isFinite(modelRadius)) {
    material.linewidth = getWireframeLineWidthForDistance(cameraDistance, modelRadius, baseWidth);
  } else {
    material.linewidth = baseWidth;
  }
  if (Number.isFinite(opacity)) {
    material.opacity = opacity;
    material.transparent = opacity < 1;
  }
  if (color) {
    material.color.set(color);
  }
}

export function buildWireframeEdges(modelRoot, options = {}) {
  if (!modelRoot) return null;

  const thresholdAngle = Number.isFinite(options.thresholdAngle)
    ? options.thresholdAngle
    : WIREFRAME_DEFAULT_THRESHOLD_ANGLE;
  const edgeGeometries = [];

  modelRoot.updateMatrixWorld(true);
  modelRoot.traverse((child) => {
    if (!isWireframeSourceMesh(child)) return;
    const edgesGeometry = createEdgesGeometrySafely(child.geometry, thresholdAngle);
    if (!edgesGeometry) return;
    child.updateWorldMatrix(true, false);
    edgesGeometry.applyMatrix4(child.matrixWorld);
    edgeGeometries.push(edgesGeometry);
  });

  return createLineSegmentsFromEdgeGeometries(edgeGeometries, options);
}

export async function buildWireframeEdgesFromFragmentsModel(model, localIds = [], options = {}) {
  if (!model || typeof model.getItemsGeometry !== 'function') return null;

  let ids = Array.isArray(localIds) && localIds.length > 0
    ? localIds
    : null;
  if (!ids?.length) {
    if (typeof model.getItemsIdsWithGeometry === 'function') {
      ids = await model.getItemsIdsWithGeometry();
    } else if (typeof model.getLocalIds === 'function') {
      ids = await model.getLocalIds();
    }
  }
  if (!ids?.length) return null;

  const batchSize = Number.isFinite(options.batchSize)
    ? options.batchSize
    : WIREFRAME_GEOMETRY_BATCH_SIZE;
  const thresholdAngle = Number.isFinite(options.thresholdAngle)
    ? options.thresholdAngle
    : WIREFRAME_DEFAULT_THRESHOLD_ANGLE;
  const edgeGeometries = [];

  for (let index = 0; index < ids.length; index += batchSize) {
    const batch = ids.slice(index, index + batchSize);
    let geometryGroups;
    try {
      geometryGroups = await model.getItemsGeometry(batch);
    } catch {
      continue;
    }
    normalizeGeometryGroups(geometryGroups).forEach((group) => {
      group.forEach((meshData) => {
        const edgesGeometry = edgesFromMeshData(meshData, thresholdAngle);
        if (edgesGeometry) edgeGeometries.push(edgesGeometry);
      });
    });
  }

  return createLineSegmentsFromEdgeGeometries(edgeGeometries, options);
}

export function disposeWireframeEdges(lines) {
  if (!lines) return;
  lines.removeFromParent();
  lines.geometry?.dispose();
  if (Array.isArray(lines.material)) {
    lines.material.forEach((material) => material.dispose());
  } else {
    lines.material?.dispose();
  }
}

export function attachWireframeEdges(parent, lines) {
  if (!parent || !lines) return;
  lines.removeFromParent();
  parent.add(lines);
}

export function syncWireframeEdgesTransform(modelRoot, lines) {
  if (!modelRoot || !lines) return;
  modelRoot.updateWorldMatrix(true, false);
  lines.matrix.copy(modelRoot.matrixWorld);
  lines.matrixWorldNeedsUpdate = true;
}

export function attachWireframeEdgesToScene(scene, modelRoot, lines) {
  if (!scene || !lines) return;
  lines.removeFromParent();
  scene.add(lines);
  lines.frustumCulled = false;
  lines.matrixAutoUpdate = false;
  syncWireframeEdgesTransform(modelRoot, lines);
}

export function ensureWireframeEdgesAttached(overlayScene, modelRoot, lines) {
  if (!overlayScene || !modelRoot || !lines) return false;
  if (lines.parent !== overlayScene) {
    attachWireframeEdgesToScene(overlayScene, modelRoot, lines);
    return true;
  }
  syncWireframeEdgesTransform(modelRoot, lines);
  return true;
}

export function renderWireframeOverlay(renderer, mainScene, overlayScene, camera, wireframeEdges, options = {}) {
  if (!renderer || !mainScene || !camera) {
    return false;
  }

  renderer.autoClear = true;
  renderer.render(mainScene, camera);

  if (!overlayScene || !wireframeEdges?.parent) {
    return true;
  }

  const size = typeof renderer.getDrawingBufferSize === 'function'
    ? renderer.getDrawingBufferSize(new THREE.Vector2())
    : null;
  updateWireframeEdgeVisuals(wireframeEdges, {
    width: size?.x,
    height: size?.y,
    cameraDistance: options.cameraDistance,
    modelRadius: options.modelRadius,
    lineWeight: options.lineWeight,
    opacity: options.opacity,
    color: options.color,
  });

  wireframeEdges.visible = true;
  wireframeEdges.updateMatrixWorld(true);
  wireframeEdges.material.depthTest = WIREFRAME_OVERLAY_DEPTH_TEST;
  wireframeEdges.material.depthWrite = false;
  const previousAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.render(overlayScene, camera);
  renderer.autoClear = previousAutoClear;
  return true;
}

export function createWireframeDepthMaterial() {
  return new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
  });
}

export function renderWireframeHiddenLines(renderer, scene, camera, {
  wireframeEdges,
  depthMaterial,
  backgroundColor = WIREFRAME_SCENE_BACKGROUND,
  useDepthOverride = false,
}) {
  if (!renderer || !scene || !camera || !wireframeEdges) {
    return false;
  }
  if (useDepthOverride && !depthMaterial) {
    return false;
  }

  const previousOverride = scene.overrideMaterial;
  const previousAutoClear = renderer.autoClear;
  const previousBackground = scene.background;
  const previousMask = camera.layers.mask;

  scene.background = new THREE.Color(backgroundColor);
  renderer.setClearColor(backgroundColor, 1);
  renderer.clear(true, true, true);

  camera.layers.set(0);
  wireframeEdges.visible = false;
  if (useDepthOverride) {
    scene.overrideMaterial = depthMaterial;
  }
  renderer.render(scene, camera);
  scene.overrideMaterial = previousOverride;

  camera.layers.set(WIREFRAME_EDGE_LAYER);
  wireframeEdges.visible = true;
  renderer.autoClear = false;
  renderer.render(scene, camera);
  renderer.autoClear = previousAutoClear;

  camera.layers.mask = previousMask;
  scene.background = previousBackground;
  wireframeEdges.visible = true;
  return true;
}
