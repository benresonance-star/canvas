import * as THREE from 'three';
import { resolveAxisViewMode } from './bimViewNavigator.js';

export const BIM_CAMERA_WALK_SHIFT_MULTIPLIER = 3;
export const BIM_CAMERA_WALK_SPEED_RATIO = 0.35;
export const BIM_CAMERA_WALK_MIN_SPEED = 0.5;
export const BIM_CAMERA_WALK_MAX_SPEED = 50;
export const BIM_CAMERA_WALK_EMIT_INTERVAL_MS = 200;

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _viewDirection = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _groundPlane = new THREE.Plane();
const _groundHit = new THREE.Vector3();

export const BIM_CAMERA_WALK_KEY_BINDINGS = {
  forward: ['ArrowUp', 'KeyW'],
  backward: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['KeyE', 'PageUp'],
  down: ['KeyQ', 'PageDown'],
};

const MOVEMENT_KEY_CODES = new Set([
  ...BIM_CAMERA_WALK_KEY_BINDINGS.forward,
  ...BIM_CAMERA_WALK_KEY_BINDINGS.backward,
  ...BIM_CAMERA_WALK_KEY_BINDINGS.left,
  ...BIM_CAMERA_WALK_KEY_BINDINGS.right,
  ...BIM_CAMERA_WALK_KEY_BINDINGS.up,
  ...BIM_CAMERA_WALK_KEY_BINDINGS.down,
]);

function createEmptyKeyState() {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    shift: false,
  };
}

function isEditableEventTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tagName = String(target.tagName ?? '').toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest?.('[contenteditable="true"]'));
}

export function shouldIgnoreBimKeyboardNavEvent(event, {
  viewportActive = false,
  enabled = true,
} = {}) {
  if (!enabled || !viewportActive) return true;
  if (event?.defaultPrevented) return true;
  if (isEditableEventTarget(event?.target)) return true;
  return false;
}

export function resolveBimCameraWalkKeyState(keyCode, pressed, keyState = createEmptyKeyState()) {
  const next = { ...keyState };
  if (keyCode === 'ShiftLeft' || keyCode === 'ShiftRight') {
    next.shift = pressed;
    return next;
  }
  for (const [axis, codes] of Object.entries(BIM_CAMERA_WALK_KEY_BINDINGS)) {
    if (codes.includes(keyCode)) next[axis] = pressed;
  }
  return next;
}

export function hasActiveBimCameraWalkInput(keyState = createEmptyKeyState()) {
  return keyState.forward
    || keyState.backward
    || keyState.left
    || keyState.right
    || keyState.up
    || keyState.down;
}

function resolveCameraRight(camera) {
  camera.updateMatrixWorld(true);
  _right.set(
    camera.matrixWorld.elements[0],
    camera.matrixWorld.elements[1],
    camera.matrixWorld.elements[2],
  );
  if (_right.lengthSq() < 1e-8) {
    return _right.set(1, 0, 0);
  }
  return _right.normalize();
}

/** Screen-aligned walk axes for plan/ceiling views (top/bottom presets). */
export function resolveAxisViewWalkAxes(camera, viewDirection = null) {
  if (!camera || !viewDirection?.isVector3) return null;
  if (!resolveAxisViewMode(viewDirection)) return null;

  const viewDir = viewDirection.clone().normalize();
  const right = resolveCameraRight(camera);
  const forward = _forward.crossVectors(right, viewDir);
  if (forward.lengthSq() < 1e-8) return null;
  forward.normalize();
  return { forward, right };
}

function resolveHorizontalForward(camera, controls) {
  if (controls?.target) {
    _forward.copy(controls.target).sub(camera.position);
  } else {
    camera.getWorldDirection(_forward);
    _forward.multiplyScalar(-1);
  }
  _forward.y = 0;
  if (_forward.lengthSq() < 1e-8) {
    camera.getWorldDirection(_forward);
    _forward.y = 0;
  }
  if (_forward.lengthSq() < 1e-8) {
    _forward.set(0, 0, -1);
  }
  return _forward.normalize();
}

export function resolvePointerGroundTarget(
  camera,
  domElement,
  clientX,
  clientY,
  planeY = 0,
) {
  if (!camera || !domElement || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return null;
  }
  const rect = domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  _raycaster.setFromCamera(_ndc, camera);
  _groundPlane.set(WORLD_UP, -planeY);
  return _raycaster.ray.intersectPlane(_groundPlane, _groundHit) ? _groundHit.clone() : null;
}

/** Walk forward follows the pointer target when available, otherwise orbit forward. */
export function resolveWalkForwardDirection(camera, controls, pointerTarget = null) {
  if (controls?.target) {
    _viewDirection.copy(camera.position).sub(controls.target);
    if (_viewDirection.lengthSq() > 1e-12) {
      _viewDirection.normalize();
      const axisAxes = resolveAxisViewWalkAxes(camera, _viewDirection);
      if (axisAxes) {
        return axisAxes.forward.clone();
      }
    }
  }

  if (pointerTarget?.isVector3) {
    _forward.copy(pointerTarget).sub(camera.position);
    _forward.y = 0;
    if (_forward.lengthSq() > 1e-8) return _forward.normalize();
  }
  return resolveHorizontalForward(camera, controls);
}

export function computeBimCameraWalkDelta({
  camera,
  controls,
  keyState = createEmptyKeyState(),
  deltaSeconds = 0,
  pointerTarget = null,
  speedRatio = BIM_CAMERA_WALK_SPEED_RATIO,
  minSpeed = BIM_CAMERA_WALK_MIN_SPEED,
  maxSpeed = BIM_CAMERA_WALK_MAX_SPEED,
  shiftMultiplier = BIM_CAMERA_WALK_SHIFT_MULTIPLIER,
} = {}) {
  if (!camera || !controls?.target || deltaSeconds <= 0) return _delta.set(0, 0, 0);

  const moveForward = Number(keyState.forward) - Number(keyState.backward);
  const moveRight = Number(keyState.right) - Number(keyState.left);
  const moveUp = Number(keyState.up) - Number(keyState.down);
  if (moveForward === 0 && moveRight === 0 && moveUp === 0) {
    return _delta.set(0, 0, 0);
  }

  const orbitDistance = camera.position.distanceTo(controls.target);
  let speed = orbitDistance * speedRatio;
  speed = Math.min(maxSpeed, Math.max(minSpeed, speed));
  if (keyState.shift) speed *= shiftMultiplier;

  const distance = speed * deltaSeconds;
  _delta.set(0, 0, 0);

  if (moveForward !== 0 || moveRight !== 0) {
    let forward = resolveWalkForwardDirection(camera, controls, pointerTarget);
    let right = null;
    if (controls?.target) {
      _viewDirection.copy(camera.position).sub(controls.target);
      if (_viewDirection.lengthSq() > 1e-12) {
        _viewDirection.normalize();
        const axisAxes = resolveAxisViewWalkAxes(camera, _viewDirection);
        if (axisAxes) {
          forward = axisAxes.forward;
          right = axisAxes.right;
        }
      }
    }
    if (!right) {
      right = _right.crossVectors(forward, WORLD_UP).normalize();
    }
    if (moveForward !== 0) _delta.addScaledVector(forward, moveForward * distance);
    if (moveRight !== 0) _delta.addScaledVector(right, moveRight * distance);
  }
  if (moveUp !== 0) _delta.y += moveUp * distance;

  return _delta.clone();
}

export function applyBimCameraWalkDelta({ camera, controls, delta }) {
  if (!camera || !controls?.target || !delta) return false;
  if (delta.lengthSq() <= 0) return false;
  camera.position.add(delta);
  controls.target.add(delta);
  return true;
}

export function createBimCameraKeyboardNav({
  domElement,
  getCamera,
  getControls,
  getEnabled = () => true,
  getPointerWalkTarget = () => null,
  onPointerMove = null,
  onCameraMoved = () => {},
  onCameraSessionBegin = () => {},
  onCameraSessionEnd = () => {},
  emitIntervalMs = BIM_CAMERA_WALK_EMIT_INTERVAL_MS,
} = {}) {
  let disposed = false;
  let isHovered = false;
  let isFocused = false;
  let keyState = createEmptyKeyState();
  let lastEmitAt = 0;
  let movedSinceLastEmit = false;
  let lastPointerClient = null;
  let walkSessionActive = false;

  const isViewportActive = () => isHovered || isFocused;

  const clearKeyState = () => {
    if (walkSessionActive) {
      walkSessionActive = false;
      onCameraSessionEnd();
    }
    keyState = createEmptyKeyState();
  };

  const emitCameraMoved = (force = false) => {
    const now = performance.now();
    if (!force && (!movedSinceLastEmit || now - lastEmitAt < emitIntervalMs)) return;
    movedSinceLastEmit = false;
    lastEmitAt = now;
    onCameraMoved();
  };

  const handleKeyDown = (event) => {
    if (disposed) return;
    const enabled = getEnabled();
    if (shouldIgnoreBimKeyboardNavEvent(event, { viewportActive: isViewportActive(), enabled })) {
      return;
    }
    if (!MOVEMENT_KEY_CODES.has(event.code) && event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') {
      return;
    }
    if (MOVEMENT_KEY_CODES.has(event.code)) event.preventDefault();
    const hadMovement = hasActiveBimCameraWalkInput(keyState);
    const next = resolveBimCameraWalkKeyState(event.code, true, keyState);
    keyState = next;
    if (!hadMovement && hasActiveBimCameraWalkInput(keyState)) {
      walkSessionActive = true;
      onCameraSessionBegin();
    }
  };

  const handleKeyUp = (event) => {
    if (disposed) return;
    if (!MOVEMENT_KEY_CODES.has(event.code) && event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') {
      return;
    }
    const hadMovement = hasActiveBimCameraWalkInput(keyState);
    keyState = resolveBimCameraWalkKeyState(event.code, false, keyState);
    if (hadMovement && !hasActiveBimCameraWalkInput(keyState)) {
      emitCameraMoved(true);
      if (walkSessionActive) {
        walkSessionActive = false;
        onCameraSessionEnd();
      }
    }
  };

  const handleMouseEnter = () => {
    isHovered = true;
  };

  const handleMouseLeave = () => {
    isHovered = false;
    lastPointerClient = null;
    clearKeyState();
  };

  const handlePointerMove = (event) => {
    lastPointerClient = { x: event.clientX, y: event.clientY };
    onPointerMove?.(event.clientX, event.clientY);
  };

  const handleFocus = () => {
    isFocused = true;
  };

  const handleBlur = () => {
    isFocused = false;
    clearKeyState();
  };

  const handlePointerDown = () => {
    if (disposed || !domElement) return;
    domElement.focus({ preventScroll: true });
  };

  const handleWindowBlur = () => {
    clearKeyState();
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleWindowBlur);
  domElement?.addEventListener('mouseenter', handleMouseEnter);
  domElement?.addEventListener('mouseleave', handleMouseLeave);
  domElement?.addEventListener('pointermove', handlePointerMove);
  domElement?.addEventListener('focus', handleFocus);
  domElement?.addEventListener('blur', handleBlur);
  domElement?.addEventListener('pointerdown', handlePointerDown);

  return {
    update(deltaSeconds = 0) {
      if (disposed || !getEnabled() || !isViewportActive() || !hasActiveBimCameraWalkInput(keyState)) {
        return false;
      }
      const camera = getCamera?.();
      const controls = getControls?.();
      let pointerTarget = getPointerWalkTarget?.() ?? null;
      if (!pointerTarget && lastPointerClient && domElement) {
        pointerTarget = resolvePointerGroundTarget(
          camera,
          domElement,
          lastPointerClient.x,
          lastPointerClient.y,
          controls?.target?.y ?? 0,
        );
      }
      const delta = computeBimCameraWalkDelta({
        camera,
        controls,
        keyState,
        deltaSeconds,
        pointerTarget,
      });
      const moved = applyBimCameraWalkDelta({ camera, controls, delta });
      if (moved) {
        movedSinceLastEmit = true;
        emitCameraMoved(false);
      }
      return moved;
    },
    setViewportActive(active) {
      if (active) {
        isHovered = true;
        return;
      }
      isHovered = false;
      isFocused = false;
      clearKeyState();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      domElement?.removeEventListener('mouseenter', handleMouseEnter);
      domElement?.removeEventListener('mouseleave', handleMouseLeave);
      domElement?.removeEventListener('pointermove', handlePointerMove);
      domElement?.removeEventListener('focus', handleFocus);
      domElement?.removeEventListener('blur', handleBlur);
      domElement?.removeEventListener('pointerdown', handlePointerDown);
      clearKeyState();
    },
  };
}
