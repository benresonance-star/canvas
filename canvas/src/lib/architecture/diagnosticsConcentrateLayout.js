import * as THREE from 'three';
import {
  LAYER_ORIGIN_X,
  LAYER_GROUP_PADDING,
  NODE_WIDTH,
  NODE_HEIGHT,
  NODE_GAP_X,
  LAYER_NODE_Y,
} from './architectureLayoutConstants.js';
import { getActionTouchedNodeIds, getActionTouchedEdgeIds } from './architectureActions.js';
import { flowLayoutToWorld } from './diagnosticsLayout3d.js';

function flowCenterToLayout(centerX, centerY, layer = 'client-ui', layerIndex = 0) {
  const x = centerX - NODE_WIDTH / 2;
  const y = centerY - NODE_HEIGHT / 2;
  return {
    x,
    y,
    centerX,
    centerY,
    layer,
    layerIndex,
  };
}

const CONCENTRATE_GAP_X = Math.round(NODE_GAP_X * 0.6);
const CONCENTRATE_GAP_Y = Math.round(NODE_HEIGHT * 0.45);
const CONCENTRATE_ORIGIN_Y = LAYER_NODE_Y;
const MIN_CLUSTER_RADIUS = 2.5;

/**
 * @param {import('./architectureGraphSchema.js').ArchitectureActionDef | null | undefined} action
 * @param {import('./architectureGraphSchema.js').ArchitecturePipeDef[]} pipes
 */
export function getActionConcentrateMembership(action, pipes) {
  const visibleNodeIds = getActionTouchedNodeIds(action);
  const visibleEdgeIds = getActionTouchedEdgeIds(action);
  const pipeById = new Map(pipes.map((pipe) => [pipe.id, pipe]));
  const actionPipes = [...visibleEdgeIds]
    .map((id) => pipeById.get(id))
    .filter(Boolean);

  return {
    visibleNodeIds,
    visibleEdgeIds,
    actionPipes,
  };
}

/**
 * @param {Set<string>} nodeIds
 * @param {import('./architectureGraphSchema.js').ArchitecturePipeDef[]} actionPipes
 */
function computeActionNodeRanks(nodeIds, actionPipes) {
  const stepOrder = [];
  const seen = new Set();
  for (const pipe of actionPipes) {
    for (const nodeId of [pipe.source, pipe.target]) {
      if (nodeIds.has(nodeId) && !seen.has(nodeId)) {
        seen.add(nodeId);
        stepOrder.push(nodeId);
      }
    }
  }
  for (const nodeId of nodeIds) {
    if (!seen.has(nodeId)) {
      stepOrder.push(nodeId);
    }
  }

  const predecessors = new Map([...nodeIds].map((id) => [id, new Set()]));
  const successors = new Map([...nodeIds].map((id) => [id, new Set()]));

  for (const pipe of actionPipes) {
    if (!nodeIds.has(pipe.source) || !nodeIds.has(pipe.target)) continue;
    predecessors.get(pipe.target)?.add(pipe.source);
    successors.get(pipe.source)?.add(pipe.target);
  }

  /** @type {Map<string, number>} */
  const ranks = new Map();
  const queue = [...nodeIds].filter((id) => (predecessors.get(id)?.size ?? 0) === 0);
  if (queue.length === 0) {
    stepOrder.forEach((nodeId, index) => ranks.set(nodeId, index));
    return ranks;
  }

  while (queue.length > 0) {
    const nodeId = queue.shift();
    const prevRank = ranks.get(nodeId) ?? 0;
    for (const successor of successors.get(nodeId) ?? []) {
      const nextRank = Math.max(ranks.get(successor) ?? 0, prevRank + 1);
      ranks.set(successor, nextRank);
      predecessors.get(successor)?.delete(nodeId);
      if ((predecessors.get(successor)?.size ?? 0) === 0) {
        queue.push(successor);
      }
    }
  }

  for (const nodeId of nodeIds) {
    if (!ranks.has(nodeId)) {
      ranks.set(nodeId, 0);
    }
  }

  return ranks;
}

/**
 * @param {object} options
 * @param {import('./architectureGraphSchema.js').ArchitectureActionDef | null | undefined} options.action
 * @param {import('./architectureGraphSchema.js').ArchitectureNodeDef[]} options.graphNodes
 * @param {import('./architectureGraphSchema.js').ArchitecturePipeDef[]} options.pipes
 */
export function buildConcentratedActionLayout({ action, graphNodes, pipes }) {
  const { visibleNodeIds, visibleEdgeIds, actionPipes } = getActionConcentrateMembership(action, pipes);
  if (visibleNodeIds.size === 0) {
    return {
      layouts: new Map(),
      layoutList: [],
      centerX: 0,
      centerY: 0,
      byNodeId: new Map(),
      layerPlanes: [],
      visibleNodeIds,
      visibleEdgeIds,
    };
  }

  const nodeById = new Map(graphNodes.map((node) => [node.id, node]));
  const ranks = computeActionNodeRanks(visibleNodeIds, actionPipes);

  /** @type {Map<number, string[]>} */
  const nodesByRank = new Map();
  for (const nodeId of visibleNodeIds) {
    const rank = ranks.get(nodeId) ?? 0;
    if (!nodesByRank.has(rank)) nodesByRank.set(rank, []);
    nodesByRank.get(rank)?.push(nodeId);
  }

  for (const rankNodes of nodesByRank.values()) {
    rankNodes.sort((left, right) => {
      const leftLayer = nodeById.get(left)?.layer ?? '';
      const rightLayer = nodeById.get(right)?.layer ?? '';
      if (leftLayer !== rightLayer) return leftLayer.localeCompare(rightLayer);
      return left.localeCompare(right);
    });
  }

  /** @type {Map<string, { x: number, y: number, centerX: number, centerY: number, layer: string, layerIndex: number }>} */
  const layouts = new Map();

  for (const [rank, rankNodes] of [...nodesByRank.entries()].sort(([a], [b]) => a - b)) {
    const columnX = LAYER_ORIGIN_X + LAYER_GROUP_PADDING + rank * (NODE_WIDTH + CONCENTRATE_GAP_X);
    const columnStartY = CONCENTRATE_ORIGIN_Y;

    rankNodes.forEach((nodeId, rowIndex) => {
      const nodeDef = nodeById.get(nodeId);
      const x = columnX;
      const y = columnStartY + rowIndex * (NODE_HEIGHT + CONCENTRATE_GAP_Y);
      layouts.set(nodeId, {
        x,
        y,
        centerX: x + NODE_WIDTH / 2,
        centerY: y + NODE_HEIGHT / 2,
        layer: nodeDef?.layer ?? 'client-ui',
        layerIndex: 0,
      });
    });
  }

  const layoutList = [...layouts.values()];
  const centerX = layoutList.reduce((sum, layout) => sum + layout.centerX, 0) / layoutList.length;
  const centerY = layoutList.reduce((sum, layout) => sum + layout.centerY, 0) / layoutList.length;

  /** @type {Map<string, { flow: object, world: object }>} */
  const byNodeId = new Map();
  for (const [nodeId, layout] of layouts) {
    byNodeId.set(nodeId, {
      flow: layout,
      world: flowLayoutToWorld(layout, centerX, centerY),
    });
  }

  return {
    layouts,
    layoutList,
    centerX,
    centerY,
    byNodeId,
    layerPlanes: [],
    visibleNodeIds,
    visibleEdgeIds,
  };
}

function lerpNumber(from, to, progress) {
  return from + (to - from) * progress;
}

/**
 * @param {ReturnType<typeof buildConcentratedActionLayout>} baseLayout3d
 * @param {ReturnType<typeof buildConcentratedActionLayout>} concentrateLayout3d
 * @param {number} progress 0..1
 * @param {Set<string>} visibleNodeIds
 */
export function interpolateDiagnosticsLayout3d(
  baseLayout3d,
  concentrateLayout3d,
  progress,
  visibleNodeIds,
) {
  if (progress <= 0) return baseLayout3d;
  if (progress >= 1) return concentrateLayout3d;

  const centerX = lerpNumber(baseLayout3d.centerX, concentrateLayout3d.centerX, progress);
  const centerY = lerpNumber(baseLayout3d.centerY, concentrateLayout3d.centerY, progress);

  /** @type {Map<string, { flow: object, world: object }>} */
  const byNodeId = new Map();

  for (const [nodeId, baseEntry] of baseLayout3d.byNodeId) {
    const concentrateEntry = concentrateLayout3d.byNodeId.get(nodeId);
    if (!concentrateEntry) {
      byNodeId.set(nodeId, baseEntry);
      continue;
    }

    const baseFlow = baseEntry.flow;
    const targetFlow = concentrateEntry.flow;
    const flow = {
      x: lerpNumber(baseFlow.x, targetFlow.x, progress),
      y: lerpNumber(baseFlow.y, targetFlow.y, progress),
      centerX: lerpNumber(baseFlow.centerX, targetFlow.centerX, progress),
      centerY: lerpNumber(baseFlow.centerY, targetFlow.centerY, progress),
      layer: targetFlow.layer,
      layerIndex: Math.round(lerpNumber(baseFlow.layerIndex, targetFlow.layerIndex, progress)),
    };

    const baseWorld = baseEntry.world;
    const targetWorld = concentrateEntry.world;
    const world = {
      x: lerpNumber(baseWorld.x, targetWorld.x, progress),
      y: lerpNumber(baseWorld.y, targetWorld.y, progress),
      z: lerpNumber(baseWorld.z, targetWorld.z, progress),
      layerIndex: flow.layerIndex,
    };

    byNodeId.set(nodeId, { flow, world });
  }

  for (const nodeId of visibleNodeIds) {
    if (byNodeId.has(nodeId)) continue;
    const concentrateEntry = concentrateLayout3d.byNodeId.get(nodeId);
    if (concentrateEntry) {
      byNodeId.set(nodeId, concentrateEntry);
    }
  }

  return {
    ...baseLayout3d,
    centerX,
    centerY,
    byNodeId,
    layerPlanes: progress < 0.5 ? baseLayout3d.layerPlanes : [],
  };
}

/**
 * @param {ReturnType<typeof buildConcentratedActionLayout>} layout3d
 * @param {Set<string>} [nodeIds]
 */
export function computeLayout3dBounds(layout3d, nodeIds) {
  const points = [...layout3d.byNodeId.entries()]
    .filter(([nodeId]) => !nodeIds || nodeIds.has(nodeId))
    .map(([, entry]) => entry.world)
    .filter(Boolean);

  if (points.length === 0) {
    return { center: new THREE.Vector3(0, 0, 0), radius: MIN_CLUSTER_RADIUS };
  }

  const box = new THREE.Box3();
  points.forEach((point) => {
    box.expandByPoint(new THREE.Vector3(point.x, point.y, point.z));
  });
  const center = new THREE.Vector3();
  box.getCenter(center);
  const radius = Math.max(MIN_CLUSTER_RADIUS, box.getSize(new THREE.Vector3()).length() * 0.55 + 0.6);
  return { center, radius };
}

export function easeOutCubic(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - (1 - clamped) ** 3;
}

/**
 * Apply user drag positions on top of a concentrate layout.
 *
 * @param {ReturnType<typeof buildConcentratedActionLayout>} layout3d
 * @param {Record<string, { centerX: number, centerY: number }>} overrides
 */
export function applyConcentrateNodeOverrides(layout3d, overrides) {
  if (!layout3d || !overrides || Object.keys(overrides).length === 0) {
    return layout3d;
  }

  const byNodeId = new Map(layout3d.byNodeId);
  for (const [nodeId, override] of Object.entries(overrides)) {
    const entry = byNodeId.get(nodeId);
    if (!entry) continue;
    const flow = flowCenterToLayout(
      override.centerX,
      override.centerY,
      entry.flow.layer,
      entry.flow.layerIndex,
    );
    byNodeId.set(nodeId, {
      flow,
      world: flowLayoutToWorld(flow, layout3d.centerX, layout3d.centerY),
    });
  }

  return {
    ...layout3d,
    byNodeId,
  };
}
