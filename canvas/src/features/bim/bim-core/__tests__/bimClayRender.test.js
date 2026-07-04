import { describe, expect, it } from 'vitest';
import {
  applyClayCameraDepthRange,
  buildClayBaseMaterial,
  buildClayGlassMaterial,
  CLAY_BASE_MATERIAL,
  CLAY_SELECTED_MATERIAL,
  getClayPresetWorkspacePatch,
  renderClayDepthPrepass,
  renderClayFrame,
  resolveClayWireframeStyle,
  updateClayComposerSettings,
  updateClayLightingIntensity,
} from '../bimClayRender.js';
import { normalizeClayStyle } from '../types.js';

describe('bimClayRender', () => {
  it('normalizes clay style defaults', () => {
    expect(normalizeClayStyle({})).toMatchObject({
      renderStyle: 'standard',
      clayAoIntensity: 2,
      clayAoRadius: 2,
      clayAoBias: 0.01,
      clayAoDistance: 0.1,
      clayLightIntensity: 0.55,
      claySurfaceColor: '#f8f8f8',
      clayGlassOpacity: 0.18,
      clayBackgroundColor: '#ffffff',
    });
  });

  it('exports light clay base material', () => {
    expect(CLAY_BASE_MATERIAL.customId).toBe('canvas-bim-clay-base');
    expect(CLAY_BASE_MATERIAL.color.getHexString()).toBe('f8f8f8');
  });

  it('builds clay materials from style inputs', () => {
    expect(buildClayBaseMaterial({ surfaceColor: '#ffffff' }).color.getHexString()).toBe('ffffff');
    expect(buildClayGlassMaterial({ surfaceColor: '#eeeeee', glassOpacity: 0.25 }).opacity).toBe(0.25);
  });

  it('returns clay wireframe profile with hidden-line depth test', () => {
    expect(resolveClayWireframeStyle({})).toMatchObject({
      lineWeight: 1.25,
      opacity: 1,
      color: '#000000',
      depthTest: true,
    });
  });

  it('returns clay preset with normalized clay defaults', () => {
    expect(getClayPresetWorkspacePatch()).toMatchObject({
      renderStyle: 'clay',
      clayAoIntensity: 2,
      clayAoRadius: 2,
    });
  });

  it('tightens camera depth range for clay SSAO', () => {
    const camera = {
      near: 0.1,
      far: 100000,
      updateProjectionMatrix: () => {},
    };
    const restore = applyClayCameraDepthRange(camera, { cameraDistance: 50, modelRadius: 25 });
    expect(camera.far).toBeLessThan(200);
    expect(camera.near).toBeGreaterThan(0.04);
    restore();
    expect(camera.far).toBe(100000);
    expect(camera.near).toBe(0.1);
  });

  it('updates clay composer SSAO settings from camera and model radius', () => {
    const camera = {
      near: 2,
      far: 120,
      projectionMatrix: { elements: new Array(16).fill(0), copy: () => {} },
      projectionMatrixInverse: { elements: new Array(16).fill(0), copy: () => {} },
    };
    const state = {
      ssaoPass: {
        kernelRadius: 8,
        maxDistance: 0.1,
        minDistance: 0.002,
        ssaoMaterial: {
          uniforms: {
            cameraNear: { value: 0 },
            cameraFar: { value: 0 },
            cameraProjectionMatrix: { value: { copy: () => {} } },
            cameraInverseProjectionMatrix: { value: { copy: () => {} } },
            kernelRadius: { value: 0 },
            minDistance: { value: 0 },
            maxDistance: { value: 0 },
          },
        },
        depthRenderMaterial: {
          uniforms: {
            cameraNear: { value: 0 },
            cameraFar: { value: 0 },
          },
        },
      },
    };
    updateClayComposerSettings(state, {
      aoIntensity: 2.5,
      aoRadius: 2,
      aoBias: 0.01,
      aoDistance: 0.12,
      camera,
      modelRadius: 24,
    });
    expect(state.ssaoPass.kernelRadius).toBeGreaterThanOrEqual(4);
    expect(state.ssaoPass.minDistance).toBe(0.01);
    expect(state.ssaoPass.maxDistance).toBeGreaterThan(0.07);
    expect(state.ssaoPass.ssaoMaterial.uniforms.cameraFar.value).toBe(120);
  });

  it('updates clay lighting intensity from style input', () => {
    const hemisphere = { isHemisphereLight: true, intensity: 0.72 };
    const directional = { isDirectionalLight: true, intensity: 0.12 };
    updateClayLightingIntensity({ lights: { children: [hemisphere, directional] } }, 0.4);
    expect(hemisphere.intensity).toBe(0.4);
    expect(directional.intensity).toBeCloseTo(0.068);
  });

  it('uses subtle grey clay selection material', () => {
    expect(CLAY_SELECTED_MATERIAL.color.getHexString()).toBe('e5e5e5');
  });

  it('renders clay wireframe overlay after composer with a depth prepass', () => {
    const scene = {
      overrideMaterial: null,
    };
    const camera = {
      near: 2,
      far: 120,
      updateProjectionMatrix: () => {},
    };
    const renderer = {
      autoClear: true,
      setRenderTarget: () => {},
      setClearColor: () => {},
      clearDepth: () => {},
      render: () => {},
    };
    const composer = { render: () => {} };
    const overlayScene = {};
    const wireframeEdges = {
      parent: overlayScene,
      visible: true,
      updateMatrixWorld: () => {},
      material: {
        depthTest: true,
        depthWrite: true,
        resolution: { set: () => {} },
        color: { set: () => {} },
      },
    };
    let renderCalls = 0;
    renderer.render = () => {
      renderCalls += 1;
    };

    const rendered = renderClayFrame({
      renderer,
      clayComposerState: {
        composer,
        ssaoPass: {
          kernelRadius: 4,
          minDistance: 0.01,
          maxDistance: 0.1,
          ssaoMaterial: {
            uniforms: {
              cameraNear: { value: 0 },
              cameraFar: { value: 0 },
              cameraProjectionMatrix: { value: { copy: () => {} } },
              cameraInverseProjectionMatrix: { value: { copy: () => {} } },
              kernelRadius: { value: 0 },
              minDistance: { value: 0 },
              maxDistance: { value: 0 },
            },
          },
          depthRenderMaterial: {
            uniforms: {
              cameraNear: { value: 0 },
              cameraFar: { value: 0 },
            },
          },
        },
      },
      scene,
      overlayScene,
      camera,
      wireframeEdges,
      wireframeEnabled: true,
      wireframeOptions: resolveClayWireframeStyle({ color: '#000000' }),
    });

    expect(rendered).toBe(true);
    expect(renderCalls).toBeGreaterThanOrEqual(2);
    expect(renderClayDepthPrepass(renderer, scene, camera)).toBe(true);
  });
});
