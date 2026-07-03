import { diagnosticsConcentrateLayoutStorageKey } from './constants.js';
import {
  fetchConcentrateLayout,
  saveConcentrateLayout,
} from './diagnosticsConcentrateLayoutApi.js';
import {
  getActionTouchedEdgeIds,
  getActionTouchedNodeIds,
} from './architecture/architectureActions.js';
import { isServerSyncEnabled } from './sync/projectSyncState.js';

export const CONCENTRATE_LAYOUT_PERSIST_DEBOUNCE_MS = 250;

/**
 * @typedef {{
 *   actionId: string,
 *   specVersion: string,
 *   nodeOverrides: Record<string, { centerX: number, centerY: number }>,
 *   edgeAnchors: Record<string, { x: number, y: number }>,
 *   updatedAt: string | null,
 * }} ConcentrateActionLayout
 */

/**
 * @param {string} actionId
 * @param {string} specVersion
 * @returns {ConcentrateActionLayout}
 */
export function emptyConcentrateActionLayout(actionId, specVersion) {
  return {
    actionId,
    specVersion,
    nodeOverrides: {},
    edgeAnchors: {},
    updatedAt: null,
  };
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function centersEqual(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.centerX === right.centerX && left.centerY === right.centerY;
}

function anchorsEqual(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.x === right.x && left.y === right.y;
}

/**
 * @param {unknown} raw
 * @param {string} actionId
 * @param {string} specVersion
 * @returns {ConcentrateActionLayout}
 */
function parseCachedLayout(raw, actionId, specVersion) {
  if (!isPlainObject(raw)) {
    return emptyConcentrateActionLayout(actionId, specVersion);
  }
  if (raw.specVersion !== specVersion || raw.actionId !== actionId) {
    return emptyConcentrateActionLayout(actionId, specVersion);
  }

  /** @type {Record<string, { centerX: number, centerY: number }>} */
  const nodeOverrides = {};
  if (isPlainObject(raw.nodeOverrides)) {
    for (const [nodeId, entry] of Object.entries(raw.nodeOverrides)) {
      if (!isPlainObject(entry)) continue;
      const centerX = Number(entry.centerX);
      const centerY = Number(entry.centerY);
      if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) continue;
      nodeOverrides[nodeId] = { centerX, centerY };
    }
  }

  /** @type {Record<string, { x: number, y: number }>} */
  const edgeAnchors = {};
  if (isPlainObject(raw.edgeAnchors)) {
    for (const [edgeId, entry] of Object.entries(raw.edgeAnchors)) {
      if (!isPlainObject(entry)) continue;
      const x = Number(entry.x);
      const y = Number(entry.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      edgeAnchors[edgeId] = { x, y };
    }
  }

  return {
    actionId,
    specVersion,
    nodeOverrides,
    edgeAnchors,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

/**
 * @param {import('./architecture/architectureGraphSchema.js').ArchitectureActionDef | null | undefined} action
 * @param {ConcentrateActionLayout} layout
 * @returns {ConcentrateActionLayout}
 */
export function sanitizeConcentrateLayout(action, layout) {
  if (!action) return layout;
  const nodeIds = getActionTouchedNodeIds(action);
  const edgeIds = getActionTouchedEdgeIds(action);

  /** @type {Record<string, { centerX: number, centerY: number }>} */
  const nodeOverrides = {};
  for (const [nodeId, center] of Object.entries(layout.nodeOverrides ?? {})) {
    if (nodeIds.has(nodeId)) nodeOverrides[nodeId] = center;
  }

  /** @type {Record<string, { x: number, y: number }>} */
  const edgeAnchors = {};
  for (const [edgeId, anchor] of Object.entries(layout.edgeAnchors ?? {})) {
    if (edgeIds.has(edgeId)) edgeAnchors[edgeId] = anchor;
  }

  return {
    ...layout,
    nodeOverrides,
    edgeAnchors,
  };
}

/**
 * @param {string | null | undefined} actionId
 * @param {string} specVersion
 * @returns {ConcentrateActionLayout | null}
 */
export function readCachedConcentrateLayout(actionId, specVersion) {
  if (!actionId || !specVersion) return null;
  try {
    const raw = localStorage.getItem(diagnosticsConcentrateLayoutStorageKey(actionId, specVersion));
    if (!raw) return null;
    return parseCachedLayout(JSON.parse(raw), actionId, specVersion);
  } catch {
    return null;
  }
}

/**
 * @param {ConcentrateActionLayout} layout
 */
export function writeCachedConcentrateLayout(layout) {
  if (!layout?.actionId || !layout?.specVersion) return;
  try {
    localStorage.setItem(
      diagnosticsConcentrateLayoutStorageKey(layout.actionId, layout.specVersion),
      JSON.stringify(layout),
    );
  } catch {
    /* ignore quota errors */
  }
}

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const persistTimers = new Map();

/** @type {Map<string, ConcentrateActionLayout>} */
const pendingWrites = new Map();

function persistKey(actionId, specVersion) {
  return `${actionId}:${specVersion}`;
}

/**
 * @param {ConcentrateActionLayout} layout
 * @param {import('./architecture/architectureGraphSchema.js').ArchitectureActionDef | null | undefined} action
 */
export function scheduleConcentrateLayoutPersist(layout, action) {
  if (!layout?.actionId || !layout?.specVersion) return;
  const sanitized = sanitizeConcentrateLayout(action, layout);
  writeCachedConcentrateLayout(sanitized);

  const key = persistKey(layout.actionId, layout.specVersion);
  pendingWrites.set(key, sanitized);

  const existing = persistTimers.get(key);
  if (existing) clearTimeout(existing);

  persistTimers.set(
    key,
    setTimeout(() => {
      persistTimers.delete(key);
      const pending = pendingWrites.get(key);
      pendingWrites.delete(key);
      if (!pending) return;
      void flushConcentrateLayoutToServer(pending);
    }, CONCENTRATE_LAYOUT_PERSIST_DEBOUNCE_MS),
  );
}

/**
 * @param {string | null | undefined} actionId
 * @param {string} specVersion
 * @param {ConcentrateActionLayout | null | undefined} layout
 */
export function flushConcentrateLayoutPersist(actionId, specVersion, layout) {
  if (!actionId || !specVersion) return;
  const key = persistKey(actionId, specVersion);
  const existing = persistTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    persistTimers.delete(key);
  }
  const pending = layout ?? pendingWrites.get(key);
  pendingWrites.delete(key);
  if (pending) {
    writeCachedConcentrateLayout(pending);
    void flushConcentrateLayoutToServer(pending);
  }
}

/**
 * @param {ConcentrateActionLayout} layout
 */
async function flushConcentrateLayoutToServer(layout) {
  if (!isServerSyncEnabled()) return;
  try {
    await saveConcentrateLayout(layout.actionId, layout.specVersion, {
      nodeOverrides: layout.nodeOverrides,
      edgeAnchors: layout.edgeAnchors,
    });
  } catch {
    /* best-effort server sync */
  }
}

/**
 * @param {string} actionId
 * @param {string} specVersion
 * @param {import('./architecture/architectureGraphSchema.js').ArchitectureActionDef | null | undefined} action
 * @returns {Promise<ConcentrateActionLayout | null>}
 */
export async function hydrateConcentrateLayoutFromServer(actionId, specVersion, action) {
  if (!isServerSyncEnabled()) return null;
  try {
    const remote = await fetchConcentrateLayout(actionId, specVersion);
    if (!remote) return null;
    const parsed = parseCachedLayout(remote, actionId, specVersion);
    const sanitized = sanitizeConcentrateLayout(action, parsed);
    writeCachedConcentrateLayout(sanitized);
    return sanitized;
  } catch {
    return null;
  }
}

/**
 * @param {ConcentrateActionLayout} base
 * @param {Partial<ConcentrateActionLayout>} partial
 * @returns {ConcentrateActionLayout}
 */
export function mergeConcentrateLayout(base, partial) {
  return {
    ...base,
    nodeOverrides: partial.nodeOverrides ?? base.nodeOverrides,
    edgeAnchors: partial.edgeAnchors ?? base.edgeAnchors,
    updatedAt: partial.updatedAt ?? base.updatedAt,
  };
}

export { centersEqual, anchorsEqual };
