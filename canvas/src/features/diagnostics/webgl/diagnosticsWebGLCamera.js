import * as THREE from 'three';

/** Match React Flow default zoom step (see @xyflow/react Controls). */
export const DIAGNOSTICS_ZOOM_STEP = 1.2;

/** Match DiagnosticsFlowCanvas fitView padding. */
export const DIAGNOSTICS_FIT_PADDING = 0.15;

/** Tiny Z offset keeps the camera off the orbit pole while staying visually top-down. */
const TOP_DOWN_LOOKAT_Z_EPSILON = 0.01;

/**
 * @param {ReturnType<typeof import('../../../lib/architecture/diagnosticsLayout3d.js').buildDiagnosticsLayout3d>} layout3d
 */
export function computeDiagnosticsSceneBounds(layout3d) {
  const points = [...layout3d.byNodeId.values()]
    .map((entry) => entry.world)
    .filter(Boolean);
  if (points.length === 0) {
    return { center: new THREE.Vector3(0, 0, 0), radius: 4 };
  }
  const box = new THREE.Box3();
  points.forEach((point) => {
    box.expandByPoint(new THREE.Vector3(point.x, point.y, point.z));
  });
  const center = new THREE.Vector3();
  box.getCenter(center);
  const radius = box.getSize(new THREE.Vector3()).length() * 0.55 + 2;
  return { center, radius };
}

/**
 * @param {number} radius
 */
export function getDiagnosticsOrbitDistanceLimits(radius) {
  return {
    minDistance: Math.max(0.45, radius * 0.1),
    maxDistance: radius * 4,
  };
}

/**
 * @param {import('three/examples/jsm/controls/OrbitControls').OrbitControls} controls
 */
export function resetDiagnosticsOrbitControlState(controls) {
  controls._scale = 1;
  controls._sphericalDelta?.set(0, 0, 0);
  controls._panOffset?.set(0, 0, 0);
}

/**
 * @param {number} radius
 * @param {number} [padding]
 */
export function computeDiagnosticsFitCameraHeight(radius, padding = DIAGNOSTICS_FIT_PADDING) {
  return Math.max(radius * 2.2 * (1 + padding), radius + 1.5);
}

/**
 * Place the camera above the diagram center with a stable top-down view.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {import('three/examples/jsm/controls/OrbitControls').OrbitControls} controls
 * @param {THREE.Vector3 | { x: number, z: number }} center
 * @param {number} height
 * @param {{ minDistance: number, maxDistance: number }} [limits]
 */
export function syncDiagnosticsCameraTopDown(camera, controls, center, height, limits) {
  controls.target.set(center.x, 0, center.z);
  const clampedHeight = limits
    ? THREE.MathUtils.clamp(height, limits.minDistance, limits.maxDistance)
    : height;
  camera.position.set(center.x, clampedHeight, center.z + TOP_DOWN_LOOKAT_Z_EPSILON);
  camera.up.set(0, 1, 0);
  camera.rotation.set(-Math.PI / 2, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  resetDiagnosticsOrbitControlState(controls);
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {import('three/examples/jsm/controls/OrbitControls').OrbitControls} controls
 * @param {{ center: THREE.Vector3, radius: number }} bounds
 * @param {number} [padding]
 */
export function fitDiagnosticsCameraToExtent(camera, controls, bounds, padding = DIAGNOSTICS_FIT_PADDING) {
  const { center, radius } = bounds;
  const height = computeDiagnosticsFitCameraHeight(radius, padding);
  const limits = getDiagnosticsOrbitDistanceLimits(radius);
  syncDiagnosticsCameraTopDown(camera, controls, center, height, limits);
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {import('three/examples/jsm/controls/OrbitControls').OrbitControls} controls
 * @param {{ center: THREE.Vector3, radius: number }} fromBounds
 * @param {{ center: THREE.Vector3, radius: number }} toBounds
 * @param {number} progress 0..1
 * @param {number} [padding]
 */
export function lerpDiagnosticsCameraToExtent(
  camera,
  controls,
  fromBounds,
  toBounds,
  progress,
  padding = DIAGNOSTICS_FIT_PADDING,
) {
  const t = Math.max(0, Math.min(1, progress));
  const center = new THREE.Vector3().lerpVectors(fromBounds.center, toBounds.center, t);
  const radius = fromBounds.radius + (toBounds.radius - fromBounds.radius) * t;
  const height = computeDiagnosticsFitCameraHeight(radius, padding);
  const limits = getDiagnosticsOrbitDistanceLimits(radius);
  syncDiagnosticsCameraTopDown(camera, controls, center, height, limits);
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {import('three/examples/jsm/controls/OrbitControls').OrbitControls} controls
 * @param {'in' | 'out'} direction
 * @param {{ minDistance: number, maxDistance: number }} limits
 */
export function stepDiagnosticsCameraZoom(camera, controls, direction, limits) {
  if (!camera || !controls) return;

  const factor = direction === 'in' ? 1 / DIAGNOSTICS_ZOOM_STEP : DIAGNOSTICS_ZOOM_STEP;
  const currentHeight = Math.max(camera.position.y - controls.target.y, limits.minDistance);
  const nextHeight = THREE.MathUtils.clamp(currentHeight * factor, limits.minDistance, limits.maxDistance);
  syncDiagnosticsCameraTopDown(camera, controls, controls.target, nextHeight, limits);
}
