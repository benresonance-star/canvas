import * as THREE from 'three';

export const THREE_D_CAMERA_FIT_MARGIN = 1.2;
const DEFAULT_FIT_DIRECTION = new THREE.Vector3(1, 0.65, 1).normalize();
/** Horizontal offset (fraction of fit distance) so OrbitControls can rotate at plan/ceiling views. */
export const AXIS_VIEW_POLE_NUDGE_FRACTION = 0.003;

/** Canonical camera-fit view presets for navigator gimbals. */
export const CAMERA_VIEW_PRESETS = ['home', 'top', 'bottom'];

export const CAMERA_VIEW_PRESET_DIRECTIONS = {
  home: DEFAULT_FIT_DIRECTION.clone(),
  top: new THREE.Vector3(0, 1, 0),
  bottom: new THREE.Vector3(0, -1, 0),
};

export function resolveViewPresetDirection(preset) {
  return CAMERA_VIEW_PRESET_DIRECTIONS[preset]?.clone() ?? null;
}

const _offset = new THREE.Vector3();
const _right = new THREE.Vector3();
const _actualUp = new THREE.Vector3();
const _size = new THREE.Vector3();
const _meshBox = new THREE.Box3();
const _footprintSamples = [];
const _footprintPoints = [];
const _worldUp = new THREE.Vector3(0, 1, 0);
const _cameraRight = new THREE.Vector3();
const _desiredRight = new THREE.Vector3();
const _worldCorner = new THREE.Vector3();

/** Skip meshes below this fraction of the largest footprint area (trees, pools, props). */
export const FOOTPRINT_MIN_AREA_FRACTION = 0.05;

function resolveHorizontalAxisFromBoundsSize(size) {
  if (size.x >= size.z) {
    return new THREE.Vector3(1, 0, 0);
  }
  return new THREE.Vector3(0, 0, 1);
}

function resolveHorizontalAxisFromFootprint(samples) {
  const count = samples.length / 2;
  if (count < 2) {
    return resolveHorizontalAxisFromBoundsSize(_size.set(1, 0, 1));
  }

  let meanX = 0;
  let meanZ = 0;
  for (let index = 0; index < samples.length; index += 2) {
    meanX += samples[index];
    meanZ += samples[index + 1];
  }
  meanX /= count;
  meanZ /= count;

  let covarianceXX = 0;
  let covarianceZZ = 0;
  let covarianceXZ = 0;
  for (let index = 0; index < samples.length; index += 2) {
    const deltaX = samples[index] - meanX;
    const deltaZ = samples[index + 1] - meanZ;
    covarianceXX += deltaX * deltaX;
    covarianceZZ += deltaZ * deltaZ;
    covarianceXZ += deltaX * deltaZ;
  }
  covarianceXX /= count;
  covarianceZZ /= count;
  covarianceXZ /= count;

  const trace = covarianceXX + covarianceZZ;
  const determinant = covarianceXX * covarianceZZ - covarianceXZ * covarianceXZ;
  const discriminant = Math.sqrt(Math.max(0, (trace * trace * 0.25) - determinant));
  const majorEigenvalue = trace * 0.5 + discriminant;

  let axisX = covarianceXZ;
  let axisZ = majorEigenvalue - covarianceXX;
  if (Math.abs(axisX) + Math.abs(axisZ) < 1e-12) {
    axisX = covarianceXX >= covarianceZZ ? 1 : 0;
    axisZ = covarianceXX >= covarianceZZ ? 0 : 1;
  }

  const axisLength = Math.hypot(axisX, axisZ) || 1;
  return new THREE.Vector3(axisX / axisLength, 0, axisZ / axisLength);
}

function appendMeshFootprintCorners(child, samples) {
  if (!child?.isMesh || !child.geometry) return;

  const geometry = child.geometry;
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox?.();
  }
  if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
    child.updateWorldMatrix(true, true);
    _meshBox.setFromObject(child);
    if (_meshBox.isEmpty()) return;
    const { min, max } = _meshBox;
    samples.push(
      min.x, min.z,
      min.x, max.z,
      max.x, min.z,
      max.x, max.z,
      min.x, (min.z + max.z) * 0.5,
      max.x, (min.z + max.z) * 0.5,
      (min.x + max.x) * 0.5, min.z,
      (min.x + max.x) * 0.5, max.z,
    );
    return;
  }

  child.updateWorldMatrix(true, true);
  const { min, max } = geometry.boundingBox;
  const midY = (min.y + max.y) * 0.5;
  const localCorners = [
    [min.x, midY, min.z],
    [min.x, midY, max.z],
    [max.x, midY, min.z],
    [max.x, midY, max.z],
    [min.x, midY, (min.z + max.z) * 0.5],
    [max.x, midY, (min.z + max.z) * 0.5],
    [(min.x + max.x) * 0.5, midY, min.z],
    [(min.x + max.x) * 0.5, midY, max.z],
  ];
  for (const [x, y, z] of localCorners) {
    _worldCorner.set(x, y, z).applyMatrix4(child.matrixWorld);
    samples.push(_worldCorner.x, _worldCorner.z);
  }
}

function computeMeshFootprintArea(child) {
  if (!child?.isMesh || !child.geometry) return 0;

  const geometry = child.geometry;
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox?.();
  }

  child.updateWorldMatrix(true, true);
  if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
    _meshBox.setFromObject(child);
    if (_meshBox.isEmpty()) return 0;
    const { min, max } = _meshBox;
    return Math.max(0, max.x - min.x) * Math.max(0, max.z - min.z);
  }

  const { min, max } = geometry.boundingBox;
  const midY = (min.y + max.y) * 0.5;
  const localCorners = [
    [min.x, midY, min.z],
    [min.x, midY, max.z],
    [max.x, midY, min.z],
    [max.x, midY, max.z],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, y, z] of localCorners) {
    _worldCorner.set(x, y, z).applyMatrix4(child.matrixWorld);
    minX = Math.min(minX, _worldCorner.x);
    maxX = Math.max(maxX, _worldCorner.x);
    minZ = Math.min(minZ, _worldCorner.z);
    maxZ = Math.max(maxZ, _worldCorner.z);
  }
  return Math.max(0, maxX - minX) * Math.max(0, maxZ - minZ);
}

function collectWeightedFootprintPoints(object) {
  const meshEntries = [];
  object.traverse((child) => {
    if (!child?.isMesh) return;
    const area = computeMeshFootprintArea(child);
    if (area > 0) {
      meshEntries.push({ child, area });
    }
  });

  if (meshEntries.length === 0) {
    return [];
  }

  const maxArea = Math.max(...meshEntries.map((entry) => entry.area));
  const minArea = maxArea * FOOTPRINT_MIN_AREA_FRACTION;
  const points = [];

  const appendWeightedCorners = (child, weight) => {
    _footprintSamples.length = 0;
    appendMeshFootprintCorners(child, _footprintSamples);
    for (let index = 0; index < _footprintSamples.length; index += 2) {
      const point = [_footprintSamples[index], _footprintSamples[index + 1]];
      for (let repeat = 0; repeat < weight; repeat += 1) {
        points.push(point);
      }
    }
  };

  for (const { child, area } of meshEntries) {
    if (area < minArea) continue;
    const weight = Math.max(1, Math.round((area / maxArea) * 8));
    appendWeightedCorners(child, weight);
  }

  if (points.length < 4) {
    for (const { child } of meshEntries) {
      appendWeightedCorners(child, 1);
    }
  }

  return points;
}

function resolveMinimumAreaBoundingRectangle(points) {
  const count = points.length;
  if (count < 2) {
    return null;
  }

  const candidateAngles = new Set([0, Math.PI * 0.5]);
  for (let index = 0; index < count; index += 1) {
    for (let other = index + 1; other < count; other += 1) {
      const deltaX = points[other][0] - points[index][0];
      const deltaZ = points[other][1] - points[index][1];
      if (Math.hypot(deltaX, deltaZ) < 1e-6) continue;
      const angle = Math.atan2(deltaZ, deltaX);
      candidateAngles.add(angle);
      candidateAngles.add(angle + Math.PI * 0.5);
    }
  }

  let bestArea = Infinity;
  let bestAngle = 0;
  let bestHalfU = 0;
  let bestHalfV = 0;
  let bestCenterU = 0;
  let bestCenterV = 0;

  for (const angle of candidateAngles) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;

    for (const [x, z] of points) {
      const u = x * cos + z * sin;
      const v = -x * sin + z * cos;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }

    const extentU = maxU - minU;
    const extentV = maxV - minV;
    const area = extentU * extentV;
    if (area < bestArea) {
      bestArea = area;
      bestAngle = angle;
      bestHalfU = extentU * 0.5;
      bestHalfV = extentV * 0.5;
      bestCenterU = (minU + maxU) * 0.5;
      bestCenterV = (minV + maxV) * 0.5;
    }
  }

  const alongU = bestHalfU >= bestHalfV;
  const longAngle = alongU ? bestAngle : bestAngle + Math.PI * 0.5;
  const longEdge = new THREE.Vector3(Math.cos(longAngle), 0, Math.sin(longAngle));
  const shortEdge = new THREE.Vector3(-longEdge.z, 0, longEdge.x);

  const cos = Math.cos(bestAngle);
  const sin = Math.sin(bestAngle);
  const centerX = bestCenterU * cos - bestCenterV * sin;
  const centerZ = bestCenterU * sin + bestCenterV * cos;

  return {
    longEdge,
    shortEdge,
    centerX,
    centerZ,
    halfLong: alongU ? bestHalfU : bestHalfV,
    halfShort: alongU ? bestHalfV : bestHalfU,
    yaw: Math.atan2(longEdge.z, longEdge.x),
  };
}

function resolveFootprintBasisFromObject(object) {
  if (!object) {
    return {
      longEdge: new THREE.Vector3(1, 0, 0),
      shortEdge: new THREE.Vector3(0, 0, 1),
      centerX: 0,
      centerZ: 0,
      halfLong: 0.5,
      halfShort: 0.5,
      yaw: 0,
    };
  }

  object.updateWorldMatrix(true, true);
  _footprintPoints.length = 0;
  _footprintPoints.push(...collectWeightedFootprintPoints(object));

  if (_footprintPoints.length >= 4) {
    const mbr = resolveMinimumAreaBoundingRectangle(_footprintPoints);
    if (mbr) {
      return mbr;
    }
  }

  _footprintSamples.length = 0;
  object.traverse((child) => {
    appendMeshFootprintCorners(child, _footprintSamples);
  });

  if (_footprintSamples.length >= 8) {
    const longEdge = resolveHorizontalAxisFromFootprint(_footprintSamples);
    const shortEdge = new THREE.Vector3(-longEdge.z, 0, longEdge.x);
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(_size);
    const halfLong = Math.max(
      Math.abs(size.x * longEdge.x + size.z * longEdge.z) * 0.5,
      0.5,
    );
    const halfShort = Math.max(
      Math.abs(size.x * shortEdge.x + size.z * shortEdge.z) * 0.5,
      0.5,
    );
    return {
      longEdge,
      shortEdge,
      centerX: center.x,
      centerZ: center.z,
      halfLong,
      halfShort,
      yaw: Math.atan2(longEdge.z, longEdge.x),
    };
  }

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(_size);
  const center = box.getCenter(new THREE.Vector3());
  const longEdge = resolveHorizontalAxisFromBoundsSize(size);
  const shortEdge = new THREE.Vector3(-longEdge.z, 0, longEdge.x);
  return {
    longEdge,
    shortEdge,
    centerX: center.x,
    centerZ: center.z,
    halfLong: Math.max(size.x * 0.5, 0.5),
    halfShort: Math.max(size.z * 0.5, 0.5),
    yaw: Math.atan2(longEdge.z, longEdge.x),
  };
}

/** Footprint long-edge basis for top/bottom alignment and OBB overlay. */
export function resolveFootprintLongEdge(object) {
  const basis = resolveFootprintBasisFromObject(object);
  return {
    longEdge: basis.longEdge.clone(),
    shortEdge: basis.shortEdge.clone(),
  };
}

/** Oriented footprint bounds (XZ from MBR, Y from world AABB). */
export function buildFootprintOrientedBounds(object) {
  if (!object) return null;

  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return null;

  const basis = resolveFootprintBasisFromObject(object);
  const centerY = (box.min.y + box.max.y) * 0.5;
  const halfY = Math.max((box.max.y - box.min.y) * 0.5, 0.5);

  return {
    center: new THREE.Vector3(basis.centerX, centerY, basis.centerZ),
    halfExtents: new THREE.Vector3(
      Math.max(basis.halfLong, 0.5),
      halfY,
      Math.max(basis.halfShort, 0.5),
    ),
    yaw: basis.yaw,
    longEdge: basis.longEdge.clone(),
    shortEdge: basis.shortEdge.clone(),
  };
}

/** Major horizontal axis for top/bottom camera roll (Fragments-safe mesh bbox sampling). */
export function resolveFootprintHorizontalAxis(object) {
  return resolveFootprintLongEdge(object).longEdge;
}

function buildViewBasis(direction, footprintRight = null) {
  const viewDir = direction.clone().normalize();

  if (footprintRight) {
    _right.copy(footprintRight).normalize();
    _actualUp.crossVectors(viewDir, _right).normalize();
    if (_actualUp.z > 0) {
      _actualUp.negate();
      _right.negate();
    }
    return {
      viewDir,
      right: _right.clone(),
      actualUp: _actualUp.clone(),
    };
  }

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

function applyAxisPresetPoleNudge(camera, center, viewDir, distance, footprintRight) {
  if (!camera?.position || distance <= 0) return;

  if (footprintRight) {
    _desiredRight.copy(footprintRight).setY(0);
  } else {
    _desiredRight.set(1, 0, 0);
  }
  if (_desiredRight.lengthSq() < 1e-12) {
    _desiredRight.set(1, 0, 0);
  } else {
    _desiredRight.normalize();
  }

  const nudge = Math.max(distance * AXIS_VIEW_POLE_NUDGE_FRACTION, 0.01);
  camera.position.copy(center).addScaledVector(viewDir, distance);
  camera.position.addScaledVector(_desiredRight, nudge);
}

function alignAxisPresetAzimuth(camera, center, footprintRight) {
  if (!camera?.position || !footprintRight) return;

  _desiredRight.copy(footprintRight).setY(0);
  if (_desiredRight.lengthSq() < 1e-12) return;
  _desiredRight.normalize();

  camera.up.copy(_worldUp);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  _cameraRight.set(
    camera.matrixWorld.elements[0],
    0,
    camera.matrixWorld.elements[2],
  );
  if (_cameraRight.lengthSq() < 1e-12) return;
  _cameraRight.normalize();

  const sin = _cameraRight.x * _desiredRight.z - _cameraRight.z * _desiredRight.x;
  const cos = _cameraRight.x * _desiredRight.x + _cameraRight.z * _desiredRight.z;
  const angle = Math.atan2(sin, cos);

  _offset.copy(camera.position).sub(center);
  _offset.applyAxisAngle(_worldUp, -angle);
  camera.position.copy(center).add(_offset);
  camera.up.copy(_worldUp);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
}

function applyAxisPresetCameraFrame(camera, center, viewDir, distance, footprintRight) {
  applyAxisPresetPoleNudge(camera, center, viewDir, distance, footprintRight);
  camera.up.copy(_worldUp);
  camera.lookAt(center);
  alignAxisPresetAzimuth(camera, center, footprintRight);
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

export function computeFitDistanceForBox(
  box,
  center,
  camera,
  direction,
  margin = THREE_D_CAMERA_FIT_MARGIN,
  footprintRight = null,
) {
  const { viewDir, right, actualUp } = buildViewBasis(direction, footprintRight);
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

  const camera = controls.object;
  if (camera?.position && controls.target) {
    _offset.copy(camera.position).sub(controls.target);
    if (_offset.lengthSq() > 1e-12 && controls._spherical?.setFromVector3) {
      controls._spherical.setFromVector3(_offset);
    }
  }

  controls._scale = 1;
  controls._sphericalDelta?.set(0, 0, 0);
  controls._panOffset?.set(0, 0, 0);
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

export function fitCameraToViewPreset(
  camera,
  controls,
  object,
  preset,
  options = {},
) {
  if (!camera || !object) return false;

  const direction = resolveViewPresetDirection(preset);
  if (!direction) return false;

  const margin = options.margin ?? THREE_D_CAMERA_FIT_MARGIN;
  const viewportAspect = options.viewportAspect ?? null;

  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return false;

  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const viewDir = direction.clone().normalize();
  const isAxisPreset = preset === 'top' || preset === 'bottom';
  const footprintRight = isAxisPreset ? resolveFootprintHorizontalAxis(object) : null;
  const axisBasis = isAxisPreset ? buildViewBasis(viewDir, footprintRight) : null;

  if (camera.isPerspectiveCamera) {
    if (Number.isFinite(viewportAspect) && viewportAspect > 0) {
      camera.aspect = viewportAspect;
    }

    const distance = isAxisPreset
      ? computeFitDistanceForBox(box, center, camera, viewDir, margin, footprintRight)
      : computeFitDistanceForSphere(sphere.radius, camera, margin);

    if (isAxisPreset && footprintRight) {
      applyAxisPresetCameraFrame(camera, center, viewDir, distance, footprintRight);
    } else {
      camera.position.copy(center).addScaledVector(viewDir, distance);
      camera.up.set(0, 1, 0);
      camera.lookAt(center);
    }
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

  if (camera.isOrthographicCamera) {
    const aspect = Number.isFinite(viewportAspect) && viewportAspect > 0
      ? viewportAspect
      : Math.max((camera.right - camera.left) / Math.max(camera.top - camera.bottom, Number.EPSILON), Number.EPSILON);

    const diameter = sphere.radius * 2 * margin;
    const viewHeight = diameter / Math.min(1, aspect);
    setOrthographicViewHeight(camera, viewHeight);
    updateOrthographicFrustum(camera, aspect, 1);

    const distance = Math.max(sphere.radius * 4, 10);
    if (isAxisPreset && footprintRight) {
      applyAxisPresetCameraFrame(camera, center, viewDir, distance, footprintRight);
    } else {
      camera.position.copy(center).addScaledVector(viewDir, distance);
      camera.up.set(0, 1, 0);
      camera.lookAt(center);
    }
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

  return false;
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
