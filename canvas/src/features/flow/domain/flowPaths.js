import {
  boundsForMemberCards,
  chromeLayoutForBounds,
  convexHull,
  expandHull,
  roundedPolygonPath,
} from '../../../lib/graph/clusterHull.js';
import { getCardPixelSize } from '../../../lib/cards.js';
import { flowEdgeEffectiveEndpoints, normalizeFlowEdgeForEditor } from './flowDocument.js';
import {
  isValidFlowStepRunState,
  normalizeFlowStepRunState,
  normalizePathStepRunStates,
} from './flowStepRunState.js';

const DEFAULT_PADDING = 16;
const DEFAULT_RADIUS = 12;
const COLLAPSED_NODE_WIDTH = 220;
const COLLAPSED_NODE_HEIGHT = 88;
const DUPLICATE_PATH_OFFSET = { x: 80, y: 80 };

function roundedRectPath(x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  return `M ${x + r} ${y} h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - 2 * r} a ${r} ${r} 0 0 1 ${-r} ${r} h ${-(w - 2 * r)} a ${r} ${r} 0 0 1 ${-r} ${-r} v ${-(h - 2 * r)} a ${r} ${r} 0 0 1 ${r} ${-r} Z`;
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function layoutCornerPoints(layoutCard) {
  const { w, h } = getCardPixelSize(layoutCard);
  const x = layoutCard.x;
  const y = layoutCard.y;
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

function hullPathForLayoutCards(memberCards, padding = DEFAULT_PADDING, radius = DEFAULT_RADIUS) {
  if (memberCards.length === 0) return null;

  if (memberCards.length === 1) {
    const card = memberCards[0];
    const { w, h } = getCardPixelSize(card);
    return roundedRectPath(
      card.x - padding,
      card.y - padding,
      w + padding * 2,
      h + padding * 2,
      radius,
    );
  }

  let points = [];
  for (const card of memberCards) {
    points.push(...layoutCornerPoints(card));
  }
  points = convexHull(points);
  if (points.length < 2) return null;
  if (points.length === 2) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs) - padding;
    const minY = Math.min(...ys) - padding;
    const maxX = Math.max(...xs) + padding;
    const maxY = Math.max(...ys) + padding;
    return roundedRectPath(minX, minY, maxX - minX, maxY - minY, radius);
  }

  const expanded = expandHull(points, padding);
  return roundedPolygonPath(expanded, radius);
}

/**
 * @param {object} node
 */
export function flowNodeBounds(node) {
  const x = Number(node?.position?.x) || 0;
  const y = Number(node?.position?.y) || 0;
  if (node?.data?.showContent === true && node?.width && node?.height) {
    return { x, y, w: Number(node.width), h: Number(node.height) };
  }
  return { x, y, w: COLLAPSED_NODE_WIDTH, h: COLLAPSED_NODE_HEIGHT };
}

function flowNodeAsLayoutCard(node) {
  const bounds = flowNodeBounds(node);
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.w,
    height: bounds.h,
  };
}

/**
 * @param {unknown} paths
 * @param {Set<string> | string[]} nodeIds
 */
export function normalizeFlowPaths(paths, nodeIds) {
  const validIds = nodeIds instanceof Set ? nodeIds : new Set(nodeIds ?? []);
  const claimed = new Set();
  const normalized = [];

  for (const raw of Array.isArray(paths) ? paths : []) {
    if (!raw?.id) continue;
    const stepIds = [...new Set((raw.stepIds ?? []).filter((id) => validIds.has(id) && !claimed.has(id)))];
    for (const id of stepIds) claimed.add(id);
    if (!stepIds.length) continue;
    const now = new Date().toISOString();
    normalized.push({
      id: String(raw.id),
      name: String(raw.name ?? '').trim() || defaultFlowPathName(normalized),
      stepIds,
      stepRunStates: normalizePathStepRunStates(raw.stepRunStates, stepIds),
      createdAt: raw.createdAt ?? now,
      updatedAt: raw.updatedAt ?? now,
    });
  }

  return normalized;
}

export function defaultFlowPathName(paths = []) {
  return `Path ${Math.max(1, paths.length + 1)}`;
}

/**
 * Order path member ids by following connections inside the path, then canvas position.
 * @param {string[]} stepIds
 * @param {object[]} edges
 * @param {Map<string, object> | Record<string, object> | null | undefined} nodesById
 */
export function orderPathStepIdsByFlowSequence(stepIds, edges = [], nodesById = null) {
  const members = [...new Set(stepIds ?? [])];
  if (members.length <= 1) return members;

  const memberSet = new Set(members);
  /** @type {Map<string, string[]>} */
  const outgoing = new Map(members.map((id) => [id, []]));
  /** @type {Map<string, number>} */
  const incomingCount = new Map(members.map((id) => [id, 0]));

  for (const edge of edges ?? []) {
    const { from, to } = flowEdgeEffectiveEndpoints(edge);
    if (!from || !to || !memberSet.has(from) || !memberSet.has(to) || from === to) continue;
    outgoing.get(from).push(to);
    incomingCount.set(to, (incomingCount.get(to) ?? 0) + 1);
  }

  const positionOf = (id) => {
    const node = nodesById instanceof Map ? nodesById.get(id) : nodesById?.[id];
    return {
      x: Number(node?.position?.x ?? 0),
      y: Number(node?.position?.y ?? 0),
    };
  };

  const compareIds = (a, b) => {
    const pa = positionOf(a);
    const pb = positionOf(b);
    if (pa.x !== pb.x) return pa.x - pb.x;
    if (pa.y !== pb.y) return pa.y - pb.y;
    return members.indexOf(a) - members.indexOf(b);
  };

  const sortIds = (ids) => [...ids].sort(compareIds);

  let starts = members.filter((id) => (incomingCount.get(id) ?? 0) === 0);
  if (!starts.length) starts = members;
  starts = sortIds(starts);

  /** @type {string[]} */
  const ordered = [];
  const visited = new Set();

  const walk = (current) => {
    if (!current || visited.has(current)) return;
    visited.add(current);
    ordered.push(current);
    for (const next of sortIds((outgoing.get(current) ?? []).filter((id) => !visited.has(id)))) {
      walk(next);
    }
  };

  for (const start of starts) {
    walk(start);
  }

  return [...ordered, ...sortIds(members.filter((id) => !visited.has(id)))];
}

/**
 * @param {{ paths?: object[], selectedStepIds?: string[], name?: string }} options
 */
export function createFlowPathFromSelection({
  paths = [],
  selectedStepIds = [],
  name,
} = {}) {
  const stepIds = [...new Set(selectedStepIds.filter(Boolean))];
  if (!stepIds.length) {
    throw new Error('Select at least one step to create a path');
  }

  const now = new Date().toISOString();
  const withoutMembers = (paths ?? []).map((path) => {
    const nextStepIds = (path.stepIds ?? []).filter((id) => !stepIds.includes(id));
    return {
      ...path,
      stepIds: nextStepIds,
      stepRunStates: normalizePathStepRunStates(path.stepRunStates, nextStepIds),
      updatedAt: now,
    };
  }).filter((path) => path.stepIds.length > 0);

  const nextPath = {
    id: crypto.randomUUID(),
    name: String(name ?? '').trim() || defaultFlowPathName(withoutMembers),
    stepIds,
    stepRunStates: {},
    createdAt: now,
    updatedAt: now,
  };

  return {
    paths: [...withoutMembers, nextPath],
    pathId: nextPath.id,
  };
}

/**
 * @param {{ paths?: object[], pathId: string, stepIds?: string[] }} options
 */
export function addStepsToFlowPath({
  paths = [],
  pathId,
  stepIds = [],
} = {}) {
  if (!pathId) throw new Error('Path id is required');
  const ids = [...new Set(stepIds.filter(Boolean))];
  if (!ids.length) throw new Error('Select at least one step to add to the path');

  const now = new Date().toISOString();
  const claimed = new Set(ids);
  let found = false;

  const nextPaths = (paths ?? []).map((path) => {
    if (path.id === pathId) {
      found = true;
      const merged = [...new Set([...(path.stepIds ?? []), ...ids])];
      return {
        ...path,
        stepIds: merged,
        stepRunStates: normalizePathStepRunStates(path.stepRunStates, merged),
        updatedAt: now,
      };
    }
    const stepIdsWithoutClaimed = (path.stepIds ?? []).filter((id) => !claimed.has(id));
    if (!stepIdsWithoutClaimed.length) return null;
    return {
      ...path,
      stepIds: stepIdsWithoutClaimed,
      stepRunStates: normalizePathStepRunStates(path.stepRunStates, stepIdsWithoutClaimed),
      updatedAt: now,
    };
  }).filter(Boolean);

  if (!found) throw new Error('Path not found');
  return nextPaths;
}

function cloneFlowNode(node, newId, offset) {
  return {
    ...node,
    id: newId,
    position: {
      x: (node.position?.x ?? 0) + offset.x,
      y: (node.position?.y ?? 0) + offset.y,
    },
    data: { ...(node.data ?? {}) },
  };
}

/**
 * @param {{ path: object, nodes: object[], edges: object[], paths?: object[], offset?: { x: number, y: number } }} options
 */
export function duplicateFlowPath({
  path,
  nodes = [],
  edges = [],
  paths = [],
  offset = DUPLICATE_PATH_OFFSET,
} = {}) {
  if (!path?.id || !path.stepIds?.length) {
    throw new Error('Path has no steps to duplicate');
  }

  const stepSet = new Set(path.stepIds);
  const idMap = new Map();
  const clonedNodes = [];

  for (const oldId of path.stepIds) {
    const node = nodes.find((candidate) => candidate.id === oldId);
    if (!node) continue;
    const newId = crypto.randomUUID();
    idMap.set(oldId, newId);
    clonedNodes.push(cloneFlowNode(node, newId, offset));
  }

  const clonedStepIds = [...idMap.values()];
  if (!clonedStepIds.length) {
    throw new Error('Path steps could not be duplicated');
  }

  const clonedEdges = edges
    .filter((edge) => stepSet.has(edge.source) && stepSet.has(edge.target))
    .map((edge) => normalizeFlowEdgeForEditor({
      ...edge,
      id: crypto.randomUUID(),
      source: idMap.get(edge.source),
      target: idMap.get(edge.target),
    }));

  const now = new Date().toISOString();
  const clonedRunStates = {};
  for (const [oldId, newId] of idMap.entries()) {
    const state = path.stepRunStates?.[oldId];
    if (state) {
      clonedRunStates[newId] = normalizeFlowStepRunState(state);
    }
  }
  const newPath = {
    id: crypto.randomUUID(),
    name: `${path.name} copy`.trim(),
    stepIds: clonedStepIds,
    stepRunStates: normalizePathStepRunStates(clonedRunStates, clonedStepIds),
    createdAt: now,
    updatedAt: now,
  };

  return {
    paths: [...(paths ?? []), newPath],
    pathId: newPath.id,
    nodes: [...nodes, ...clonedNodes],
    edges: [...edges, ...clonedEdges],
  };
}

/**
 * @param {object[]} nodes
 * @param {string[]} stepIds
 * @param {number} dx
 * @param {number} dy
 * @param {Map<string, { x: number, y: number }>} startPositions
 */
export function applyDeltaToPathSteps(nodes, stepIds, dx, dy, startPositions) {
  const ids = new Set(stepIds);
  return nodes.map((node) => {
    if (!ids.has(node.id)) return node;
    const start = startPositions.get(node.id);
    if (!start) return node;
    return {
      ...node,
      position: {
        x: start.x + dx,
        y: start.y + dy,
      },
    };
  });
}

/**
 * @param {{ paths?: object[], nodes?: object[] }} options
 */
export function buildFlowPathHulls({ paths = [], nodes = [] } = {}) {
  const nodeById = new Map((nodes ?? []).map((node) => [node.id, node]));
  const hulls = [];

  for (const path of paths ?? []) {
    const memberNodes = (path.stepIds ?? [])
      .map((id) => nodeById.get(id))
      .filter(Boolean);
    if (!memberNodes.length) continue;

    const layoutCards = memberNodes.map(flowNodeAsLayoutCard);
    const pathD = hullPathForLayoutCards(layoutCards);
    if (!pathD) continue;

    const bounds = boundsForMemberCards(layoutCards);
    const chrome = bounds ? chromeLayoutForBounds(bounds) : null;

    hulls.push({
      pathId: path.id,
      name: path.name,
      pathD,
      memberStepIds: memberNodes.map((node) => node.id),
      ...(chrome ?? {}),
    });
  }

  return hulls;
}

/**
 * @param {unknown} paths
 * @param {string[]} nodeIds
 */
export function validateFlowPaths(paths, nodeIds) {
  const validIds = new Set(nodeIds ?? []);
  const seenPathIds = new Set();
  const claimedSteps = new Set();

  for (const path of Array.isArray(paths) ? paths : []) {
    if (!path?.id || typeof path.id !== 'string') {
      throw new Error('flow path id is required');
    }
    if (seenPathIds.has(path.id)) {
      throw new Error('flow path ids must be unique');
    }
    seenPathIds.add(path.id);

    const name = String(path.name ?? '').trim();
    if (!name) throw new Error('flow path name is required');

    const stepIds = Array.isArray(path.stepIds) ? path.stepIds : [];
    if (!stepIds.length) throw new Error('flow path must include at least one step');

    for (const stepId of stepIds) {
      if (typeof stepId !== 'string' || !validIds.has(stepId)) {
        throw new Error('flow path references unknown step');
      }
      if (claimedSteps.has(stepId)) {
        throw new Error('flow step may belong to only one path');
      }
      claimedSteps.add(stepId);
    }

    const stepRunStates = path.stepRunStates;
    if (stepRunStates != null && (typeof stepRunStates !== 'object' || Array.isArray(stepRunStates))) {
      throw new Error('flow path stepRunStates must be an object');
    }
    if (stepRunStates) {
      for (const [stepId, state] of Object.entries(stepRunStates)) {
        if (!stepIds.includes(stepId)) {
          throw new Error('flow path stepRunStates references unknown step');
        }
        if (!isValidFlowStepRunState(state)) {
          throw new Error('flow path stepRunStates contains invalid run state');
        }
      }
    }
  }
}

/**
 * @param {object[]} paths
 * @param {string} pathId
 * @param {string} stepId
 * @param {string} runState
 */
export function patchPathStepRunState(paths, pathId, stepId, runState) {
  const normalizedState = normalizeFlowStepRunState(runState);
  const now = new Date().toISOString();
  return (paths ?? []).map((path) => {
    if (path.id !== pathId) return path;
    if (!path.stepIds?.includes(stepId)) return path;
    const nextStates = { ...(path.stepRunStates ?? {}) };
    if (normalizedState === 'not_started') {
      delete nextStates[stepId];
    } else {
      nextStates[stepId] = normalizedState;
    }
    return {
      ...path,
      stepRunStates: nextStates,
      updatedAt: now,
    };
  });
}

export function patchFlowPathName(paths, pathId, name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return paths;
  const now = new Date().toISOString();
  return (paths ?? []).map((path) => (
    path.id === pathId
      ? { ...path, name: trimmed, updatedAt: now }
      : path
  ));
}

/**
 * @param {object[]} paths
 * @param {string} pathId
 */
export function deleteFlowPath(paths, pathId) {
  if (!pathId) throw new Error('Path id is required');
  const next = (paths ?? []).filter((path) => path.id !== pathId);
  if (next.length === (paths ?? []).length) {
    throw new Error('Path not found');
  }
  return next;
}

/**
 * @param {{ paths?: object[], pathId: string, stepIds?: string[] }} options
 */
export function removeStepsFromFlowPath({
  paths = [],
  pathId,
  stepIds = [],
} = {}) {
  if (!pathId) throw new Error('Path id is required');
  const removeSet = new Set(stepIds.filter(Boolean));
  if (!removeSet.size) throw new Error('Select at least one step to remove from the path');

  const now = new Date().toISOString();
  let found = false;
  let removedAny = false;

  const nextPaths = (paths ?? []).flatMap((path) => {
    if (path.id !== pathId) return [path];
    found = true;
    const nextStepIds = (path.stepIds ?? []).filter((id) => {
      if (removeSet.has(id)) {
        removedAny = true;
        return false;
      }
      return true;
    });
    if (!nextStepIds.length) return [];
    return [{
      ...path,
      stepIds: nextStepIds,
      stepRunStates: normalizePathStepRunStates(path.stepRunStates, nextStepIds),
      updatedAt: now,
    }];
  });

  if (!found) throw new Error('Path not found');
  if (!removedAny) throw new Error('Selected steps are not in this path');
  return nextPaths;
}
