import { loadFolderHandle, saveFolderHandle } from './folderStore.js';

/**
 * Save a directory handle for a project and verify it round-trips in IndexedDB.
 * @param {string} projectId
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<boolean>}
 */
export async function verifyFolderHandleStored(projectId, handle) {
  if (!projectId || !handle) return false;
  await saveFolderHandle(projectId, handle);
  const stored = await loadFolderHandle(projectId);
  return Boolean(stored);
}
