import * as THREE from 'three';
import { bufferGeometryFromMeshData } from './bimWireframeOverlay.js';

/** Keep in sync with BIM_SELECTION_HIGHLIGHT_COLOR in bimClayRender.js */
export const CLAY_SELECTION_OVERLAY_COLOR = '#f59e0b';

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

function solidMeshFromMeshData(meshData, material) {
  const geometry = bufferGeometryFromMeshData(meshData);
  if (!geometry) return null;
  const transform = resolveMeshDataTransform(meshData.transform);
  if (transform) geometry.applyMatrix4(transform);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

export async function buildClaySelectionOverlay(model, localIds = [], {
  color = CLAY_SELECTION_OVERLAY_COLOR,
} = {}) {
  if (!model || !localIds?.length || typeof model.getItemsGeometry !== 'function') {
    return null;
  }

  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
    transparent: false,
  });

  const group = new THREE.Group();
  group.name = 'bim-clay-selection-overlay';
  group.renderOrder = 90;
  group.frustumCulled = false;
  group.matrixAutoUpdate = false;

  let geometryGroups;
  try {
    geometryGroups = await model.getItemsGeometry(localIds);
  } catch {
    material.dispose();
    return null;
  }

  normalizeGeometryGroups(geometryGroups).forEach((meshGroup) => {
    meshGroup.forEach((meshData) => {
      const mesh = solidMeshFromMeshData(meshData, material);
      if (mesh) group.add(mesh);
    });
  });

  if (group.children.length === 0) {
    material.dispose();
    return null;
  }

  return group;
}

export function disposeClaySelectionOverlay(group) {
  if (!group) return;
  group.removeFromParent();
  group.traverse((child) => {
    child.geometry?.dispose?.();
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((entry) => entry.dispose?.());
      } else {
        child.material.dispose?.();
      }
    }
  });
}

export function syncClaySelectionOverlayTransform(modelRoot, group) {
  if (!modelRoot || !group) return;
  modelRoot.updateWorldMatrix(true, false);
  group.matrix.copy(modelRoot.matrixWorld);
  group.matrixWorldNeedsUpdate = true;
}

export function attachClaySelectionOverlay(overlayScene, modelRoot, group) {
  if (!overlayScene || !group) return;
  group.removeFromParent();
  overlayScene.add(group);
  syncClaySelectionOverlayTransform(modelRoot, group);
}

export function ensureClaySelectionOverlayAttached(overlayScene, modelRoot, group) {
  if (!overlayScene || !modelRoot || !group) return false;
  if (group.parent !== overlayScene) {
    attachClaySelectionOverlay(overlayScene, modelRoot, group);
    return true;
  }
  syncClaySelectionOverlayTransform(modelRoot, group);
  return true;
}

export function renderClaySelectionOverlayPass(
  renderer,
  overlayScene,
  camera,
  selectionOverlay,
  {
    depthTest = true,
  } = {},
) {
  if (!renderer || !overlayScene || !camera || !selectionOverlay?.parent) {
    return false;
  }

  selectionOverlay.visible = true;
  selectionOverlay.updateMatrixWorld(true);
  renderer.setRenderTarget(null);

  selectionOverlay.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      material.depthTest = depthTest;
      material.depthWrite = false;
      if (material.depthTest) {
        material.depthFunc = THREE.LessEqualDepth;
      } else {
        material.polygonOffset = false;
      }
    });
  });

  const previousAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.render(overlayScene, camera);
  renderer.autoClear = previousAutoClear;
  renderer.resetState?.();
  return true;
}
