import { buildRelativeEdgePath } from './architectureEdgeRouting.js';
import {
  flowPointToWorld,
  getHandleFlowPosition,
} from './diagnosticsLayout3d.js';

const DEFAULT_SAMPLE_COUNT = 48;

/**
 * Sample cubic-bezier SVG path segments (M + C commands only).
 * @param {string} path
 * @param {number} sampleCount
 * @returns {{ x: number, y: number }[]}
 */
export function sampleSvgPath(path, sampleCount = DEFAULT_SAMPLE_COUNT) {
  const segments = [];
  const tokens = path.trim().split(/[\s,]+/);
  let i = 0;

  const readNumber = () => parseFloat(tokens[i++]);

  let current = { x: 0, y: 0 };

  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M') {
      current = { x: readNumber(), y: readNumber() };
      segments.push({ type: 'move', point: { ...current } });
    } else if (cmd === 'C') {
      const cp1 = { x: readNumber(), y: readNumber() };
      const cp2 = { x: readNumber(), y: readNumber() };
      const end = { x: readNumber(), y: readNumber() };
      segments.push({ type: 'cubic', start: { ...current }, cp1, cp2, end });
      current = end;
    }
  }

  const cubics = segments.filter((segment) => segment.type === 'cubic');
  if (cubics.length === 0) {
    const moves = segments.filter((segment) => segment.type === 'move');
    return moves.map((segment) => segment.point);
  }

  const points = [];
  const perCurve = Math.max(2, Math.floor(sampleCount / cubics.length));

  for (const cubic of cubics) {
    for (let step = 0; step <= perCurve; step += 1) {
      const t = step / perCurve;
      const mt = 1 - t;
      const x = mt ** 3 * cubic.start.x
        + 3 * mt ** 2 * t * cubic.cp1.x
        + 3 * mt * t ** 2 * cubic.cp2.x
        + t ** 3 * cubic.end.x;
      const y = mt ** 3 * cubic.start.y
        + 3 * mt ** 2 * t * cubic.cp1.y
        + 3 * mt * t ** 2 * cubic.cp2.y
        + t ** 3 * cubic.end.y;
      if (points.length === 0 || points[points.length - 1].x !== x || points[points.length - 1].y !== y) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

/**
 * @param {{ x: number, y: number }[]} points2d
 * @param {{ x: number, y: number, z: number }[]} worldPoints
 * @param {{ x: number, y: number }} label2d
 */
export function closestWorldPointToFlowLabel(points2d, worldPoints, label2d) {
  if (!label2d || worldPoints.length === 0) return null;
  if (worldPoints.length === 1) return worldPoints[0];

  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points2d.length; i += 1) {
    const dist = Math.hypot(points2d[i].x - label2d.x, points2d[i].y - label2d.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }
  return worldPoints[bestIndex] ?? null;
}

/**
 * @param {object} options
 * @param {ReturnType<typeof import('./diagnosticsLayout3d.js').buildDiagnosticsLayout3d>} layout3d
 * @param {number} [sampleCount]
 */
export function buildEdgeFlowPolyline(options, layout3d, sampleCount = DEFAULT_SAMPLE_COUNT) {
  const {
    sourceId,
    targetId,
    routingMeta,
    routeAnchor,
  } = options;

  const sourceEntry = layout3d.byNodeId.get(sourceId);
  const targetEntry = layout3d.byNodeId.get(targetId);
  if (!sourceEntry || !targetEntry) return { points2d: [], label2d: null };

  const sourceLayout = sourceEntry.flow;
  const targetLayout = targetEntry.flow;
  const sourceHandle = routingMeta.sourceHandle ?? 'bottom';
  const targetHandle = routingMeta.targetHandle ?? 'top';
  const sourcePoint = getHandleFlowPosition(sourceLayout, sourceHandle);
  const targetPoint = getHandleFlowPosition(targetLayout, targetHandle);

  const { path, labelX, labelY } = buildRelativeEdgePath({
    routeStyle: routingMeta.routeStyle ?? 'relative-diagonal',
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
    routeAnchor,
    bulgeSide: routingMeta.bulgeSide ?? 1,
    archSide: routingMeta.archSide ?? 'above',
    parallelIndex: routingMeta.parallelIndex ?? 0,
    parallelTotal: routingMeta.parallelTotal ?? 1,
    laneOffset: routingMeta.laneOffset ?? 0,
    busSide: routingMeta.busSide ?? 'left',
    busLane: routingMeta.busLane ?? 0,
    maxRightX: routingMeta.maxRightX,
  });

  const points2d = sampleSvgPath(path, sampleCount);
  return {
    points2d,
    label2d: { x: labelX, y: labelY },
  };
}

/**
 * @param {{ x: number, y: number }[]} points2d
 * @param {number} sourceLayerIndex
 * @param {number} targetLayerIndex
 * @param {number} originCenterX
 * @param {number} originCenterY
 */
export function liftPolylineToWorld(
  points2d,
  _sourceLayerIndex,
  _targetLayerIndex,
  originCenterX,
  originCenterY,
) {
  if (points2d.length === 0) return [];
  return points2d.map((point) => flowPointToWorld(
    point.x,
    point.y,
    0,
    originCenterX,
    originCenterY,
  ));
}

/**
 * @param {object} edgeProjection
 * @param {ReturnType<typeof import('./diagnosticsLayout3d.js').buildDiagnosticsLayout3d>} layout3d
 * @param {number} [sampleCount]
 */
export function buildProjectedEdgeGeometry(edgeProjection, layout3d, sampleCount = DEFAULT_SAMPLE_COUNT) {
  const sourceEntry = layout3d.byNodeId.get(edgeProjection.sourceId);
  const targetEntry = layout3d.byNodeId.get(edgeProjection.targetId);
  if (!sourceEntry || !targetEntry) {
    return { worldPoints: [], labelWorld: null, label2d: null };
  }

  const { points2d, label2d } = buildEdgeFlowPolyline(edgeProjection, layout3d, sampleCount);
  const worldPoints = liftPolylineToWorld(
    points2d,
    sourceEntry.flow.layerIndex,
    targetEntry.flow.layerIndex,
    layout3d.centerX,
    layout3d.centerY,
  );

  const labelWorld = label2d
    ? closestWorldPointToFlowLabel(points2d, worldPoints, label2d)
    : null;

  return { worldPoints, labelWorld, label2d };
}

/**
 * Strip user-rerouted anchors and full-diagram bus/arch metadata so edges
 * reproject between the current concentrated node positions. Anchors that
 * still sit near the edge segment are preserved so wire dragging works.
 *
 * @param {object} edge
 * @param {ReturnType<typeof import('./diagnosticsLayout3d.js').buildDiagnosticsLayout3d>} [layout3d]
 */
const CONCENTRATE_ANCHOR_MAX_FLOW_DISTANCE = 420;

function resolveConcentrateRouteAnchor(edge, layout3d) {
  const anchor = edge.routeAnchor ?? null;
  if (!anchor || !layout3d) return null;

  const source = layout3d.byNodeId.get(edge.sourceId);
  const target = layout3d.byNodeId.get(edge.targetId);
  if (!source || !target) return null;

  const sx = source.flow.centerX;
  const sy = source.flow.centerY;
  const tx = target.flow.centerX;
  const ty = target.flow.centerY;
  const dx = tx - sx;
  const dy = ty - sy;
  const lenSq = dx * dx + dy * dy;

  let closestX = sx;
  let closestY = sy;
  if (lenSq > 0) {
    const t = Math.max(0, Math.min(1, ((anchor.x - sx) * dx + (anchor.y - sy) * dy) / lenSq));
    closestX = sx + t * dx;
    closestY = sy + t * dy;
  }

  const dist = Math.hypot(anchor.x - closestX, anchor.y - closestY);
  return dist <= CONCENTRATE_ANCHOR_MAX_FLOW_DISTANCE ? anchor : null;
}

export function prepareConcentratedEdgeProjection(edge, layout3d) {
  const routeAnchor = resolveConcentrateRouteAnchor(edge, layout3d);
  return {
    ...edge,
    routeAnchor,
    routingMeta: {
      ...edge.routingMeta,
      routeStyle: routeAnchor ? edge.routingMeta?.routeStyle ?? 'relative-diagonal' : 'relative-diagonal',
      parallelIndex: 0,
      parallelTotal: 1,
      laneOffset: 0,
      busLane: 0,
      busSide: 'left',
      archSide: 'above',
      bulgeSide: 1,
      maxRightX: undefined,
    },
  };
}
