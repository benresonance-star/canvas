import { Position } from '@xyflow/react';
import {
  LAYER_ORDER,
  LAYER_Y,
  NODE_WIDTH,
  NODE_HEIGHT,
  NODE_GAP_X,
  LAYER_GROUP_PADDING,
  LAYER_ORIGIN_X,
  LAYER_NODE_Y,
} from './architectureLayoutConstants.js';

const EXTERIOR_BUS_BASE_X = 4;
const BUS_LANE_SPACING = 52;
const FAN_SPREAD_MAX = 34;
const ARCH_BASE_LIFT = 52;
const VERTICAL_BULGE = 38;
const DIAGONAL_BULGE = 42;

/**
 * @param {import('./architectureGraphSchema.js').ArchitectureNodeDef[]} graphNodes
 */
export function computeArchitectureNodeLayouts(graphNodes) {
  /** @type {Map<string, { x: number, y: number, centerX: number, centerY: number, layer: string, layerIndex: number }>} */
  const layouts = new Map();
  const byLayer = new Map();
  for (const layer of LAYER_ORDER) byLayer.set(layer, []);
  for (const node of graphNodes) {
    byLayer.get(node.layer)?.push(node);
  }

  for (const layer of LAYER_ORDER) {
    const layerNodes = byLayer.get(layer) ?? [];
    const layerIndex = LAYER_ORDER.indexOf(layer);
    layerNodes.forEach((node, index) => {
      const x = LAYER_ORIGIN_X + LAYER_GROUP_PADDING + index * (NODE_WIDTH + NODE_GAP_X);
      const y = LAYER_Y[layer] + LAYER_NODE_Y;
      layouts.set(node.id, {
        x,
        y,
        centerX: x + NODE_WIDTH / 2,
        centerY: y + NODE_HEIGHT / 2,
        layer: node.layer,
        layerIndex,
      });
    });
  }
  return layouts;
}

/**
 * @param {{ centerX: number, centerY: number, y: number, layerIndex: number }} source
 * @param {{ centerX: number, centerY: number, y: number, layerIndex: number }} target
 */
export function classifyEdgeTopology(source, target) {
  const dx = Math.abs(target.centerX - source.centerX);
  const dy = Math.abs(target.centerY - source.centerY);
  const hThreshold = NODE_WIDTH * 0.38;
  const vThreshold = NODE_HEIGHT * 0.85;

  if (dx < hThreshold && dy >= vThreshold) return 'vertical';
  if (dy < vThreshold && dx >= hThreshold) return 'horizontal';
  return 'diagonal';
}

/**
 * @param {object} source
 * @param {object} target
 * @param {-1|1} side
 * @param {object[]} layoutList
 */
export function scoreBulgeSide(source, target, side, layoutList) {
  const minY = Math.min(source.y, target.y) - 16;
  const maxY = Math.max(source.y + NODE_HEIGHT, target.y + NODE_HEIGHT) + 16;
  const midX = (source.centerX + target.centerX) / 2;
  let score = 0;

  for (const node of layoutList) {
    if (node === source || node === target) continue;
    const nodeTop = node.y;
    const nodeBottom = node.y + NODE_HEIGHT;
    if (nodeBottom < minY || nodeTop > maxY) continue;

    if (side < 0 && node.centerX < midX) {
      score += Math.max(0, 140 - (midX - node.centerX)) / 35;
    } else if (side > 0 && node.centerX > midX) {
      score += Math.max(0, 140 - (node.centerX - midX)) / 35;
    }
  }
  return score;
}

/**
 * @param {object} source
 * @param {object} target
 * @param {'above'|'below'} side
 * @param {object[]} layoutList
 */
export function scoreArchSide(source, target, side, layoutList) {
  const minX = Math.min(source.x, target.x) - 24;
  const maxX = Math.max(source.x + NODE_WIDTH, target.x + NODE_WIDTH) + 24;
  const rowY = Math.min(source.y, target.y);
  const corridorY = side === 'above' ? rowY - 72 : rowY + NODE_HEIGHT + 72;
  let score = 0;

  for (const node of layoutList) {
    if (node === source || node === target) continue;
    const nodeLeft = node.x;
    const nodeRight = node.x + NODE_WIDTH;
    if (nodeRight < minX || nodeLeft > maxX) continue;

    const nodeMidY = node.y + NODE_HEIGHT / 2;
    if (side === 'above' && nodeMidY < rowY) {
      score += Math.max(0, 90 - Math.abs(nodeMidY - corridorY)) / 30;
    } else if (side === 'below' && nodeMidY > rowY + NODE_HEIGHT) {
      score += Math.max(0, 90 - Math.abs(nodeMidY - corridorY)) / 30;
    }
  }
  return score;
}

/**
 * @param {object} source
 * @param {object} target
 * @param {object[]} layoutList
 * @param {{ left?: number, right?: number }} sideLoad
 */
export function chooseBulgeSide(source, target, layoutList, sideLoad = {}) {
  const left = scoreBulgeSide(source, target, -1, layoutList) + (sideLoad.left ?? 0) * 1.6;
  const right = scoreBulgeSide(source, target, 1, layoutList) + (sideLoad.right ?? 0) * 1.6;
  if (left < right) return -1;
  if (right < left) return 1;
  const midX = (source.centerX + target.centerX) / 2;
  const diagramMid = layoutList.reduce((sum, l) => sum + l.centerX, 0) / Math.max(layoutList.length, 1);
  return midX >= diagramMid ? 1 : -1;
}

/**
 * @param {object} source
 * @param {object} target
 * @param {object[]} layoutList
 * @param {{ above?: number, below?: number }} sideLoad
 */
export function chooseArchSide(source, target, layoutList, sideLoad = {}) {
  const above = scoreArchSide(source, target, 'above', layoutList) + (sideLoad.above ?? 0) * 1.6;
  const below = scoreArchSide(source, target, 'below', layoutList) + (sideLoad.below ?? 0) * 1.6;
  return above <= below ? 'above' : 'below';
}

/** Alternate bulge direction for sibling edges on the same node pair. */
export function resolveCounterBulgeSide(parallelIndex, parallelTotal, baseBulgeSide = 1) {
  if (parallelTotal <= 1) return baseBulgeSide;
  return parallelIndex % 2 === 0 ? -1 : 1;
}

/** Alternate arch direction (above/below) for sibling edges on the same node pair. */
export function resolveCounterArchSide(parallelIndex, parallelTotal, baseArchSide = 'above') {
  if (parallelTotal <= 1) return baseArchSide;
  return parallelIndex % 2 === 0 ? 'above' : 'below';
}

export function counterSpreadTier(parallelIndex, parallelTotal) {
  if (parallelTotal <= 1) return 0;
  return Math.floor(parallelIndex / 2) + 1;
}

/**
 * @param {object} baseRouting
 * @param {number} parallelIndex
 * @param {number} parallelTotal
 */
export function applyParallelRoutingOverrides(baseRouting, parallelIndex, parallelTotal) {
  if (parallelTotal <= 1) return { ...baseRouting };

  const routing = { ...baseRouting };

  if (routing.routeStyle === 'relative-horizontal') {
    routing.archSide = resolveCounterArchSide(parallelIndex, parallelTotal, baseRouting.archSide ?? 'above');
    const above = routing.archSide === 'above';
    routing.sourceHandle = above ? 'top-source' : 'bottom';
    routing.targetHandle = above ? 'top' : 'bottom-target';
    return routing;
  }

  if (routing.routeStyle === 'exterior-bus') {
    const flip = parallelIndex % 2 === 1;
    routing.busSide = flip
      ? (baseRouting.busSide === 'left' ? 'right' : 'left')
      : baseRouting.busSide;
    routing.bulgeSide = routing.busSide === 'left' ? -1 : 1;
    return routing;
  }

  routing.bulgeSide = resolveCounterBulgeSide(parallelIndex, parallelTotal, baseRouting.bulgeSide ?? 1);
  return routing;
}

/**
 * @param {object} source
 * @param {object} target
 * @param {{ layoutList?: object[], diagramCenter?: number, sideLoad?: object }} context
 */
export function resolveRelativeEdgeRouting(source, target, context = {}) {
  const layoutList = context.layoutList ?? [];
  const sideLoad = context.sideLoad ?? { left: 0, right: 0, above: 0, below: 0 };
  const dy = target.centerY - source.centerY;
  const layerGap = target.layerIndex - source.layerIndex;
  const bulgeSide = chooseBulgeSide(source, target, layoutList, sideLoad);

  if (layerGap > 2) {
    return {
      topology: 'exterior',
      routeStyle: 'exterior-bus',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      bulgeSide,
      archSide: null,
      busSide: bulgeSide < 0 ? 'left' : 'right',
    };
  }

  const topology = classifyEdgeTopology(source, target);

  if (topology === 'vertical') {
    const downward = dy >= 0;
    return {
      topology,
      routeStyle: 'relative-vertical',
      sourceHandle: downward ? 'bottom' : 'top-source',
      targetHandle: downward ? 'top' : 'bottom-target',
      bulgeSide,
      archSide: null,
      busSide: null,
    };
  }

  if (topology === 'horizontal') {
    const archSide = chooseArchSide(source, target, layoutList, sideLoad);
    const above = archSide === 'above';
    return {
      topology,
      routeStyle: 'relative-horizontal',
      sourceHandle: above ? 'top-source' : 'bottom',
      targetHandle: above ? 'top' : 'bottom-target',
      bulgeSide,
      archSide,
      busSide: null,
    };
  }

  const downward = dy >= 0;
  return {
    topology,
    routeStyle: 'relative-diagonal',
    sourceHandle: downward ? 'bottom' : 'top-source',
    targetHandle: downward ? 'top' : 'bottom-target',
    bulgeSide,
    archSide: null,
    busSide: null,
  };
}

/** @deprecated Use resolveRelativeEdgeRouting */
export function resolveEdgeHandles(source, target, layoutList) {
  const list = layoutList ?? [];
  const diagramCenter = list.length
    ? list.reduce((sum, layout) => sum + layout.centerX, 0) / list.length
    : 0;
  return resolveRelativeEdgeRouting(source, target, { layoutList: list, diagramCenter });
}

/**
 * @param {{ centerX: number } | undefined} layout
 * @param {number} fanIndex
 * @param {number} fanTotal
 */
export function spreadAlongNode(layout, fanIndex, fanTotal) {
  if (!layout) return 0;
  if (fanTotal <= 1) return layout.centerX;
  const step = Math.min(FAN_SPREAD_MAX, (NODE_WIDTH - 20) / fanTotal);
  return layout.centerX + (fanIndex - (fanTotal - 1) / 2) * step;
}

/**
 * @param {{ busSide: 'left'|'right', busLane: number, parallelIndex: number, maxRightX: number }} opts
 */
export function resolveExteriorBusX({ busSide, busLane, parallelIndex, maxRightX }) {
  const parallelBump = parallelIndex * 12;
  if (busSide === 'right') {
    return maxRightX + 32 + busLane * BUS_LANE_SPACING + parallelBump;
  }
  return EXTERIOR_BUS_BASE_X + busLane * BUS_LANE_SPACING + parallelBump;
}

/**
 * @param {string} handleId
 */
export function handleIdToPosition(handleId) {
  switch (handleId) {
    case 'left':
    case 'left-source':
      return Position.Left;
    case 'right':
    case 'right-target':
      return Position.Right;
    case 'top':
    case 'top-source':
      return Position.Top;
    case 'bottom':
    case 'bottom-target':
      return Position.Bottom;
    default:
      return Position.Bottom;
  }
}

/** Case 1 — vertically aligned: bottom/top ports, curve to the side. */
export function buildVerticalCurvePath(
  sourceX,
  sourceY,
  targetX,
  targetY,
  bulgeSide,
  parallelIndex = 0,
  laneOffset = 0,
  parallelTotal = 1,
) {
  const tier = counterSpreadTier(parallelIndex, parallelTotal);
  const bulge = VERTICAL_BULGE + tier * 16 + Math.abs(laneOffset) * 0.2;
  const offsetX = bulgeSide * bulge + laneOffset * 0.12;
  const dy = targetY - sourceY;
  const midY = sourceY + dy * 0.5;
  const exitLen = Math.min(Math.abs(dy) * 0.2, 44);
  const sign = dy >= 0 ? 1 : -1;

  const path = [
    `M ${sourceX} ${sourceY}`,
    `C ${sourceX} ${sourceY + sign * exitLen}, ${sourceX + offsetX} ${midY - sign * 12}, ${sourceX + offsetX} ${midY}`,
    `C ${sourceX + offsetX} ${midY + sign * 12}, ${targetX} ${targetY - sign * exitLen}, ${targetX} ${targetY}`,
  ].join(' ');

  return { path, labelX: sourceX + offsetX, labelY: midY };
}

/** Case 2 — horizontally aligned: arch above or below through top/bottom ports. */
export function buildHorizontalArchPath(
  sourceX,
  sourceY,
  targetX,
  targetY,
  archSide,
  parallelIndex = 0,
  laneOffset = 0,
  parallelTotal = 1,
) {
  const tier = counterSpreadTier(parallelIndex, parallelTotal);
  const lift = ARCH_BASE_LIFT + tier * 16 + Math.abs(laneOffset) * 0.15;
  const above = archSide !== 'below';
  const dir = above ? -1 : 1;
  const apexY = above
    ? Math.min(sourceY, targetY) - lift
    : Math.max(sourceY, targetY) + lift;
  const midX = (sourceX + targetX) / 2 + laneOffset * 0.2;
  const handleLen = lift * 0.48;

  const path = [
    `M ${sourceX} ${sourceY}`,
    `C ${sourceX} ${sourceY + dir * handleLen}, ${sourceX} ${apexY}, ${midX} ${apexY}`,
    `C ${targetX} ${apexY}, ${targetX} ${targetY + dir * handleLen}, ${targetX} ${targetY}`,
  ].join(' ');

  return { path, labelX: midX, labelY: apexY - dir * 8 };
}

/** Case 3 — diagonal: bottom/top ports with smooth S-curve. */
export function buildDiagonalCurvePath(
  sourceX,
  sourceY,
  targetX,
  targetY,
  bulgeSide,
  parallelIndex = 0,
  laneOffset = 0,
  parallelTotal = 1,
) {
  const tier = counterSpreadTier(parallelIndex, parallelTotal);
  const bulge = DIAGONAL_BULGE + tier * 16 + Math.abs(laneOffset) * 0.28;
  const offsetX = bulgeSide * bulge + laneOffset * 0.18;
  const dy = targetY - sourceY;
  const midY = sourceY + dy * 0.5;
  const midX = (sourceX + targetX) / 2 + offsetX * 0.45;
  const exitLen = Math.min(Math.abs(dy) * 0.16, 40);
  const sign = dy >= 0 ? 1 : -1;

  const path = [
    `M ${sourceX} ${sourceY}`,
    `C ${sourceX} ${sourceY + sign * exitLen}, ${sourceX + offsetX} ${sourceY + dy * 0.3}, ${midX} ${midY}`,
    `C ${targetX + offsetX * 0.35} ${sourceY + dy * 0.7}, ${targetX} ${targetY - sign * exitLen}, ${targetX} ${targetY}`,
  ].join(' ');

  return { path, labelX: midX, labelY: midY - 6 };
}

/** Long cross-layer exterior route outside the diagram. */
export function buildExteriorCurvePath(
  sourceX,
  sourceY,
  targetEntryX,
  targetY,
  busSide,
  busLane,
  parallelIndex = 0,
  maxRightX = targetEntryX,
) {
  const corridorX = resolveExteriorBusX({ busSide, busLane, parallelIndex, maxRightX });
  const midY = (sourceY + targetY) / 2;
  const exitDrop = 40;
  const entryRise = 40;

  const path = [
    `M ${sourceX} ${sourceY}`,
    `C ${sourceX} ${sourceY + exitDrop}, ${corridorX} ${sourceY + exitDrop + 16}, ${corridorX} ${midY - 32}`,
    `C ${corridorX} ${midY + 32}, ${targetEntryX} ${targetY - entryRise - 16}, ${targetEntryX} ${targetY}`,
  ].join(' ');

  return { path, labelX: corridorX, labelY: midY };
}

/** User-dragged label anchor — wire bends through this point. */
export function buildAnchoredCurvePath(sourceX, sourceY, targetX, targetY, anchorX, anchorY) {
  const path = [
    `M ${sourceX} ${sourceY}`,
    `C ${sourceX} ${sourceY + (anchorY - sourceY) * 0.45}, ${sourceX + (anchorX - sourceX) * 0.35} ${anchorY}, ${anchorX} ${anchorY}`,
    `C ${targetX + (anchorX - targetX) * 0.35} ${anchorY}, ${targetX} ${targetY + (anchorY - targetY) * 0.45}, ${targetX} ${targetY}`,
  ].join(' ');

  return { path, labelX: anchorX, labelY: anchorY };
}

/**
 * @param {object} options
 */
export function buildRelativeEdgePath(options) {
  const {
    routeStyle,
    sourceX,
    sourceY,
    targetX,
    targetY,
    routeAnchor,
    bulgeSide = 1,
    archSide = 'above',
    parallelIndex = 0,
    laneOffset = 0,
    parallelTotal = 1,
    busSide = 'left',
    busLane = 0,
    maxRightX,
  } = options;

  if (routeAnchor) {
    return buildAnchoredCurvePath(
      sourceX,
      sourceY,
      targetX,
      targetY,
      routeAnchor.x,
      routeAnchor.y,
    );
  }

  switch (routeStyle) {
    case 'relative-vertical':
      return buildVerticalCurvePath(
        sourceX, sourceY, targetX, targetY, bulgeSide, parallelIndex, laneOffset, parallelTotal,
      );
    case 'relative-horizontal':
      return buildHorizontalArchPath(
        sourceX, sourceY, targetX, targetY, archSide, parallelIndex, laneOffset, parallelTotal,
      );
    case 'relative-diagonal':
      return buildDiagonalCurvePath(
        sourceX, sourceY, targetX, targetY, bulgeSide, parallelIndex, laneOffset, parallelTotal,
      );
    case 'exterior-bus':
      return buildExteriorCurvePath(
        sourceX,
        sourceY,
        targetX,
        targetY,
        busSide,
        busLane,
        parallelIndex,
        maxRightX ?? targetX,
      );
    default:
      return buildDiagonalCurvePath(
        sourceX, sourceY, targetX, targetY, bulgeSide, parallelIndex, laneOffset, parallelTotal,
      );
  }
}

/**
 * @param {import('./architectureGraphSchema.js').ArchitecturePipeDef[]} pipes
 * @param {ReturnType<typeof computeArchitectureNodeLayouts>} layouts
 */
export function buildEdgeRoutingMetadata(pipes, layouts) {
  /** @type {Map<string, import('./architectureGraphSchema.js').ArchitecturePipeDef[]>} */
  const pairBuckets = new Map();
  /** @type {Map<string, import('./architectureGraphSchema.js').ArchitecturePipeDef[]>} */
  const byTarget = new Map();
  /** @type {Map<string, import('./architectureGraphSchema.js').ArchitecturePipeDef[]>} */
  const bySource = new Map();

  for (const pipe of pipes) {
    const pairKey = `${pipe.source}::${pipe.target}`;
    if (!pairBuckets.has(pairKey)) pairBuckets.set(pairKey, []);
    pairBuckets.get(pairKey).push(pipe);
    if (!byTarget.has(pipe.target)) byTarget.set(pipe.target, []);
    byTarget.get(pipe.target).push(pipe);
    if (!bySource.has(pipe.source)) bySource.set(pipe.source, []);
    bySource.get(pipe.source).push(pipe);
  }

  for (const group of pairBuckets.values()) group.sort((a, b) => a.id.localeCompare(b.id));
  for (const group of byTarget.values()) group.sort((a, b) => a.id.localeCompare(b.id));
  for (const group of bySource.values()) group.sort((a, b) => a.id.localeCompare(b.id));

  const layoutList = [...layouts.values()];
  const maxCenterX = Math.max(...layoutList.map((l) => l.centerX));
  const minCenterX = Math.min(...layoutList.map((l) => l.centerX));
  const diagramCenter = (maxCenterX + minCenterX) / 2;
  const maxRightX = Math.max(...layoutList.map((l) => l.x + NODE_WIDTH));

  const sideLoad = { left: 0, right: 0, above: 0, below: 0 };
  let leftBusCounter = 0;
  let rightBusCounter = 0;

  const pairBaseRouting = new Map();
  for (const [pairKey, group] of pairBuckets) {
    const pipe = group[0];
    const sourceLayout = layouts.get(pipe.source);
    const targetLayout = layouts.get(pipe.target);
    if (!sourceLayout || !targetLayout) continue;
    const baseRouting = resolveRelativeEdgeRouting(sourceLayout, targetLayout, {
      layoutList,
      diagramCenter,
      sideLoad,
    });
    pairBaseRouting.set(pairKey, baseRouting);
    if (baseRouting.bulgeSide < 0) sideLoad.left += 1;
    else sideLoad.right += 1;
    if (baseRouting.archSide === 'above') sideLoad.above += 1;
    if (baseRouting.archSide === 'below') sideLoad.below += 1;
  }

  const sortedPipes = [...pipes].sort((a, b) => a.id.localeCompare(b.id));

  return sortedPipes.map((pipe) => {
    const pairKey = `${pipe.source}::${pipe.target}`;
    const siblings = pairBuckets.get(pairKey) ?? [pipe];
    const parallelIndex = Math.max(0, siblings.findIndex((p) => p.id === pipe.id));
    const parallelTotal = siblings.length;

    const sourceLayout = layouts.get(pipe.source);
    const targetLayout = layouts.get(pipe.target);
    const baseRouting = pairBaseRouting.get(pairKey) ?? {
      topology: 'diagonal',
      routeStyle: 'relative-diagonal',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      bulgeSide: 1,
      archSide: null,
      busSide: null,
    };
    const routing = applyParallelRoutingOverrides(baseRouting, parallelIndex, parallelTotal);

    const targetGroup = byTarget.get(pipe.target) ?? [pipe];
    const sourceGroup = bySource.get(pipe.source) ?? [pipe];
    const targetFanIndex = targetGroup.findIndex((p) => p.id === pipe.id);
    const sourceFanIndex = sourceGroup.findIndex((p) => p.id === pipe.id);
    const targetEntryX = spreadAlongNode(targetLayout, targetFanIndex, targetGroup.length);
    const sourceEntryX = spreadAlongNode(sourceLayout, sourceFanIndex, sourceGroup.length);

    let busSide = routing.busSide ?? 'left';
    let busLane = 0;
    if (routing.routeStyle === 'exterior-bus') {
      busLane = busSide === 'right' ? rightBusCounter++ : leftBusCounter++;
    }

    const fanSpread = (targetFanIndex - (targetGroup.length - 1) / 2) * 22
      + (sourceFanIndex - (sourceGroup.length - 1) / 2) * 12;
    const laneOffset = fanSpread;

    return {
      pipe,
      routing,
      parallelIndex,
      parallelTotal,
      sourceEntryX,
      targetEntryX,
      targetFanIndex,
      targetFanTotal: targetGroup.length,
      busSide,
      busLane,
      laneOffset,
      maxRightX,
    };
  });
}
