import { describe, expect, it } from 'vitest';
import {
  bimLightingToolbarLabel,
  cycleBimLightingState,
  normalizeBimLightingState,
} from '../bimLighting.js';

describe('bimLighting', () => {
  it('defaults to legacy lighting with HDRI off', () => {
    expect(normalizeBimLightingState({})).toEqual({
      showEnvironment: false,
      environmentPreset: 'studio',
      lightingMode: 'studio',
    });
  });

  it('cycles off → studio → city → sunset → off', () => {
    expect(cycleBimLightingState({ showEnvironment: false })).toEqual({
      showEnvironment: true,
      environmentPreset: 'studio',
      lightingMode: 'studio',
    });
    expect(cycleBimLightingState({
      showEnvironment: true,
      environmentPreset: 'studio',
      lightingMode: 'studio',
    })).toEqual({
      showEnvironment: true,
      environmentPreset: 'city',
      lightingMode: 'bright',
    });
    expect(cycleBimLightingState({
      showEnvironment: true,
      environmentPreset: 'city',
      lightingMode: 'bright',
    })).toEqual({
      showEnvironment: true,
      environmentPreset: 'sunset',
      lightingMode: 'soft',
    });
    expect(cycleBimLightingState({
      showEnvironment: true,
      environmentPreset: 'sunset',
      lightingMode: 'soft',
    })).toEqual({
      showEnvironment: false,
      environmentPreset: 'studio',
      lightingMode: 'studio',
    });
  });

  it('labels toolbar state', () => {
    expect(bimLightingToolbarLabel({ showEnvironment: false })).toBe('Lighting: off');
    expect(bimLightingToolbarLabel({ showEnvironment: true, environmentPreset: 'city' }))
      .toBe('Lighting: city (HDRI)');
  });
});
