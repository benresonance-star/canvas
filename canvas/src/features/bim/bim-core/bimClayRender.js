import * as THREE from 'three';
import { RenderedFaces } from '@thatopen/fragments';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { renderWireframeOverlayPass } from './bimWireframeOverlay.js';
import { chunkLocalIds } from './bimPickPipeline.js';
import { resolveFragmentsLocalIdsByGlobalIds, isValidFragmentsLocalId } from './fragmentsSelection.js';
import {
  CLAY_AO_BIAS_DEFAULT,
  CLAY_AO_BIAS_MAX,
  CLAY_AO_BIAS_MIN,
  CLAY_AO_DISTANCE_DEFAULT,
  CLAY_AO_DISTANCE_MAX,
  CLAY_AO_DISTANCE_MIN,
  CLAY_AO_INTENSITY_DEFAULT,
  CLAY_AO_INTENSITY_MAX,
  CLAY_AO_INTENSITY_MIN,
  CLAY_AO_RADIUS_DEFAULT,
  CLAY_AO_RADIUS_MAX,
  CLAY_AO_RADIUS_MIN,
  CLAY_AO_SAMPLES_DEFAULT,
  CLAY_AO_SAMPLES_MAX,
  CLAY_AO_SAMPLES_MIN,
  CLAY_AO_RESOLUTION_DEFAULT,
  CLAY_AO_RESOLUTION_MAX,
  CLAY_AO_RESOLUTION_MIN,
  CLAY_SSAO_KERNEL_RADIUS_FLOOR,
  CLAY_BACKGROUND_DEFAULT,
  CLAY_GLASS_OPACITY_DEFAULT,
  CLAY_LIGHT_INTENSITY_DEFAULT,
  CLAY_SURFACE_COLOR_DEFAULT,
  normalizeClayStyle,
} from './types.js';
import { applyBimStyleSettings } from './bimStyleSettings.js';
import { populateScreenDepthFromScene } from './bimScreenDepth.js';
export { populateScreenDepthFromScene } from './bimScreenDepth.js';

export {
  CLAY_AO_BIAS_DEFAULT,
  CLAY_AO_BIAS_MAX,
  CLAY_AO_BIAS_MIN,
  CLAY_AO_DISTANCE_DEFAULT,
  CLAY_AO_DISTANCE_MAX,
  CLAY_AO_DISTANCE_MIN,
  CLAY_AO_INTENSITY_DEFAULT,
  CLAY_AO_INTENSITY_MAX,
  CLAY_AO_INTENSITY_MIN,
  CLAY_AO_RADIUS_DEFAULT,
  CLAY_AO_RADIUS_MAX,
  CLAY_AO_RADIUS_MIN,
  CLAY_SSAO_KERNEL_RADIUS_FLOOR,
  CLAY_BACKGROUND_DEFAULT,
  CLAY_GLASS_OPACITY_DEFAULT,
  CLAY_GLASS_OPACITY_MAX,
  CLAY_GLASS_OPACITY_MIN,
  CLAY_LIGHT_INTENSITY_DEFAULT,
  CLAY_LIGHT_INTENSITY_MAX,
  CLAY_LIGHT_INTENSITY_MIN,
  CLAY_SURFACE_COLOR_DEFAULT,
  normalizeClayStyle,
} from './types.js';

export const CLAY_WIREFRAME_LINE_WEIGHT_DEFAULT = 1.25;
export const CLAY_WIREFRAME_COLOR_DEFAULT = '#000000';
export const CLAY_WIREFRAME_OPACITY_DEFAULT = 0.45;

export const CLAY_GLASS_IFC_CLASSES = new Set([
  'IfcWindow',
  'IfcPlate',
  'IfcCurtainWall',
  'IfcWindowStandardCase',
  'IfcDoor',
]);

export const CLAY_BASE_MATERIAL = buildClayBaseMaterial({ surfaceColor: CLAY_SURFACE_COLOR_DEFAULT });
export const CLAY_GLASS_MATERIAL = buildClayGlassMaterial({
  surfaceColor: CLAY_SURFACE_COLOR_DEFAULT,
  glassOpacity: CLAY_GLASS_OPACITY_DEFAULT,
});

export const CLAY_GHOST_MATERIAL = {
  color: new THREE.Color(CLAY_SURFACE_COLOR_DEFAULT),
  renderedFaces: RenderedFaces.TWO,
  opacity: 0.35,
  transparent: true,
  customId: 'canvas-bim-clay-ghost',
};

export const CLAY_SELECTED_MATERIAL = {
  color: new THREE.Color('#e5e5e5'),
  renderedFaces: RenderedFaces.TWO,
  opacity: 1,
  transparent: false,
  customId: 'canvas-bim-clay-selected',
};

export function buildClayBaseMaterial({ surfaceColor = CLAY_SURFACE_COLOR_DEFAULT } = {}) {
  return {
    color: new THREE.Color(surfaceColor),
    renderedFaces: RenderedFaces.TWO,
    opacity: 1,
    transparent: false,
    customId: 'canvas-bim-clay-base',
  };
}

export function buildClayGlassMaterial({
  surfaceColor = CLAY_SURFACE_COLOR_DEFAULT,
  glassOpacity = CLAY_GLASS_OPACITY_DEFAULT,
} = {}) {
  return {
    color: new THREE.Color(surfaceColor),
    renderedFaces: RenderedFaces.TWO,
    opacity: glassOpacity,
    transparent: true,
    customId: 'canvas-bim-clay-glass',
  };
}

export function isClayGlassElement(element) {
  return CLAY_GLASS_IFC_CLASSES.has(String(element?.ifcClass ?? '').trim());
}

export function resolveClayWireframeStyle(style = {}) {
  const hiddenLines = style.hiddenLines !== false;
  return {
    lineWeight: Number.isFinite(style.lineWeight)
      ? style.lineWeight
      : CLAY_WIREFRAME_LINE_WEIGHT_DEFAULT,
    opacity: Number.isFinite(style.opacity)
      ? style.opacity
      : CLAY_WIREFRAME_OPACITY_DEFAULT,
    color: style.color ?? CLAY_WIREFRAME_COLOR_DEFAULT,
    hiddenLines,
    depthTest: hiddenLines,
  };
}

/**
 * Ensures an offscreen render target has an initialized WebGL framebuffer.
 */
function ensureRenderTargetFramebuffer(renderer, target) {
  if (!renderer || !target) return null;
  let props = renderer.properties?.get(target);
  if (props?.__webglFramebuffer) return props.__webglFramebuffer;
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.setRenderTarget(previous);
  props = renderer.properties?.get(target);
  return props?.__webglFramebuffer ?? null;
}

export function resolveClayComposerDepthSource(clayComposerState) {
  return clayComposerState?.composer?.readBuffer
    ?? clayComposerState?.composer?.writeBuffer
    ?? null;
}

export function resolveClayComposerDepthSources(clayComposerState) {
  const composer = clayComposerState?.composer;
  if (!composer) return [];
  const targets = [composer.readBuffer, composer.writeBuffer];
  return targets.filter((target, index) => target && targets.indexOf(target) === index);
}

export function copyClayComposerDepthToScreen(renderer, clayComposerState, width, height) {
  const sources = resolveClayComposerDepthSources(clayComposerState);
  for (const source of sources) {
    if (copyRenderTargetDepthToScreen(renderer, source, width, height)) {
      return true;
    }
  }
  return false;
}

/**
 * Copies depth from an offscreen render target into the screen depth buffer.
 * Used after the clay composer beauty pass so wireframe edges can depth-test
 * against Fragments geometry without repainting the SSAO output.
 */
export function copyRenderTargetDepthToScreen(renderer, sourceTarget, width, height) {
  if (!renderer || !sourceTarget || !width || !height) return false;
  if (!sourceTarget.depthBuffer && !sourceTarget.depthTexture) return false;

  const gl = renderer.getContext?.();
  if (!gl || typeof gl.blitFramebuffer !== 'function') return false;

  const readFramebuffer = ensureRenderTargetFramebuffer(renderer, sourceTarget);
  if (!readFramebuffer) return false;

  const w = Math.floor(width);
  const h = Math.floor(height);
  const previousRenderTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(null);

  const blitVariants = [
    [0, h, 0, h],
    [0, h, h, 0],
  ];

  let copied = false;
  for (const [srcY0, srcY1, dstY0, dstY1] of blitVariants) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(
      0, srcY0, w, srcY1,
      0, dstY0, w, dstY1,
      gl.DEPTH_BUFFER_BIT,
      gl.NEAREST,
    );
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    copied = true;
    if (!gl.getError || gl.getError() === gl.NO_ERROR) {
      break;
    }
  }

  renderer.setRenderTarget(previousRenderTarget);
  return copied;
}

/** @deprecated Use copyRenderTargetDepthToScreen */
export const copySsaoDepthToScreen = copyRenderTargetDepthToScreen;

export function resolveClayViewDistance(camera, controlsTarget, boundsCenter) {
  if (camera?.position && controlsTarget) {
    return camera.position.distanceTo(controlsTarget);
  }
  if (camera?.position && boundsCenter) {
    return camera.position.distanceTo(boundsCenter);
  }
  return undefined;
}

/** Canonical view distance for slider tuning — AO scales from this reference. */
export const CLAY_SSAO_REFERENCE_DISTANCE_FACTOR = 1.25;
/** Floor/ceiling for zoom-responsive AO — keep full kernel when zoomed in (depth range handles precision). */
export const CLAY_SSAO_VIEW_SCALE_MIN = 1;
export const CLAY_SSAO_VIEW_SCALE_MAX = 2.75;
/** Max camera far:near ratio for SSAO depth precision (geometry still fits in frustum). */
export const CLAY_SSAO_MAX_DEPTH_RATIO = 8000;
/** Reference frustum span for scaling SSAO min/max distance thresholds. */
export const CLAY_SSAO_DEPTH_SPAN_REFERENCE = 45;

export function resolveClayCameraDepthRange({
  cameraDistance,
  modelRadius,
  cameraPosition,
  boundsCenter,
} = {}) {
  const radius = Math.max(modelRadius ?? 10, 1);
  const padding = 1.12;

  let centerDistance = Math.max(cameraDistance ?? radius * 1.5, radius * 0.005);
  if (cameraPosition?.distanceTo && boundsCenter) {
    centerDistance = Math.max(cameraPosition.distanceTo(boundsCenter), radius * 0.01);
  }

  const extent = radius * padding;
  const orbitDistance = Math.max(cameraDistance ?? centerDistance, radius * 0.01);
  const insideBounds = centerDistance < extent;

  let near;
  let far;

  if (insideBounds) {
    // Zoomed inside the padded bounds: use a local frustum so SSAO keeps depth precision.
    near = Math.max(0.02, orbitDistance * 0.04);
    far = Math.max(near + 3, orbitDistance + radius * 0.6);
    far = Math.max(far, centerDistance + extent * 0.35);
    const maxSpan = Math.max(radius * 0.85, orbitDistance + radius * 0.45);
    if (far - near > maxSpan) {
      far = near + maxSpan;
    }
  } else {
    near = Math.max(0.001, centerDistance - extent);
    far = Math.max(near + 0.1, centerDistance + extent);
  }

  const maxDepthRatio = CLAY_SSAO_MAX_DEPTH_RATIO;
  if (far / near > maxDepthRatio) {
    near = Math.max(0.001, far / maxDepthRatio);
  }

  return { near, far, distance: centerDistance, margin: extent, insideBounds };
}

export function applyClayCameraDepthRange(camera, {
  cameraDistance,
  modelRadius,
  boundsCenter,
} = {}) {
  if (!camera) return () => {};

  const saved = { near: camera.near, far: camera.far };
  const { near, far } = resolveClayCameraDepthRange({
    cameraDistance,
    modelRadius,
    cameraPosition: camera.position,
    boundsCenter,
  });

  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();

  return () => {
    camera.near = saved.near;
    camera.far = saved.far;
    camera.updateProjectionMatrix();
  };
}

export function setupClayLighting(
  scene,
  {
    backgroundColor = CLAY_BACKGROUND_DEFAULT,
    lightIntensity = CLAY_LIGHT_INTENSITY_DEFAULT,
  } = {},
) {
  if (!scene) return { lights: null, previousBackground: null };

  const previousBackground = scene.background;
  scene.background = new THREE.Color(backgroundColor);
  scene.environment = null;
  if ('environmentIntensity' in scene) {
    scene.environmentIntensity = 0;
  }

  const lights = new THREE.Group();
  lights.name = 'bim-clay-lights';

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0xe8e8e8, lightIntensity);
  const skylight = new THREE.DirectionalLight(0xffffff, lightIntensity * 0.17);
  skylight.position.set(0.12, 1, 0.08).normalize();

  lights.add(hemisphere, skylight);
  scene.add(lights);

  return { lights, previousBackground };
}

export function updateClayLightingIntensity(clayLightingState, lightIntensity = CLAY_LIGHT_INTENSITY_DEFAULT) {
  const lights = clayLightingState?.lights;
  if (!lights) return;

  lights.children.forEach((child) => {
    if (child.isHemisphereLight) {
      child.intensity = lightIntensity;
    } else if (child.isDirectionalLight) {
      child.intensity = lightIntensity * 0.17;
    }
  });
}

export function teardownClayLighting(scene, clayLightingState) {
  if (!scene || !clayLightingState) return;
  if (clayLightingState.lights) {
    scene.remove(clayLightingState.lights);
    clayLightingState.lights.traverse((child) => child.dispose?.());
  }
  scene.background = clayLightingState.previousBackground ?? scene.background;
}

export function createClayComposer(renderer, scene, camera, width, height) {
  if (!renderer || !scene || !camera) return null;

  const logicalWidth = Math.max(1, width);
  const logicalHeight = Math.max(1, height);
  const composer = new EffectComposer(renderer);
  composer.setSize(logicalWidth, logicalHeight);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const ssaoPass = new SSAOPass(scene, camera, logicalWidth, logicalHeight);
  ssaoPass.output = SSAOPass.OUTPUT.Default;
  composer.addPass(ssaoPass);

  const outputPass = new OutputPass();
  // Keep RenderPass depth in readBuffer — a post-swap writeBuffer is empty depth.
  outputPass.needsSwap = false;
  composer.addPass(outputPass);

  return { composer, renderPass, ssaoPass, outputPass, baseWidth: logicalWidth, baseHeight: logicalHeight };
}

export function resolveClaySsaoKernelSize(aoSamples = CLAY_AO_SAMPLES_DEFAULT) {
  const numeric = Number(aoSamples);
  if (!Number.isFinite(numeric)) return CLAY_AO_SAMPLES_DEFAULT;
  return Math.min(
    CLAY_AO_SAMPLES_MAX,
    Math.max(CLAY_AO_SAMPLES_MIN, Math.round(numeric)),
  );
}

export function resolveClaySsaoResolutionScale(aoResolution = CLAY_AO_RESOLUTION_DEFAULT) {
  const numeric = Number(aoResolution);
  if (!Number.isFinite(numeric)) return CLAY_AO_RESOLUTION_DEFAULT;
  return Math.min(
    CLAY_AO_RESOLUTION_MAX,
    Math.max(CLAY_AO_RESOLUTION_MIN, numeric),
  );
}

export function resolveClaySsaoPassSize(width, height, aoResolution = CLAY_AO_RESOLUTION_DEFAULT) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const scale = resolveClaySsaoResolutionScale(aoResolution);
  return {
    width: Math.max(1, Math.floor(safeWidth * scale)),
    height: Math.max(1, Math.floor(safeHeight * scale)),
    scale,
  };
}

export function applyClaySsaoSampleCount(ssaoPass, aoSamples = CLAY_AO_SAMPLES_DEFAULT) {
  if (!ssaoPass?.ssaoMaterial) return false;

  const kernelSize = resolveClaySsaoKernelSize(aoSamples);
  const currentSize = ssaoPass.ssaoMaterial.defines?.KERNEL_SIZE;
  if (currentSize === kernelSize && ssaoPass.kernel?.length === kernelSize) {
    return true;
  }

  const kernel = [];
  for (let index = 0; index < kernelSize; index += 1) {
    const sample = new THREE.Vector3();
    sample.x = Math.random() * 2 - 1;
    sample.y = Math.random() * 2 - 1;
    sample.z = Math.random();
    sample.normalize();
    let sampleScale = index / kernelSize;
    sampleScale = THREE.MathUtils.lerp(0.1, 1, sampleScale * sampleScale);
    sample.multiplyScalar(sampleScale);
    kernel.push(sample);
  }

  ssaoPass.kernel = kernel;
  if (!ssaoPass.ssaoMaterial.defines) {
    ssaoPass.ssaoMaterial.defines = {};
  }
  ssaoPass.ssaoMaterial.defines.KERNEL_SIZE = kernelSize;
  if (!ssaoPass.ssaoMaterial.uniforms.kernel) {
    ssaoPass.ssaoMaterial.uniforms.kernel = { value: kernel };
  } else {
    ssaoPass.ssaoMaterial.uniforms.kernel.value = kernel;
  }
  ssaoPass.ssaoMaterial.needsUpdate = true;
  return true;
}

export function updateClaySsaoQuality(clayComposerState, {
  aoSamples = CLAY_AO_SAMPLES_DEFAULT,
  aoResolution = CLAY_AO_RESOLUTION_DEFAULT,
} = {}) {
  const ssaoPass = clayComposerState?.ssaoPass;
  if (!ssaoPass) return;

  applyClaySsaoSampleCount(ssaoPass, aoSamples);

  const baseWidth = clayComposerState.baseWidth ?? ssaoPass.width ?? 1;
  const baseHeight = clayComposerState.baseHeight ?? ssaoPass.height ?? 1;
  const { width, height } = resolveClaySsaoPassSize(baseWidth, baseHeight, aoResolution);
  if (ssaoPass.width !== width || ssaoPass.height !== height) {
    if (typeof ssaoPass.setSize === 'function') {
      ssaoPass.setSize(width, height);
    } else {
      ssaoPass.width = width;
      ssaoPass.height = height;
    }
  }
}

export function resizeClayComposer(clayComposerState, width, height, quality = {}) {
  if (!clayComposerState?.composer) return;
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  clayComposerState.baseWidth = safeWidth;
  clayComposerState.baseHeight = safeHeight;
  clayComposerState.composer.setSize(safeWidth, safeHeight);
  updateClaySsaoQuality(clayComposerState, quality);
}

function clampClaySliderNorm(value, min, max) {
  if (!Number.isFinite(value) || max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/**
 * Maps clay AO slider values to Three.js SSAOPass settings (pure, unit-testable).
 */
export function resolveClaySsaoSettings({
  aoIntensity = CLAY_AO_INTENSITY_DEFAULT,
  aoRadius = CLAY_AO_RADIUS_DEFAULT,
  aoBias = CLAY_AO_BIAS_DEFAULT,
  aoDistance = CLAY_AO_DISTANCE_DEFAULT,
  cameraDistance,
  modelRadius,
  cameraNear,
  cameraFar,
} = {}) {
  const radius = Math.max(modelRadius ?? 10, 1);
  const viewDistance = Math.max(cameraDistance ?? radius * 1.5, radius * 0.005);
  const referenceDistance = radius * CLAY_SSAO_REFERENCE_DISTANCE_FACTOR;
  const rawViewScale = viewDistance / referenceDistance;
  const viewScale = Math.min(
    CLAY_SSAO_VIEW_SCALE_MAX,
    Math.max(CLAY_SSAO_VIEW_SCALE_MIN, rawViewScale),
  );

  const strength = clampClaySliderNorm(
    aoIntensity,
    CLAY_AO_INTENSITY_MIN,
    CLAY_AO_INTENSITY_MAX,
  );
  const radiusNorm = clampClaySliderNorm(aoRadius, CLAY_AO_RADIUS_MIN, CLAY_AO_RADIUS_MAX);
  const biasNorm = clampClaySliderNorm(aoBias, CLAY_AO_BIAS_MIN, CLAY_AO_BIAS_MAX);
  const distanceNorm = clampClaySliderNorm(aoDistance, CLAY_AO_DISTANCE_MIN, CLAY_AO_DISTANCE_MAX);

  const baseKernel = (0.5 + radiusNorm * 15) * (radius / 8) * (0.85 + strength * 0.35);
  const kernelRadius = Math.max(CLAY_SSAO_KERNEL_RADIUS_FLOOR, baseKernel * viewScale);
  let minDistance = 0.0005 + biasNorm * 0.08;
  const distanceBase = 0.02 + distanceNorm * 0.98;
  let maxDistance = Math.min(1, distanceBase * (0.35 + strength * 1.65));

  const depthSpan = Number.isFinite(cameraFar) && Number.isFinite(cameraNear) && cameraFar > cameraNear
    ? cameraFar - cameraNear
    : null;
  if (depthSpan) {
    const spanScale = Math.min(1, CLAY_SSAO_DEPTH_SPAN_REFERENCE / depthSpan);
    minDistance *= spanScale;
    maxDistance *= spanScale;
  }

  return { kernelRadius, minDistance, maxDistance, viewScale };
}

export function updateClayComposerSettings(clayComposerState, {
  aoIntensity = CLAY_AO_INTENSITY_DEFAULT,
  aoRadius = CLAY_AO_RADIUS_DEFAULT,
  aoBias = CLAY_AO_BIAS_DEFAULT,
  aoDistance = CLAY_AO_DISTANCE_DEFAULT,
  aoSamples = CLAY_AO_SAMPLES_DEFAULT,
  aoResolution = CLAY_AO_RESOLUTION_DEFAULT,
  camera,
  cameraDistance,
  modelRadius,
} = {}) {
  const ssaoPass = clayComposerState?.ssaoPass;
  if (!ssaoPass || !camera) return;

  updateClaySsaoQuality(clayComposerState, { aoSamples, aoResolution });

  const { kernelRadius, minDistance, maxDistance } = resolveClaySsaoSettings({
    aoIntensity,
    aoRadius,
    aoBias,
    aoDistance,
    cameraDistance,
    modelRadius,
    cameraNear: camera.near,
    cameraFar: camera.far,
  });

  ssaoPass.kernelRadius = kernelRadius;
  ssaoPass.minDistance = minDistance;
  ssaoPass.maxDistance = maxDistance;

  ssaoPass.ssaoMaterial.uniforms.cameraNear.value = camera.near;
  ssaoPass.ssaoMaterial.uniforms.cameraFar.value = camera.far;
  ssaoPass.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
  ssaoPass.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);

  ssaoPass.depthRenderMaterial.uniforms.cameraNear.value = camera.near;
  ssaoPass.depthRenderMaterial.uniforms.cameraFar.value = camera.far;

  ssaoPass.ssaoMaterial.uniforms.kernelRadius.value = ssaoPass.kernelRadius;
  ssaoPass.ssaoMaterial.uniforms.minDistance.value = ssaoPass.minDistance;
  ssaoPass.ssaoMaterial.uniforms.maxDistance.value = ssaoPass.maxDistance;
}

export function disposeClayComposer(clayComposerState) {
  if (!clayComposerState) return;
  clayComposerState.ssaoPass?.dispose?.();
  clayComposerState.composer?.dispose?.();
}

export function applyViewportBackground(scene, renderer, backgroundColor = CLAY_BACKGROUND_DEFAULT) {
  const color = new THREE.Color(backgroundColor);
  if (scene) {
    if (scene.background?.isColor) {
      scene.background.copy(color);
    } else {
      scene.background = color;
    }
  }
  if (renderer) {
    renderer.setClearColor(color, 1);
  }
}

/** @deprecated Use applyViewportBackground */
export const applyClaySceneBackground = applyViewportBackground;

export async function applyClayBaseMaterials(
  model,
  preparedModel,
  cache,
  allLocalIds,
  { surfaceColor = CLAY_SURFACE_COLOR_DEFAULT, glassOpacity = CLAY_GLASS_OPACITY_DEFAULT } = {},
) {
  if (!model || !allLocalIds?.length) return;

  const baseMaterial = buildClayBaseMaterial({ surfaceColor });
  const glassMaterial = buildClayGlassMaterial({ surfaceColor, glassOpacity });

  for (const chunk of chunkLocalIds(allLocalIds)) {
    await model.highlight(chunk, baseMaterial);
  }

  const glassElements = (preparedModel?.elements ?? []).filter(isClayGlassElement);
  if (!glassElements.length) return;

  const idMap = await resolveFragmentsLocalIdsByGlobalIds(
    model,
    glassElements.map((element) => element.ifcGlobalId),
    cache,
  );
  const glassLocalIds = glassElements
    .map((element) => idMap.get(element.ifcGlobalId))
    .filter(isValidFragmentsLocalId);
  if (!glassLocalIds.length) return;

  for (const chunk of chunkLocalIds(glassLocalIds)) {
    await model.highlight(chunk, glassMaterial);
  }
}


export function renderClayFrame({
  renderer,
  clayComposerState,
  scene,
  overlayScene,
  camera,
  wireframeEdges,
  wireframeEnabled = false,
  wireframeOptions = {},
  backgroundColor = CLAY_BACKGROUND_DEFAULT,
  aoIntensity = CLAY_AO_INTENSITY_DEFAULT,
  aoRadius = CLAY_AO_RADIUS_DEFAULT,
  aoBias = CLAY_AO_BIAS_DEFAULT,
  aoDistance = CLAY_AO_DISTANCE_DEFAULT,
  aoSamples = CLAY_AO_SAMPLES_DEFAULT,
  aoResolution = CLAY_AO_RESOLUTION_DEFAULT,
  cameraDistance,
  modelRadius,
  boundsCenter,
} = {}) {
  if (!renderer || !clayComposerState?.composer || !scene || !camera) {
    return false;
  }

  applyViewportBackground(scene, renderer, backgroundColor);
  const restoreCameraDepth = applyClayCameraDepthRange(camera, {
    cameraDistance,
    modelRadius,
    boundsCenter,
  });
  try {
    updateClayComposerSettings(clayComposerState, {
      aoIntensity,
      aoRadius,
      aoBias,
      aoDistance,
      aoSamples,
      aoResolution,
      camera,
      cameraDistance,
      modelRadius,
    });
    clayComposerState.composer.render();

    const wireframeOpacity = wireframeOptions.opacity;
    const shouldDrawWireframe = wireframeEnabled
      && wireframeEdges?.parent
      && overlayScene
      && (!Number.isFinite(wireframeOpacity) || wireframeOpacity > 0);
    if (shouldDrawWireframe) {
      renderer.setRenderTarget(null);
      const hiddenLines = wireframeOptions.hiddenLines !== false;
      let depthTest = hiddenLines;
      if (hiddenLines) {
        depthTest = populateScreenDepthFromScene(renderer, scene, camera);
      }
      renderWireframeOverlayPass(renderer, overlayScene, camera, wireframeEdges, {
        ...wireframeOptions,
        depthTest,
      });
      renderer.resetState?.();
    }
  } finally {
    restoreCameraDepth();
  }

  return true;
}

/** Saved "Rhino Arctic" style preset — applied when entering clay mode. */
export const RHINO_ARCTIC_CLAY_STYLE = {
  renderStyle: 'clay',
  viewportBackgroundColor: '#ffffff',
  clayAoIntensity: 0,
  clayAoRadius: 0.0005,
  clayAoBias: 0.05,
  clayAoDistance: 0.17,
  clayAoSamples: 256,
  clayAoResolution: 1,
  clayLightIntensity: 2.7,
  claySurfaceColor: '#f8f8f8',
  clayGlassOpacity: 0.31,
  wireframeMode: false,
  wireframeColor: '#919191',
  wireframeOpacity: 0.5,
  wireframeLineWeight: 1.25,
  wireframeHiddenLines: true,
  showEnvironment: true,
  lightingMode: 'soft',
  environmentPreset: 'sunset',
};

export function getClayPresetWorkspacePatch() {
  return applyBimStyleSettings({}, RHINO_ARCTIC_CLAY_STYLE);
}
