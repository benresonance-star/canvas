import { loadFolderHandle } from './folderStore.js';
import {
  getCachedFolderHandle,
  setCachedFolderHandle,
  clearCachedFolderHandle,
  notifyFolderHandleRepaired,
} from './folderSessionCache.js';

/**
 * @param {FileSystemDirectoryHandle} handle
 */
async function queryFolderPermission(handle) {
  let perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') {
    perm = await handle.queryPermission({ mode: 'read' });
  }
  return perm;
}

/**
 * @param {FileSystemDirectoryHandle} handle
 */
async function requestFolderPermission(handle) {
  let perm = await handle.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') {
    perm = await handle.requestPermission({ mode: 'read' });
  }
  return perm;
}

/**
 * Resolve handle from session cache or IndexedDB.
 * @param {string} projectId
 */
export async function getStoredFolderHandleForRepair(projectId) {
  const cached = getCachedFolderHandle(projectId);
  if (cached) return cached;
  const handle = await loadFolderHandle(projectId);
  if (handle) setCachedFolderHandle(projectId, handle);
  else clearCachedFolderHandle(projectId);
  return handle;
}

/**
 * Link a persisted folder handle without scanning disk.
 * @param {string} projectId
 * @param {{ requestIfNeeded?: boolean, handle?: FileSystemDirectoryHandle | null }} [options]
 * @returns {Promise<{
 *   handle: FileSystemDirectoryHandle | null,
 *   granted: boolean,
 *   stored: boolean,
 *   needsPermission: boolean,
 * }>}
 */
export async function linkFolderForProject(
  projectId,
  { requestIfNeeded = false, handle: handleOverride = null } = {},
) {
  const handle = handleOverride ?? (await getStoredFolderHandleForRepair(projectId));
  if (!handle) {
    clearCachedFolderHandle(projectId);
    return { handle: null, granted: false, stored: false, needsPermission: false };
  }
  setCachedFolderHandle(projectId, handle);

  let perm = await queryFolderPermission(handle);
  if (perm === 'prompt' && requestIfNeeded) {
    perm = await requestFolderPermission(handle);
  }

  const granted = perm === 'granted';

  return {
    handle: granted ? handle : null,
    granted,
    stored: true,
    needsPermission: !granted,
  };
}

/**
 * Restore a persisted folder handle for a project.
 * @param {string} projectId
 * @param {{ requestIfNeeded?: boolean }} options - When true, call requestPermission (requires user gesture)
 */
export async function restoreFolderForProject(projectId, { requestIfNeeded = false } = {}) {
  return linkFolderForProject(projectId, { requestIfNeeded });
}

/**
 * Re-approve access to a previously linked folder (user gesture required).
 * @param {string} projectId
 * @returns {Promise<{ ok: true, handle: FileSystemDirectoryHandle } | { ok: false, reason: 'not_stored' | 'denied' }>}
 */
export async function reconnectFolderForProject(projectId) {
  const handle = await getStoredFolderHandleForRepair(projectId);
  if (!handle) {
    return { ok: false, reason: 'not_stored' };
  }

  const perm = await requestFolderPermission(handle);
  if (perm !== 'granted') {
    return { ok: false, reason: 'denied' };
  }

  setCachedFolderHandle(projectId, handle);
  notifyFolderHandleRepaired(projectId, handle);
  return { ok: true, handle };
}

/**
 * Verify a directory handle can read the filesystem (without using "." — invalid on Windows).
 * @param {FileSystemDirectoryHandle} handle
 */
export async function probeFolderHandleAlive(handle) {
  if (!handle || typeof handle.entries !== 'function') return;
  const iterator = handle.entries();
  try {
    await iterator.next();
  } finally {
    if (typeof iterator.return === 'function') {
      await iterator.return();
    }
  }
}

function isStaleFolderHandleProbeError(error) {
  const message = String(error?.message ?? '');
  return (
    /state cached in an interface object/i.test(message)
    || /state has changed since it was read from the disk/i.test(message)
  );
}

/**
 * Reload a folder handle from IndexedDB after a stale File System Access error.
 * @param {string} projectId
 * @returns {Promise<FileSystemDirectoryHandle | null>}
 */
export async function reloadFolderHandleForWrite(projectId) {
  if (!projectId) return null;
  clearCachedFolderHandle(projectId);
  const handle = await loadFolderHandle(projectId);
  if (!handle) return null;

  let perm = await queryFolderPermission(handle);
  if (perm !== 'granted') {
    if (perm === 'prompt') {
      perm = await requestFolderPermission(handle);
    }
    if (perm !== 'granted') return null;
  }

  try {
    await probeFolderHandleAlive(handle);
  } catch (error) {
    if (isStaleFolderHandleProbeError(error)) {
      const reconnected = await reconnectFolderForProject(projectId);
      if (reconnected.ok && reconnected.handle) {
        try {
          await probeFolderHandleAlive(reconnected.handle);
          setCachedFolderHandle(projectId, reconnected.handle);
          notifyFolderHandleRepaired(projectId, reconnected.handle);
          return reconnected.handle;
        } catch {
          clearCachedFolderHandle(projectId);
          return null;
        }
      }
      clearCachedFolderHandle(projectId);
      return null;
    }
    throw error;
  }

  setCachedFolderHandle(projectId, handle);
  notifyFolderHandleRepaired(projectId, handle);
  return handle;
}
