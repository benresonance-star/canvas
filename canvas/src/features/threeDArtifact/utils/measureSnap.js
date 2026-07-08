import * as THREE from 'three';
import { normalizeRlMeasurement } from '../../bim/bim-core/bimRlMeasure.js';

const edgeCacheByGeometry = new WeakMap();

const UNIT_LABELS = {
  mm: 'mm',
  cm: 'cm',
  m: 'm',
  in: 'in',
  ft: 'ft',
  unknown: 'units',
};

const AREA_UNIT_LABELS = {
  mm: 'mm²',
  cm: 'cm²',
  m: 'm²',
  in: 'in²',
  ft: 'ft²',
  unknown: 'units²',
};

export const MEASUREMENT_UNIT_OPTIONS = ['mm', 'cm', 'm', 'in', 'ft'];

const VALID_UNITS = new Set(MEASUREMENT_UNIT_OPTIONS);

/** Meters per one unit (ISO/base conversion). */
export const METERS_PER_UNIT = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  in: 0.0254,
  ft: 0.3048,
};

/**
 * @param {string | null | undefined} units
 * @returns {'mm' | 'cm' | 'm' | 'in' | 'ft'}
 */
export function normalizeMeasureUnits(units) {
  if (units && VALID_UNITS.has(units)) return units;
  return 'cm';
}

/**
 * Convert a distance from model world units to a display unit.
 * @param {number} distance Distance in `fromUnits` (typically model world space).
 * @param {string | null | undefined} fromUnits
 * @param {string | null | undefined} toUnits
 */
export function convertMeasurementDistance(distance, fromUnits, toUnits) {
  const from = normalizeMeasureUnits(fromUnits);
  const to = normalizeMeasureUnits(toUnits);
  const value = Number.isFinite(distance) ? distance : 0;
  if (from === to) return value;
  const meters = value * METERS_PER_UNIT[from];
  return meters / METERS_PER_UNIT[to];
}

/**
 * @param {number} distance Stored distance in model world units.
 * @param {string | null | undefined} displayUnits Unit shown in the UI.
 * @param {string | null | undefined} modelUnits Unit system of model world space.
 */
export function formatMeasurementDistance(distance, displayUnits = 'cm', modelUnits = null) {
  const display = normalizeMeasureUnits(displayUnits);
  const model = normalizeMeasureUnits(modelUnits ?? displayUnits);
  const label = UNIT_LABELS[display] ?? UNIT_LABELS.cm;
  const converted = convertMeasurementDistance(distance, model, display);
  return `${converted.toFixed(2)} ${label}`;
}

/**
 * Convert an area from model world units squared to a display unit squared.
 */
export function convertMeasurementArea(area, fromUnits, toUnits) {
  const linearFactor = convertMeasurementDistance(1, fromUnits, toUnits);
  const value = Number.isFinite(area) ? area : 0;
  return value * linearFactor * linearFactor;
}

/**
 * @param {number} area Stored area in model world units squared.
 */
export function formatMeasurementArea(area, displayUnits = 'cm', modelUnits = null) {
  const display = normalizeMeasureUnits(displayUnits);
  const model = normalizeMeasureUnits(modelUnits ?? displayUnits);
  const label = AREA_UNIT_LABELS[display] ?? AREA_UNIT_LABELS.cm;
  const converted = convertMeasurementArea(area, model, display);
  return `${converted.toFixed(2)} ${label}`;
}

/**
 * @param {THREE.Object3D | null | undefined} modelRoot
 * @param {number} [fallback=0.008]
 */
export function computeMeasurementMarkerRadius(modelRoot, fallback = 0.008) {
  if (!modelRoot) return fallback;

  const box = new THREE.Box3().setFromObject(modelRoot);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDim) || maxDim <= 0) return fallback;

  return Math.max(maxDim * 0.004, fallback * 0.25);
}

/**
 * @param {THREE.Camera} camera
 * @param {number} hitDistance
 * @param {number} viewportHeight
 * @param {number} pixelRadius
 */
export function computeSnapRadiusWorld(
  camera,
  hitDistance,
  viewportHeight,
  pixelRadius = 12,
) {
  if (!camera?.isPerspectiveCamera || !viewportHeight) {
    return hitDistance * 0.05;
  }
  const vFov = (camera.fov * Math.PI) / 180;
  const worldPerPixel = (2 * Math.tan(vFov / 2) * hitDistance) / viewportHeight;
  return Math.max(worldPerPixel * pixelRadius, 1e-6);
}

/**
 * @param {THREE.Raycaster} raycaster
 * @param {THREE.Vector2} pointer
 * @param {THREE.Camera} camera
 * @param {THREE.Object3D | null | undefined} modelRoot
 * @param {{ width?: number, height?: number }} viewportSize
 */
export function pickSurfaceHit(raycaster, pointer, camera, modelRoot, viewportSize = {}) {
  if (!modelRoot) return null;

  raycaster.setFromCamera(pointer, camera);
  const meshes = [];
  modelRoot.traverse((child) => {
    if (child.isMesh && child.visible) meshes.push(child);
  });
  if (!meshes.length) return null;

  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;

  const hit = hits[0];
  const viewportHeight = viewportSize.height ?? 720;
  return {
    point: hit.point.clone(),
    face: hit.face,
    object: hit.object,
    distance: hit.distance,
    snapRadius: computeSnapRadiusWorld(camera, hit.distance, viewportHeight),
  };
}

function closestPointOnSegment(point, a, b, target = new THREE.Vector3()) {
  const ab = _ab.subVectors(b, a);
  const lenSq = ab.lengthSq();
  if (lenSq <= 1e-12) return target.copy(a);
  const t = THREE.MathUtils.clamp(_t.subVectors(point, a).dot(ab) / lenSq, 0, 1);
  return target.copy(a).addScaledVector(ab, t);
}

const _ab = new THREE.Vector3();
const _t = new THREE.Vector3();
const _local = new THREE.Vector3();
const _worldA = new THREE.Vector3();
const _worldB = new THREE.Vector3();
const _closest = new THREE.Vector3();

/**
 * @param {THREE.BufferGeometry} geometry
 * @returns {Array<[number, number]>}
 */
export function buildGeometryEdgePairs(geometry) {
  if (!geometry) return [];

  const position = geometry.getAttribute('position');
  if (!position) return [];

  const edges = new Map();
  const addEdge = (a, b) => {
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    edges.set(`${min},${max}`, [min, max]);
  };

  const index = geometry.index;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      addEdge(a, b);
      addEdge(b, c);
      addEdge(c, a);
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      addEdge(i, i + 1);
      addEdge(i + 1, i + 2);
      addEdge(i + 2, i);
    }
  }

  return Array.from(edges.values());
}

/**
 * @param {THREE.Mesh} mesh
 * @returns {Array<[number, number]>}
 */
export function buildMeshEdgeCache(mesh) {
  const geometry = mesh?.geometry;
  if (!geometry) return [];

  const cached = edgeCacheByGeometry.get(geometry);
  if (cached) return cached;

  const pairs = buildGeometryEdgePairs(geometry);
  edgeCacheByGeometry.set(geometry, pairs);
  return pairs;
}

/**
 * @param {ReturnType<typeof pickSurfaceHit>} hit
 * @param {{ maxDistance?: number }} options
 */
export function snapToVertex(hit, { maxDistance = 0.1 } = {}) {
  if (!hit?.object?.isMesh) return null;

  const mesh = hit.object;
  const geometry = mesh.geometry;
  const position = geometry?.getAttribute?.('position');
  if (!position) return null;

  mesh.updateWorldMatrix(true, false);
  const worldMatrix = mesh.matrixWorld;

  let bestDistance = maxDistance;
  let bestPoint = null;

  for (let i = 0; i < position.count; i += 1) {
    _local.fromBufferAttribute(position, i);
    _worldA.copy(_local).applyMatrix4(worldMatrix);
    const distance = _worldA.distanceTo(hit.point);
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestPoint = _worldA.clone();
    }
  }

  if (!bestPoint) return null;

  return {
    kind: 'vertex',
    position: bestPoint.toArray(),
    meshUuid: mesh.uuid,
  };
}

/**
 * @param {ReturnType<typeof pickSurfaceHit>} hit
 * @param {Array<[number, number]>} edgePairs
 * @param {{ maxDistance?: number }} options
 */
export function snapToEdge(hit, edgePairs, { maxDistance = 0.1 } = {}) {
  if (!hit?.object?.isMesh || !edgePairs?.length) return null;

  const mesh = hit.object;
  const geometry = mesh.geometry;
  const position = geometry?.getAttribute?.('position');
  if (!position) return null;

  mesh.updateWorldMatrix(true, false);
  const worldMatrix = mesh.matrixWorld;

  let bestDistance = maxDistance;
  let bestPoint = null;
  let bestEdgeStart = null;
  let bestEdgeEnd = null;

  for (const [aIndex, bIndex] of edgePairs) {
    _local.fromBufferAttribute(position, aIndex);
    _worldA.copy(_local).applyMatrix4(worldMatrix);
    _local.fromBufferAttribute(position, bIndex);
    _worldB.copy(_local).applyMatrix4(worldMatrix);
    closestPointOnSegment(hit.point, _worldA, _worldB, _closest);
    const distance = _closest.distanceTo(hit.point);
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestPoint = _closest.clone();
      bestEdgeStart = _worldA.clone();
      bestEdgeEnd = _worldB.clone();
    }
  }

  if (!bestPoint || !bestEdgeStart || !bestEdgeEnd) return null;

  return {
    kind: 'edge',
    position: bestPoint.toArray(),
    edgeStart: bestEdgeStart.toArray(),
    edgeEnd: bestEdgeEnd.toArray(),
    meshUuid: mesh.uuid,
  };
}

/**
 * @param {'vertex' | 'edge'} snapMode
 * @param {ReturnType<typeof pickSurfaceHit>} hit
 * @param {{ maxDistance?: number }} options
 */
export function snapPickPoint(snapMode, hit, options = {}) {
  if (!hit) return null;
  if (snapMode === 'edge') {
    const edgePairs = buildMeshEdgeCache(hit.object);
    return snapToEdge(hit, edgePairs, options);
  }
  return snapToVertex(hit, options) ?? snapToEdge(hit, buildMeshEdgeCache(hit.object), options);
}

/**
 * @param {{ position: number[], edgeStart?: number[], edgeEnd?: number[], meshUuid?: string, kind?: string }} edgeSnap
 */
export function createEdgeMeasurementRecord(edgeSnap) {
  if (
    edgeSnap?.kind !== 'edge'
    || !Array.isArray(edgeSnap.edgeStart)
    || !Array.isArray(edgeSnap.edgeEnd)
  ) {
    return null;
  }

  const start = { position: edgeSnap.edgeStart, meshUuid: edgeSnap.meshUuid };
  const end = { position: edgeSnap.edgeEnd, meshUuid: edgeSnap.meshUuid };
  const startVec = new THREE.Vector3(...edgeSnap.edgeStart);
  const endVec = new THREE.Vector3(...edgeSnap.edgeEnd);

  return {
    id: crypto.randomUUID(),
    kind: 'segment',
    snapMode: 'edge',
    start,
    end,
    distance: startVec.distanceTo(endVec),
    createdAt: new Date().toISOString(),
  };
}

/**
 * @param {{ position: number[], meshUuid?: string }} start
 * @param {{ position: number[], meshUuid?: string }} end
 * @param {'vertex' | 'edge'} snapMode
 */
export function createMeasurementRecord(start, end, snapMode) {
  const startVec = new THREE.Vector3(...start.position);
  const endVec = new THREE.Vector3(...end.position);
  return {
    id: crypto.randomUUID(),
    kind: 'segment',
    snapMode,
    start,
    end,
    distance: startVec.distanceTo(endVec),
    createdAt: new Date().toISOString(),
  };
}

/**
 * @param {Array<{ position: number[] }>} points
 * @param {boolean} [closed=false]
 */
export function computePolylineDistance(points, closed = false) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = new THREE.Vector3(...points[index - 1].position);
    const end = new THREE.Vector3(...points[index].position);
    total += start.distanceTo(end);
  }
  if (closed && points.length >= 3) {
    const start = new THREE.Vector3(...points[points.length - 1].position);
    const end = new THREE.Vector3(...points[0].position);
    total += start.distanceTo(end);
  }
  return total;
}

/**
 * Planar polygon area in 3D using Newell's method.
 * @param {Array<{ position: number[] } | number[]>} points
 */
export function computePolygonArea3D(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]?.position ?? points[index];
    const next = points[(index + 1) % points.length]?.position ?? points[(index + 1) % points.length];
    if (!Array.isArray(current) || !Array.isArray(next)) continue;
    sumX += (current[1] - next[1]) * (current[2] + next[2]);
    sumY += (current[2] - next[2]) * (current[0] + next[0]);
    sumZ += (current[0] - next[0]) * (current[1] + next[1]);
  }

  return Math.sqrt((sumX * sumX) + (sumY * sumY) + (sumZ * sumZ)) / 2;
}

/**
 * @param {Array<{ position: number[] }>} points
 * @param {boolean} [closed=false]
 */
export function computePolylineArea(points, closed = false) {
  if (!closed || !Array.isArray(points) || points.length < 3) return null;
  const area = computePolygonArea3D(points);
  return Number.isFinite(area) && area > 0 ? area : null;
}

/**
 * @param {{ distance: number, area?: number | null, closed?: boolean, pointCount?: number }} values
 */
export function formatPolylineMeasurementLabel(
  values,
  displayUnits = 'cm',
  modelUnits = null,
) {
  const distanceLabel = formatMeasurementDistance(values.distance, displayUnits, modelUnits);
  const parts = [distanceLabel];
  if (values.closed && Number.isFinite(values.area) && values.area > 0) {
    parts.push(formatMeasurementArea(values.area, displayUnits, modelUnits));
  }
  parts.push(values.closed ? 'perimeter' : 'polyline');
  if (values.pointCount) {
    parts.push(`${values.pointCount} pts`);
  }
  return parts.join(' · ');
}

/**
 * @param {Array<{ position: number[], meshUuid?: string }>} points
 * @param {{ closed?: boolean, snapMode?: 'vertex' | 'edge' }} [options]
 */
export function createPolylineMeasurementRecord(points, { closed = false, snapMode = 'vertex' } = {}) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const normalizedPoints = points.map((point) => ({
    position: point.position,
    meshUuid: point.meshUuid,
  }));
  const closedLoop = Boolean(closed);
  const distance = computePolylineDistance(normalizedPoints, closedLoop);
  const area = computePolylineArea(normalizedPoints, closedLoop);
  return {
    id: crypto.randomUUID(),
    kind: 'polyline',
    snapMode,
    points: normalizedPoints,
    closed: closedLoop,
    distance,
    area,
    createdAt: new Date().toISOString(),
  };
}

function isValidMeasurementPoint(point) {
  return Array.isArray(point?.position) && point.position.length === 3;
}

function normalizeSegmentMeasurement(entry) {
  if (
    !entry
    || !isValidMeasurementPoint(entry.start)
    || !isValidMeasurementPoint(entry.end)
    || !Number.isFinite(entry.distance)
  ) {
    return null;
  }
  return {
    ...entry,
    kind: 'segment',
    start: entry.start,
    end: entry.end,
    distance: entry.distance,
  };
}

function normalizePolylineMeasurement(entry) {
  if (
    !entry
    || entry.kind !== 'polyline'
    || !Array.isArray(entry.points)
    || entry.points.length < 2
    || !entry.points.every(isValidMeasurementPoint)
  ) {
    return null;
  }
  const closed = Boolean(entry.closed);
  const distance = Number.isFinite(entry.distance)
    ? entry.distance
    : computePolylineDistance(entry.points, closed);
  if (!Number.isFinite(distance)) return null;
  const area = closed
    ? (Number.isFinite(entry.area) ? entry.area : computePolylineArea(entry.points, true))
    : null;
  return {
    ...entry,
    kind: 'polyline',
    points: entry.points,
    closed,
    distance,
    area,
  };
}

/**
 * @param {unknown} measurements
 * @returns {Array<object>}
 */
export function normalizeMeasurements(measurements) {
  if (!Array.isArray(measurements)) return [];
  return measurements.flatMap((entry) => {
    if (entry?.kind === 'polyline') {
      const normalized = normalizePolylineMeasurement(entry);
      return normalized ? [normalized] : [];
    }
    if (entry?.kind === 'rl') {
      const normalized = normalizeRlMeasurement(entry);
      return normalized ? [normalized] : [];
    }
    const normalized = normalizeSegmentMeasurement(entry);
    return normalized ? [normalized] : [];
  });
}

/**
 * @param {ReturnType<typeof normalizeMeasurements>[number]} measurement
 */
export function formatMeasurementLabel(measurement, displayUnits = 'cm', modelUnits = null) {
  if (measurement.kind === 'polyline') {
    return formatPolylineMeasurementLabel({
      distance: measurement.distance,
      area: measurement.area,
      closed: measurement.closed,
      pointCount: measurement.points?.length ?? 0,
    }, displayUnits, modelUnits);
  }
  const distanceLabel = formatMeasurementDistance(measurement.distance, displayUnits, modelUnits);
  return `${distanceLabel} · ${measurement.snapMode ?? 'vertex'}`;
}
