import {
  fetchCanvasIndexDocument,
  fetchCanvasProjectMeta,
  saveCanvasIndex,
  saveCanvasProject,
} from '../canvasProjectsApi.js';
import {
  auditWorkspaceIndex,
  purgeOrphanProjectBodies,
  readLocalProjectPayload,
  projectCardCountFromDoc,
} from '../workspaceIntegrity.js';
import { normalizeWorkspaceIndex } from '../projectIndexNormalize.js';
import {
  registerProjectSyncResetHook,
  getServerSyncEnabled,
  setPendingBackgroundMode,
  setPendingSyncBothServerOnlyIds,
  getPendingSyncBothServerOnlyIds,
  bumpLastSyncRecoveryCount,
  getLastSyncRecoveryCount,
} from './projectSyncState.js';
import {
  mergeProjectIndices,
  mergeIndexPullOptions,
  preserveMergedLocalRowsWithCards,
  parseServerUpdatedAt,
  projectIndexSignature,
} from './projectSyncMerge.js';
import { isDeletedProjectId } from '../projectDeletionTombstones.js';
import { deleteCanvasProject } from '../canvasProjectsApi.js';
import {
  readLocalIndex,
  writeLocalIndex,
  readLocalProjectSerialised,
  writeLocalProjectSerialised,
  normalizeAndRepairLocalIndex,
  getLastKnownProjectPayloadById,
} from './projectSyncLocal.js';
import { applyServerProjectRevision } from './projectSyncRevision.js';
import {
  applyServerWorkspaceIndexRevision,
  getClientWorkspaceIndexRevision,
} from '../workspaceIndexRevision.js';
import {
  flushIndexTimer,
  getPendingIndexPayload,
  setPendingIndexPayload,
  scheduleIndexRemoteSave as scheduleIndexRemoteSavePending,
} from './projectSyncPending.js';

let lastServerWorkspaceIndexUpdatedAt = 0;
let indexPullChain = null;
let indexPullPendingOptions = null;
let indexPullRetryTimer = null;
let indexPullConsecutiveTimeouts = 0;
let indexPushRetryTimer = null;
let indexPushConsecutiveFailures = 0;
let indexPushChain = Promise.resolve();

export function getLastServerWorkspaceIndexUpdatedAt() {
  return lastServerWorkspaceIndexUpdatedAt;
}

export function setLastServerWorkspaceIndexUpdatedAt(ms) {
  lastServerWorkspaceIndexUpdatedAt = ms;
}

export function resetProjectSyncIndexState() {
  lastServerWorkspaceIndexUpdatedAt = 0;
  indexPullChain = null;
  indexPullPendingOptions = null;
  if (indexPullRetryTimer) clearTimeout(indexPullRetryTimer);
  indexPullRetryTimer = null;
  indexPullConsecutiveTimeouts = 0;
  if (indexPushRetryTimer) clearTimeout(indexPushRetryTimer);
  indexPushRetryTimer = null;
  indexPushConsecutiveFailures = 0;
  indexPushChain = Promise.resolve();
}

registerProjectSyncResetHook(resetProjectSyncIndexState);

function scheduleIndexRemoteSave(index) {
  if (!getServerSyncEnabled()) return;
  scheduleIndexRemoteSavePending(index, (payload) => {
    void pushIndexToServer(payload);
  });
}

/**
 * Upload local bodies for index rows that have no server document yet.
 * @param {object} index
 * @returns {Promise<number>} count uploaded
 */
export async function healProjectsMissingServerDocuments(index) {
  if (!getServerSyncEnabled() || !index?.projects?.length) return 0;
  const candidateIds = index.projects
    .filter((p) => p?.id && !p.archived)
    .map((p) => p.id);
  const missing = await collectMissingServerProjectIds(candidateIds);
  if (missing.length === 0) return 0;
  return uploadLocalOnlyProjects(missing, index, { pushIndex: false });
}

async function collectMissingServerProjectIds(candidateIds) {
  const missing = [];
  const concurrency = 8;
  let cursor = 0;
  async function worker() {
    while (cursor < candidateIds.length) {
      const projectId = candidateIds[cursor];
      cursor += 1;
      try {
        const meta = await fetchCanvasProjectMeta(projectId);
        if (!meta) missing.push(projectId);
      } catch {
        missing.push(projectId);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, candidateIds.length) }, () => worker()),
  );
  return missing;
}

function isTimeoutError(error) {
  return error?.name === 'TimeoutError'
    || error?.code === 'ABORT_ERR'
    || /signal timed out|timeout/i.test(String(error?.message ?? error));
}

function scheduleIndexPushRetry(index, options = {}) {
  if (!getServerSyncEnabled() || !index) return;
  if (indexPushRetryTimer) clearTimeout(indexPushRetryTimer);
  const delayMs = Math.min(30_000, 5_000 * Math.max(1, indexPushConsecutiveFailures));
  indexPushRetryTimer = setTimeout(() => {
    indexPushRetryTimer = null;
    scheduleIndexRemoteSavePending(index, (payload) => {
      void pushIndexToServer(payload, options);
    });
  }, delayMs);
}

function scheduleIndexPullRetry(options = {}) {
  if (!getServerSyncEnabled()) return;
  if (indexPullRetryTimer) clearTimeout(indexPullRetryTimer);
  const delayMs = Math.min(30_000, 5_000 * Math.max(1, indexPullConsecutiveTimeouts));
  indexPullRetryTimer = setTimeout(() => {
    indexPullRetryTimer = null;
    void pullAndMergeProjectIndex(options).catch(() => {});
  }, delayMs);
}

function pushIndexToServer(index, options = {}) {
  indexPushChain = indexPushChain
    .catch(() => {})
    .then(() => pushIndexToServerBody(index, options));
  return indexPushChain;
}

async function pushIndexToServerBody(index, options = {}) {
  if (!getServerSyncEnabled() || !index) return;
  flushIndexTimer();
  setPendingIndexPayload(null);
  try {
    await healProjectsMissingServerDocuments(index);
    const refreshed = await readLocalIndex();
    if (refreshed?.projects?.length) {
      index = refreshed;
    }
    const { getProjectSyncClientId } = await import('./projectSyncClientId.js');
    let expected = getClientWorkspaceIndexRevision();
    let result = await saveCanvasIndex(
      index,
      expected,
      getProjectSyncClientId(),
      { deletedProjectIds: options.deletedProjectIds ?? [] },
    );
    if (result.conflict && result.index) {
      applyServerWorkspaceIndexRevision(result.revision);
      const localIndex = index;
      const { index: merged } = mergeProjectIndices(localIndex, result.index, {});
      await writeLocalIndex(merged);
      result = await saveCanvasIndex(merged, result.revision, getProjectSyncClientId(), {
        deletedProjectIds: options.deletedProjectIds ?? [],
      });
      index = merged;
    }
    if (result.ok) {
      applyServerWorkspaceIndexRevision(result.revision);
      indexPushConsecutiveFailures = 0;
    }
  } catch (e) {
    indexPushConsecutiveFailures += 1;
    if (isTimeoutError(e)) {
      console.warn('Canvas index sync timed out; will retry in background.', {
        attempts: indexPushConsecutiveFailures,
      });
      scheduleIndexPushRetry(index, options);
      return;
    }
    console.error('Canvas index sync failed:', e);
  }
}
async function collectLocalProjectIdsWithCards(localProjects) {
  const ids = [];
  for (const row of localProjects ?? []) {
    if (!row?.id || isDeletedProjectId(row.id)) continue;
    const payload = await readLocalProjectPayload(row.id);
    if (projectCardCountFromDoc(payload) > 0) ids.push(row.id);
  }
  return ids;
}
export async function patchIndexDocumentRevision(projectId, revision, updatedAt, options = {}) {
  if (!projectId) return;
  const index = await readLocalIndex();
  if (!index?.projects?.length) return;
  const row = index.projects.find((p) => p.id === projectId);
  if (!row) return;
  row.documentRevision = revision;
  row.documentUpdatedAt = updatedAt ?? null;
  row.updatedAt = Date.now();
  if ((Number(revision) || 0) > 0 && row.syncState) {
    delete row.syncState;
  }
  await writeLocalIndex(index);
  if (getPendingIndexPayload()?.projects) {
    const pendingRow = getPendingIndexPayload().projects.find((p) => p.id === projectId);
    if (pendingRow) {
      pendingRow.documentRevision = revision;
      pendingRow.documentUpdatedAt = updatedAt ?? null;
      pendingRow.updatedAt = row.updatedAt;
      if ((Number(revision) || 0) > 0 && pendingRow.syncState) {
        delete pendingRow.syncState;
      }
    }
  } else if (getServerSyncEnabled() && options.remoteSave !== false) {
    scheduleIndexRemoteSave(index);
  }
}

/**
 * @param {object | null | undefined} index
 * @param {{
 *   checkServerGhosts?: boolean,
 *   skipOrphanRecovery?: boolean,
 *   recentlyDeletedIds?: string[],
 * }} [options]
 */
export async function applyWorkspaceIntegrityRepair(index, options = {}) {
  const result = await auditWorkspaceIndex(index, {
    checkServerGhosts: options.checkServerGhosts ?? false,
    serverSyncEnabled: getServerSyncEnabled(),
    skipOrphanRecovery: options.skipOrphanRecovery ?? false,
    recentlyDeletedIds: options.recentlyDeletedIds ?? [],
  });
  if (!result.repairedIndex) return result;

  const beforeSig = projectIndexSignature(index);
  const afterSig = projectIndexSignature(result.repairedIndex);
  const changed =
    beforeSig !== afterSig
    || (result.orphanPurged ?? result.orphanRecovered ?? 0) > 0
    || (result.ghostsPruned ?? 0) > 0
    || result.ghostsMarked > 0
    || index?.activeProjectId !== result.repairedIndex.activeProjectId;

  if (changed) {
    await writeLocalIndex(result.repairedIndex);
    if ((result.ghostPrunedIds?.length ?? 0) > 0 && getServerSyncEnabled()) {
      await pushIndexToServer(result.repairedIndex, {
        deletedProjectIds: result.ghostPrunedIds,
      });
    }
  }
  return result;
}
async function uploadLocalOnlyProjects(localOnlyIds, index, options = {}) {
  if (!getServerSyncEnabled() || localOnlyIds.length === 0) return 0;
  let uploaded = 0;
  for (const projectId of localOnlyIds) {
    const raw = await readLocalProjectSerialised(projectId);
    let doc = null;
    if (raw) {
      try {
        doc = JSON.parse(raw);
      } catch {
        doc = null;
      }
    }
    if (!doc) {
      doc = getLastKnownProjectPayloadById().get(projectId) ?? null;
    }
    if (!doc) continue;
    try {
      let meta = null;
      try {
        meta = await fetchCanvasProjectMeta(projectId);
      } catch {
        meta = null;
      }
      if (meta && Number(meta.revision) > 0) {
        applyServerProjectRevision(projectId, meta.updatedAt, meta.revision);
        continue;
      }
      const result = await saveCanvasProject(projectId, doc, 0);
      if (!result.ok) {
        if (result.conflict && result.payload) {
          await writeLocalProjectSerialised(
            projectId,
            JSON.stringify(result.payload),
          );
          applyServerProjectRevision(
            projectId,
            result.updatedAt,
            result.revision,
          );
        }
        continue;
      }
      const serialised = raw ?? JSON.stringify(doc);
      await writeLocalProjectSerialised(projectId, serialised);
      applyServerProjectRevision(projectId, result.updatedAt, result.revision);
      await patchIndexDocumentRevision(projectId, result.revision, result.updatedAt, {
        remoteSave: false,
      });
      uploaded += 1;
    } catch (e) {
      console.error(`Failed to upload project ${projectId}:`, e);
      const msg = String(e?.message ?? e);
      if (/too large|413/i.test(msg)) {
        const row = index.projects.find((p) => p.id === projectId);
        if (row) {
          row.syncState = 'error';
          row.updatedAt = Date.now();
        }
      }
    }
  }
  if ((uploaded > 0 || index) && options.pushIndex !== false) {
    await pushIndexToServer(index);
  }
  return uploaded;
}

/**
 * Fetch server project index, merge with local, persist locally, push local-only rows.
 * Call on boot, tab focus, and after background sync so menus stay cross-browser accurate.
 */
async function pullAndMergeProjectIndexBody(options = {}) {
  const {
    skipProjectIds = new Set(),
    adoptDocumentNameFor = null,
    activeProjectId = null,
    reconcileScope = 'active',
  } = options;
  const { reconcileWorkspaceIndex } = await import('../projectReconcile.js');

  async function maybeReconcile(index) {
    if (reconcileScope === 'none' || !index) return index;
    return reconcileWorkspaceIndex(index, {
      activeProjectId,
      skipProjectIds,
      adoptDocumentNameFor,
      scope: reconcileScope,
    });
  }

  if (!getServerSyncEnabled()) {
    return readLocalIndex();
  }

  let serverIndex = null;
  let serverIndexUpdatedAt = null;
  try {
    const remote = await fetchCanvasIndexDocument();
    serverIndex = remote.index;
    serverIndexUpdatedAt = remote.updatedAt;
    indexPullConsecutiveTimeouts = 0;
    if (remote.revision != null) {
      applyServerWorkspaceIndexRevision(remote.revision);
    }
  } catch (e) {
    if (isTimeoutError(e)) {
      indexPullConsecutiveTimeouts += 1;
      console.warn('Could not refresh project index from server; using local index and retrying:', e.message);
      scheduleIndexPullRetry(options);
    } else {
      console.warn('Could not refresh project index from server:', e.message);
    }
    return readLocalIndex();
  }

  const localIndex = await readLocalIndex();
  const serverHas = Boolean(serverIndex?.projects?.length);
  const localHas = Boolean(localIndex?.projects?.length);
  const serverResetAt = typeof serverIndex?.resetAt === 'string' && serverIndex.resetAt;

  if (!serverHas && serverResetAt) {
    const emptyIndex = {
      ...serverIndex,
      activeProjectId: null,
      projects: [],
    };
    await writeLocalIndex(emptyIndex);
    await purgeOrphanProjectBodies(emptyIndex);
    const serverIndexMs = parseServerUpdatedAt(serverIndexUpdatedAt);
    if (serverIndexMs > 0) {
      lastServerWorkspaceIndexUpdatedAt = serverIndexMs;
    }
    return emptyIndex;
  }
  if (!serverHas && !localHas) return localIndex;
  if (!serverHas) return localIndex;

  const serverIndexMs = parseServerUpdatedAt(serverIndexUpdatedAt);
  const preferServerActive =
    serverIndexMs > 0
    && lastServerWorkspaceIndexUpdatedAt > 0
    && serverIndexMs > lastServerWorkspaceIndexUpdatedAt;

  if (!localHas) {
    await writeLocalIndex(serverIndex);
    if (serverIndexMs > 0) {
      lastServerWorkspaceIndexUpdatedAt = serverIndexMs;
    }
    const serverOnly = (serverIndex.projects ?? []).map((p) => p.id);
    setPendingSyncBothServerOnlyIds(serverOnly);
    if (serverOnly.length > 0) {
      setPendingBackgroundMode('sync_both');
      try {
        const { recordServerProjectsSynced } = await import('../projects.js');
        recordServerProjectsSynced(serverOnly.length);
      } catch {
        /* ignore */
      }
    }
    const reconciled = await maybeReconcile(serverIndex);
    await writeLocalIndex(reconciled);
    const integrity = await applyWorkspaceIntegrityRepair(reconciled, {
      checkServerGhosts: false,
    });
    return integrity.repairedIndex ?? reconciled;
  }

  const preserveIds = await collectLocalProjectIdsWithCards(localIndex?.projects);
  let { index, merged, localOnlyIds, serverOnlyIds } = mergeProjectIndices(
    localIndex,
    serverIndex,
    { preferServerActive },
  );
  index = preserveMergedLocalRowsWithCards(index, localIndex, preserveIds);

  const countBefore = localIndex?.projects?.length ?? 0;
  const countAfter = index?.projects?.length ?? 0;
  if (countBefore !== countAfter || index.activeProjectId !== localIndex.activeProjectId) {
    console.warn('[canvas] project index merge changed workspace', {
      countBefore,
      countAfter,
      activeBefore: localIndex.activeProjectId,
      activeAfter: index.activeProjectId,
      preserveIds: preserveIds.length,
    });
  }

  const changed =
    projectIndexSignature(index) !== projectIndexSignature(localIndex)
    || index.activeProjectId !== localIndex.activeProjectId;

  if (!changed && !merged) {
    if (serverIndexMs > lastServerWorkspaceIndexUpdatedAt) {
      lastServerWorkspaceIndexUpdatedAt = serverIndexMs;
    }
    const reconciled = await maybeReconcile(localIndex);
    const integrity = await applyWorkspaceIntegrityRepair(reconciled, {
      checkServerGhosts: true,
    });
    return integrity.repairedIndex ?? reconciled;
  }

  await writeLocalIndex(index);

  if (localOnlyIds.length > 0) {
    const uploaded = await uploadLocalOnlyProjects(localOnlyIds, index);
    if (uploaded > 0) {
      bumpLastSyncRecoveryCount(Math.max(getLastSyncRecoveryCount(), uploaded));
    }
  } else if (changed) {
    await pushIndexToServer(index);
  }

  if (serverIndexMs > 0) {
    lastServerWorkspaceIndexUpdatedAt = serverIndexMs;
  }

  const suppressedServerOnly = serverOnlyIds.filter((id) => !isDeletedProjectId(id));
  for (const id of serverOnlyIds) {
    if (!isDeletedProjectId(id) || !getServerSyncEnabled()) continue;
    let removedOnServer = false;
    for (let attempt = 0; attempt < 2 && !removedOnServer; attempt += 1) {
      try {
        await deleteCanvasProject(id);
        removedOnServer = true;
      } catch (e) {
        if (attempt === 1 && import.meta.env?.DEV) {
          console.warn('[canvas] tombstoned server project delete failed:', id, e);
        }
      }
    }
  }
  if (suppressedServerOnly.length > 0) {
    setPendingSyncBothServerOnlyIds([
      ...new Set([...getPendingSyncBothServerOnlyIds(), ...suppressedServerOnly]),
    ]);
    setPendingBackgroundMode('sync_both');
    try {
      const { recordServerProjectsSynced } = await import('../projects.js');
      recordServerProjectsSynced(suppressedServerOnly.length);
    } catch {
      /* ignore */
    }
  }

  const mergedIndex = await readLocalIndex();
  const reconciled = await maybeReconcile(mergedIndex ?? index);
  await writeLocalIndex(reconciled);
  const integrity = await applyWorkspaceIntegrityRepair(reconciled, {
    checkServerGhosts: true,
  });
  return integrity.repairedIndex ?? reconciled;
}

/**
 * Fetch server project index, merge with local, upload local-only bodies, reconcile.
 * @param {{ skipProjectIds?: Set<string>, adoptDocumentNameFor?: string }} [options]
 */
export function pullAndMergeProjectIndex(options = {}) {
  indexPullPendingOptions = mergeIndexPullOptions(indexPullPendingOptions, options);
  if (!indexPullChain) {
    indexPullChain = (async () => {
      let result;
      while (indexPullPendingOptions) {
        const runOptions = indexPullPendingOptions;
        indexPullPendingOptions = null;
        result = await pullAndMergeProjectIndexBody(runOptions);
      }
      return result;
    })().finally(() => {
      indexPullChain = null;
    });
  }
  return indexPullChain;
}
export async function loadSyncedProjectIndex() {
  const { initializeProjectSync } = await import('./projectSyncInit.js');
  await initializeProjectSync();
  const raw = await readLocalIndex();
  return normalizeAndRepairLocalIndex(raw);
}

export async function saveSyncedProjectIndex(
  index,
  { immediate = false, deletedProjectIds = [], localOnly = false } = {},
) {
  const { index: normalized } = normalizeWorkspaceIndex(index ?? { projects: [] });
  await writeLocalIndex(normalized);
  index = normalized;
  if (localOnly) {
    return;
  }
  if (immediate) {
    await pushIndexToServer(normalized, { deletedProjectIds });
  } else {
    scheduleIndexRemoteSave(normalized);
  }
}
