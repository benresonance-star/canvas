import { describe, expect, it } from 'vitest';
import {
  environmentHdriUrl,
  environmentPresetForLightingMode,
  environmentSettingsForLightingMode,
  environmentSettingsForPreset,
  lightingModeForEnvironmentPreset,
  resolveEnvironmentPreset,
} from '../environmentConfig.js';

describe('environmentConfig', () => {
  it('maps each lighting mode to a distinct HDRI preset', () => {
    expect(environmentPresetForLightingMode('studio')).toBe('studio');
    expect(environmentPresetForLightingMode('bright')).toBe('city');
    expect(environmentPresetForLightingMode('soft')).toBe('sunset');
  });

  it('round-trips lighting mode and environment preset', () => {
    expect(lightingModeForEnvironmentPreset('city')).toBe('bright');
    expect(lightingModeForEnvironmentPreset('sunset')).toBe('soft');
    expect(lightingModeForEnvironmentPreset('studio')).toBe('studio');
  });

  it('resolves preset from explicit viewer state or lighting mode fallback', () => {
    expect(resolveEnvironmentPreset({ environmentPreset: 'city', lightingMode: 'studio' })).toBe('city');
    expect(resolveEnvironmentPreset({ lightingMode: 'soft' })).toBe('sunset');
    expect(resolveEnvironmentPreset(null)).toBe('studio');
  });

  it('returns distinct environment intensities per preset', () => {
    expect(environmentSettingsForPreset('studio').environmentIntensity).toBe(0.7);
    expect(environmentSettingsForPreset('city').environmentIntensity).toBe(0.85);
    expect(environmentSettingsForPreset('sunset').environmentIntensity).toBe(0.45);
    expect(environmentSettingsForLightingMode('bright').preset).toBe('city');
  });

  it('builds drei CDN URLs for supported presets', () => {
    expect(environmentHdriUrl('studio')).toContain('studio_small_03_1k.hdr');
    expect(environmentHdriUrl('unknown')).toBeNull();
  });
});
