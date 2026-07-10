import * as THREE from 'three';
import { populateScreenDepthFromScene } from './bimScreenDepth.js';

export const GEOMETRY_REPAIR_OVERLAY_NAME = 'bim-geometry-repair-overlay';
export const GEOMETRY_REPAIR_SHELL_COLORS = [
  '#94a3b8',
  '#7dd3fc',
  '#86efac',
  '#fcd34d',
  '#f9a8d4',
  '#c4b5fd',
  '#fdba74',
  '#67e8f9',
];

function resolveMeshDataTransform(transform) {
  if (!transform) return null;
  if (transform.isMatrix4) return transform.clone();
  const elements = transform.elements;
  if (Array.isArray(elements) || elements instanceof Float32Array) {
    const matrix = new THREE.Matrix4();
    matrix.fromArray(elements);
    return matrix;
  }
  if (Array.isArray(transform) || transform instanceof Float32Array) {
    const matrix = new THREE.Matrix4();
    matrix.fromArray(transform);
    return matrix;
  }
  return null;
}

export const GEOMETRY_REPAIR_REPAIRED_COLOR = '#94a3b8';

export function resolveShellDisplayColor(index, {
  selected = false,
  flipped = false,
  submeshDisplay = false,
} = {}) {
  if (selected) return '#f59e0b';
  if (!submeshDisplay) return GEOMETRY_REPAIR_REPAIRED_COLOR;
  const base = GEOMETRY_REPAIR_SHELL_COLORS[index % GEOMETRY_REPAIR_SHELL_COLORS.length];
  if (!flipped) return base;
  return base;
}

function shellMaterial({ color, selected = false, editMode = false }) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    side: THREE.DoubleSide,
    transparent: editMode,
    opacity: editMode ? (selected ? 0.95 : 0.82) : 1,
    depthTest: true,
    depthWrite: !editMode,
    polygonOffset: true,
    polygonOffsetFactor: selected ? -4 : -3,
    polygonOffsetUnits: selected ? 4 : 2,
  });
}

function buildBufferGeometryFromMeshData(meshData) {
  if (!meshData?.positions?.length) return null;
  const geometry = new THREE.BufferGeometry();
  const positions = meshData.positions instanceof Float32Array
    ? meshData.positions
    : Float32Array.from(meshData.positions);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (meshData.indices?.length) {
    geometry.setIndex(Array.from(meshData.indices));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function meshFromShell(shell, {
  elementId,
  selectedShellIndex = null,
  editMode = false,
}) {
  const geometry = buildBufferGeometryFromMeshData(shell.meshData);
  if (!geometry) return null;
  const transform = resolveMeshDataTransform(shell.meshData?.transform);
  if (transform) geometry.applyMatrix4(transform);

  const selected = selectedShellIndex === shell.index;
  const submeshDisplay = editMode;
  const mesh = new THREE.Mesh(
    geometry,
    shellMaterial({
      color: resolveShellDisplayColor(shell.index, { selected, flipped: shell.flipped, submeshDisplay }),
      selected,
      editMode,
    }),
  );
  mesh.name = `repair-shell-${elementId}-${shell.index}`;
  mesh.userData = {
    kind: 'geometry-repair-shell',
    elementId,
    shellIndex: shell.index,
    flipped: shell.flipped === true,
  };
  mesh.frustumCulled = false;
  mesh.renderOrder = editMode ? 96 : 95;
  return mesh;
}

export function buildGeometryRepairOverlay(entries = [], {
  editElementId = null,
  selectedShellIndex = null,
} = {}) {
  const group = new THREE.Group();
  group.name = GEOMETRY_REPAIR_OVERLAY_NAME;
  group.renderOrder = 95;
  group.frustumCulled = false;
  group.matrixAutoUpdate = false;

  entries.forEach(({ elementId, shells }) => {
    const editMode = editElementId === elementId;
    shells.forEach((shell) => {
      const mesh = meshFromShell(shell, {
        elementId,
        selectedShellIndex: editMode ? selectedShellIndex : null,
        editMode,
      });
      if (mesh) group.add(mesh);
    });
  });

  return group;
}

export function updateGeometryRepairShellSelection(group, {
  editElementId = null,
  selectedShellIndex = null,
} = {}) {
  if (!group) return;
  group.traverse((child) => {
    if (!child.isMesh || child.userData?.kind !== 'geometry-repair-shell') return;
    const editMode = child.userData.elementId === editElementId;
    const selected = editMode && child.userData.shellIndex === selectedShellIndex;
    const flipped = child.userData.flipped === true;
    const material = child.material;
    if (!material?.color) return;
    material.color.set(resolveShellDisplayColor(child.userData.shellIndex, {
      selected,
      flipped,
      submeshDisplay: editMode,
    }));
    material.transparent = editMode;
    material.opacity = editMode ? (selected ? 0.95 : 0.82) : 1;
    material.depthWrite = !editMode;
    material.polygonOffsetFactor = selected ? -4 : -3;
    material.polygonOffsetUnits = selected ? 4 : 2;
  });
}

export function disposeGeometryRepairOverlay(group) {
  if (!group) return;
  group.removeFromParent();
  group.traverse((child) => {
    child.geometry?.dispose?.();
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose?.());
      } else {
        child.material.dispose?.();
      }
    }
  });
}

export function clearGeometryRepairOverlaysFromScene(overlayScene, activeGroup = null) {
  if (!overlayScene?.children?.length) return;
  [...overlayScene.children].forEach((child) => {
    if (child.name === GEOMETRY_REPAIR_OVERLAY_NAME && child !== activeGroup) {
      disposeGeometryRepairOverlay(child);
    }
  });
}

export function syncGeometryRepairOverlayTransform(modelRoot, group) {
  if (!modelRoot || !group) return;
  modelRoot.updateWorldMatrix(true, false);
  group.matrix.copy(modelRoot.matrixWorld);
  group.matrixWorldNeedsUpdate = true;
}

export function attachGeometryRepairOverlay(overlayScene, modelRoot, group) {
  if (!overlayScene || !group) return;
  group.removeFromParent();
  overlayScene.add(group);
  syncGeometryRepairOverlayTransform(modelRoot, group);
}

export function ensureGeometryRepairOverlayAttached(overlayScene, modelRoot, group) {
  if (!overlayScene || !modelRoot || !group) return false;
  if (group.parent !== overlayScene) {
    attachGeometryRepairOverlay(overlayScene, modelRoot, group);
    return true;
  }
  syncGeometryRepairOverlayTransform(modelRoot, group);
  return true;
}

export function renderGeometryRepairOverlayPass(renderer, overlayScene, camera, group, {
  mainScene = null,
  refreshScreenDepth = false,
} = {}) {
  if (!renderer || !overlayScene || !camera || !group?.parent) return false;
  group.visible = true;
  group.updateMatrixWorld(true);
  renderer.setRenderTarget(null);

  const depthTest = refreshScreenDepth && mainScene
    ? populateScreenDepthFromScene(renderer, mainScene, camera)
    : true;

  group.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      material.depthTest = depthTest;
      material.depthWrite = false;
      if (material.depthTest) {
        material.depthFunc = THREE.LessEqualDepth;
      }
    });
  });

  const previousAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.render(overlayScene, camera);
  renderer.autoClear = previousAutoClear;
  renderer.resetState?.();
  return true;
}

export function pickGeometryRepairShell(group, raycaster, pointer, camera) {
  if (!group || !raycaster || !camera) return null;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(group, true);
  for (const hit of hits) {
    const shellIndex = hit.object?.userData?.shellIndex;
    if (Number.isInteger(shellIndex)) {
      return {
        elementId: hit.object.userData.elementId ?? null,
        shellIndex,
      };
    }
  }
  return null;
}
