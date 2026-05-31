import { getCardPixelSize } from '../cards.js';
import { buildArtifactToCardMap } from './clusterGraph.js';

const DEFAULT_PADDING = 16;
const DEFAULT_RADIUS = 12;

export const CLUSTER_CHROME_HANDLE_SIZE = 24;
/** Target on-screen grip control size (counter-scaled in ClusterHullLayer). */
export const CLUSTER_CHROME_HANDLE_SCREEN_PX = 18;
export const CLUSTER_CHROME_ICON_SCREEN_PX = 10;
export const CLUSTER_CHROME_LABEL_MAX_WIDTH = 160;
export const CLUSTER_CHROME_GAP = 4;
export const CLUSTER_CHROME_ROW_HEIGHT = 28;
export const CLUSTER_CHROME_ABOVE_HULL = 10;
/** Zoom at or above this level shows cluster name labels on canvas. */
export const CLUSTER_CHROME_LABEL_MIN_ZOOM = 0.5;

export function cardCornerPoints(card) {
  const { w, h } = getCardPixelSize(card);
  const x = card.x;
  const y = card.y;
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Monotone chain convex hull; returns points in CCW order without duplicate closing point. */
export function convexHull(points) {
  if (points.length <= 1) return [...points];
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

/** Offset each hull vertex outward along the angle bisector. */
export function expandHull(points, padding) {
  if (points.length < 3 || padding <= 0) return points;
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const e1 = normalize({ x: prev.x - curr.x, y: prev.y - curr.y });
    const e2 = normalize({ x: next.x - curr.x, y: next.y - curr.y });
    let bis = normalize({ x: e1.x + e2.x, y: e1.y + e2.y });
    const crossBis = e1.x * e2.y - e1.y * e2.x;
    if (crossBis < 0) {
      bis = { x: -bis.x, y: -bis.y };
    }
    const dot = Math.max(-1, Math.min(1, e1.x * e2.x + e1.y * e2.y));
    const angle = Math.acos(dot);
    const sinHalf = Math.sin(angle / 2) || 1e-6;
    const offsetDist = padding / sinHalf;
    out.push({
      x: curr.x + bis.x * offsetDist,
      y: curr.y + bis.y * offsetDist,
    });
  }
  return out;
}

/**
 * Rounded closed polygon path (filleted corners).
 */
export function roundedPolygonPath(points, radius = DEFAULT_RADIUS) {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) {
    const p = points[0];
    const r = radius;
    return `M ${p.x - r} ${p.y} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  }
  if (n === 2) {
    const [a, b] = points;
    const minX = Math.min(a.x, b.x) - radius;
    const minY = Math.min(a.y, b.y) - radius;
    const maxX = Math.max(a.x, b.x) + radius;
    const maxY = Math.max(a.y, b.y) + radius;
    const w = maxX - minX;
    const h = maxY - minY;
    return `M ${minX + radius} ${minY} h ${w - 2 * radius} a ${radius} ${radius} 0 0 1 ${radius} ${radius} v ${h - 2 * radius} a ${radius} ${radius} 0 0 1 ${-radius} ${radius} h ${-(w - 2 * radius)} a ${radius} ${radius} 0 0 1 ${-radius} ${-radius} v ${-(h - 2 * radius)} a ${radius} ${radius} 0 0 1 ${radius} ${-radius} Z`;
  }

  const parts = [];
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    const len1 = Math.hypot(v1.x, v1.y);
    const len2 = Math.hypot(v2.x, v2.y);
    const r = Math.min(radius, len1 / 2, len2 / 2);

    const n1 = normalize(v1);
    const n2 = normalize(v2);
    const p1 = { x: curr.x + n1.x * r, y: curr.y + n1.y * r };
    const p2 = { x: curr.x + n2.x * r, y: curr.y + n2.y * r };

    if (i === 0) {
      parts.push(`M ${p1.x} ${p1.y}`);
    } else {
      parts.push(`L ${p1.x} ${p1.y}`);
    }
    parts.push(`Q ${curr.x} ${curr.y} ${p2.x} ${p2.y}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

function roundedRectPath(x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  return `M ${x + r} ${y} h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - 2 * r} a ${r} ${r} 0 0 1 ${-r} ${r} h ${-(w - 2 * r)} a ${r} ${r} 0 0 1 ${-r} ${-r} v ${-(h - 2 * r)} a ${r} ${r} 0 0 1 ${r} ${-r} Z`;
}

/**
 * @param {object[]} memberCards
 * @param {number} [padding]
 */
export function boundsForMemberCards(memberCards, padding = DEFAULT_PADDING) {
  if (memberCards.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const card of memberCards) {
    const { w, h } = getCardPixelSize(card);
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + w);
    maxY = Math.max(maxY, card.y + h);
  }

  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

/**
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
 */
export function chromeLayoutForBounds(bounds) {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const chromeY = bounds.minY - CLUSTER_CHROME_ABOVE_HULL;
  const rowWidth =
    CLUSTER_CHROME_HANDLE_SIZE + CLUSTER_CHROME_GAP + CLUSTER_CHROME_LABEL_MAX_WIDTH;
  const chromeLeft = centerX - rowWidth / 2;

  return {
    centerX,
    chromeY,
    chromeLeft,
    chromeWidth: rowWidth,
    chromeHeight: CLUSTER_CHROME_ROW_HEIGHT,
    handleX: chromeLeft,
    handleY: chromeY - CLUSTER_CHROME_ROW_HEIGHT,
    labelX: chromeLeft + CLUSTER_CHROME_HANDLE_SIZE + CLUSTER_CHROME_GAP,
    labelY: chromeY - CLUSTER_CHROME_ROW_HEIGHT,
  };
}

function hullPathForCards(memberCards, padding = DEFAULT_PADDING, radius = DEFAULT_RADIUS) {
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
    points.push(...cardCornerPoints(card));
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

export function clusterNestingDepth(cluster, clusterById, workspaceClusterId) {
  let depth = 0;
  let parentId = cluster.parent_cluster_id;
  while (parentId && parentId !== workspaceClusterId) {
    depth += 1;
    const parent = clusterById.get(parentId);
    if (!parent) break;
    parentId = parent.parent_cluster_id;
  }
  return depth;
}

/**
 * @param {{ id: string, name: string, parent_cluster_id?: string }[]} clusters
 * @param {Map<string, { id: string, type: string }[]>} membersByClusterId
 * @param {object[]} cards
 * @param {string} [workspaceClusterId]
 */
export function buildClusterHulls({
  clusters,
  membersByClusterId,
  cards,
  workspaceClusterId = null,
}) {
  const artifactMap = buildArtifactToCardMap(cards);
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const clusterById = new Map(clusters.map((c) => [c.id, c]));
  const hulls = [];

  for (const cluster of clusters) {
    const members = membersByClusterId.get(cluster.id) || [];
    const memberCards = [];
    for (const m of members) {
      if (m.type !== 'artifact') continue;
      const hit = artifactMap.get(m.id);
      if (hit?.cardId) {
        const card = cardById.get(hit.cardId);
        if (card) memberCards.push(card);
      }
    }
    const pathD = hullPathForCards(memberCards);
    if (!pathD) continue;
    const bounds = boundsForMemberCards(memberCards);
    const chrome = bounds ? chromeLayoutForBounds(bounds) : null;
    const depth =
      workspaceClusterId != null
        ? clusterNestingDepth(cluster, clusterById, workspaceClusterId)
        : 0;
    hulls.push({
      clusterId: cluster.id,
      name: cluster.name,
      pathD,
      depth,
      memberCardIds: memberCards.map((c) => c.id),
      ...(chrome || {}),
    });
  }

  hulls.sort((a, b) => a.depth - b.depth);
  return hulls;
}
