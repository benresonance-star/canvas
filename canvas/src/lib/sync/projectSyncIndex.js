import {
  fetchCanvasIndexDocument,
  saveCanvasIndex,
  saveCanvasProject,
} from '../canvasProjectsApi.js';
import { auditWorkspaceIndex, readLocalProjectPayload, projectCardCountFromDoc } from '../workspaceIntegrity.js';
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
}

registerProjectSyncResetHook(resetProjectSyncIndexState);

function scheduleIndexRemoteSave(index) {
  if (!getServerSyncEnabled()) return;
  scheduleIndexRemoteSavePending(index, (payload) => {
    void pushIndexToServer(payload);
  });
}

async function pushIndexToServer(index) {
  if (!getServerSyncEnabled() || !index) return;
  flushIndexTimer();
  setPendingIndexPayload(null);
  try {
    let expected = getClientWorkspaceIndexRevision();
    let result = await saveCanvasIndex(index, expected);
    if (result.conflict && result.index) {
      const localIndex = index;
      const { index: merged } = mergeProjectIndices(localIndex, result.index, {});
      result = await saveCanvasIndex(merged, result.revision);
      index = merged;
    }
    if (result.ok) {
      applyServerWorkspaceIndexRevision(result.revision);
    }
  } catch (e) {
    console.error('Canvas index sync failed:', e);
  }
}
async function collectLocalProjectIdsWithCards(localProjects) {
  const ids = [];
  for (const row of localProjects ?? []) {
    if (!row?.id) continue;
    const payload = await readLocalProjectPayload(row.id);
    if (projectCardCountFromDoc(payload) > 0) ids.push(row.id);
  }
  return ids;
}
export async function patchIndexDocumentRevision(projectId, revision, updatedAt) {
  if (!projectId) return;
  const index = await readLocalIndex();
  if (!index?.projects?.length) return;
  const row = index.projects.find((p) => p.id === projectId);
  if (!row) return;
  row.documentRevision = revision;
  row.documentUpdatedAt = updatedAt ?? null;
  row.updatedAt = Date.now();
  await writeLocalIndex(index);
  if (getPendingIndexPayload()?.projects) {
    const pendingRow = getPendingIndexPayload().projects.find((p) => p.id === projectId);
    if (pendingRow) {
      pendingRow.documentRevision = revision;
      pendingRow.documentUpdatedAt = updatedAt ?? null;
      pendingRow.updatedAt = row.updatedAt;
    }
  } else if (getServerSyncEnabled()) {
    scheduleIndexRemoteSave(index);
  }
}

/**
 * @param {object | null | undefined} index
 * @param {{ checkServerGhosts?: boolean }} [options]
 */
export async function applyWorkspaceIntegrityRepair(index, options = {}) {
  const result = await auditWorkspaceIndex(index, {
    checkServerGhosts: options.checkServerGhosts ?? false,
    serverSyncEnabled: getServerSyncEnabled(),
  });
  if (!result.repairedIndex) return result;

  const beforeSig = projectIndexSignature(index);
  const afterSig = projectIndexSignature(result.repairedIndex);
  const changed =
    beforeSig !== afterSig
    || (result.orphanPurged ?? result.orphanRecovered ?? 0) > 0
    || result.ghostsMarked > 0
    || index?.activeProjectId !== result.repairedIndex.activeProjectId;

  if (changed) {
    await writeLocalIndex(result.repairedIndex);
  }
  return result;
}
async function uploadLocalOnlyProjects(localOnlyIds, index) {
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
      await patchIndexDocumentRevision(projectId, result.revision, result.updatedAt);
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
  if (uploaded > 0 || index) {
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
    if (remote.revision != null) {
      applyServerWorkspaceIndexRevision(remote.revision);
    }
  } catch (e) {
    console.warn('Could not refresh project index from server:', e.message);
    return readLocalIndex();
  }

  const localIndex = await readLocalIndex();
  const serverHas = Boolean(serverIndex?.projects?.length);
  const localHas = Boolean(localIndex?.projects?.length);

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

  if (serverOnlyIds.length > 0) {
    setPendingSyncBothServerOnlyIds([
      ...new Set([...getPendingSyncBothServerOnlyIds(), ...serverOnlyIds]),
    ]);
    setPendingBackgroundMode('sync_both');
    try {
      const { recordServerProjectsSynced } = await import('../projects.js');
      recordServerProjectsSynced(serverOnlyIds.length);
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

export async function saveSyncedProjectIndex(index, { immediate = false } = {}) {
  const { index: normalized } = normalizeWorkspaceIndex(index ?? { projects: [] });
  await writeLocalIndex(normalized);
  index = normalized;
  if (immediate) {
    await pushIndexToServer(normalized);
  } else {
    scheduleIndexRemoteSave(normalized);
  }
}
