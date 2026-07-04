import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fitPerspectiveCameraToDefaultView } from '../utils/cameraFit.js';
import { resolveEnvironmentPreset } from '../utils/environmentConfig.js';
import {
  applyHdriEnvironment,
  createDirectLights,
  setHdriToneMapping,
} from '../utils/hdriEnvironment.js';
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
  setHdriToneMapping(renderer, useEnvironment);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#141414');

  let disposeEnvironment = () => {};
  if (useEnvironment) {
    disposeEnvironment = await applyHdriEnvironment(scene, renderer, resolvedPreset);
  }
  createDirectLights(scene, resolvedLightingMode);

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
