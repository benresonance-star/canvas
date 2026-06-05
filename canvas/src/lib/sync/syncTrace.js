/**
 * Opt-in cross-layer sync tracing. Enable in devtools:
 *   localStorage.setItem('canvas-sync-trace', '1')
 * Legacy alias (docs previously used colon form):
 *   localStorage.setItem('canvas:sync-trace', '1')
 * Server: CANVAS_SYNC_TRACE=1
 */

/** @type {readonly string[]} */
export const SYNC_TRACE_STORAGE_KEYS = ['canvas-sync-trace', 'canvas:sync-trace'];

function isLocalStorageFlagEnabled(keys) {
  try {
    if (typeof localStorage === 'undefined') return false;
    return keys.some((key) => localStorage.getItem(key) === '1');
  } catch {
    return false;
  }
}

export function isSyncTraceEnabled() {
  if (typeof process !== 'undefined' && process.env?.CANVAS_SYNC_TRACE === '1') {
    return true;
  }
  return isLocalStorageFlagEnabled(SYNC_TRACE_STORAGE_KEYS);
}

export function createSyncTraceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `st-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param {string | null | undefined} traceId
 * @param {string} stage
 * @param {Record<string, unknown>} [meta]
 */
export function syncTraceLog(traceId, stage, meta = {}) {
  if (!traceId || !isSyncTraceEnabled()) return;
  console.info(
    '[canvas:sync-trace]',
    JSON.stringify({ traceId, stage, t: Date.now(), ...meta }),
  );
}

/**
 * Flow-level trace (create/switch/delete/folder) — uses projectId when provided.
 * @param {string} stage
 * @param {Record<string, unknown>} [meta]
 */
export function flowTrace(stage, meta = {}) {
  const traceId =
    (typeof meta.traceId === 'string' && meta.traceId)
    || (typeof meta.projectId === 'string' && meta.projectId)
    || createSyncTraceId();
  const { traceId: _tid, ...rest } = meta;
  syncTraceLog(traceId, stage, rest);
}

/**
 * @param {object[] | null | undefined} ops
 */
export function summarizePatchOps(ops) {
  if (!Array.isArray(ops)) return { count: 0, types: [] };
  const types = ops.map((o) => o?.op).filter(Boolean);
  return { count: ops.length, types: [...new Set(types)] };
}
