import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import {
  getWireframeLineWidthForDistance,
  updateWireframeEdgeVisuals,
} from './bimWireframeOverlay.js';
import { populateScreenDepthFromScene } from './bimScreenDepth.js';
import {
  isElementHiddenByLayerFilter,
  normalizeHiddenLayerState,
} from './bimLayerVisibility.js';
import { isValidFragmentsLocalId, resolveFragmentsLocalIdsByGlobalIds } from './fragmentsSelection.js';
import {
  WIREFRAME_LINE_WEIGHT_DEFAULT,
  WIREFRAME_LINE_WEIGHT_MAX,
  WIREFRAME_LINE_WEIGHT_MIN,
} from './types.js';

export const SECTION_FILL_COLOR_DEFAULT = '#e8e8e8';
export const SECTION_EDGE_COLOR_DEFAULT = '#333333';
export const SECTION_EDGE_LINE_WEIGHT_DEFAULT = 1.5;
export const SECTION_PLANE_ID_DEFAULT = 'section-plane-1';
export const SECTION_FILL_OFFSET_SCALE = 0.00004;
export const SECTION_EDGE_OFFSET_SCALE = 0.00006;

function clampSectionWeight(value, fallback = SECTION_EDGE_LINE_WEIGHT_DEFAULT) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(WIREFRAME_LINE_WEIGHT_MAX, Math.max(WIREFRAME_LINE_WEIGHT_MIN, numeric));
}

function normalizeColor(value, fallback) {
  const color = String(value ?? fallback);
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function normalizeNormal(normal) {
  const vector = new THREE.Vector3(
    Number(normal?.[0] ?? 0),
    Number(normal?.[1] ?? -1),
    Number(normal?.[2] ?? 0),
  );
  if (vector.lengthSq() <= 0) return new THREE.Vector3(0, -1, 0);
  return vector.normalize();
}

function normalizePoint(point, fallbackY = 0) {
  const y = Number(point?.[1] ?? fallbackY);
  return new THREE.Vector3(
    Number(point?.[0] ?? 0),
    Number.isFinite(y) ? y : fallbackY,
    Number(point?.[2] ?? 0),
  );
}

function normalizePlanes(planes, fallbackY = 0) {
  if (!Array.isArray(planes) || planes.length === 0) {
    return [{
      id: SECTION_PLANE_ID_DEFAULT,
      normal: [0, -1, 0],
      point: [0, fallbackY, 0],
      enabled: true,
    }];
  }
  return planes.slice(0, 3).map((plane, index) => {
    const normal = normalizeNormal(plane?.normal).toArray();
    const point = normalizePoint(plane?.point, fallbackY).toArray();
    return {
      id: String(plane?.id ?? `section-plane-${index + 1}`),
      normal,
      point,
      enabled: plane?.enabled !== false,
    };
  });
}

export function normalizeBimSectionState(section = {}, { defaultPlaneY = 0 } = {}) {
  return {
    enabled: section?.enabled === true,
    showFills: section?.showFills !== false,
    showEdges: section?.showEdges !== false,
    fillColor: normalizeColor(section?.fillColor, SECTION_FILL_COLOR_DEFAULT),
    edgeColor: normalizeColor(section?.edgeColor, SECTION_EDGE_COLOR_DEFAULT),
    edgeLineWeight: clampSectionWeight(section?.edgeLineWeight),
    planes: normalizePlanes(section?.planes, defaultPlaneY),
  };
}

export function planeDefinitionToThreePlane(definition) {
  const normal = normalizeNormal(definition?.normal);
  const point = normalizePoint(definition?.point);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
}

export function sectionPlanesToThreePlanes(sectionState) {
  const normalized = normalizeBimSectionState(sectionState);
  if (!normalized.enabled) return [];
  return normalized.planes
    .filter((plane) => plane.enabled)
    .map((plane) => planeDefinitionToThreePlane(plane));
}

export function buildViewportBoundsFromBox3(box) {
  if (!box || box.isEmpty()) {
    return {
      radius: 1,
      center: { x: 0, y: 0, z: 0 },
      min: { x: -1, y: -1, z: -1 },
      max: { x: 1, y: 1, z: 1 },
    };
  }
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  return {
    radius: Math.max(sphere.radius, 1),
    center: {
      x: sphere.center.x,
      y: sphere.center.y,
      z: sphere.center.z,
    },
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
  };
}

export function defaultSectionStateForBounds(bounds = {}) {
  const { defaultY } = sectionHeightRangeFromBounds(bounds);
  return normalizeBimSectionState({ enabled: false }, { defaultPlaneY: defaultY });
}

export function sectionHeightRangeFromBounds(bounds = {}) {
  const minY = Number(bounds?.min?.y);
  const maxY = Number(bounds?.max?.y);
  if (Number.isFinite(minY) && Number.isFinite(maxY) && maxY >= minY) {
    const span = Math.max(maxY - minY, 0.01);
    return {
      min: minY,
      max: maxY,
      defaultY: minY + span * 0.5,
    };
  }

  const center = bounds?.center;
  const radius = Math.max(Number(bounds?.radius) || 1, 1);
  const centerY = center?.y ?? 0;
  return {
    min: centerY - radius,
    max: centerY + radius,
    defaultY: centerY,
  };
}

export function getPrimaryPlaneHeight(section = {}) {
  const normalized = normalizeBimSectionState(section);
  const y = Number(normalized.planes[0]?.point?.[1] ?? 0);
  return Number.isFinite(y) ? y : 0;
}

export function patchPrimaryPlaneHeight(section = {}, y = 0, bounds = {}) {
  const normalized = normalizeBimSectionState(section);
  const numericY = Number(y);
  const safeY = Number.isFinite(numericY) ? numericY : getPrimaryPlaneHeight(section);
  const centerX = Number(bounds?.center?.x);
  const centerZ = Number(bounds?.center?.z);
  const planes = normalized.planes.map((plane, index) => (
    index === 0
      ? {
        ...plane,
        point: [
          Number.isFinite(centerX) ? centerX : plane.point[0],
          safeY,
          Number.isFinite(centerZ) ? centerZ : plane.point[2],
        ],
      }
      : plane
  ));
  return { ...normalized, planes };
}

export function flipPrimaryPlaneNormal(section = {}) {
  const normalized = normalizeBimSectionState(section);
  const planes = normalized.planes.map((plane, index) => {
    if (index !== 0) return plane;
    const flipped = normalizeNormal(plane.normal).multiplyScalar(-1);
    return { ...plane, normal: flipped.toArray() };
  });
  return { ...normalized, planes };
}

export function patchSectionStyle(section = {}, stylePatch = {}) {
  return normalizeBimSectionState({ ...section, ...stylePatch });
}

export function buildPropertiesByElement(preparedModel) {
  const map = new Map();
  for (const property of preparedModel?.properties ?? []) {
    if (!map.has(property.elementId)) map.set(property.elementId, []);
    map.get(property.elementId).push(property);
  }
  return map;
}

export function filterVisibleElements(preparedModel, hiddenStoreys = [], hiddenLayers = []) {
  const propertiesByElement = buildPropertiesByElement(preparedModel);
  return (preparedModel?.elements ?? []).filter((element) => (
    !isElementHiddenByLayerFilter(
      element,
      propertiesByElement.get(element.id) ?? [],
      normalizeHiddenLayerState(hiddenStoreys),
      normalizeHiddenLayerState(hiddenLayers),
    )
  ));
}

export async function resolveVisibleLocalIds(model, preparedModel, cache, hiddenStoreys = [], hiddenLayers = []) {
  const elements = filterVisibleElements(preparedModel, hiddenStoreys, hiddenLayers);
  if (!model || elements.length === 0) return [];
  const idMap = await resolveFragmentsLocalIdsByGlobalIds(
    model,
    elements.map((element) => element.ifcGlobalId),
    cache,
  );
  return [...idMap.values()].filter(isValidFragmentsLocalId);
}

export async function resolveSectionLocalIds(model, preparedModel, cache, hiddenStoreys = [], hiddenLayers = []) {
  const hasLayerFilter = hiddenStoreys.length > 0 || hiddenLayers.length > 0;
  if (!hasLayerFilter) return undefined;
  const localIds = await resolveVisibleLocalIds(model, preparedModel, cache, hiddenStoreys, hiddenLayers);
  return localIds.length > 0 ? localIds : undefined;
}

function normalizeIndexArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (ArrayBuffer.isView(value)) return [...value];
  return [];
}

export function buildSectionGeometriesFromModelSection(modelSection) {
  if (!modelSection?.buffer) return { fillGeometry: null, edgeGeometry: null };
  const vertexCount = Number(modelSection.index);
  if (!Number.isFinite(vertexCount) || vertexCount <= 0) {
    return { fillGeometry: null, edgeGeometry: null };
  }

  const positions = modelSection.buffer.subarray(0, vertexCount * 3);
  const positionAttribute = new THREE.BufferAttribute(positions.slice(), 3);

  let fillGeometry = null;
  const fillsIndices = normalizeIndexArray(modelSection.fillsIndices);
  if (fillsIndices.length >= 3) {
    fillGeometry = new THREE.BufferGeometry();
    fillGeometry.setAttribute('position', positionAttribute.clone());
    fillGeometry.setIndex(fillsIndices);
    fillGeometry.computeVertexNormals();
  }

  const edgeIndices = [];
  for (let vertex = 0; vertex + 1 < vertexCount; vertex += 2) {
    edgeIndices.push(vertex, vertex + 1);
  }

  let edgeGeometry = null;
  if (edgeIndices.length >= 2) {
    edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', positionAttribute);
    edgeGeometry.setIndex(edgeIndices);
  }

  return { fillGeometry, edgeGeometry };
}

export function resolveSectionOverlayOffset(modelRadius = 1, scale = SECTION_FILL_OFFSET_SCALE) {
  const radius = Math.max(Number(modelRadius) || 1, 1);
  return Math.min(0.05, Math.max(0.00015, radius * scale));
}

export function offsetGeometryAlongNormal(geometry, normal, distance = 0) {
  if (!geometry || !normal || !distance) return geometry;
  const source = geometry.getAttribute('position');
  if (!source) return geometry;
  const offset = geometry.clone();
  const positions = source.array.slice();
  const nx = normal.x;
  const ny = normal.y;
  const nz = normal.z;
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] += nx * distance;
    positions[index + 1] += ny * distance;
    positions[index + 2] += nz * distance;
  }
  offset.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const indexAttr = geometry.getIndex();
  if (indexAttr) offset.setIndex(indexAttr.clone());
  offset.computeVertexNormals?.();
  return offset;
}

export function createSectionOverlayGroup(geometries, style, {
  width = 1,
  height = 1,
  planeNormal = null,
  modelRadius = 1,
} = {}) {
  const normalized = normalizeBimSectionState(style);
  const group = new THREE.Group();
  group.name = 'bim-section-overlay';
  const normal = planeNormal?.isVector3
    ? planeNormal.clone().normalize()
    : new THREE.Vector3(0, -1, 0);
  const fillOffset = resolveSectionOverlayOffset(modelRadius, SECTION_FILL_OFFSET_SCALE);
  const edgeOffset = resolveSectionOverlayOffset(modelRadius, SECTION_EDGE_OFFSET_SCALE);

  if (normalized.showFills && geometries.fillGeometry) {
    const fillGeometry = offsetGeometryAlongNormal(geometries.fillGeometry, normal, fillOffset);
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: normalized.fillColor,
      // Cut-face winding varies by plane orientation; That Open ClipStyler uses DoubleSide.
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      clippingPlanes: [],
      clipIntersection: false,
    });
    const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
    fillMesh.name = 'bim-section-fill';
    fillMesh.renderOrder = 20;
    fillMesh.frustumCulled = false;
    group.add(fillMesh);
  }

  if (normalized.showEdges && geometries.edgeGeometry) {
    const edgeGeometry = offsetGeometryAlongNormal(geometries.edgeGeometry, normal, edgeOffset);
    const positions = edgeGeometry.getAttribute('position')?.array;
    const index = edgeGeometry.getIndex()?.array;
    if (positions && index) {
      const linePositions = [];
      for (let i = 0; i < index.length; i += 1) {
        const vertex = index[i] * 3;
        linePositions.push(positions[vertex], positions[vertex + 1], positions[vertex + 2]);
      }
      const lineGeometry = new LineSegmentsGeometry();
      lineGeometry.setPositions(linePositions);
      const lineMaterial = new LineMaterial({
        color: normalized.edgeColor,
        linewidth: normalized.edgeLineWeight,
        opacity: 1,
        transparent: false,
        depthTest: true,
        depthWrite: false,
        worldUnits: false,
        clippingPlanes: [],
        clipIntersection: false,
      });
      lineMaterial.resolution.set(Math.max(1, width), Math.max(1, height));
      lineMaterial.depthFunc = THREE.LessEqualDepth;
      const lines = new LineSegments2(lineGeometry, lineMaterial);
      lines.name = 'bim-section-edges';
      lines.renderOrder = 21;
      lines.frustumCulled = false;
      group.add(lines);
    }
  }

  return group;
}

export function updateSectionOverlayStyle(group, style, {
  width,
  height,
  cameraDistance,
  modelRadius,
} = {}) {
  if (!group) return;
  const normalized = normalizeBimSectionState(style);
  group.traverse((object) => {
    if (object.name === 'bim-section-fill' && object.material) {
      object.visible = normalized.showFills;
      object.material.color.set(normalized.fillColor);
    }
    if (object.name === 'bim-section-edges') {
      object.visible = normalized.showEdges;
      updateWireframeEdgeVisuals(object, {
        width,
        height,
        cameraDistance,
        modelRadius,
        lineWeight: normalized.edgeLineWeight,
        opacity: 1,
        color: normalized.edgeColor,
      });
    }
  });
}

export function disposeSectionOverlay(group) {
  if (!group) return;
  group.traverse((object) => {
    object.geometry?.dispose?.();
    if (object.material) {
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material.dispose?.();
    }
  });
  group.clear?.();
}

export const SECTION_STOREY_PLANE_OFFSET = 1;

function normalizeStoreyLabel(value) {
  return String(value ?? '').trim().toLowerCase();
}

function clampSectionPlaneHeight(y, bounds = {}) {
  const { min, max } = sectionHeightRangeFromBounds(bounds);
  const numeric = Number(y);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function resolveStoreyElevationsFromModel(preparedModel) {
  const elevationsByLabel = new Map();
  if (!preparedModel) return elevationsByLabel;

  const propertiesByElement = buildPropertiesByElement(preparedModel);
  for (const element of preparedModel.elements ?? []) {
    if (element.ifcClass !== 'IfcBuildingStorey') continue;

    const properties = propertiesByElement.get(element.id) ?? [];
    const elevationValue = properties.find((property) => property.propertyName === 'Elevation')?.value;
    const elevation = Number(elevationValue);
    if (!Number.isFinite(elevation)) continue;

    const labels = new Set([
      element.name,
      element.storeyId,
      properties.find((property) => property.propertyName === 'LongName')?.value,
      properties.find((property) => property.propertyName === 'Name')?.value,
    ]);
    for (const label of labels) {
      const key = normalizeStoreyLabel(label);
      if (key) elevationsByLabel.set(key, elevation);
    }
  }

  return elevationsByLabel;
}

function evenlySpacedStoreyPlaneHeights(bounds = {}, catalogStoreys = []) {
  const { min, max } = sectionHeightRangeFromBounds(bounds);
  const count = Math.max(catalogStoreys.length, 1);
  const step = count > 1 ? (max - min) / count : 0;
  return catalogStoreys.map((entry, index) => ({
    id: entry.id,
    label: entry.label,
    y: min + step * (index + 0.5),
  }));
}

export function estimateStoreyPlaneHeights(preparedModel, bounds = {}, catalogStoreys = []) {
  if (!Array.isArray(catalogStoreys) || catalogStoreys.length === 0) return [];

  const elevationsByLabel = resolveStoreyElevationsFromModel(preparedModel);
  if (elevationsByLabel.size === 0) {
    return evenlySpacedStoreyPlaneHeights(bounds, catalogStoreys);
  }

  return catalogStoreys.map((entry) => {
    const elevation = elevationsByLabel.get(normalizeStoreyLabel(entry.id))
      ?? elevationsByLabel.get(normalizeStoreyLabel(entry.label));
    const y = Number.isFinite(elevation)
      ? clampSectionPlaneHeight(elevation + SECTION_STOREY_PLANE_OFFSET, bounds)
      : null;
    return {
      id: entry.id,
      label: entry.label,
      y,
      elevation: Number.isFinite(elevation) ? elevation : null,
    };
  }).filter((preset) => preset.y != null);
}

export function applyRendererClippingPlanes(renderer, planes = []) {
  if (!renderer) return;
  const active = Array.isArray(planes) ? planes : [];
  renderer.clippingPlanes = active;
  renderer.localClippingEnabled = active.length > 0;
}

export function syncMaterialClippingPlanes(material, planes = []) {
  if (!material) return;
  const active = Array.isArray(planes) ? planes : [];
  const applyToMaterial = (target) => {
    if (!target) return;
    target.clippingPlanes = active;
    target.clipIntersection = active.length > 1;
    target.needsUpdate = true;
  };
  if (Array.isArray(material)) material.forEach(applyToMaterial);
  else applyToMaterial(material);
}

export async function fetchModelSection(model, plane, localIds) {
  if (!model || typeof model.getSection !== 'function' || !plane) return null;
  const sectionPlane = plane.isPlane ? plane.clone() : plane;
  const ids = Array.isArray(localIds) && localIds.length > 0 ? localIds : undefined;
  return model.getSection(sectionPlane, ids);
}

export function renderSectionOverlayPass(renderer, overlayScene, camera, {
  mainScene = null,
  refreshDepth = false,
} = {}) {
  if (!renderer || !overlayScene || !camera || overlayScene.children.length === 0) {
    return false;
  }
  const previousAutoClear = renderer.autoClear;
  const previousLocalClipping = renderer.localClippingEnabled;
  renderer.localClippingEnabled = false;
  // Edges depth-test against the model; fills use depthTest:false so they stay visible
  // on the cut plane (log depth + SSAO depth passes otherwise swallow them).
  if (refreshDepth && mainScene) {
    populateScreenDepthFromScene(renderer, mainScene, camera);
  }
  renderer.autoClear = false;
  renderer.render(overlayScene, camera);
  renderer.autoClear = previousAutoClear;
  renderer.localClippingEnabled = previousLocalClipping;
  return true;
}
