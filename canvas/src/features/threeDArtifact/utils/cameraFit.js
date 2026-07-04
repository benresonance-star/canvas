import * as THREE from 'three';

export const THREE_D_CAMERA_FIT_MARGIN = 1.2;
const DEFAULT_FIT_DIRECTION = new THREE.Vector3(1, 0.65, 1).normalize();

const _offset = new THREE.Vector3();
const _right = new THREE.Vector3();
const _actualUp = new THREE.Vector3();

function buildViewBasis(direction) {
  const viewDir = direction.clone().normalize();
  const upCandidate = new THREE.Vector3(0, 1, 0);
  if (Math.abs(viewDir.dot(upCandidate)) > 0.999) {
    upCandidate.set(1, 0, 0);
  }
  _right.crossVectors(upCandidate, viewDir).normalize();
  _actualUp.crossVectors(viewDir, _right).normalize();
  return {
    viewDir,
    right: _right.clone(),
    actualUp: _actualUp.clone(),
  };
}

function getBoxCorners(box) {
  const { min, max } = box;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
}

export function computeFitDistanceForBox(box, center, camera, direction, margin = THREE_D_CAMERA_FIT_MARGIN) {
  const { viewDir, right, actualUp } = buildViewBasis(direction);
  const halfTanV = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const halfTanH = halfTanV * Math.max(camera.aspect, Number.EPSILON);

  let distance = 0;
  for (const corner of getBoxCorners(box)) {
    _offset.copy(corner).sub(center);
    const depthComp = _offset.dot(viewDir);
    const rightComp = _offset.dot(right);
    const upComp = _offset.dot(actualUp);
    const required = Math.max(
      Math.abs(rightComp) / halfTanH,
      Math.abs(upComp) / halfTanV,
    );
    distance = Math.max(distance, depthComp + required);
  }

  return Math.max(distance * margin, 1e-3);
}

/** Distance from orbit target so a bounding sphere fits the camera frustum. */
export function computeFitDistanceForSphere(radius, camera, margin = THREE_D_CAMERA_FIT_MARGIN) {
  if (!Number.isFinite(radius) || radius <= 0) return 1e-3;
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const aspect = Math.max(camera.aspect, Number.EPSILON);
  const halfTanV = Math.tan(fovRad * 0.5);
  const halfTanH = halfTanV * aspect;
  const distanceV = radius / halfTanV;
  const distanceH = radius / halfTanH;
  return Math.max(distanceV, distanceH, 1e-3) * margin;
}

export function syncOrbitControlsAfterCameraFit(controls) {
  if (!controls) return;
  const dampingEnabled = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = dampingEnabled;
}

export function applySavedCameraState(camera, controls, savedCamera, { viewportWidth = null, viewportHeight = null } = {}) {
  if (!camera || !savedCamera) return;
  const target = new THREE.Vector3(
    savedCamera.target[0],
    savedCamera.target[1],
    savedCamera.target[2],
  );
  camera.position.set(
    savedCamera.position[0],
    savedCamera.position[1],
    savedCamera.position[2],
  );
  camera.up.set(savedCamera.up[0], savedCamera.up[1], savedCamera.up[2]);
  if (camera.isOrthographicCamera) {
    if (Number.isFinite(savedCamera.zoom) && savedCamera.zoom > 0) {
      camera.zoom = savedCamera.zoom;
    }
    if (Number.isFinite(savedCamera.viewHeight) && savedCamera.viewHeight > 0) {
      camera.userData.viewHeight = savedCamera.viewHeight;
    }
  } else {
    camera.fov = savedCamera.fov ?? camera.fov;
  }
  if (savedCamera.near) camera.near = savedCamera.near;
  if (savedCamera.far) camera.far = savedCamera.far;
  camera.lookAt(target);
  if (camera.isOrthographicCamera && viewportWidth && viewportHeight) {
    updateOrthographicFrustum(camera, viewportWidth, viewportHeight);
  } else {
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld(true);
  controls?.target?.copy(target);
  syncOrbitControlsAfterCameraFit(controls);
}

export function updateOrthographicFrustum(camera, width, height) {
  if (!camera?.isOrthographicCamera) return;
  const aspect = Math.max(width / Math.max(height, 1), Number.EPSILON);
  const viewHeight = Number.isFinite(camera.userData.viewHeight) && camera.userData.viewHeight > 0
    ? camera.userData.viewHeight
    : 20;
  const effectiveHeight = viewHeight / Math.max(camera.zoom, Number.EPSILON);
  const effectiveWidth = effectiveHeight * aspect;
  camera.left = -effectiveWidth / 2;
  camera.right = effectiveWidth / 2;
  camera.top = effectiveHeight / 2;
  camera.bottom = -effectiveHeight / 2;
  camera.updateProjectionMatrix();
}

export function getOrthographicViewHeight(camera) {
  if (!camera?.isOrthographicCamera) return null;
  return Number.isFinite(camera.userData.viewHeight) && camera.userData.viewHeight > 0
    ? camera.userData.viewHeight
    : (camera.top - camera.bottom) * camera.zoom;
}

export function setOrthographicViewHeight(camera, viewHeight) {
  if (!camera?.isOrthographicCamera) return;
  camera.userData.viewHeight = viewHeight;
}

export function perspectiveToOrthoViewHeight(camera, targetDistance) {
  if (!camera?.isPerspectiveCamera || !Number.isFinite(targetDistance)) return 20;
  const halfTanV = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  return Math.max(2 * targetDistance * halfTanV, 1e-3);
}

export function fitPerspectiveCameraToDefaultView(
  camera,
  controls,
  object,
  {
    margin = THREE_D_CAMERA_FIT_MARGIN,
    direction = DEFAULT_FIT_DIRECTION,
    viewportAspect = null,
  } = {},
) {
  if (!object || !camera?.isPerspectiveCamera) return false;

  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return false;

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const center = sphere.center;
  const viewDir = direction.clone().normalize();

  if (Number.isFinite(viewportAspect) && viewportAspect > 0) {
    camera.aspect = viewportAspect;
  }

  const distance = computeFitDistanceForSphere(sphere.radius, camera, margin);

  camera.position.copy(center).addScaledVector(viewDir, distance);
  camera.up.set(0, 1, 0);
  camera.lookAt(center);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = Math.max(camera.far, distance * 100);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  if (controls?.target) {
    controls.target.copy(center);
    syncOrbitControlsAfterCameraFit(controls);
  }

  return true;
}

export function fitOrthographicCameraToDefaultView(
  camera,
  controls,
  object,
  {
    margin = THREE_D_CAMERA_FIT_MARGIN,
    direction = DEFAULT_FIT_DIRECTION,
    viewportAspect = null,
  } = {},
) {
  if (!object || !camera?.isOrthographicCamera) return false;

  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return false;

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const center = sphere.center;
  const viewDir = direction.clone().normalize();
  const aspect = Number.isFinite(viewportAspect) && viewportAspect > 0
    ? viewportAspect
    : Math.max((camera.right - camera.left) / Math.max(camera.top - camera.bottom, Number.EPSILON), Number.EPSILON);

  const diameter = sphere.radius * 2 * margin;
  const viewHeight = diameter / Math.min(1, aspect);
  setOrthographicViewHeight(camera, viewHeight);
  updateOrthographicFrustum(camera, aspect, 1);

  const distance = Math.max(sphere.radius * 4, 10);
  camera.position.copy(center).addScaledVector(viewDir, distance);
  camera.up.set(0, 1, 0);
  camera.lookAt(center);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = Math.max(camera.far, distance * 100);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  if (controls?.target) {
    controls.target.copy(center);
    syncOrbitControlsAfterCameraFit(controls);
  }

  return true;
}

/** @deprecated Use fitPerspectiveCameraToDefaultView */
export const fitPerspectiveCameraToObject = fitPerspectiveCameraToDefaultView;

export function fitPerspectiveCameraToCurrentView(
  camera,
  controls,
  object,
  {
    margin = THREE_D_CAMERA_FIT_MARGIN,
    viewportAspect = null,
  } = {},
) {
  if (!object || !camera?.isPerspectiveCamera) return false;

  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return false;

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const center = sphere.center;
  const orbitTarget = controls?.target?.clone?.() ?? center;
  const viewDir = camera.position.clone().sub(orbitTarget);
  if (viewDir.lengthSq() < 1e-12) {
    viewDir.copy(DEFAULT_FIT_DIRECTION);
  } else {
    viewDir.normalize();
  }

  if (Number.isFinite(viewportAspect) && viewportAspect > 0) {
    camera.aspect = viewportAspect;
  }

  const distance = computeFitDistanceForSphere(sphere.radius, camera, margin);

  if (controls?.target) {
    controls.target.copy(center);
  }
  camera.position.copy(center).addScaledVector(viewDir, distance);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = Math.max(camera.far, distance * 100);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  syncOrbitControlsAfterCameraFit(controls);

  return true;
}

export function allBoxCornersInsideCameraView(camera, box, padding = 0.02) {
  if (!camera?.isPerspectiveCamera || box.isEmpty()) return false;
  const projected = new THREE.Vector3();
  for (const corner of getBoxCorners(box)) {
    projected.copy(corner).project(camera);
    if (
      projected.x < -1 - padding
      || projected.x > 1 + padding
      || projected.y < -1 - padding
      || projected.y > 1 + padding
      || projected.z < -1
      || projected.z > 1
    ) {
      return false;
    }
  }
  return true;
}
