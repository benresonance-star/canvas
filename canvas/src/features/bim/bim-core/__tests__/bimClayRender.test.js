import { describe, expect, it, vi } from 'vitest';
import {
  applyClayCameraDepthRange,
  buildClayBaseMaterial,
  buildClayGlassMaterial,
  CLAY_BASE_MATERIAL,
  CLAY_SSAO_REFERENCE_DISTANCE_FACTOR,
  CLAY_SELECTED_MATERIAL,
  getClayPresetWorkspacePatch,
  copyRenderTargetDepthToScreen,
  copyClayComposerDepthToScreen,
  populateScreenDepthFromScene,
  resolveClayComposerDepthSource,
  renderClayFrame,
  resolveClayCameraDepthRange,
  resolveClaySsaoSettings,
  resolveClayViewDistance,
  resolveClayWireframeStyle,
  updateClayComposerSettings,
  updateClayLightingIntensity,
} from '../bimClayRender.js';
import {
  CLAY_AO_BIAS_DEFAULT,
  CLAY_AO_BIAS_MAX,
  CLAY_AO_BIAS_MIN,
  CLAY_AO_DISTANCE_DEFAULT,
  CLAY_AO_DISTANCE_MAX,
  CLAY_AO_DISTANCE_MIN,
  CLAY_AO_RADIUS_MAX,
  CLAY_AO_RADIUS_MIN,
  normalizeClayStyle,
} from '../types.js';

describe('bimClayRender', () => {
  it('normalizes clay style defaults', () => {
    expect(normalizeClayStyle({})).toMatchObject({
      renderStyle: 'standard',
      clayAoIntensity: 2,
      clayAoRadius: 0.02,
      clayAoBias: CLAY_AO_BIAS_DEFAULT,
      clayAoDistance: CLAY_AO_DISTANCE_DEFAULT,
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

  it('returns clay wireframe profile as a hidden-line overlay on SSAO', () => {
    expect(resolveClayWireframeStyle({})).toMatchObject({
      lineWeight: 1.25,
      opacity: 0.45,
      color: '#000000',
      hiddenLines: true,
      depthTest: true,
    });
    expect(resolveClayWireframeStyle({ hiddenLines: false })).toMatchObject({
      hiddenLines: false,
      depthTest: false,
    });
  });

  it('returns clay preset with normalized clay defaults', () => {
    expect(getClayPresetWorkspacePatch()).toMatchObject({
      renderStyle: 'clay',
      clayAoIntensity: 2,
      clayAoRadius: 0.02,
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
    expect(camera.near).toBeGreaterThan(0.004);
    restore();
    expect(camera.far).toBe(100000);
    expect(camera.near).toBe(0.1);
  });

  it('uses a tighter depth span when the camera is close to the orbit target', () => {
    const close = resolveClayCameraDepthRange({ cameraDistance: 3, modelRadius: 25 });
    const far = resolveClayCameraDepthRange({ cameraDistance: 80, modelRadius: 25 });
    expect(close.far - close.near).toBeLessThan(far.far - far.near);
  });

  it('scales SSAO kernel with view distance for screen-stable shading', () => {
    const radius = 25;
    const reference = radius * CLAY_SSAO_REFERENCE_DISTANCE_FACTOR;
    const close = resolveClaySsaoSettings({ modelRadius: radius, cameraDistance: 3 });
    const far = resolveClaySsaoSettings({ modelRadius: radius, cameraDistance: 80 });
    expect(far.kernelRadius).toBeGreaterThan(close.kernelRadius);
    expect(far.kernelRadius / close.kernelRadius).toBeCloseTo(80 / 3, 0);
    expect(close.viewScale).toBeCloseTo(3 / reference, 2);
  });

  it('maps clay AO sliders to responsive SSAO settings', () => {
    const low = resolveClaySsaoSettings({
      aoIntensity: 0,
      aoRadius: CLAY_AO_RADIUS_MIN,
      aoBias: CLAY_AO_BIAS_MIN,
      aoDistance: CLAY_AO_DISTANCE_MIN,
      modelRadius: 24,
    });
    const high = resolveClaySsaoSettings({
      aoIntensity: 20,
      aoRadius: CLAY_AO_RADIUS_MAX,
      aoBias: CLAY_AO_BIAS_MAX,
      aoDistance: CLAY_AO_DISTANCE_MAX,
      modelRadius: 24,
    });
    expect(high.maxDistance).toBeGreaterThan(low.maxDistance * 2);
    expect(high.kernelRadius).toBeGreaterThan(low.kernelRadius);
    expect(high.minDistance).toBeGreaterThan(low.minDistance);
    expect(CLAY_AO_BIAS_DEFAULT).toBeGreaterThan(CLAY_AO_BIAS_MIN);
    expect(CLAY_AO_BIAS_MIN).toBe(0.1);
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
      aoRadius: 0.02,
      aoBias: 0.2,
      aoDistance: 0.12,
      camera,
      modelRadius: 24,
    });
    expect(state.ssaoPass.kernelRadius).toBeGreaterThanOrEqual(4);
    expect(state.ssaoPass.minDistance).toBeGreaterThan(0.009);
    expect(state.ssaoPass.maxDistance).toBeGreaterThan(0.13);
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

  it('copies render-target depth to the screen buffer when blitFramebuffer is available', () => {
    const readBuffer = {};
    const drawBuffer = {};
    const gl = {
      DEPTH_BUFFER_BIT: 256,
      NEAREST: 9728,
      FRAMEBUFFER_BINDING: 36006,
      READ_FRAMEBUFFER: 36008,
      DRAW_FRAMEBUFFER: 36009,
      bindFramebuffer: vi.fn(),
      blitFramebuffer: vi.fn(),
      getParameter: vi.fn(() => drawBuffer),
    };
    const depthSource = { width: 1280, height: 720, depthBuffer: true };
    const renderer = {
      getContext: () => gl,
      properties: {
        get: () => ({ __webglFramebuffer: readBuffer }),
      },
      getRenderTarget: () => null,
      setRenderTarget: vi.fn(),
    };

    expect(copyRenderTargetDepthToScreen(renderer, depthSource, 1280, 720)).toBe(true);
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.DRAW_FRAMEBUFFER, null);
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.READ_FRAMEBUFFER, readBuffer);
    expect(gl.blitFramebuffer).toHaveBeenCalledWith(
      0, 0, 1280, 720,
      0, 0, 1280, 720,
      gl.DEPTH_BUFFER_BIT,
      gl.NEAREST,
    );
    expect(resolveClayComposerDepthSource({
      composer: { readBuffer: { width: 10 }, writeBuffer: { width: 20 } },
    }).width).toBe(10);
  });

  it('copies clay composer depth from whichever buffer still holds the render-pass depth', () => {
    const readBuffer = { width: 1280, height: 720, depthBuffer: true };
    const writeBuffer = { width: 1280, height: 720, depthBuffer: true };
    const gl = {
      DEPTH_BUFFER_BIT: 256,
      NEAREST: 9728,
      NO_ERROR: 0,
      bindFramebuffer: vi.fn(),
      blitFramebuffer: vi.fn(),
      getError: vi.fn(() => 0),
    };
    const renderer = {
      getContext: () => gl,
      properties: {
        get: (target) => ({ __webglFramebuffer: target === readBuffer ? 'read-fbo' : 'write-fbo' }),
      },
      getRenderTarget: () => null,
      setRenderTarget: vi.fn(),
    };

    expect(copyClayComposerDepthToScreen(renderer, {
      composer: { readBuffer, writeBuffer },
    }, 1280, 720)).toBe(true);
    expect(gl.blitFramebuffer).toHaveBeenCalled();
  });

  it('populates screen depth without writing color', () => {
    const colorBuffer = {
      setMask: vi.fn(),
      setLocked: vi.fn(),
    };
    const depthBuffer = {
      setTest: vi.fn(),
      setMask: vi.fn(),
    };
    const renderer = {
      autoClear: true,
      getRenderTarget: () => null,
      setRenderTarget: vi.fn(),
      clearDepth: vi.fn(),
      render: vi.fn(),
      state: {
        buffers: {
          color: colorBuffer,
          depth: depthBuffer,
        },
      },
    };
    const scene = {};
    const camera = {};

    expect(populateScreenDepthFromScene(renderer, scene, camera)).toBe(true);
    expect(colorBuffer.setMask).toHaveBeenCalledWith(false);
    expect(colorBuffer.setLocked).toHaveBeenCalledWith(true);
    expect(renderer.clearDepth).toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
    expect(colorBuffer.setLocked).toHaveBeenCalledWith(false);
    expect(colorBuffer.setMask).toHaveBeenCalledWith(true);
  });

  it('renders clay wireframe overlay after composer without repainting the scene', () => {
    const colorBuffer = {
      setMask: vi.fn(),
      setLocked: vi.fn(),
    };
    const depthBuffer = {
      setTest: vi.fn(),
      setMask: vi.fn(),
    };
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
      getRenderTarget: () => null,
      state: {
        buffers: {
          color: colorBuffer,
          depth: depthBuffer,
        },
      },
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
    expect(renderCalls).toBe(2);
  });

  it('skips clay wireframe overlay when line opacity is zero', () => {
    const renderer = {
      autoClear: true,
      setRenderTarget: () => {},
      setClearColor: () => {},
      clearDepth: () => {},
      render: () => {},
    };
    const scene = { background: null, overrideMaterial: null };
    const overlayScene = {};
    const camera = {
      near: 0.1,
      far: 100,
      updateProjectionMatrix: () => {},
      projectionMatrix: { copy: () => {} },
      projectionMatrixInverse: { copy: () => {} },
    };
    let composerRenderCalls = 0;
    let wireframeRenderCalls = 0;
    const composer = { render: () => { composerRenderCalls += 1; } };
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
    renderer.render = () => {
      wireframeRenderCalls += 1;
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
      wireframeOptions: resolveClayWireframeStyle({ opacity: 0 }),
    });

    expect(rendered).toBe(true);
    expect(composerRenderCalls).toBe(1);
    expect(wireframeRenderCalls).toBe(0);
  });
});
