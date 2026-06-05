import {
  LOCAL_ACTIVE_PROJECT_ID_KEY,
  PROJECT_INDEX_KEY,
  projectStorageKey,
} from '../constants.js';
import {
  getProjectDocumentSerialised,
  putProjectDocumentSerialised,
  getWorkspaceIndexSerialised,
  putWorkspaceIndexSerialised,
  isProjectDocumentIdbAvailable,
} from '../projectDocumentStore.js';
import {
  evictInactiveProjectCaches,
  evictInactiveProjectIdbCaches,
  touchProjectCache,
  isQuotaError,
} from '../storageBudget.js';
import { normalizeWorkspaceIndex } from '../projectIndexNormalize.js';
import {
  getServerSyncEnabled,
  getCacheEvictionContext,
  registerProjectSyncResetHook,
} from './projectSyncState.js';
import { indexProjectIdSignature } from './projectSyncMerge.js';

/** In-memory fallback when localStorage quota blocks cache (boot upload). */
const lastKnownProjectPayloadById = new Map();

export function getLastKnownProjectPayloadById() {
  return lastKnownProjectPayloadById;
}

export async function readLocalActiveProjectId() {
  try {
    const result = await window.storage.get(LOCAL_ACTIVE_PROJECT_ID_KEY);
    if (typeof result?.value === 'string') return result.value || null;
  } catch {
    /* storage */
  }
  try {
    return localStorage.getItem(LOCAL_ACTIVE_PROJECT_ID_KEY) || null;
  } catch {
    return null;
  }
}

export async function writeLocalActiveProjectId(projectId) {
  const value = projectId ?? '';
  try {
    await window.storage.set(LOCAL_ACTIVE_PROJECT_ID_KEY, value);
  } catch {
    /* storage */
  }
  try {
    if (projectId) {
      localStorage.setItem(LOCAL_ACTIVE_PROJECT_ID_KEY, projectId);
    } else {
      localStorage.removeItem(LOCAL_ACTIVE_PROJECT_ID_KEY);
    }
  } catch {
    /* localStorage */
  }
}

async function overlayLocalActiveProjectId(index) {
  if (!index?.projects?.length) return index;
  const localActiveId = await readLocalActiveProjectId();
  if (!localActiveId) return index;
  if (!index.projects.some((p) => p.id === localActiveId && !p.archived)) {
    return index;
  }
  if (index.activeProjectId === localActiveId) return index;
  return { ...index, activeProjectId: localActiveId };
}

export async function readLocalIndex() {
  try {
    const fromIdb = await getWorkspaceIndexSerialised();
    if (fromIdb) return overlayLocalActiveProjectId(JSON.parse(fromIdb));
  } catch {
    /* idb */
  }
  try {
    const result = await window.storage.get(PROJECT_INDEX_KEY);
    return result ? overlayLocalActiveProjectId(JSON.parse(result.value)) : null;
  } catch {
    return null;
  }
}

export async function writeLocalIndex(index) {
  const serialised = JSON.stringify(index);
  try {
    await putWorkspaceIndexSerialised(serialised);
  } catch {
    /* idb */
  }
  try {
    await window.storage.set(PROJECT_INDEX_KEY, serialised);
  } catch (e) {
    if (isQuotaError(e)) {
      console.warn('localStorage full for project index');
    } else {
      throw e;
    }
  }
}

/**
 * Normalize index (id dedupe only); persist when project list or active id changes.
 * @returns {Promise<object | null>}
 */
export async function normalizeAndRepairLocalIndex(index) {
  if (!index) return null;
  const { index: normalized } = normalizeWorkspaceIndex(index);
  const changed =
    indexProjectIdSignature(index) !== indexProjectIdSignature(normalized)
    || index.activeProjectId !== normalized.activeProjectId;
  if (changed) {
    await writeLocalIndex(normalized);
  }
  return normalized;
}

export async function readLocalProjectSerialised(projectId) {
  try {
    const fromIdb = await getProjectDocumentSerialised(projectId);
    if (fromIdb) return fromIdb;
  } catch {
    /* idb */
  }
  try {
    const result = await window.storage.get(projectStorageKey(projectId));
    return result?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<boolean>} false when local cache quota is exceeded
 */
export async function writeLocalProjectSerialised(projectId, serialised) {
  touchProjectCache(projectId);

  const tryWrite = async () => {
    if (isProjectDocumentIdbAvailable()) {
      try {
        await putProjectDocumentSerialised(projectId, serialised);
      } catch (e) {
        console.warn(`IDB project cache write failed for ${projectId}:`, e?.message ?? e);
      }
    }
    await window.storage.set(projectStorageKey(projectId), serialised);
    return true;
  };

  try {
    return await tryWrite();
  } catch (e) {
    if (!isQuotaError(e)) throw e;
  }

  if (!getServerSyncEnabled()) {
    console.warn(
      `Cache full for project ${projectId} (local-only); session may not persist locally`,
    );
    return false;
  }

  const ctx = getCacheEvictionContext();
  const evicted = evictInactiveProjectCaches(
    ctx.activeProjectId ?? projectId,
    ctx.indexProjectIds,
    { maxEvict: 3 },
  );
  await evictInactiveProjectIdbCaches(
    ctx.activeProjectId ?? projectId,
    ctx.indexProjectIds,
    { maxEvict: 3 },
  );
  if (evicted.length === 0) {
    console.warn(
      `Cache full for project ${projectId}; using server copy in session only`,
    );
    return false;
  }

  try {
    return await tryWrite();
  } catch (e) {
    if (isQuotaError(e)) {
      console.warn(
        `Cache full for project ${projectId} after eviction; using server copy in session only`,
      );
      return false;
    }
    throw e;
  }
}

export async function readLocalProjectDocument(projectId) {
  const localRaw = await readLocalProjectSerialised(projectId);
  if (!localRaw) return null;
  try {
    return JSON.parse(localRaw);
  } catch {
    return null;
  }
}

export function resetProjectSyncLocalState() {
  lastKnownProjectPayloadById.clear();
}

registerProjectSyncResetHook(resetProjectSyncLocalState);
