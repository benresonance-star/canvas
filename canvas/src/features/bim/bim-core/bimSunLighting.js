import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import {
  buildSunPathGridSamples,
  buildSunPathSamples,
  buildSunStudyReadout,
  configureDirectionalShadowCamera,
  normalizeBimEnvironmentalAnalysisState,
  resolveSunDirection,
  resolveSunFromEnvironmentalState,
  resolveSunIntensity,
  splitSunPathSamplesByHorizon,
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
    sunPath: null,
    sunPathCacheKey: null,
    shadowUpdateKey: null,
    shadowModelRoot: null,
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
  ground.userData.shadowMaterialState = {
    color: '#000000',
    opacity: 0.22,
  };
  adapter.scene.add(ground);
  adapter.ground = ground;
  return ground;
}

function updateGround(adapter, bounds, enabled, sunStudy = {}) {
  if (!enabled) {
    if (adapter.ground) adapter.ground.visible = false;
    return;
  }
  const ground = ensureGround(adapter, bounds);
  const shadowColor = sunStudy.shadowColor ?? '#000000';
  const shadowOpacity = Number.isFinite(Number(sunStudy.shadowOpacity))
    ? Number(sunStudy.shadowOpacity)
    : 0.22;
  const materialState = ground.userData.shadowMaterialState ?? {};
  if (materialState.color !== shadowColor) {
    ground.material.color.set(shadowColor);
    materialState.color = shadowColor;
  }
  if (materialState.opacity !== shadowOpacity) {
    ground.material.opacity = shadowOpacity;
    materialState.opacity = shadowOpacity;
  }
  ground.userData.shadowMaterialState = materialState;
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

function updateSunTracker(adapter, bounds, direction, enabled, sunPathRadius = 1) {
  if (!enabled) {
    if (adapter.tracker) adapter.tracker.group.visible = false;
    return;
  }
  const tracker = ensureSunTracker(adapter);
  const center = centerFromBounds(bounds);
  const radius = Math.max(1, Number(bounds?.radius) || 10);
  const domeRadius = radius * Math.min(5, Math.max(0.25, Number(sunPathRadius) || 1));
  const markerDistance = Math.max(6, domeRadius);
  const markerRadius = Math.max(0.35, radius * 0.095);
  const markerPosition = center.clone().addScaledVector(direction, markerDistance);
  tracker.marker.position.copy(markerPosition);
  tracker.marker.scale.setScalar(markerRadius);
  tracker.line.geometry.setFromPoints([center, markerPosition]);
  tracker.line.geometry.computeBoundingSphere();
  tracker.group.visible = true;
}

function ensureSunPath(adapter) {
  if (adapter.sunPath) return adapter.sunPath;
  const group = new THREE.Group();
  group.name = 'bim-sun-study-path';

  const dayArc = new THREE.Group();
  dayArc.name = 'bim-sun-study-day-arc';

  const belowArc = new THREE.Group();
  belowArc.name = 'bim-sun-study-below-horizon-arc';

  const compass = new THREE.Group();
  compass.name = 'bim-sun-study-compass';
  const compassMaterial = new THREE.LineBasicMaterial({
    color: 0x93c5fd,
    transparent: true,
    opacity: 0.58,
    toneMapped: false,
  });
  compass.add(new THREE.LineLoop(new THREE.BufferGeometry(), compassMaterial));
  ['N', 'E', 'S', 'W'].forEach((name) => {
    const axis = new THREE.Line(new THREE.BufferGeometry(), compassMaterial.clone());
    axis.name = `bim-sun-study-compass-${name}`;
    compass.add(axis);
  });

  const monthGrid = new THREE.Group();
  monthGrid.name = 'bim-sun-study-month-grid';
  const hourGrid = new THREE.Group();
  hourGrid.name = 'bim-sun-study-hour-grid';

  group.add(monthGrid, hourGrid, belowArc, dayArc, compass);
  adapter.scene.add(group);
  adapter.sunPath = { group, dayArc, belowArc, compass, monthGrid, hourGrid };
  return adapter.sunPath;
}

function syncLinePool(group, count, materialFactory) {
  while (group.children.length < count) {
    group.add(new THREE.Line(new THREE.BufferGeometry(), materialFactory()));
  }
  while (group.children.length > count) {
    const child = group.children.pop();
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  }
}

function sunPathPoint(sample, center, radius, trueNorthOffsetDeg) {
  const direction = vectorFromPlain(resolveSunDirection({
    azimuthDeg: sample.azimuthDeg,
    elevationDeg: Math.max(0, sample.elevationDeg),
    trueNorthOffsetDeg,
  }));
  return center.clone().addScaledVector(direction, radius);
}

function updateCompass(compass, center, radius, visible) {
  compass.visible = visible;
  if (!visible) return;
  const ringPoints = [];
  for (let index = 0; index < 96; index += 1) {
    const angle = (index / 96) * Math.PI * 2;
    ringPoints.push(new THREE.Vector3(
      center.x + Math.sin(angle) * radius,
      center.y,
      center.z + Math.cos(angle) * radius,
    ));
  }
  compass.children[0].geometry.setFromPoints(ringPoints);
  const axes = [
    [new THREE.Vector3(center.x, center.y, center.z), new THREE.Vector3(center.x, center.y, center.z + radius)],
    [new THREE.Vector3(center.x, center.y, center.z), new THREE.Vector3(center.x + radius, center.y, center.z)],
    [new THREE.Vector3(center.x, center.y, center.z), new THREE.Vector3(center.x, center.y, center.z - radius)],
    [new THREE.Vector3(center.x, center.y, center.z), new THREE.Vector3(center.x - radius, center.y, center.z)],
  ];
  axes.forEach((points, index) => {
    compass.children[index + 1].geometry.setFromPoints(points);
  });
}

function samplePointSegments(samples, center, radius, trueNorthOffsetDeg, { belowHorizon = false } = {}) {
  return splitSunPathSamplesByHorizon(samples, { belowHorizon })
    .map((segment) => segment.map((sample) => sunPathPoint(
      sample,
      center,
      radius,
      trueNorthOffsetDeg,
    )));
}

function setLineSegments(group, segments, materialFactory) {
  syncLinePool(group, segments.length, materialFactory);
  segments.forEach((points, index) => {
    group.children[index].geometry.setFromPoints(points);
  });
}

function roundedNumber(value, precision = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(precision));
}

function boundsCacheKey(bounds = {}) {
  return [
    roundedNumber(bounds.center?.x),
    roundedNumber(bounds.center?.y),
    roundedNumber(bounds.center?.z),
    roundedNumber(bounds.min?.y),
    roundedNumber(bounds.radius),
  ].join(',');
}

function sunPathCacheKey(state, bounds = {}) {
  return JSON.stringify({
    bounds: boundsCacheKey(bounds),
    latitude: state.site.latitude,
    longitude: state.site.longitude,
    timezone: state.site.timezone,
    daylightSavingTime: state.site.daylightSavingTime,
    trueNorthOffsetDeg: state.site.trueNorthOffsetDeg,
    dateTimeLocal: state.sunStudy.geo.dateTimeLocal,
    sunPathRadius: state.sunStudy.sunPathRadius,
    showCompass: state.sunStudy.showCompass,
  });
}

function shadowUpdateKey({ state, bounds, sun, castShadow }) {
  return JSON.stringify({
    bounds: boundsCacheKey(bounds),
    castShadow,
    shadowQuality: state.sunStudy.shadowQuality,
    azimuthDeg: roundedNumber(sun.azimuthDeg),
    elevationDeg: roundedNumber(sun.elevationDeg),
    trueNorthOffsetDeg: roundedNumber(sun.trueNorthOffsetDeg),
  });
}

function updateSunPath(adapter, bounds, environmentalAnalysis, enabled) {
  if (!enabled) {
    if (adapter.sunPath) adapter.sunPath.group.visible = false;
    return;
  }
  const path = ensureSunPath(adapter);
  const state = normalizeBimEnvironmentalAnalysisState(environmentalAnalysis);
  const nextCacheKey = sunPathCacheKey(state, bounds);
  if (adapter.sunPathCacheKey === nextCacheKey) {
    path.group.visible = true;
    return;
  }
  const center = centerFromBounds(bounds);
  const modelRadius = Math.max(1, Number(bounds?.radius) || 10);
  const radius = modelRadius * state.sunStudy.sunPathRadius;
  const grid = buildSunPathGridSamples(state);
  const monthMaterialFactory = () => new THREE.LineBasicMaterial({
    color: 0x3b82f6,
    transparent: true,
    opacity: 0.62,
    toneMapped: false,
  });
  const hourMaterialFactory = () => new THREE.LineBasicMaterial({
    color: 0x60a5fa,
    transparent: true,
    opacity: 0.38,
    toneMapped: false,
  });
  const dayMaterialFactory = () => new THREE.LineBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
  });
  const belowMaterialFactory = () => new THREE.LineBasicMaterial({
    color: 0x9ca3af,
    transparent: true,
    opacity: 0.28,
    toneMapped: false,
  });
  const monthSegments = grid.monthArcs.flatMap((arc) => (
    samplePointSegments(arc.samples, center, radius, state.site.trueNorthOffsetDeg)
  ));
  const hourSegments = grid.hourCurves.flatMap((curve) => (
    samplePointSegments(curve.samples, center, radius, state.site.trueNorthOffsetDeg)
  ));
  setLineSegments(path.monthGrid, monthSegments, monthMaterialFactory);
  setLineSegments(path.hourGrid, hourSegments, hourMaterialFactory);
  const samples = buildSunPathSamples(state, { intervalMinutes: 20 });
  const daySegments = samplePointSegments(samples, center, radius, state.site.trueNorthOffsetDeg);
  const belowSegments = samplePointSegments(samples, center, radius, state.site.trueNorthOffsetDeg, {
    belowHorizon: true,
  });
  setLineSegments(path.dayArc, daySegments, dayMaterialFactory);
  setLineSegments(path.belowArc, belowSegments, belowMaterialFactory);
  updateCompass(path.compass, center, radius, state.sunStudy.showCompass);
  adapter.sunPathCacheKey = nextCacheKey;
  path.group.visible = true;
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
    updateGround(adapter, bounds, false, state.sunStudy);
    updateSky(adapter, bounds, false);
    updateSunTracker(adapter, bounds, new THREE.Vector3(0, 1, 0), false, state.sunStudy.sunPathRadius);
    updateSunPath(adapter, bounds, state, false);
    adapter.sun.castShadow = false;
    adapter.shadowUpdateKey = null;
    adapter.lastEnabled = false;
    return buildSunStudyReadout(state);
  }

  if (adapter.shadowModelRoot !== modelRoot) {
    enableModelSunShadows(modelRoot);
    adapter.shadowModelRoot = modelRoot;
  }
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
  const nextShadowUpdateKey = shadowUpdateKey({
    state,
    bounds,
    sun,
    castShadow: adapter.sun.castShadow,
  });
  if (adapter.shadowUpdateKey !== nextShadowUpdateKey) {
    configureDirectionalShadowCamera(adapter.sun, bounds, state.sunStudy.shadowQuality);
    adapter.sun.shadow.needsUpdate = true;
    adapter.renderer.shadowMap.needsUpdate = true;
    adapter.shadowUpdateKey = nextShadowUpdateKey;
  }
  updateGround(
    adapter,
    bounds,
    state.sunStudy.groundReceiverEnabled && adapter.sun.castShadow,
    state.sunStudy,
  );
  updateSunPath(
    adapter,
    bounds,
    state,
    state.sunStudy.controlMode === 'geo' && state.sunStudy.showSunPath,
  );
  updateSky(adapter, bounds, direction, state.sunStudy.showSkyDome);
  updateSunTracker(
    adapter,
    bounds,
    direction,
    state.sunStudy.showSunTracker,
    state.sunStudy.sunPathRadius,
  );

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
  if (adapter.sunPath) {
    adapter.scene?.remove(adapter.sunPath.group);
    adapter.sunPath.group.traverse((child) => {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
  }
}
