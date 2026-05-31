import { registerProjectSyncResetHook } from './projectSyncState.js';

export const DEBOUNCE_MS = 600;

let pendingIndexTimer = null;
let pendingIndexPayload = null;
const pendingProjectTimers = new Map();
const pendingProjectPayloads = new Map();

export function getPendingIndexPayload() {
  return pendingIndexPayload;
}

export function setPendingIndexPayload(value) {
  pendingIndexPayload = value;
}

export function getPendingProjectPayloads() {
  return pendingProjectPayloads;
}

export function flushIndexTimer() {
  if (pendingIndexTimer) {
    clearTimeout(pendingIndexTimer);
    pendingIndexTimer = null;
  }
}

export function flushProjectTimer(projectId) {
  const t = pendingProjectTimers.get(projectId);
  if (t) {
    clearTimeout(t);
    pendingProjectTimers.delete(projectId);
  }
}

/** @param {string} projectId */
export function hasPendingProjectSave(projectId) {
  return pendingProjectPayloads.has(projectId) || pendingProjectTimers.has(projectId);
}

/** Drop debounced remote save for a project (e.g. before an authoritative switch flush). */
export function cancelPendingProjectSave(projectId) {
  if (!projectId) return;
  flushProjectTimer(projectId);
  pendingProjectPayloads.delete(projectId);
}

export function scheduleIndexRemoteSave(index, onFlush) {
  pendingIndexPayload = index;
  flushIndexTimer();
  pendingIndexTimer = setTimeout(() => {
    const payload = pendingIndexPayload;
    pendingIndexPayload = null;
    pendingIndexTimer = null;
    if (payload) onFlush(payload);
  }, DEBOUNCE_MS);
}

export function scheduleProjectRemoteSave(projectId, payload, onFlush) {
  pendingProjectPayloads.set(projectId, payload);
  flushProjectTimer(projectId);
  const timer = setTimeout(() => {
    pendingProjectTimers.delete(projectId);
    const doc = pendingProjectPayloads.get(projectId);
    pendingProjectPayloads.delete(projectId);
    if (!doc) return;
    onFlush(projectId, doc);
  }, DEBOUNCE_MS);
  pendingProjectTimers.set(projectId, timer);
}

export function takePendingIndexPayloadForFlush() {
  flushIndexTimer();
  const payload = pendingIndexPayload;
  pendingIndexPayload = null;
  return payload;
}

export function takePendingProjectEntriesForFlush() {
  const projectEntries = [...pendingProjectPayloads.entries()];
  for (const [projectId] of projectEntries) {
    flushProjectTimer(projectId);
  }
  pendingProjectPayloads.clear();
  return projectEntries;
}

export async function getPendingOrCachedPayload(projectId, readSerialised) {
  const pending = pendingProjectPayloads.get(projectId);
  if (pending) return pending;
  return readSerialised(projectId);
}

export function resetProjectSyncPendingState() {
  flushIndexTimer();
  pendingIndexPayload = null;
  for (const t of pendingProjectTimers.values()) clearTimeout(t);
  pendingProjectTimers.clear();
  pendingProjectPayloads.clear();
}

registerProjectSyncResetHook(resetProjectSyncPendingState);
