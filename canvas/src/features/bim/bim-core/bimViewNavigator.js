import * as THREE from 'three';
import { resolveViewPresetDirection } from '../../threeDArtifact/utils/cameraFit.js';

export const AXIS_VIEW_DOT_THRESHOLD = 0.82;
const HOME_VIEW_DOT_THRESHOLD = 0.92;

const WORLD_VIEW_LABELS = [
  { label: 'TOP VIEW', vector: new THREE.Vector3(0, 1, 0), mode: 'top' },
  { label: 'BOTTOM VIEW', vector: new THREE.Vector3(0, -1, 0), mode: 'bottom' },
];

/** View direction from camera toward orbit target (camera.position - target, normalized). */
export function resolveCameraViewDirection(camera, controls) {
  if (!camera?.position || !controls?.target) return null;
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 1e-12) return null;
  return direction.normalize();
}

/** Returns 'top' or 'bottom' when the view is aligned to a plan/ceiling axis preset. */
export function resolveAxisViewMode(viewDirection) {
  if (!viewDirection || viewDirection.lengthSq() < 1e-12) {
    return null;
  }

  const direction = viewDirection.clone().normalize();
  let bestMatch = null;
  for (const axis of WORLD_VIEW_LABELS) {
    const dot = direction.dot(axis.vector);
    if (!bestMatch || dot > bestMatch.dot) {
      bestMatch = { mode: axis.mode, dot };
    }
  }

  if (!bestMatch || bestMatch.dot < AXIS_VIEW_DOT_THRESHOLD) {
    return null;
  }

  return bestMatch.mode;
}

/** Map the active camera view direction to a human-readable navigator label. */
export function resolveViewNavigatorLabel(viewDirection) {
  if (!viewDirection || viewDirection.lengthSq() < 1e-12) {
    return 'HOME VIEW';
  }

  const direction = viewDirection.clone().normalize();
  const homeDirection = resolveViewPresetDirection('home');

  if (homeDirection && direction.dot(homeDirection) >= HOME_VIEW_DOT_THRESHOLD) {
    return 'HOME VIEW';
  }

  let bestMatch = null;
  for (const axis of WORLD_VIEW_LABELS) {
    const dot = direction.dot(axis.vector);
    if (!bestMatch || dot > bestMatch.dot) {
      bestMatch = { label: axis.label, dot };
    }
  }

  if (!bestMatch || bestMatch.dot < AXIS_VIEW_DOT_THRESHOLD) {
    return 'ISO VIEW';
  }

  return bestMatch.label;
}
