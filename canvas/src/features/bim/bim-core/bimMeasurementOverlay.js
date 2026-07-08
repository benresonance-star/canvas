import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
  computeMeasurementMarkerRadius,
  computePolylineArea,
  computePolylineDistance,
  formatMeasurementDistance,
  formatPolylineMeasurementLabel,
} from '../../threeDArtifact/utils/measureSnap.js';
import {
  computeRlFromPosition,
  formatDatumLabel,
  formatRlLabel,
  getRlMarkerColor,
  isRlDatumLive,
  RL_DATUM_MARKER_COLOR,
} from './bimRlMeasure.js';

const HOVER_COLOR = 0x34d399;
const MEASUREMENT_COLOR = 0x60a5fa;
const DRAFT_COLOR = MEASUREMENT_COLOR;
const SAVED_COLOR = MEASUREMENT_COLOR;
const SELECTED_RL_COLOR = 0xfbbf24;
const MARKER_RADIUS_SCALE = 0.5;
const CLOSE_POLYLINE_SCALE = 2.5;
const RL_MARKER_SPHERE_OPACITY = 0.4;

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}

function createLine(start, end, color) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...start),
    new THREE.Vector3(...end),
  ]);
  const material = new THREE.LineBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 1000;
  return line;
}

function createPolyline(positions, color, closed = false) {
  if (!positions?.length) return null;
  const points = positions.map((position) => new THREE.Vector3(...position));
  if (closed && points.length >= 3) {
    points.push(points[0].clone());
  }
  if (points.length < 2) return null;
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 1000;
  return line;
}

function createRlMarkerSphere(position, color, radius) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 10, 10),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: RL_MARKER_SPHERE_OPACITY,
      depthTest: false,
      depthWrite: false,
    }),
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.renderOrder = 1001;
  return mesh;
}

function createMarker(position, color, radius) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 10, 10),
    new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
    }),
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.renderOrder = 1001;
  return mesh;
}

function tagRlPickable(object, pickMeta) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.userData.bimRlPick = pickMeta;
    }
  });
}

function createCrossSphereMarker(position, color, radius, pickMeta = null) {
  const group = new THREE.Group();
  const armLength = radius * 3;
  const axes = [
    [[-armLength, 0, 0], [armLength, 0, 0]],
    [[0, -armLength, 0], [0, armLength, 0]],
    [[0, 0, -armLength], [0, 0, armLength]],
  ];
  axes.forEach(([start, end]) => {
    const offsetStart = [
      position[0] + start[0],
      position[1] + start[1],
      position[2] + start[2],
    ];
    const offsetEnd = [
      position[0] + end[0],
      position[1] + end[1],
      position[2] + end[2],
    ];
    group.add(createLine(offsetStart, offsetEnd, color));
  });
  group.add(createRlMarkerSphere(position, color, radius));
  group.renderOrder = 1001;
  if (pickMeta) tagRlPickable(group, pickMeta);
  return group;
}

function labelOffsetPosition(position, markerRadius) {
  return [position[0], position[1] + markerRadius * 4, position[2]];
}

function addRlMarkerVisual(group, {
  position,
  label,
  color,
  markerRadius,
  pickMeta = null,
  selected = false,
}) {
  const markerColor = selected ? SELECTED_RL_COLOR : color;
  group.add(createCrossSphereMarker(position, markerColor, markerRadius, pickMeta));
  const labelObject = createLabel(label);
  labelObject.position.set(...labelOffsetPosition(position, markerRadius));
  group.add(labelObject);
}

function isSelectedRlPick(selectedRlPick, pickMeta) {
  if (!selectedRlPick || !pickMeta) return false;
  return selectedRlPick.kind === pickMeta.kind && selectedRlPick.id === pickMeta.id;
}

function createLabel(text) {
  const element = document.createElement('div');
  element.className = 'sans px-1.5 py-0.5 rounded bg-surface/90 border border-border text-[10px] text-primary whitespace-nowrap';
  element.textContent = text;
  return new CSS2DObject(element);
}

function midpoint(start, end) {
  return [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2,
  ];
}

function centroid(positions) {
  if (!positions.length) return [0, 0, 0];
  const total = positions.reduce(
    (accumulator, position) => [
      accumulator[0] + position[0],
      accumulator[1] + position[1],
      accumulator[2] + position[2],
    ],
    [0, 0, 0],
  );
  return total.map((value) => value / positions.length);
}

function isNearPosition(a, b, threshold) {
  if (!a || !b) return false;
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  return start.distanceTo(end) <= threshold;
}

function addMeasurementVisual(group, {
  start,
  end,
  label,
  color,
  markerRadius,
  showEndMarker = true,
}) {
  group.add(createLine(start, end, color));
  group.add(createMarker(start, color, markerRadius));
  if (showEndMarker) {
    group.add(createMarker(end, color, markerRadius));
  }
  const labelObject = createLabel(label);
  labelObject.position.set(...midpoint(start, end));
  group.add(labelObject);
}

function addPolylineVisual(group, {
  points,
  label,
  color,
  markerRadius,
  closed = false,
  emphasizeFirst = false,
}) {
  const positions = points.map((point) => point.position ?? point);
  const polyline = createPolyline(positions, color, closed);
  if (polyline) group.add(polyline);
  positions.forEach((position, index) => {
    const radius = emphasizeFirst && index === 0 ? markerRadius * 1.2 : markerRadius;
    group.add(createMarker(position, color, radius));
  });
  const labelObject = createLabel(label);
  labelObject.position.set(...centroid(positions));
  group.add(labelObject);
}

export function createBimMeasurementOverlay({ scene, container }) {
  const group = new THREE.Group();
  group.name = 'bim-measurements';
  group.renderOrder = 1000;
  scene.add(group);

  const css2dRenderer = new CSS2DRenderer();
  css2dRenderer.domElement.style.position = 'absolute';
  css2dRenderer.domElement.style.top = '0';
  css2dRenderer.domElement.style.left = '0';
  css2dRenderer.domElement.style.pointerEvents = 'none';
  css2dRenderer.domElement.style.zIndex = '2';
  container.appendChild(css2dRenderer.domElement);

  const clearGroup = () => {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      disposeObject(child);
    }
  };

  return {
    group,
    css2dRenderer,
    sync({
      measurements = [],
      rlDatum = null,
      selectedRlPick = null,
      draftStart = null,
      draftPoints = [],
      previewEnd = null,
      hoverSnap = null,
      snapMode = 'vertex',
      measureKind = 'segment',
      showOnModel = true,
      units = 'm',
      modelUnits = 'm',
      modelRoot = null,
      active = false,
    }) {
      clearGroup();
      const markerRadius = computeMeasurementMarkerRadius(modelRoot) * MARKER_RADIUS_SCALE;
      const datumLive = isRlDatumLive(rlDatum);

      if (datumLive && showOnModel) {
        const datumRl = computeRlFromPosition(rlDatum.position, {
          datum: rlDatum,
          measuredFromDatum: true,
        });
        const datumPick = { kind: 'datum', id: rlDatum.id };
        addRlMarkerVisual(group, {
          position: rlDatum.position,
          label: formatDatumLabel(datumRl, units, modelUnits),
          color: RL_DATUM_MARKER_COLOR,
          markerRadius: markerRadius * 1.1,
          pickMeta: datumPick,
          selected: isSelectedRlPick(selectedRlPick, datumPick),
        });
      }

      measurements.forEach((measurement) => {
        if (!showOnModel) return;
        if (measurement.kind === 'rl') {
          const measuredFromDatum = measurement.measuredFromDatum === true && datumLive;
          const rlValue = computeRlFromPosition(measurement.position, {
            datum: rlDatum,
            measuredFromDatum,
          });
          addRlMarkerVisual(group, {
            position: measurement.position,
            label: formatRlLabel(rlValue, units, modelUnits),
            color: getRlMarkerColor(measuredFromDatum, datumLive),
            markerRadius,
            pickMeta: { kind: 'rl', id: measurement.id },
            selected: isSelectedRlPick(selectedRlPick, { kind: 'rl', id: measurement.id }),
          });
          return;
        }
        if (measurement.kind === 'polyline') {
          addPolylineVisual(group, {
            points: measurement.points,
            label: formatPolylineMeasurementLabel({
              distance: measurement.distance,
              area: measurement.area,
              closed: measurement.closed,
              pointCount: measurement.points.length,
            }, units, modelUnits),
            color: SAVED_COLOR,
            markerRadius,
            closed: measurement.closed,
          });
          return;
        }
        if (measurement.kind !== 'segment') return;

        addMeasurementVisual(group, {
          start: measurement.start.position,
          end: measurement.end.position,
          label: formatMeasurementDistance(measurement.distance, units, modelUnits),
          color: SAVED_COLOR,
          markerRadius,
        });
      });

      if (measureKind === 'polyline' && draftPoints.length > 0 && snapMode === 'vertex') {
        const draftPositions = draftPoints.map((point) => point.position);
        const closeThreshold = markerRadius * CLOSE_POLYLINE_SCALE;
        const closingPreview = draftPoints.length >= 3
          && previewEnd
          && isNearPosition(previewEnd, draftPoints[0].position, closeThreshold);
        const previewPositions = closingPreview
          ? draftPositions
          : (previewEnd ? [...draftPositions, previewEnd] : draftPositions);
        const draftDistance = closingPreview
          ? computePolylineDistance(draftPoints, true)
          : (previewEnd
            ? computePolylineDistance([...draftPoints, { position: previewEnd }], false)
            : computePolylineDistance(draftPoints, false));
        const draftArea = closingPreview ? computePolylineArea(draftPoints, true) : null;
        addPolylineVisual(group, {
          points: previewPositions,
          label: formatPolylineMeasurementLabel({
            distance: draftDistance,
            area: draftArea,
            closed: closingPreview,
            pointCount: draftPoints.length,
          }, units, modelUnits),
          color: DRAFT_COLOR,
          markerRadius,
          closed: closingPreview,
          emphasizeFirst: draftPoints.length >= 3,
        });
      } else if (draftStart && previewEnd && snapMode === 'vertex') {
        const startVec = new THREE.Vector3(...draftStart.position);
        const endVec = new THREE.Vector3(...previewEnd);
        addMeasurementVisual(group, {
          start: draftStart.position,
          end: previewEnd,
          label: formatMeasurementDistance(startVec.distanceTo(endVec), units, modelUnits),
          color: DRAFT_COLOR,
          markerRadius,
          showEndMarker: !hoverSnap,
        });
      }

      if (active && hoverSnap) {
        const previewRadius = markerRadius * 0.2;
        if (measureKind === 'rl' || measureKind === 'datum') {
          const previewMeasuredFromDatum = measureKind === 'rl' && datumLive;
          const previewRl = computeRlFromPosition(hoverSnap.position, {
            datum: rlDatum,
            measuredFromDatum: previewMeasuredFromDatum,
          });
          const previewColor = measureKind === 'datum'
            ? RL_DATUM_MARKER_COLOR
            : getRlMarkerColor(previewMeasuredFromDatum, datumLive);
          const previewLabel = measureKind === 'datum'
            ? formatDatumLabel(0, units, modelUnits)
            : formatRlLabel(previewRl, units, modelUnits);
          addRlMarkerVisual(group, {
            position: hoverSnap.position,
            label: previewLabel,
            color: previewColor,
            markerRadius: previewRadius,
          });
        } else if (hoverSnap.kind === 'edge' && hoverSnap.edgeStart && hoverSnap.edgeEnd) {
          group.add(createLine(hoverSnap.edgeStart, hoverSnap.edgeEnd, HOVER_COLOR));
          group.add(createMarker(hoverSnap.position, HOVER_COLOR, previewRadius));
        } else {
          group.add(createMarker(hoverSnap.position, HOVER_COLOR, previewRadius));
        }
      }
    },
    resize(width, height) {
      css2dRenderer.setSize(width, height);
    },
    render(sceneRef, camera) {
      css2dRenderer.render(sceneRef, camera);
    },
    dispose() {
      clearGroup();
      scene.remove(group);
      css2dRenderer.domElement.remove();
    },
  };
}
