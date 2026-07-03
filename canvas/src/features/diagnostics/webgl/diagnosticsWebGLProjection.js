import * as THREE from 'three';
import { FLOW_TO_WORLD_SCALE } from '../../../lib/architecture/diagnosticsLayout3d.js';

/**
 * @param {number} dx
 * @param {number} dy
 * @param {THREE.Camera} camera
 * @param {number} viewportHeight
 * @param {{ x: number, y: number, z: number }} worldPoint
 */
export function screenPixelsToFlowDelta(dx, dy, camera, viewportHeight, worldPoint) {
  if (!viewportHeight) return { x: 0, y: 0 };
  const anchor = new THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z);
  const distance = camera.position.distanceTo(anchor);
  const fovRadians = ((camera.fov ?? 42) * Math.PI) / 180;
  const worldPerPixel = (2 * distance * Math.tan(fovRadians / 2)) / viewportHeight;
  const flowPerPixel = worldPerPixel / FLOW_TO_WORLD_SCALE;
  return { x: dx * flowPerPixel, y: dy * flowPerPixel };
}
