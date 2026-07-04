/** In-tab cache of granted directory handles (IDB remains durable source). */

/** @type {Map<string, FileSystemDirectoryHandle>} */
const handlesByProjectId = new Map();

/** @type {Set<(projectId: string, handle: FileSystemDirectoryHandle) => void>} */
const repairListeners = new Set();

/** @type {Set<(projectId: string) => void>} */
const staleListeners = new Set();

/**
 * @param {string} projectId
 * @returns {FileSystemDirectoryHandle | null}
 */
export function getCachedFolderHandle(projectId) {
  if (!projectId) return null;
  return handlesByProjectId.get(projectId) ?? null;
}

/**
 * @param {string} projectId
 * @param {FileSystemDirectoryHandle} handle
 */
export function setCachedFolderHandle(projectId, handle) {
  if (!projectId || !handle) return;
  handlesByProjectId.set(projectId, handle);
}

/**
 * @param {string} projectId
 */
export function clearCachedFolderHandle(projectId) {
  if (!projectId) return;
  handlesByProjectId.delete(projectId);
}

/**
 * @param {(projectId: string, handle: FileSystemDirectoryHandle) => void} listener
 * @returns {() => void}
 */
export function onFolderHandleRepaired(listener) {
  repairListeners.add(listener);
  return () => repairListeners.delete(listener);
}

/**
 * @param {string} projectId
 * @param {FileSystemDirectoryHandle} handle
 */
export function notifyFolderHandleRepaired(projectId, handle) {
  if (!projectId || !handle) return;
  for (const listener of repairListeners) {
    listener(projectId, handle);
  }
}

/**
 * @param {(projectId: string) => void} listener
 * @returns {() => void}
 */
export function onFolderHandleStale(listener) {
  staleListeners.add(listener);
  return () => staleListeners.delete(listener);
}

/**
 * Drop cached handles after an unrecoverable stale File System Access error.
 * @param {string} projectId
 */
export function markFolderHandleStale(projectId) {
  if (!projectId) return;
  clearCachedFolderHandle(projectId);
  for (const listener of staleListeners) {
    listener(projectId);
  }
}

/** @internal tests */
export function resetFolderSessionCacheForTests() {
  handlesByProjectId.clear();
  repairListeners.clear();
  staleListeners.clear();
}
