import { resetProjectDocumentDbForTests } from '../projectDocumentStore.js';

/** @type {Array<() => void>} */
const resetHooks = [];

export function registerProjectSyncResetHook(fn) {
  resetHooks.push(fn);
}

let quickInitDone = false;
let serverSyncEnabled = false;
/** @type {'mirror_from_server' | 'migrate_local' | 'sync_both' | 'none'} */
let pendingBackgroundMode = 'none';
/** @type {string[]} */
let pendingSyncBothLocalOnlyIds = [];
/** @type {string[]} */
let pendingSyncBothServerOnlyIds = [];
let pendingColdBrowserHint = false;
let pendingDatabaseUnavailable = false;
let lastSyncRecoveryCount = 0;
let quickInitPromise = null;
let backgroundSyncPromise = null;

/** @type {{ activeProjectId: string | null, indexProjectIds: string[] }} */
let cacheEvictionContext = { activeProjectId: null, indexProjectIds: [] };

export function getQuickInitDone() {
  return quickInitDone;
}

export function setQuickInitDone(value) {
  quickInitDone = value;
}

export function getServerSyncEnabled() {
  return serverSyncEnabled;
}

export function setServerSyncEnabled(value) {
  serverSyncEnabled = value;
}

export function getPendingBackgroundMode() {
  return pendingBackgroundMode;
}

export function setPendingBackgroundMode(value) {
  pendingBackgroundMode = value;
}

export function getPendingSyncBothLocalOnlyIds() {
  return pendingSyncBothLocalOnlyIds;
}

export function setPendingSyncBothLocalOnlyIds(value) {
  pendingSyncBothLocalOnlyIds = value;
}

export function getPendingSyncBothServerOnlyIds() {
  return pendingSyncBothServerOnlyIds;
}

export function setPendingSyncBothServerOnlyIds(value) {
  pendingSyncBothServerOnlyIds = value;
}

export function getPendingColdBrowserHint() {
  return pendingColdBrowserHint;
}

export function setPendingColdBrowserHint(value) {
  pendingColdBrowserHint = value;
}

export function getPendingDatabaseUnavailable() {
  return pendingDatabaseUnavailable;
}

export function setPendingDatabaseUnavailable(value) {
  pendingDatabaseUnavailable = value;
}

export function getLastSyncRecoveryCount() {
  return lastSyncRecoveryCount;
}

export function setLastSyncRecoveryCount(value) {
  lastSyncRecoveryCount = value;
}

export function bumpLastSyncRecoveryCount(delta) {
  lastSyncRecoveryCount = Math.max(lastSyncRecoveryCount, delta);
}

export function getQuickInitPromise() {
  return quickInitPromise;
}

export function setQuickInitPromise(value) {
  quickInitPromise = value;
}

export function getBackgroundSyncPromise() {
  return backgroundSyncPromise;
}

export function setBackgroundSyncPromise(value) {
  backgroundSyncPromise = value;
}

export function setCacheEvictionContext(ctx) {
  cacheEvictionContext = { ...cacheEvictionContext, ...ctx };
}

export function getCacheEvictionContext() {
  return cacheEvictionContext;
}

export function isServerSyncEnabled() {
  return serverSyncEnabled;
}

export function getProjectSyncMode() {
  return serverSyncEnabled ? 'server' : 'local-only';
}

export function consumeProjectSyncRecoveryNotice() {
  const count = lastSyncRecoveryCount;
  lastSyncRecoveryCount = 0;
  return count;
}

export function shouldShowOpenInCursorToSync() {
  return pendingColdBrowserHint;
}

export function shouldShowDatabaseUnavailable() {
  return pendingDatabaseUnavailable;
}

export function resetProjectSyncState() {
  quickInitDone = false;
  serverSyncEnabled = false;
  pendingBackgroundMode = 'none';
  pendingSyncBothLocalOnlyIds = [];
  pendingSyncBothServerOnlyIds = [];
  pendingColdBrowserHint = false;
  pendingDatabaseUnavailable = false;
  lastSyncRecoveryCount = 0;
  quickInitPromise = null;
  backgroundSyncPromise = null;
  for (const hook of resetHooks) hook();
  resetProjectDocumentDbForTests();
}
