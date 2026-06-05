import { canonicalKeyForEntry } from './artifactPlacement.js';

/** @type {readonly string[]} */
export const PLACEMENT_AUDIT_STORAGE_KEYS = [
  'canvas-placement-audit',
  'canvas:placement-audit',
];

/**
 * Opt-in: `localStorage.setItem('canvas-placement-audit', '1')`
 * Legacy alias: `canvas:placement-audit`
 */
export function isPlacementAuditEnabled() {
  if (typeof localStorage === 'undefined') return false;
  try {
    return PLACEMENT_AUDIT_STORAGE_KEYS.some(
      (key) => localStorage.getItem(key) === '1',
    );
  } catch {
    return false;
  }
}

/**
 * @param {object[] | undefined} cards
 * @param {object[] | undefined} staged
 */
function keysOnSurface(cards, staged) {
  const canvas = [];
  const dock = [];
  for (const c of cards ?? []) {
    const k = canonicalKeyForEntry(c);
    if (k) canvas.push(k);
  }
  for (const s of staged ?? []) {
    const k = canonicalKeyForEntry(s);
    if (k) dock.push(k);
  }
  return { canvas, dock };
}

/**
 * @param {Record<string, { surface?: string }> | null | undefined} map
 */
function keysFromMap(map) {
  const canvas = [];
  const dock = [];
  for (const [key, entry] of Object.entries(map ?? {})) {
    if (entry?.surface === 'dock') dock.push(key);
    else if (entry?.surface === 'canvas') canvas.push(key);
  }
  return { canvas, dock };
}

/**
 * @param {string} step
 * @param {object} docOrPayload
 * @param {{ projectId?: string, extra?: object }} [meta]
 */
export function auditPlacementStep(step, docOrPayload, meta = {}) {
  if (!isPlacementAuditEnabled() || !docOrPayload) return;
  const cards = docOrPayload.cards ?? [];
  const staged = docOrPayload.stagedSyncCards ?? [];
  const arrays = keysOnSurface(cards, staged);
  const map = keysFromMap(docOrPayload.artifactPlacements);
  const conflicts = arrays.canvas.filter((k) => map.dock.includes(k));
  const missingOnCanvas = map.canvas.filter((k) => !arrays.canvas.includes(k));
  console.debug('[placement-audit]', step, {
    projectId: meta.projectId,
    ...meta.extra,
    arrayCanvas: arrays.canvas,
    arrayDock: arrays.dock,
    mapCanvas: map.canvas,
    mapDock: map.dock,
    conflictsMapDockVsArrayCanvas: conflicts,
    mapCanvasNotInArrays: missingOnCanvas,
  });
}
