import * as THREE from 'three';

export const BOUNDING_BOX_COLOR = 0xea580c;
export const BOUNDING_BOX_OPACITY = 0.95;
export const BOUNDING_BOX_OVERLAY_DEPTH_TEST = false;

function resolveAxisAlignedBoxSize(bounds = {}) {
  const min = bounds?.min;
  const max = bounds?.max;
  if (!min || !max) return null;
  const dx = max.x - min.x;
  const dy = max.y - min.y;
  const dz = max.z - min.z;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) return null;
  if (dx <= 0 || dy <= 0 || dz <= 0) return null;
  return {
    size: new THREE.Vector3(dx, dy, dz),
    center: new THREE.Vector3(
      (min.x + max.x) / 2,
      (min.y + max.y) / 2,
      (min.z + max.z) / 2,
    ),
    yaw: 0,
  };
}

function resolveOrientedBoxSize(bounds = {}) {
  const center = bounds?.center;
  const halfExtents = bounds?.halfExtents;
  if (!center || !halfExtents) return null;
  const dx = halfExtents.x * 2;
  const dy = halfExtents.y * 2;
  const dz = halfExtents.z * 2;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) return null;
  if (dx <= 0 || dy <= 0 || dz <= 0) return null;
  const resolvedCenter = center instanceof THREE.Vector3
    ? center.clone()
    : new THREE.Vector3(center.x, center.y, center.z);
  return {
    size: new THREE.Vector3(dx, dy, dz),
    center: resolvedCenter,
    yaw: Number.isFinite(bounds.yaw) ? bounds.yaw : 0,
  };
}

function resolveBoxSize(bounds = {}) {
  return resolveOrientedBoxSize(bounds) ?? resolveAxisAlignedBoxSize(bounds);
}

export function createModelBoundingBoxEdges(bounds, options = {}) {
  const resolved = resolveBoxSize(bounds);
  if (!resolved) return null;

  const boxGeometry = new THREE.BoxGeometry(
    resolved.size.x,
    resolved.size.y,
    resolved.size.z,
  );
  const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);
  boxGeometry.dispose();

  const material = new THREE.LineBasicMaterial({
    color: options.color ?? BOUNDING_BOX_COLOR,
    transparent: true,
    opacity: options.opacity ?? BOUNDING_BOX_OPACITY,
    depthTest: options.depthTest ?? BOUNDING_BOX_OVERLAY_DEPTH_TEST,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(edgesGeometry, material);
  lines.position.copy(resolved.center);
  lines.rotation.y = resolved.yaw;
  lines.frustumCulled = false;
  return lines;
}

export function disposeModelBoundingBoxEdges(lines) {
  if (!lines) return;
  lines.parent?.remove(lines);
  lines.geometry?.dispose();
  lines.material?.dispose();
}

export function syncModelBoundingBoxEdges(existing, bounds, overlayScene, options = {}) {
  disposeModelBoundingBoxEdges(existing);
  const next = createModelBoundingBoxEdges(bounds, options);
  if (next && overlayScene) {
    overlayScene.add(next);
  }
  return next;
}

export function renderOverlayScenePass(renderer, overlayScene, camera) {
  if (!renderer || !overlayScene || !camera) return false;
  const previousAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.render(overlayScene, camera);
  renderer.autoClear = previousAutoClear;
  return true;
}
