import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { resolveViewPresetDirection } from '../../../threeDArtifact/utils/cameraFit.js';
import { resolveAxisViewMode, resolveViewNavigatorLabel } from '../bimViewNavigator.js';

describe('resolveAxisViewMode', () => {
  it('returns top and bottom for aligned axis directions', () => {
    expect(resolveAxisViewMode(new THREE.Vector3(0, 1, 0))).toBe('top');
    expect(resolveAxisViewMode(new THREE.Vector3(0, -1, 0))).toBe('bottom');
  });

  it('returns null for home and iso directions', () => {
    expect(resolveAxisViewMode(resolveViewPresetDirection('home'))).toBeNull();
    expect(resolveAxisViewMode(new THREE.Vector3(-0.4, 0.75, -0.53).normalize())).toBeNull();
  });
});

describe('resolveViewNavigatorLabel', () => {
  it('returns axis labels for aligned camera directions', () => {
    expect(resolveViewNavigatorLabel(new THREE.Vector3(0, 1, 0))).toBe('TOP VIEW');
    expect(resolveViewNavigatorLabel(new THREE.Vector3(0, -1, 0))).toBe('BOTTOM VIEW');
  });

  it('returns HOME VIEW for the default oblique home direction', () => {
    const homeDirection = resolveViewPresetDirection('home');
    expect(resolveViewNavigatorLabel(homeDirection)).toBe('HOME VIEW');
  });

  it('returns ISO VIEW for oblique directions that are not home or axis aligned', () => {
    expect(resolveViewNavigatorLabel(new THREE.Vector3(-0.4, 0.75, -0.53).normalize())).toBe('ISO VIEW');
  });
});
