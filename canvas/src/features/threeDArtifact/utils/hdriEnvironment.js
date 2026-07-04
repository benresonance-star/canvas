import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import {
  environmentHdriUrl,
  environmentSettingsForPreset,
  lightingForMode,
} from './environmentConfig.js';

function loadHdriTexture(url) {
  return new Promise((resolve, reject) => {
    new RGBELoader().load(url, resolve, undefined, reject);
  });
}

/**
 * @param {THREE.Scene} scene
 * @returns {THREE.Group}
 */
export function createBimLegacyLights(scene) {
  const group = new THREE.Group();
  group.name = 'bim-legacy-lights';

  const hemi = new THREE.HemisphereLight('#ffffff', '#4b423a', 2.2);
  group.add(hemi);

  const keyLight = new THREE.DirectionalLight('#ffffff', 2.4);
  keyLight.position.set(10, 16, 8);
  group.add(keyLight);

  const fillLight = new THREE.DirectionalLight('#d8c7b4', 1);
  fillLight.position.set(-12, 8, -10);
  group.add(fillLight);

  scene.add(group);
  return group;
}

/**
 * @param {THREE.Scene} scene
 * @param {'studio' | 'bright' | 'soft'} lightingMode
 * @returns {THREE.Group}
 */
export function createDirectLights(scene, lightingMode) {
  const lighting = lightingForMode(lightingMode);
  const group = new THREE.Group();
  group.name = 'bim-direct-lights';

  group.add(new THREE.AmbientLight(0xffffff, lighting.ambient));

  const hemi = new THREE.HemisphereLight(0xf8fafc, 0x222222, lighting.hemi);
  group.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, lighting.key);
  key.position.set(6, 8, 5);
  group.add(key);

  const fill = new THREE.DirectionalLight(0xdbeafe, lighting.fill);
  fill.position.set(-5, 4, -3);
  group.add(fill);

  const rim = new THREE.DirectionalLight(0xfff7ed, lighting.rim);
  rim.position.set(0, 6, -7);
  group.add(rim);

  scene.add(group);
  return group;
}

/**
 * @param {THREE.Object3D | null | undefined} lightGroup
 */
export function setLightGroupVisible(lightGroup, visible) {
  if (!lightGroup) return;
  lightGroup.visible = visible;
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Object3D | null | undefined} lightGroup
 */
export function removeLightGroup(scene, lightGroup) {
  if (!lightGroup) return;
  scene.remove(lightGroup);
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {boolean} enabled
 */
export function setHdriToneMapping(renderer, enabled) {
  if (!renderer) return;
  if (enabled) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    return;
  }
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 * @param {'studio' | 'city' | 'sunset'} environmentPreset
 * @returns {Promise<() => void>}
 */
export async function applyHdriEnvironment(scene, renderer, environmentPreset) {
  const url = environmentHdriUrl(environmentPreset);
  if (!url) return () => {};

  const settings = environmentSettingsForPreset(environmentPreset);
  let hdrTexture = null;
  let pmrem = null;
  let envMap = null;

  try {
    hdrTexture = await loadHdriTexture(url);
    hdrTexture.mapping = THREE.EquirectangularReflectionMapping;

    pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    envMap = pmrem.fromEquirectangular(hdrTexture).texture;
    scene.environment = envMap;
    if ('environmentIntensity' in scene) {
      scene.environmentIntensity = settings.environmentIntensity;
    }
  } catch {
    return () => {};
  } finally {
    hdrTexture?.dispose();
    pmrem?.dispose();
  }

  return () => {
    if (scene.environment === envMap) {
      scene.environment = null;
    }
    if ('environmentIntensity' in scene) {
      scene.environmentIntensity = 1;
    }
    envMap?.dispose();
  };
}
