/**
 * Scoped mutex for remote project sync.
 * Calls without an explicit scope use the global lane; project-scoped calls can
 * run in parallel across different projects while global work remains a barrier.
 */

const GLOBAL_SCOPE = 'global';
const lanes = new Map();

function laneFor(scope = GLOBAL_SCOPE) {
  const key = scope || GLOBAL_SCOPE;
  if (!lanes.has(key)) {
    lanes.set(key, { inFlight: null, label: null });
  }
  return lanes.get(key);
}

function activeLanes() {
  return [...lanes.entries()].filter(([, lane]) => lane.inFlight);
}

function firstActiveLaneForScope(scope = GLOBAL_SCOPE) {
  const key = scope || GLOBAL_SCOPE;
  const active = activeLanes();
  if (active.length === 0) return null;
  if (key === GLOBAL_SCOPE) {
    return active[0];
  }
  const globalLane = lanes.get(GLOBAL_SCOPE);
  if (globalLane?.inFlight) return [GLOBAL_SCOPE, globalLane];
  const scopedLane = lanes.get(key);
  if (scopedLane?.inFlight) return [key, scopedLane];
  return null;
}

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
export function canBypassSyncGateForPlacement(label, scope = GLOBAL_SCOPE) {
  const busy = firstActiveLaneForScope(scope);
  const busyLabel = busy?.[1]?.label ?? null;
  if (!PLACEMENT_PRIORITY_LABELS.has(label) || !busyLabel) {
    return false;
  }
  return busyLabel !== 'action:placementTransfer';
}

/** @deprecated Use canBypassSyncGateForPlacement */
export function canBypassBootSyncGate(label) {
  return canBypassSyncGateForPlacement(label);
}

/**
 * @template T
 * @param {string} label
 * @param {() => Promise<T>} fn
 * @param {{ mode?: 'wait' | 'skip', scope?: string }} [options]
 * @returns {Promise<T | null>}
 */
export async function runSyncGate(label, fn, { mode = 'wait', scope = GLOBAL_SCOPE } = {}) {
  const key = scope || GLOBAL_SCOPE;
  for (;;) {
    const busy = firstActiveLaneForScope(key);
    const busyLabel = busy?.[1]?.label ?? null;
    if (!busy) break;
    if (canBypassSyncGateForPlacement(label, key)) {
      logSyncGate('bypass-wait', { label, scope: key, busy: busyLabel });
      return fn();
    }
    if (mode === 'skip') {
      logSyncGate('skip', { label, scope: key, busy: busyLabel });
      return null;
    }
    logSyncGate('wait', { label, scope: key, busy: busyLabel });
    try {
      await busy[1].inFlight;
    } catch {
      /* prior job failed */
    }
  }

  const lane = laneFor(key);
  const run = (async () => {
    logSyncGate('start', { label, scope: key });
    try {
      return await fn();
    } finally {
      logSyncGate('end', { label, scope: key });
    }
  })();
  lane.inFlight = run;
  lane.label = label;
  try {
    return await run;
  } finally {
    if (lane.inFlight === run) {
      lane.inFlight = null;
      lane.label = null;
      if (key !== GLOBAL_SCOPE) {
        lanes.delete(key);
      }
    }
  }
}

export function isSyncGateIdle() {
  return activeLanes().length === 0;
}

export function getSyncGateLabel() {
  const globalLane = lanes.get(GLOBAL_SCOPE);
  if (globalLane?.label) return globalLane.label;
  return activeLanes()[0]?.[1]?.label ?? null;
}

/** @internal */
export function resetSyncGateForTests() {
  lanes.clear();
}
