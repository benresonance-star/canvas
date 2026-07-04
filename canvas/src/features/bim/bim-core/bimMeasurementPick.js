import * as THREE from 'three';
import { SnappingClass } from '@thatopen/fragments';
import { pickSurfaceHit, snapPickPoint } from '../../threeDArtifact/utils/measureSnap.js';

export function fragmentsResultToSnap(result, snapMode) {
  if (!result?.point) return null;

  const position = result.point.toArray
    ? result.point.toArray()
    : [result.point.x, result.point.y, result.point.z];

  if (
    snapMode === 'edge'
    && result.snappedEdgeP1
    && result.snappedEdgeP2
  ) {
    return {
      kind: 'edge',
      position,
      edgeStart: result.snappedEdgeP1.toArray(),
      edgeEnd: result.snappedEdgeP2.toArray(),
      meshUuid: result.object?.uuid,
    };
  }

  return {
    kind: 'vertex',
    position,
    meshUuid: result.object?.uuid,
  };
}

export async function pickBimMeasurementSnap({
  raycaster,
  camera,
  canvas,
  clientX,
  clientY,
  fragmentsModel = null,
  modelRoot = null,
  snapMode = 'vertex',
}) {
  if (!camera || !canvas) return null;

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const mouse = new THREE.Vector2(clientX, clientY);

  if (fragmentsModel?.raycastWithSnapping) {
    try {
      const snappingClasses = snapMode === 'edge'
        ? [SnappingClass.LINE, SnappingClass.POINT]
        : [SnappingClass.POINT, SnappingClass.LINE];
      const results = await fragmentsModel.raycastWithSnapping({
        camera,
        mouse,
        dom: canvas,
        snappingClasses,
      });
      if (results?.length) {
        const snap = fragmentsResultToSnap(results[0], snapMode);
        if (snap) return snap;
      }
    } catch {
      // Fall back to plain raycast / mesh pick below.
    }

    try {
      const hit = await fragmentsModel.raycast({ camera, mouse, dom: canvas });
      const snap = fragmentsResultToSnap(hit, snapMode);
      if (snap) return snap;
    } catch {
      // Fall back to mesh pick below.
    }
  }

  if (!modelRoot) return null;

  const pointer = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -(((clientY - rect.top) / rect.height) * 2 - 1),
  );
  const hit = pickSurfaceHit(raycaster, pointer, camera, modelRoot, {
    width: rect.width,
    height: rect.height,
  });
  if (!hit) return null;

  return snapPickPoint(snapMode, hit, { maxDistance: hit.snapRadius });
}
