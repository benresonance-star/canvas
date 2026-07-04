import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { environmentHdriUrl } from '../environmentConfig.js';
import {
  createBimLegacyLights,
  createDirectLights,
  setHdriToneMapping,
} from '../hdriEnvironment.js';

describe('hdriEnvironment', () => {
  it('builds HDRI URLs for each preset', () => {
    expect(environmentHdriUrl('studio')).toContain('studio_small_03_1k.hdr');
    expect(environmentHdriUrl('city')).toContain('potsdamer_platz_1k.hdr');
    expect(environmentHdriUrl('sunset')).toContain('venice_sunset_1k.hdr');
  });

  it('creates legacy and direct light groups', () => {
    const scene = new THREE.Scene();
    const legacy = createBimLegacyLights(scene);
    expect(legacy.children).toHaveLength(3);
    expect(scene.children).toContain(legacy);

    scene.remove(legacy);
    const direct = createDirectLights(scene, 'studio');
    expect(direct.children.length).toBeGreaterThanOrEqual(4);
    expect(scene.children).toContain(direct);
  });

  it('toggles renderer tone mapping for HDRI mode', () => {
    const renderer = { toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 };
    setHdriToneMapping(renderer, true);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    setHdriToneMapping(renderer, false);
    expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
  });
});
