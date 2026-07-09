import * as THREE from 'three';
import {
  fitOrthographicCameraToCurrentView,
  fitPerspectiveCameraToCurrentView,
} from '../../threeDArtifact/utils/cameraFit.js';
import { bufferGeometryFromMeshData } from './bimWireframeOverlay.js';

export const BIM_SELECTION_CAMERA_FIT_MARGIN = 1.35;
export const BIM_SELECTION_CAMERA_ANIMATION_MS = 400;

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

export function expandBox3FromItemsGeometry(geometryGroups, targetBox = new THREE.Box3()) {
  targetBox.makeEmpty();
  const meshBox = new THREE.Box3();

  normalizeGeometryGroups(geometryGroups).forEach((meshGroup) => {
    meshGroup.forEach((meshData) => {
      const geometry = bufferGeometryFromMeshData(meshData);
      if (!geometry) return;
      geometry.computeBoundingBox();
      if (!geometry.boundingBox) {
        geometry.dispose();
        return;
      }
      meshBox.copy(geometry.boundingBox);
      const transform = resolveMeshDataTransform(meshData.transform);
      if (transform) meshBox.applyMatrix4(transform);
      targetBox.union(meshBox);
      geometry.dispose();
    });
  });

  return targetBox;
}

export function fitCameraToSelectionBox(camera, controls, box, {
  margin = BIM_SELECTION_CAMERA_FIT_MARGIN,
  viewportAspect = null,
} = {}) {
  if (!camera || !controls || !box || box.isEmpty()) return false;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(
    Math.max(size.x, 1e-4),
    Math.max(size.y, 1e-4),
    Math.max(size.z, 1e-4),
  ));
  mesh.position.copy(center);
  mesh.updateMatrixWorld(true);

  const options = { margin, viewportAspect };
  const fitted = camera.isOrthographicCamera
    ? fitOrthographicCameraToCurrentView(camera, controls, mesh, options)
    : fitPerspectiveCameraToCurrentView(camera, controls, mesh, options);
  mesh.geometry.dispose();
  return fitted;
}

export async function fitCameraToFragmentLocalIds(model, localIds = [], camera, controls, options = {}) {
  if (!model || !localIds?.length || typeof model.getItemsGeometry !== 'function') {
    return false;
  }
  if (!camera || !controls) return false;

  let geometryGroups;
  try {
    geometryGroups = await model.getItemsGeometry(localIds);
  } catch {
    return false;
  }

  const box = expandBox3FromItemsGeometry(geometryGroups);
  if (box.isEmpty()) return false;
  return fitCameraToSelectionBox(camera, controls, box, options);
}
