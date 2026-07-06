import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import {
  buildSunStudyReadout,
  configureDirectionalShadowCamera,
  normalizeBimEnvironmentalAnalysisState,
  resolveSunDirection,
  resolveSunFromEnvironmentalState,
  resolveSunIntensity,
} from './bimSunStudy.js';

function vectorFromPlain(direction) {
  return new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
}

function centerFromBounds(bounds = {}) {
  return new THREE.Vector3(
    Number(bounds.center?.x) || 0,
    Number(bounds.center?.y) || 0,
    Number(bounds.center?.z) || 0,
  );
}

export function enableModelSunShadows(modelRoot) {
  if (!modelRoot) return;
  modelRoot.traverse((child) => {
    if (!child?.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (child.material && !Array.isArray(child.material)) {
      child.material.needsUpdate = true;
    } else if (Array.isArray(child.material)) {
      child.material.forEach((material) => {
        if (material) material.needsUpdate = true;
      });
    }
  });
}

export function createBimSunLightingAdapter(scene, renderer) {
  const group = new THREE.Group();
  group.name = 'bim-sun-study-lights';

  const ambient = new THREE.HemisphereLight(0xf8fafc, 0x3f3428, 0.65);
  ambient.name = 'bim-sun-study-fill';

  const sun = new THREE.DirectionalLight(0xfff4dc, 2.6);
  sun.name = 'bim-sun-study-key';
  sun.castShadow = true;

  const target = new THREE.Object3D();
  target.name = 'bim-sun-study-target';
  sun.target = target;

  group.add(ambient, sun, target);
  group.visible = false;
  scene.add(group);

  return {
    scene,
    renderer,
    group,
    ambient,
    sun,
    target,
    ground: null,
    sky: null,
    tracker: null,
    lastEnabled: false,
  };
}

function ensureGround(adapter, bounds) {
  if (adapter.ground) return adapter.ground;
  const material = new THREE.ShadowMaterial({
    color: 0x000000,
    opacity: 0.22,
    transparent: true,
    depthWrite: false,
  });
  const geometry = new THREE.PlaneGeometry(1, 1);
  const ground = new THREE.Mesh(geometry, material);
  ground.name = 'bim-sun-study-ground-receiver';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  adapter.scene.add(ground);
  adapter.ground = ground;
  return ground;
}

function updateGround(adapter, bounds, enabled) {
  if (!enabled) {
    if (adapter.ground) adapter.ground.visible = false;
    return;
  }
  const ground = ensureGround(adapter, bounds);
  const radius = Math.max(1, Number(bounds?.radius) || 10);
  const groundY = Number.isFinite(Number(bounds?.min?.y))
    ? Number(bounds.min.y) - Math.max(0.02, radius * 0.01)
    : -0.02;
  ground.scale.set(radius * 5, radius * 5, 1);
  ground.position.set(
    Number(bounds?.center?.x) || 0,
    groundY,
    Number(bounds?.center?.z) || 0,
  );
  ground.visible = true;
}

function ensureSky(adapter) {
  if (adapter.sky) return adapter.sky;
  const sky = new Sky();
  sky.name = 'bim-sun-study-sky';
  sky.material.uniforms.turbidity.value = 8;
  sky.material.uniforms.rayleigh.value = 1.4;
  sky.material.uniforms.mieCoefficient.value = 0.004;
  sky.material.uniforms.mieDirectionalG.value = 0.82;
  adapter.scene.add(sky);
  adapter.sky = sky;
  return sky;
}

function updateSky(adapter, bounds, direction, enabled) {
  if (!enabled) {
    if (adapter.sky) adapter.sky.visible = false;
    return;
  }
  const sky = ensureSky(adapter);
  const radius = Math.max(500, (Number(bounds?.radius) || 10) * 20);
  sky.scale.setScalar(radius);
  sky.position.copy(centerFromBounds(bounds));
  sky.material.uniforms.sunPosition.value.copy(direction);
  sky.visible = true;
}

function ensureSunTracker(adapter) {
  if (adapter.tracker) return adapter.tracker;
  const group = new THREE.Group();
  group.name = 'bim-sun-study-tracker';

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffd166,
      toneMapped: false,
    }),
  );
  marker.name = 'bim-sun-study-tracker-marker';

  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
  ]);
  const line = new THREE.Line(
    lineGeometry,
    new THREE.LineBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.65,
      toneMapped: false,
    }),
  );
  line.name = 'bim-sun-study-tracker-ray';

  group.add(line, marker);
  adapter.scene.add(group);
  adapter.tracker = { group, marker, line };
  return adapter.tracker;
}

function updateSunTracker(adapter, bounds, direction, enabled) {
  if (!enabled) {
    if (adapter.tracker) adapter.tracker.group.visible = false;
    return;
  }
  const tracker = ensureSunTracker(adapter);
  const center = centerFromBounds(bounds);
  const radius = Math.max(1, Number(bounds?.radius) || 10);
  const markerDistance = Math.max(6, radius * 1.65);
  const markerRadius = Math.max(0.15, radius * 0.045);
  const markerPosition = center.clone().addScaledVector(direction, markerDistance);
  tracker.marker.position.copy(markerPosition);
  tracker.marker.scale.setScalar(markerRadius);
  tracker.line.geometry.setFromPoints([center, markerPosition]);
  tracker.line.geometry.computeBoundingSphere();
  tracker.group.visible = true;
}

export function applyBimSunLighting(adapter, {
  environmentalAnalysis,
  bounds,
  modelRoot,
} = {}) {
  if (!adapter?.scene || !adapter?.renderer) return null;
  const state = normalizeBimEnvironmentalAnalysisState(environmentalAnalysis);
  const enabled = state.sunStudy.enabled === true;

  adapter.group.visible = enabled;
  adapter.renderer.shadowMap.enabled = enabled && state.sunStudy.shadowsEnabled;
  adapter.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  if (!enabled) {
    updateGround(adapter, bounds, false);
    updateSky(adapter, bounds, false);
    updateSunTracker(adapter, bounds, new THREE.Vector3(0, 1, 0), false);
    adapter.sun.castShadow = false;
    adapter.lastEnabled = false;
    return buildSunStudyReadout(state);
  }

  enableModelSunShadows(modelRoot);
  const sun = resolveSunFromEnvironmentalState(state);
  const direction = vectorFromPlain(resolveSunDirection(sun));
  const center = centerFromBounds(bounds);
  const radius = Math.max(1, Number(bounds?.radius) || 10);
  const distance = Math.max(30, radius * 3);
  const intensity = resolveSunIntensity({
    elevationDeg: sun.elevationDeg,
    enabled,
  });

  adapter.target.position.copy(center);
  adapter.sun.position.copy(center).addScaledVector(direction, distance);
  adapter.target.updateMatrixWorld(true);
  adapter.sun.updateMatrixWorld(true);
  adapter.sun.intensity = intensity;
  adapter.sun.castShadow = state.sunStudy.shadowsEnabled && intensity > 0;
  adapter.ambient.intensity = intensity > 0 ? 0.42 : 0.65;
  configureDirectionalShadowCamera(adapter.sun, bounds, state.sunStudy.shadowQuality);
  adapter.sun.shadow.needsUpdate = true;
  adapter.renderer.shadowMap.needsUpdate = true;
  updateGround(adapter, bounds, state.sunStudy.groundReceiverEnabled && adapter.sun.castShadow);
  updateSky(adapter, bounds, direction, state.sunStudy.showSkyDome);
  updateSunTracker(adapter, bounds, direction, state.sunStudy.showSunTracker);

  adapter.lastEnabled = true;
  return buildSunStudyReadout(state);
}

export function disposeBimSunLightingAdapter(adapter) {
  if (!adapter) return;
  adapter.scene?.remove(adapter.group);
  adapter.group?.traverse((child) => {
    child.dispose?.();
  });
  if (adapter.ground) {
    adapter.scene?.remove(adapter.ground);
    adapter.ground.geometry?.dispose?.();
    adapter.ground.material?.dispose?.();
  }
  if (adapter.sky) {
    adapter.scene?.remove(adapter.sky);
    adapter.sky.geometry?.dispose?.();
    adapter.sky.material?.dispose?.();
  }
  if (adapter.tracker) {
    adapter.scene?.remove(adapter.tracker.group);
    adapter.tracker.group.traverse((child) => {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
  }
}
