import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyBimCameraWalkDelta,
  BIM_CAMERA_WALK_SHIFT_MULTIPLIER,
  computeBimCameraWalkDelta,
  hasActiveBimCameraWalkInput,
  resolveBimCameraWalkKeyState,
  shouldIgnoreBimKeyboardNavEvent,
} from '../bimCameraKeyboardNav.js';

function createWalkFixture() {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(10, 5, 10);
  const controls = { target: new THREE.Vector3(0, 0, 0) };
  return { camera, controls };
}

describe('bimCameraKeyboardNav', () => {
  it('ignores keyboard nav when viewport is inactive or disabled', () => {
    expect(shouldIgnoreBimKeyboardNavEvent({ target: {} }, {
      viewportActive: false,
      enabled: true,
    })).toBe(true);
    expect(shouldIgnoreBimKeyboardNavEvent({ target: {} }, {
      viewportActive: true,
      enabled: false,
    })).toBe(true);
  });

  it('ignores keyboard nav when typing in form fields', () => {
    expect(shouldIgnoreBimKeyboardNavEvent({ target: { tagName: 'INPUT' } }, {
      viewportActive: true,
      enabled: true,
    })).toBe(true);
    expect(shouldIgnoreBimKeyboardNavEvent({ target: { tagName: 'TEXTAREA' } }, {
      viewportActive: true,
      enabled: true,
    })).toBe(true);
  });

  it('allows keyboard nav for viewport body targets when active', () => {
    expect(shouldIgnoreBimKeyboardNavEvent({ target: { tagName: 'DIV' } }, {
      viewportActive: true,
      enabled: true,
    })).toBe(false);
  });

  it('maps movement keys into key state', () => {
    let keyState = resolveBimCameraWalkKeyState('KeyW', true);
    expect(keyState.forward).toBe(true);
    keyState = resolveBimCameraWalkKeyState('ArrowUp', true, keyState);
    expect(keyState.forward).toBe(true);
    keyState = resolveBimCameraWalkKeyState('KeyW', false, keyState);
    expect(keyState.forward).toBe(false);
    expect(hasActiveBimCameraWalkInput(keyState)).toBe(false);
  });

  it('moves forward along the flattened view direction', () => {
    const { camera, controls } = createWalkFixture();
    const delta = computeBimCameraWalkDelta({
      camera,
      controls,
      keyState: { forward: true, backward: false, left: false, right: false, up: false, down: false, shift: false },
      deltaSeconds: 1,
      speedRatio: 1,
      minSpeed: 0,
      maxSpeed: 1000,
    });
    const towardTarget = controls.target.clone().sub(camera.position);
    towardTarget.y = 0;
    towardTarget.normalize();
    expect(delta.length()).toBeGreaterThan(0);
    expect(delta.y).toBeCloseTo(0, 5);
    expect(delta.normalize().dot(towardTarget)).toBeGreaterThan(0.9);
  });

  it('moves forward toward the pointer target when provided', () => {
    const { camera, controls } = createWalkFixture();
    const pointerTarget = new THREE.Vector3(-5, 0, 10);
    const delta = computeBimCameraWalkDelta({
      camera,
      controls,
      pointerTarget,
      keyState: { forward: true, backward: false, left: false, right: false, up: false, down: false, shift: false },
      deltaSeconds: 1,
      speedRatio: 1,
      minSpeed: 0,
      maxSpeed: 1000,
    });
    const towardPointer = pointerTarget.clone().sub(camera.position);
    towardPointer.y = 0;
    towardPointer.normalize();
    expect(delta.normalize().dot(towardPointer)).toBeGreaterThan(0.9);
  });

  it('reverses movement for backward input', () => {
    const { camera, controls } = createWalkFixture();
    const forward = computeBimCameraWalkDelta({
      camera,
      controls,
      keyState: { forward: true, backward: false, left: false, right: false, up: false, down: false, shift: false },
      deltaSeconds: 1,
      speedRatio: 1,
      minSpeed: 0,
      maxSpeed: 1000,
    });
    const backward = computeBimCameraWalkDelta({
      camera,
      controls,
      keyState: { forward: false, backward: true, left: false, right: false, up: false, down: false, shift: false },
      deltaSeconds: 1,
      speedRatio: 1,
      minSpeed: 0,
      maxSpeed: 1000,
    });
    expect(forward.dot(backward)).toBeLessThan(0);
  });

  it('increases movement speed while shift is held', () => {
    const { camera, controls } = createWalkFixture();
    const normal = computeBimCameraWalkDelta({
      camera,
      controls,
      keyState: { forward: true, backward: false, left: false, right: false, up: false, down: false, shift: false },
      deltaSeconds: 1,
      speedRatio: 1,
      minSpeed: 0,
      maxSpeed: 1000,
    });
    const boosted = computeBimCameraWalkDelta({
      camera,
      controls,
      keyState: { forward: true, backward: false, left: false, right: false, up: false, down: false, shift: true },
      deltaSeconds: 1,
      speedRatio: 1,
      minSpeed: 0,
      maxSpeed: 1000,
      shiftMultiplier: BIM_CAMERA_WALK_SHIFT_MULTIPLIER,
    });
    expect(boosted.length()).toBeCloseTo(normal.length() * BIM_CAMERA_WALK_SHIFT_MULTIPLIER, 5);
  });

  it('moves camera and target together to preserve orbit distance', () => {
    const { camera, controls } = createWalkFixture();
    const beforeDistance = camera.position.distanceTo(controls.target);
    const delta = new THREE.Vector3(1, 2, 3);
    applyBimCameraWalkDelta({ camera, controls, delta });
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(beforeDistance, 5);
    expect(camera.position.x).toBeCloseTo(11, 5);
    expect(controls.target.x).toBeCloseTo(1, 5);
  });
});
