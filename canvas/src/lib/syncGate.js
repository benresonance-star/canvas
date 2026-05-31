/**
 * Single mutex for all remote project sync (push, reconcile, debounced flush, actionSync).
 * Replaces parallel coordinators; `runExclusive` delegates here.
 */

let inFlight = null;
let inFlightLabel = null;

/** @param {string} label */
function logSyncGate(label, detail) {
  if (import.meta.env?.DEV) {
    console.debug(`[syncGate] ${label}`, detail ?? '');
  }
}

/**
 * @template T
 * @param {string} label
 * @param {() => Promise<T>} fn
 * @param {{ mode?: 'wait' | 'skip' }} [options]
 * @returns {Promise<T | null>}
 */
export async function runSyncGate(label, fn, { mode = 'wait' } = {}) {
  if (inFlight) {
    if (mode === 'skip') {
      logSyncGate('skip', { label, busy: inFlightLabel });
      return null;
    }
    try {
      await inFlight;
    } catch {
      /* prior job failed */
    }
  }

  inFlightLabel = label;
  const run = (async () => {
    logSyncGate('start', { label });
    try {
      return await fn();
    } finally {
      logSyncGate('end', { label });
    }
  })();
  inFlight = run;
  try {
    return await run;
  } finally {
    if (inFlight === run) {
      inFlight = null;
      inFlightLabel = null;
    }
  }
}

export function isSyncGateIdle() {
  return inFlight == null;
}

export function getSyncGateLabel() {
  return inFlightLabel;
}

/** @internal */
export function resetSyncGateForTests() {
  inFlight = null;
  inFlightLabel = null;
}
