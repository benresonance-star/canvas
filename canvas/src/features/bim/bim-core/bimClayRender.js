import * as THREE from 'three';
import { RenderedFaces } from '@thatopen/fragments';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { renderWireframeOverlayPass, createWireframeDepthMaterial } from './bimWireframeOverlay.js';
import { chunkLocalIds } from './bimPickPipeline.js';
import { resolveFragmentsLocalIdsByGlobalIds, isValidFragmentsLocalId } from './fragmentsSelection.js';
import {
  CLAY_AO_BIAS_DEFAULT,
  CLAY_AO_DISTANCE_DEFAULT,
  CLAY_AO_INTENSITY_DEFAULT,
  CLAY_AO_RADIUS_DEFAULT,
  CLAY_BACKGROUND_DEFAULT,
  CLAY_GLASS_OPACITY_DEFAULT,
  CLAY_LIGHT_INTENSITY_DEFAULT,
  CLAY_SURFACE_COLOR_DEFAULT,
  normalizeClayStyle,
} from './types.js';

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
export const CLAY_WIREFRAME_OPACITY_DEFAULT = 1;

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
  return {
    lineWeight: Number.isFinite(style.lineWeight)
      ? style.lineWeight
      : CLAY_WIREFRAME_LINE_WEIGHT_DEFAULT,
    opacity: Number.isFinite(style.opacity)
      ? style.opacity
      : CLAY_WIREFRAME_OPACITY_DEFAULT,
    color: style.color ?? CLAY_WIREFRAME_COLOR_DEFAULT,
    depthTest: true,
  };
}

export function applyClayCameraDepthRange(camera, { cameraDistance, modelRadius } = {}) {
  if (!camera) return () => {};

  const radius = Math.max(modelRadius ?? 10, 1);
  const distance = Math.max(cameraDistance ?? radius * 2, radius * 0.5);
  const saved = { near: camera.near, far: camera.far };
  const margin = radius * 2.75;

  camera.near = Math.max(0.05, distance - margin);
  camera.far = Math.max(camera.near + 1, distance + margin);
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

  const composer = new EffectComposer(renderer);
  composer.setSize(Math.max(1, width), Math.max(1, height));

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const ssaoPass = new SSAOPass(scene, camera, Math.max(1, width), Math.max(1, height));
  ssaoPass.output = SSAOPass.OUTPUT.Default;
  composer.addPass(ssaoPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  return { composer, renderPass, ssaoPass, outputPass };
}

export function resizeClayComposer(clayComposerState, width, height) {
  if (!clayComposerState?.composer) return;
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  clayComposerState.composer.setSize(safeWidth, safeHeight);
  clayComposerState.ssaoPass?.setSize?.(safeWidth, safeHeight);
}

export function updateClayComposerSettings(clayComposerState, {
  aoIntensity = CLAY_AO_INTENSITY_DEFAULT,
  aoRadius = CLAY_AO_RADIUS_DEFAULT,
  aoBias = CLAY_AO_BIAS_DEFAULT,
  aoDistance = CLAY_AO_DISTANCE_DEFAULT,
  camera,
  modelRadius,
} = {}) {
  const ssaoPass = clayComposerState?.ssaoPass;
  if (!ssaoPass || !camera) return;

  const radius = Math.max(modelRadius ?? 10, 1);

  ssaoPass.kernelRadius = Math.max(0.25, aoRadius * (radius / 12));
  ssaoPass.minDistance = aoBias;
  ssaoPass.maxDistance = Math.min(1, aoDistance * (0.55 + aoIntensity * 0.045));

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

export function applyClaySceneBackground(scene, renderer, backgroundColor = CLAY_BACKGROUND_DEFAULT) {
  if (scene) {
    scene.background = new THREE.Color(backgroundColor);
  }
  if (renderer) {
    renderer.setClearColor(backgroundColor, 1);
  }
}

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

let clayDepthOverrideMaterial = null;

function getClayDepthOverrideMaterial() {
  if (!clayDepthOverrideMaterial) {
    clayDepthOverrideMaterial = createWireframeDepthMaterial();
  }
  return clayDepthOverrideMaterial;
}

export function renderClayDepthPrepass(renderer, scene, camera) {
  if (!renderer || !scene || !camera) return false;

  const previousOverride = scene.overrideMaterial;
  const previousAutoClear = renderer.autoClear;
  scene.overrideMaterial = getClayDepthOverrideMaterial();
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(scene, camera);
  scene.overrideMaterial = previousOverride;
  renderer.autoClear = previousAutoClear;
  return true;
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
  cameraDistance,
  modelRadius,
} = {}) {
  if (!renderer || !clayComposerState?.composer || !scene || !camera) {
    return false;
  }

  applyClaySceneBackground(scene, renderer, backgroundColor);
  const restoreCameraDepth = applyClayCameraDepthRange(camera, { cameraDistance, modelRadius });
  try {
    updateClayComposerSettings(clayComposerState, {
      aoIntensity,
      aoRadius,
      aoBias,
      aoDistance,
      camera,
      modelRadius,
    });
    clayComposerState.composer.render();

    if (wireframeEnabled && wireframeEdges?.parent && overlayScene) {
      renderer.setRenderTarget(null);
      if (wireframeOptions.depthTest !== false) {
        renderClayDepthPrepass(renderer, scene, camera);
      }
      renderWireframeOverlayPass(renderer, overlayScene, camera, wireframeEdges, wireframeOptions);
    }
  } finally {
    restoreCameraDepth();
  }

  return true;
}

export function getClayPresetWorkspacePatch() {
  return normalizeClayStyle({ renderStyle: 'clay' });
}
