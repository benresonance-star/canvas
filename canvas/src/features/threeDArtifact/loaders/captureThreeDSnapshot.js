import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { fitPerspectiveCameraToDefaultView } from '../utils/cameraFit.js';
import {
  environmentHdriUrl,
  environmentSettingsForPreset,
  lightingForMode,
  resolveEnvironmentPreset,
} from '../utils/environmentConfig.js';
import { normalizeThreeDViewerState } from '../utils/viewerState.js';
import { disposeObject3D } from '../utils/dispose.js';

/** Card preview body aspect (340×240 card minus ~52px header), 2× for crisp PNGs. */
export const THREE_D_SNAPSHOT_WIDTH = 680;
export const THREE_D_SNAPSHOT_HEIGHT = 376;

function loadGltfScene(url) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (error) => reject(error),
    );
  });
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Snapshot export failed'))),
      'image/png',
    );
  });
}

function addDirectLights(scene, lightingMode) {
  const lighting = lightingForMode(lightingMode);
  scene.add(new THREE.AmbientLight(0xffffff, lighting.ambient));
  const hemi = new THREE.HemisphereLight(0xf8fafc, 0x222222, lighting.hemi);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, lighting.key);
  key.position.set(6, 8, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdbeafe, lighting.fill);
  fill.position.set(-5, 4, -3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xfff7ed, lighting.rim);
  rim.position.set(0, 6, -7);
  scene.add(rim);
}

function loadHdriTexture(url) {
  return new Promise((resolve, reject) => {
    new RGBELoader().load(url, resolve, undefined, reject);
  });
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 * @param {'studio' | 'city' | 'sunset'} environmentPreset
 * @returns {Promise<() => void>}
 */
async function applyHdriEnvironment(scene, renderer, environmentPreset) {
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
    envMap?.dispose();
  };
}

/**
 * Render a centered default-view PNG of a GLB/GLTF model (headless, one shot).
 * @param {{
 *   sourceUrl: string,
 *   format: string,
 *   width?: number,
 *   height?: number,
 *   environmentPreset?: string,
 *   showEnvironment?: boolean,
 *   lightingMode?: string,
 *   viewerState?: object | null,
 * }} params
 * @returns {Promise<Blob>}
 */
export async function captureThreeDSnapshotBlob({
  sourceUrl,
  format,
  width = THREE_D_SNAPSHOT_WIDTH,
  height = THREE_D_SNAPSHOT_HEIGHT,
  environmentPreset,
  showEnvironment = true,
  lightingMode = 'studio',
  viewerState = null,
}) {
  const normalizedFormat = String(format ?? '').toLowerCase();
  if (!sourceUrl || (normalizedFormat !== 'glb' && normalizedFormat !== 'gltf')) {
    throw new Error('Unsupported 3D format for snapshot');
  }

  const normalizedViewerState = normalizeThreeDViewerState(viewerState ?? {
    lightingMode,
    environmentPreset,
    showEnvironment,
  });
  const resolvedPreset = resolveEnvironmentPreset(normalizedViewerState);
  const resolvedLightingMode = normalizedViewerState.lightingMode;
  const useEnvironment = normalizedViewerState.showEnvironment && showEnvironment;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: false,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#141414');

  let disposeEnvironment = () => {};
  if (useEnvironment) {
    disposeEnvironment = await applyHdriEnvironment(scene, renderer, resolvedPreset);
  }
  addDirectLights(scene, resolvedLightingMode);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
  const controls = { target: new THREE.Vector3(), update: () => {} };

  let object = null;
  try {
    object = await loadGltfScene(sourceUrl);
    scene.add(object);

    const fitted = fitPerspectiveCameraToDefaultView(camera, controls, object, {
      viewportAspect: width / height,
    });
    if (!fitted) {
      throw new Error('Could not frame model for snapshot');
    }

    renderer.render(scene, camera);
    return await canvasToPngBlob(renderer.domElement);
  } finally {
    disposeEnvironment();
    if (object) disposeObject3D(object);
    renderer.dispose();
  }
}
