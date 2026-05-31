const ENABLED = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);

/**
 * @param {string} name
 */
export function perfMark(name) {
  if (!ENABLED || typeof performance === 'undefined') return;
  try {
    performance.mark(name);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} name
 * @param {string} startMark
 * @param {string} [endMark]
 */
export function perfMeasure(name, startMark, endMark) {
  if (!ENABLED || typeof performance === 'undefined') return;
  try {
    performance.measure(name, startMark, endMark);
    const entry = performance.getEntriesByName(name).pop();
    if (entry?.duration != null) {
      console.debug(`[canvas-perf] ${name}: ${Math.round(entry.duration)}ms`);
    }
  } catch {
    /* ignore */
  }
}

export function isLoadPerfEnabled() {
  return ENABLED;
}
