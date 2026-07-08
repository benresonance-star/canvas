import * as THREE from 'three';

/**
 * @param {THREE.Object3D | null | undefined} group
 * @param {{
 *   raycaster: THREE.Raycaster,
 *   camera: THREE.Camera,
 *   canvas: HTMLElement,
 *   clientX: number,
 *   clientY: number,
 * }} options
 * @returns {{ kind: 'rl' | 'datum', id: string } | null}
 */
export function pickRlMarkerFromOverlay(group, {
  raycaster,
  camera,
  canvas,
  clientX,
  clientY,
}) {
  if (!group || !raycaster || !camera || !canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const pointer = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);

  const meshes = [];
  group.traverse((child) => {
    if (child.isMesh && child.userData?.bimRlPick) {
      meshes.push(child);
    }
  });
  if (!meshes.length) return null;

  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;
  return hits[0].object.userData.bimRlPick ?? null;
}
