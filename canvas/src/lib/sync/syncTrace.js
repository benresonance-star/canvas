/**
 * Opt-in cross-layer sync tracing. Enable in devtools:
 *   localStorage.setItem('canvas-sync-trace', '1')
 * Server: CANVAS_SYNC_TRACE=1
 */

export function isSyncTraceEnabled() {
  if (typeof process !== 'undefined' && process.env?.CANVAS_SYNC_TRACE === '1') {
    return true;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('canvas-sync-trace') === '1';
    }
  } catch {
    /* ignore */
  }
  return false;
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
 * @param {object[] | null | undefined} ops
 */
export function summarizePatchOps(ops) {
  if (!Array.isArray(ops)) return { count: 0, types: [] };
  const types = ops.map((o) => o?.op).filter(Boolean);
  return { count: ops.length, types: [...new Set(types)] };
}
