/** In-tab cache of granted directory handles (IDB remains durable source). */

/** @type {Map<string, FileSystemDirectoryHandle>} */
const handlesByProjectId = new Map();

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

/** @internal tests */
export function resetFolderSessionCacheForTests() {
  handlesByProjectId.clear();
}
