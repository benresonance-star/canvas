/**
 * Single mutex for all remote project sync (push, reconcile, debounced flush, actionSync).
 * Replaces parallel coordinators; `runExclusive` delegates here.
 */

let inFlight = null;
let inFlightLabel = null;

/** Placement push must not queue behind long-running sync jobs. */
const PLACEMENT_PRIORITY_LABELS = new Set([
  'action:placementTransfer',
  'patch-push',
  'flush-outgoing',
]);

/** @param {string} label */
function logSyncGate(label, detail) {
  if (import.meta.env?.DEV) {
    console.debug(`[syncGate] ${label}`, detail ?? '');
  }
}

/**
 * Dock/canvas placement runs immediately unless another placement is in flight.
 * @param {string} label
 * @returns {boolean}
 */
export function canBypassSyncGateForPlacement(label) {
  if (!PLACEMENT_PRIORITY_LABELS.has(label) || !inFlightLabel) {
    return false;
  }
  return inFlightLabel !== 'action:placementTransfer';
}

/** @deprecated Use canBypassSyncGateForPlacement */
export function canBypassBootSyncGate(label) {
  return canBypassSyncGateForPlacement(label);
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
    if (canBypassSyncGateForPlacement(label)) {
      logSyncGate('bypass-wait', { label, busy: inFlightLabel });
      return fn();
    }
    if (mode === 'skip') {
      logSyncGate('skip', { label, busy: inFlightLabel });
      return null;
    }
    logSyncGate('wait', { label, busy: inFlightLabel });
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
