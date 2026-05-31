/** Interval for visible-tab server poll (ms). */
export const PROJECT_SYNC_POLL_INTERVAL_MS = 3000;

/** Interval for workspace index refresh during poll (ms). */
export const PROJECT_SYNC_INDEX_POLL_INTERVAL_MS = 30000;

/** Max poll interval after repeated API errors (ms). */
export const PROJECT_SYNC_POLL_MAX_INTERVAL_MS = 60000;

import {
  runSyncGate,
  isSyncGateIdle,
  getSyncGateLabel,
  resetSyncGateForTests,
} from './syncGate.js';

/** Single-flight guard for canvas project sync (boot, background, poll, manual). */
let bootSyncCompleted = false;
let bootPulledThisSession = false;

export function markBootSyncCompleted() {
  bootSyncCompleted = true;
}

export function isBootSyncCompleted() {
  return bootSyncCompleted;
}

export function markBootPulledProject() {
  bootPulledThisSession = true;
}

export function wasBootPulledThisSession() {
  return bootPulledThisSession;
}

export function resetBootPulledThisSession() {
  bootPulledThisSession = false;
}

export function isSyncIdle() {
  return isSyncGateIdle();
}

export function getSyncInFlightLabel() {
  return getSyncGateLabel();
}

/**
 * Run sync work exclusively. Poll ticks use mode 'skip' when busy.
 * @template T
 * @param {string} label
 * @param {() => Promise<T>} fn
 * @param {{ mode?: 'wait' | 'skip' }} [options]
 * @returns {Promise<T | null>}
 */
export async function runExclusive(label, fn, { mode = 'wait' } = {}) {
  return runSyncGate(`exclusive:${label}`, fn, { mode });
}

/** @internal tests */
export function resetSyncCoordinatorForTests() {
  resetSyncGateForTests();
  bootSyncCompleted = false;
  bootPulledThisSession = false;
}
