import {
  readCachedRevision,
  writeCachedRevision,
  clearCachedRevision,
  readCachedLocalEditAt,
  writeCachedLocalEditAt,
} from '../projectRevision.js';
import { normalizeProjectNameKey } from '../projectIndexNormalize.js';
import { fetchCanvasProjectMeta } from '../canvasProjectsApi.js';
import { registerProjectSyncResetHook, getServerSyncEnabled } from './projectSyncState.js';
import { parseServerUpdatedAt } from './projectSyncMerge.js';
import { syncTraceLog } from './syncTrace.js';
import {
  flushProjectTimer,
  getPendingProjectPayloads,
} from './projectSyncPending.js';

const clientRevisionByProject = new Map();
const lastServerUpdatedAtByProject = new Map();
const localEditAtByProject = new Map();

/** @type {((projectId: string, lock: 'live' | 'stale' | 'offline') => void) | null} */
let syncLockListener = null;

export function setSyncLockListener(listener) {
  syncLockListener = listener;
}

export function notifySyncLock(projectId, lock) {
  if (!projectId) return;
  syncLockListener?.(projectId, lock);
}

export function getClientRevision(projectId) {
  return clientRevisionByProject.get(projectId) ?? 0;
}

export async function ensureClientRevision(projectId) {
  if (!clientRevisionByProject.has(projectId)) {
    const cached = await readCachedRevision(projectId);
    clientRevisionByProject.set(projectId, cached);
  }
  if (!localEditAtByProject.has(projectId)) {
    const storedEditAt = await readCachedLocalEditAt(projectId);
    if (storedEditAt > 0) {
      localEditAtByProject.set(projectId, storedEditAt);
    }
  }
  return clientRevisionByProject.get(projectId) ?? 0;
}

/**
 * When duplicate projects merge, revision markers may remain on dropped ids.
 * @param {object | null | undefined} indexBefore
 * @param {object | null | undefined} normalizedIndex
 * @param {string[]} removedIds
 */
export async function migrateRevisionsOnIndexRepair(
  indexBefore,
  normalizedIndex,
  removedIds,
) {
  if (!removedIds?.length) return;

  const droppedById = new Map(
    (indexBefore?.projects ?? []).filter((p) => p?.id).map((p) => [p.id, p]),
  );
  const keptProjects = normalizedIndex?.projects ?? [];

  for (const removedId of removedIds) {
    const removedRev = await readCachedRevision(removedId);
    if (removedRev <= 0) continue;

    const dropped = droppedById.get(removedId);
    const nameKey = dropped
      ? normalizeProjectNameKey(dropped.name)
      : '';
    const kept = keptProjects.find(
      (p) => p.id !== removedId && normalizeProjectNameKey(p.name) === nameKey,
    );
    if (!kept?.id) continue;

    const keptRev = await readCachedRevision(kept.id);
    const mergedRev = Math.max(keptRev, removedRev);
    if (mergedRev > keptRev) {
      await writeCachedRevision(kept.id, mergedRev);
      clientRevisionByProject.set(kept.id, mergedRev);
    }
    clientRevisionByProject.delete(removedId);
    await clearCachedRevision(removedId);
  }
}

export function recordLocalProjectEdit(projectId) {
  if (!projectId) return;
  const now = Date.now();
  localEditAtByProject.set(projectId, now);
  void writeCachedLocalEditAt(projectId, now);
}

export function applyServerProjectRevision(projectId, updatedAt, revision) {
  if (!projectId) return;
  const ms = parseServerUpdatedAt(updatedAt);
  lastServerUpdatedAtByProject.set(projectId, ms);
  const prevLocal = localEditAtByProject.get(projectId) ?? 0;
  if (prevLocal <= ms) {
    localEditAtByProject.set(projectId, ms);
    void writeCachedLocalEditAt(projectId, ms);
  }
  if (revision !== undefined) {
    const rev = Number(revision) || 0;
    clientRevisionByProject.set(projectId, rev);
    void writeCachedRevision(projectId, rev);
  }
  flushProjectTimer(projectId);
  getPendingProjectPayloads().delete(projectId);
}

/**
 * Align in-memory revision markers with server meta (e.g. after createProject).
 * @param {string} projectId
 */
/**
 * Bump client revision to match server meta before push (avoids PUT/PATCH with expectedRevision 0 vs server 1).
 * @param {string} projectId
 * @param {string | null} [traceId]
 */
export async function alignClientRevisionWithServerMeta(projectId, traceId = null) {
  if (!projectId || !getServerSyncEnabled()) return null;
  try {
    const meta = await fetchCanvasProjectMeta(projectId);
    if (!meta) return null;
    await ensureClientRevision(projectId);
    const clientRev = getClientRevision(projectId);
    const serverRev = Number(meta.revision) || 0;
    if (serverRev > clientRev) {
      syncTraceLog(traceId, 'revision:align-meta', {
        projectId,
        clientRev,
        serverRevision: serverRev,
      });
      applyServerProjectRevision(projectId, meta.updatedAt, serverRev);
    }
    return meta;
  } catch (e) {
    syncTraceLog(traceId, 'revision:align-failed', {
      projectId,
      error: e?.message ?? String(e),
    });
    return null;
  }
}

export async function seedClientRevisionFromMeta(projectId) {
  if (!projectId || !getServerSyncEnabled()) return;
  try {
    const { readLocalProjectSerialised } = await import('./projectSyncLocal.js');
    const { projectCardCount } = await import('./projectSyncMerge.js');
    const raw = await readLocalProjectSerialised(projectId);
    if (raw) {
      try {
        const localCards = projectCardCount(JSON.parse(raw));
        if (localCards > 0) {
          const { fetchCanvasProjectDocument } = await import('../canvasProjectsApi.js');
          const remote = await fetchCanvasProjectDocument(projectId);
          if (!remote?.payload) return;
        }
      } catch {
        /* ignore */
      }
    }
    const meta = await fetchCanvasProjectMeta(projectId);
    if (meta) {
      await ensureClientRevision(projectId);
      applyServerProjectRevision(projectId, meta.updatedAt, meta.revision);
    }
  } catch (e) {
    console.warn(`Could not seed revision for ${projectId}:`, e.message);
  }
}

export function getLastServerUpdatedAt(projectId) {
  return lastServerUpdatedAtByProject.get(projectId);
}

export function getLocalEditAt(projectId) {
  return localEditAtByProject.get(projectId) ?? 0;
}

export function deleteRevisionStateForProject(projectId) {
  clientRevisionByProject.delete(projectId);
  localEditAtByProject.delete(projectId);
  lastServerUpdatedAtByProject.delete(projectId);
}

export function resetProjectSyncRevisionState() {
  clientRevisionByProject.clear();
  lastServerUpdatedAtByProject.clear();
  localEditAtByProject.clear();
  syncLockListener = null;
}

registerProjectSyncResetHook(resetProjectSyncRevisionState);
