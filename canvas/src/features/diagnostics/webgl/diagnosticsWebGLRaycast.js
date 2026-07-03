import * as THREE from 'three';

/**
 * Opt out of Three.js raycasting for visual-only meshes.
 * @param {THREE.Raycaster} _raycaster
 * @param {THREE.Intersection[]} _intersects
 */
export function disableRaycast(_raycaster, _intersects) {}

/**
 * @param {THREE.Mesh} mesh
 * @param {() => boolean} isInteractive
 */
export function bindConditionalMeshRaycast(mesh, isInteractive) {
  const baseRaycast = THREE.Mesh.prototype.raycast;
  mesh.raycast = function conditionalRaycast(raycaster, intersects) {
    if (!isInteractive()) return;
    baseRaycast.call(this, raycaster, intersects);
  };
}

/** @param {THREE.Mesh} mesh */
export function unbindConditionalMeshRaycast(mesh) {
  delete mesh.raycast;
}
