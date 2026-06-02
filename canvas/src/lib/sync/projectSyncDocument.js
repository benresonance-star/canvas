import {
  fetchCanvasIndexDocument,
  fetchCanvasProjectDocument,
  fetchCanvasProjectMeta,
  saveCanvasProject,
  deleteCanvasProject,
  saveCanvasIndex,
} from '../canvasProjectsApi.js';
import {
  localPlacementShouldWin,
  patchPlacementsMapFromArrays,
} from '../artifactPlacementsMap.js';
import { placementMapDiffers } from '../placementTransfer.js';
import { slimProjectPayloadForCache } from '../projectSlim.js';
import { projectStorageKey } from '../constants.js';
import { clearCachedRevision } from '../projectRevision.js';
import { deleteProjectDocumentSerialised } from '../projectDocumentStore.js';
import {
  readLocalProjectSerialised,
  writeLocalProjectSerialised,
  writeLocalIndex,
  readLocalProjectDocument,
  readLocalIndex,
  getLastKnownProjectPayloadById,
} from './projectSyncLocal.js';
import {
  mergeProjectIndices,
  projectCardCount,
  payloadsEquivalent,
  parseServerUpdatedAt,
} from './projectSyncMerge.js';
import { applyServerWorkspaceIndexRevision } from '../workspaceIndexRevision.js';
import {
  ensureClientRevision,
  getClientRevision,
  applyServerProjectRevision,
  recordLocalProjectEdit,
  notifySyncLock,
  getLastServerUpdatedAt,
  getLocalEditAt,
  deleteRevisionStateForProject,
} from './projectSyncRevision.js';
import { getServerSyncEnabled } from './projectSyncState.js';

import {
  recordGoodLocalCardCount,
  getLastGoodLocalCardCount,
  clearLastGoodLocalCardCount,
  preserveCanvasCardsInMergedPayload,
} from '../projectDocumentMerge.js';

export {
  recordGoodLocalCardCount,
  getLastGoodLocalCardCount,
  clearLastGoodLocalCardCount,
  preserveCanvasCardsInMergedPayload,
};

import {
  cancelPendingProjectSave,
  hasPendingProjectSave,
  scheduleProjectRemoteSave as scheduleProjectRemoteSavePending,
  getPendingOrCachedPayload,
  takePendingProjectEntriesForFlush,
  takePendingIndexPayloadForFlush,
  flushProjectTimer,
  getPendingProjectPayloads,
} from './projectSyncPending.js';
import { patchIndexDocumentRevision } from './projectSyncIndex.js';
import { runSyncGate } from '../syncGate.js';
import {
  needsProjectConflictResolution,
  recordProjectConflict,
  clearProjectConflict,
  projectPayloadsStructurallyEqual,
} from './projectSyncConflict.js';
import { syncSpecCanvasStateFromPayload } from '../specDataPlaneSync.js';
import { auditPlacementStep } from '../placementAudit.js';

function scheduleProjectRemoteSave(projectId, payload) {
  if (!getServerSyncEnabled()) return;
  recordLocalProjectEdit(projectId);
  scheduleProjectRemoteSavePending(projectId, payload, (id, doc) => {
    void runSyncGate('debounced-push', () =>
      pushProjectDocumentIfLocalNewerInner(id, doc),
    );
  });
}

async function getPendingOrCachedProjectDoc(projectId) {
  return getPendingOrCachedPayload(projectId, async (id) => {
    const raw = await readLocalProjectSerialised(id);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
}
async function pushProjectPayloadToServer(
  projectId,
  payload,
  { expectedRevision, _retrying = false, traceId = null } = {},
) {
  if (!getServerSyncEnabled() || !projectId || !payload) {
    return { ok: false };
  }
  if (!_retrying) {
    const { alignClientRevisionWithServerMeta } = await import('./projectSyncRevision.js');
    await alignClientRevisionWithServerMeta(projectId, traceId);
  }
  await ensureClientRevision(projectId);
  const revision =
    expectedRevision !== undefined ? expectedRevision : getClientRevision(projectId);
  try {
    const result = await saveCanvasProject(projectId, payload, revision);
    if (result.ok) {
      applyServerProjectRevision(projectId, result.updatedAt, result.revision);
      await writeLocalProjectSerialised(projectId, JSON.stringify(payload));
      await patchIndexDocumentRevision(projectId, result.revision, result.updatedAt);
      notifySyncLock(projectId, 'live');
      return { ok: true, revision: result.revision, updatedAt: result.updatedAt };
    }
    if (result.conflict) {
      const serverPayload = result.payload;
      if (
        serverPayload
        && needsProjectConflictResolution(payload, serverPayload)
      ) {
        recordProjectConflict(
          projectId,
          payload,
          serverPayload,
          result.revision,
        );
        notifySyncLock(projectId, 'stale');
        return {
          ok: false,
          conflict: true,
          needsResolution: true,
          serverRevision: result.revision,
        };
      }
      if (serverPayload && projectPayloadsStructurallyEqual(payload, serverPayload)) {
        applyServerProjectRevision(projectId, result.updatedAt, result.revision);
        clearProjectConflict(projectId);
        notifySyncLock(projectId, 'live');
        return { ok: true, adopted: true, revision: result.revision };
      }
      applyServerProjectRevision(projectId, result.updatedAt, result.revision);
      if (serverPayload) {
        const localCards = projectCardCount(payload);
        const serverCards = projectCardCount(serverPayload);
        if (serverCards > localCards) {
          await writeLocalProjectSerialised(
            projectId,
            JSON.stringify(serverPayload),
          );
          clearProjectConflict(projectId);
          notifySyncLock(projectId, 'live');
          return { ok: true, pulled: true, revision: result.revision };
        }
        const clientBehind = getClientRevision(projectId) < (Number(result.revision) || 0);
        if ((localCards > serverCards || clientBehind) && !_retrying) {
          const retry = await pushProjectPayloadToServer(projectId, payload, {
            expectedRevision: result.revision,
            _retrying: true,
            traceId,
          });
          if (retry.ok) {
            clearProjectConflict(projectId);
            return retry;
          }
        }
      }
      notifySyncLock(projectId, 'stale');
      return { ok: false, conflict: true, keptLocal: true, needsResolution: true };
    }
  } catch (e) {
    console.error(`Canvas project sync failed (${projectId}):`, e);
  }
  return { ok: false };
}
export async function pushProjectDocumentIfLocalNewer(projectId, payload) {
  if (!getServerSyncEnabled() || !projectId || !payload) {
    return { ok: false, skipped: true, reason: 'no_sync' };
  }
  return runSyncGate('push-if-newer', () =>
    pushProjectDocumentIfLocalNewerInner(projectId, payload),
  );
}

async function pushProjectDocumentIfLocalNewerInner(
  projectId,
  payload,
  { traceId = null } = {},
) {
  const pushOpts = { traceId };

  const localCards = projectCardCount(payload);
  if (localCards === 0) {
    return pushProjectPayloadToServer(projectId, payload, pushOpts);
  }

  let meta;
  try {
    meta = await fetchCanvasProjectMeta(projectId);
  } catch {
    return { ok: false, reason: 'offline' };
  }
  if (!meta) {
    return pushProjectPayloadToServer(projectId, payload, pushOpts);
  }

  await ensureClientRevision(projectId);
  const serverRev = meta.revision ?? 0;
  const serverAt = parseServerUpdatedAt(meta.updatedAt);
  const knownServerAt = getLastServerUpdatedAt(projectId) ?? serverAt;
  const localEditAt = getLocalEditAt(projectId) ?? 0;
  const clientRev = getClientRevision(projectId);
  const ahead = serverRev > clientRev;
  const localNewerByTime = localEditAt > knownServerAt;

  if (!localNewerByTime && !ahead && clientRev >= serverRev) {
    return pushProjectPayloadToServer(projectId, payload, pushOpts);
  }

  let serverDoc = null;
  let serverCards = 0;
  try {
    const remote = await fetchCanvasProjectDocument(projectId);
    serverDoc = remote?.payload ?? null;
    serverCards = projectCardCount(serverDoc);
  } catch {
    /* best effort */
  }

  const localRicherThanServer = localCards > serverCards;
  const hasPending = hasPendingProjectSave(projectId);
  const shouldForcePush =
    (localNewerByTime && localRicherThanServer)
    || (localCards > 0 && serverCards === 0)
    || (ahead && (localNewerByTime || hasPending));

  if (!shouldForcePush) {
    if (ahead && serverDoc && payloadsEquivalent(payload, serverDoc)) {
      applyServerProjectRevision(projectId, meta.updatedAt, meta.revision);
      notifySyncLock(projectId, 'live');
      return { ok: true, adopted: true };
    }
    if (ahead && serverDoc && !payloadsEquivalent(payload, serverDoc)) {
      return pushProjectPayloadToServer(projectId, payload, {
        ...pushOpts,
        expectedRevision: serverRev,
      });
    }
    if (ahead) {
      return { ok: false, conflict: true, skipped: true, reason: 'server_newer' };
    }
    return pushProjectPayloadToServer(projectId, payload, pushOpts);
  }

  return pushProjectPayloadToServer(projectId, payload, {
    ...pushOpts,
    expectedRevision: serverRev,
  });
}

export async function checkServerRevisionAhead(projectId) {
  if (!projectId || !getServerSyncEnabled()) return null;
  try {
    const meta = await fetchCanvasProjectMeta(projectId);
    if (!meta) return { ahead: false, serverRevision: 0 };
    await ensureClientRevision(projectId);
    const clientRev = getClientRevision(projectId);
    return {
      ahead: meta.revision > clientRev,
      serverRevision: meta.revision,
    };
  } catch (e) {
    console.warn(`Could not fetch project meta ${projectId}:`, e.message);
    return null;
  }
}

/**
 * Auto-reconcile revision drift: adopt revision, push local, or pull server.
 * Keeps syncLock live except when offline (no blocking stale tab).
 * @param {string} projectId
 * @param {{ pullOnServerWin?: boolean }} [options]
 * @returns {Promise<{
 *   lock: 'live' | 'offline',
 *   serverRevision: number,
 *   action: 'none' | 'adopt_revision' | 'pushed' | 'pulled' | 'offline',
 *   pulled?: boolean,
 *   payload?: object | null,
 *   localCacheWritten?: boolean,
 * }>}
 */
export async function reconcileActiveProject(projectId, options = {}) {
  if (!projectId || !getServerSyncEnabled()) {
    return { lock: 'live', serverRevision: 0, action: 'none' };
  }
  return runSyncGate('reconcile', () =>
    reconcileActiveProjectInner(projectId, options),
  );
}

async function reconcileActiveProjectInner(projectId, options = {}) {
  const { pullOnServerWin = true } = options;

  let meta;
  try {
    meta = await fetchCanvasProjectMeta(projectId);
  } catch {
    notifySyncLock(projectId, 'offline');
    return { lock: 'offline', serverRevision: 0, action: 'offline' };
  }
  if (!meta) {
    notifySyncLock(projectId, 'live');
    return { lock: 'live', serverRevision: 0, action: 'none' };
  }

  await ensureClientRevision(projectId);
  const clientRev = getClientRevision(projectId);
  const serverRev = meta.revision ?? 0;
  const ahead = serverRev > clientRev;

  if (!ahead) {
    notifySyncLock(projectId, 'live');
    return { lock: 'live', serverRevision: serverRev, action: 'none' };
  }

  const localDoc = await getPendingOrCachedProjectDoc(projectId);
  let serverDoc = null;
  let remoteUpdatedAt = meta.updatedAt;
  try {
    const remote = await fetchCanvasProjectDocument(projectId);
    serverDoc = remote?.payload ?? null;
    if (remote?.revision != null) {
      remoteUpdatedAt = remote.updatedAt ?? remoteUpdatedAt;
    }
  } catch {
    /* best effort */
  }

  if (payloadsEquivalent(localDoc, serverDoc)) {
    applyServerProjectRevision(projectId, remoteUpdatedAt, serverRev);
    notifySyncLock(projectId, 'live');
    return { lock: 'live', serverRevision: serverRev, action: 'adopt_revision' };
  }

  const localEditAt = getLocalEditAt(projectId) ?? 0;
  const serverAt = parseServerUpdatedAt(meta.updatedAt);
  const knownServerAt = getLastServerUpdatedAt(projectId) ?? serverAt;
  const hasPending = hasPendingProjectSave(projectId);

  if (localDoc && (hasPending || localEditAt > knownServerAt)) {
    const pushResult = await pushProjectDocumentIfLocalNewerInner(projectId, localDoc);
    if (pushResult.ok) {
      return {
        lock: 'live',
        serverRevision: getClientRevision(projectId),
        action: 'pushed',
        pushed: true,
      };
    }
    if (pushResult.needsResolution || pushResult.conflict) {
      notifySyncLock(projectId, 'stale');
      return {
        lock: 'stale',
        serverRevision: serverRev,
        action: 'conflict',
        conflict: true,
      };
    }
  }

  const localCards = projectCardCount(localDoc);
  const serverCards = projectCardCount(serverDoc);
  const layoutDiffers =
    localDoc && serverDoc && !payloadsEquivalent(localDoc, serverDoc);
  const placementShouldWin =
    localDoc
    && serverDoc
    && localPlacementShouldWin(localDoc, serverDoc, localEditAt, serverAt);
  const lastGoodCards = getLastGoodLocalCardCount(projectId);
  const localFresherWithLayout =
    (localEditAt > serverAt && localCards > 0 && localCards >= serverCards)
    || placementShouldWin;
  const serverWins =
    serverRev > clientRev
    && serverAt >= localEditAt
    && serverCards > 0
    && (serverCards > localCards || localCards === 0)
    && !localFresherWithLayout
    && !placementShouldWin;
  const serverUndercutsLastGood =
    serverWins
    && lastGoodCards > 0
    && serverCards < lastGoodCards;
  const keepLocalLayout =
    layoutDiffers
    && localCards > 0
    && (
      (localEditAt > serverAt && localCards >= serverCards)
      || placementShouldWin
    );

  if (keepLocalLayout) {
    const pushResult = await pushProjectDocumentIfLocalNewerInner(projectId, localDoc);
    if (pushResult.ok) {
      return {
        lock: 'live',
        serverRevision: getClientRevision(projectId),
        action: 'pushed',
        pushed: true,
      };
    }
    if (placementShouldWin) {
      applyServerProjectRevision(projectId, meta.updatedAt, serverRev);
      notifySyncLock(projectId, 'live');
      return {
        lock: 'live',
        serverRevision: serverRev,
        action: 'kept_local',
        keptLocal: true,
      };
    }
  }

  if (serverUndercutsLastGood) {
    applyServerProjectRevision(projectId, meta.updatedAt, serverRev);
    notifySyncLock(projectId, 'live');
    return {
      lock: 'live',
      serverRevision: serverRev,
      action: 'kept_local',
      keptLocal: true,
    };
  }

  if (
    placementShouldWin
    && layoutDiffers
    && localDoc
    && serverDoc
    && placementMapDiffers(
      localDoc.artifactPlacements,
      serverDoc.artifactPlacements,
    )
  ) {
    const pushResult = await pushProjectDocumentIfLocalNewerInner(projectId, localDoc);
    applyServerProjectRevision(projectId, meta.updatedAt, serverRev);
    notifySyncLock(projectId, 'live');
    return {
      lock: 'live',
      serverRevision: serverRev,
      action: pushResult.ok ? 'pushed' : 'kept_local',
      pushed: Boolean(pushResult.ok),
      keptLocal: true,
      placementKeptLocal: true,
    };
  }

  if (serverWins && serverDoc && pullOnServerWin && !placementShouldWin) {
    const pullResult = await pullProjectDocumentIfServerNewer(projectId, { force: true });
    notifySyncLock(projectId, 'live');
    return {
      lock: 'live',
      serverRevision: getClientRevision(projectId),
      action: 'pulled',
      pulled: pullResult.pulled,
      payload: pullResult.payload,
      localCacheWritten: pullResult.localCacheWritten,
    };
  }

  if (!localDoc && serverDoc && pullOnServerWin) {
    const pullResult = await pullProjectDocumentIfServerNewer(projectId, { force: true });
    notifySyncLock(projectId, 'live');
    return {
      lock: 'live',
      serverRevision: getClientRevision(projectId),
      action: pullResult.pulled ? 'pulled' : 'adopt_revision',
      pulled: pullResult.pulled,
      payload: pullResult.payload,
      localCacheWritten: pullResult.localCacheWritten,
    };
  }

  if (localDoc) {
    const pushResult = await pushProjectDocumentIfLocalNewerInner(projectId, localDoc);
    if (pushResult.ok) {
      return {
        lock: 'live',
        serverRevision: getClientRevision(projectId),
        action: 'pushed',
        pushed: true,
      };
    }
    if (pushResult.needsResolution || pushResult.conflict) {
      notifySyncLock(projectId, 'stale');
      return {
        lock: 'stale',
        serverRevision: serverRev,
        action: 'conflict',
        conflict: true,
      };
    }
  }

  if (localDoc && serverDoc && !payloadsEquivalent(localDoc, serverDoc)) {
    recordProjectConflict(projectId, localDoc, serverDoc, serverRev);
    notifySyncLock(projectId, 'stale');
    return {
      lock: 'stale',
      serverRevision: serverRev,
      action: 'conflict',
      conflict: true,
    };
  }

  if (payloadsEquivalent(localDoc, serverDoc)) {
    applyServerProjectRevision(projectId, meta.updatedAt, meta.revision);
    notifySyncLock(projectId, 'live');
    return { lock: 'live', serverRevision: serverRev, action: 'adopt_revision' };
  }

  notifySyncLock(projectId, 'stale');
  return { lock: 'stale', serverRevision: serverRev, action: 'conflict', conflict: true };
}
export async function reconcileSyncLock(projectId) {
  const result = await reconcileActiveProject(projectId);
  return {
    lock: result.lock,
    serverRevision: result.serverRevision,
    action: result.action,
  };
}
export async function adoptSyncLockForProject(projectId) {
  return reconcileSyncLock(projectId);
}
function cardCountFromLocalWrite(serialisedOrPayload, options) {
  try {
    if (typeof serialisedOrPayload === 'string') {
      return projectCardCount(JSON.parse(serialisedOrPayload));
    }
    const slim = slimProjectPayloadForCache(serialisedOrPayload, options);
    return projectCardCount(slim.payload);
  } catch {
    return 0;
  }
}

export async function persistProjectDocumentLocally(
  projectId,
  serialisedOrPayload,
  options = {},
) {
  recordLocalProjectEdit(projectId);
  const cardCount = cardCountFromLocalWrite(serialisedOrPayload, options);
  recordGoodLocalCardCount(projectId, cardCount);
  const serialised =
    typeof serialisedOrPayload === 'string'
      ? serialisedOrPayload
      : slimProjectPayloadForCache(serialisedOrPayload, options).serialised;
  const written = await writeLocalProjectSerialised(projectId, serialised);
  if (typeof serialised === 'string') {
    try {
      auditPlacementStep('persist:local', JSON.parse(serialised), { projectId });
    } catch {
      /* ignore */
    }
  }
  return written;
}

/**
 * Push an explicit project snapshot on switch-away (cancels stale debounced payloads first).
 * @param {string} projectId
 * @param {object} payload
 * @param {{ reason?: string, traceId?: string | null, beforePayload?: object | null, skipSpecDualWrite?: boolean }} [options]
 */
export async function flushOutgoingProjectDocument(projectId, payload, options = {}) {
  if (!projectId || !payload) {
    return { ok: false, skipped: true, reason: 'no_payload' };
  }
  const {
    reason = 'flush',
    traceId = null,
    beforePayload = null,
    skipSpecDualWrite = false,
  } = options;
  getLastKnownProjectPayloadById().set(projectId, payload);
  cancelPendingProjectSave(projectId);
  if (!getServerSyncEnabled()) {
    return { ok: true, skipped: true, reason: 'no_sync' };
  }
  const { pushProjectPatchIfEnabled, shouldFallbackToPutAfterPatch } =
    await import('./projectSyncPatch.js');
  const patchResult = await pushProjectPatchIfEnabled(
    projectId,
    payload,
    reason,
    beforePayload,
    traceId,
  );
  if (patchResult !== null) {
    if (patchResult?.ok) {
      if (!skipSpecDualWrite) {
        void syncSpecCanvasStateFromPayload(projectId, payload);
      }
      return patchResult;
    }
    if (!shouldFallbackToPutAfterPatch(patchResult)) {
      return patchResult;
    }
  }
  const result = await runSyncGate('flush-outgoing', () =>
    pushProjectDocumentIfLocalNewerInner(projectId, payload, { traceId }),
  );
  if (result?.ok) {
    if (!skipSpecDualWrite) {
      void syncSpecCanvasStateFromPayload(projectId, payload);
    }
  }
  return result;
}

async function fencePullPayload(projectId, payload) {
  if (!projectId || !payload) return payload;
  try {
    const { applyProjectLoadFence } = await import('../project/loadProjectStructure.js');
    return (await applyProjectLoadFence(projectId, payload)) ?? payload;
  } catch {
    return payload;
  }
}
export async function pullProjectDocumentIfServerNewer(projectId, options = {}) {
  const { force = false } = options;
  if (!projectId || !getServerSyncEnabled()) {
    return { pulled: false, payload: null, localCacheWritten: true };
  }

  if (!force) {
    const reconcile = await reconcileActiveProject(projectId);
    if (reconcile.pulled) {
      return {
        pulled: true,
        payload: reconcile.payload ?? null,
        localCacheWritten: reconcile.localCacheWritten ?? true,
      };
    }
    return { pulled: false, payload: null, localCacheWritten: true };
  }

  let remote;
  try {
    remote = await fetchCanvasProjectDocument(projectId);
  } catch (e) {
    console.warn(`Could not fetch project ${projectId} from server:`, e.message);
    return { pulled: false, payload: null, localCacheWritten: true };
  }

  if (!remote?.payload) {
    return { pulled: false, payload: null, localCacheWritten: true };
  }

  let localDoc = null;
  try {
    const raw = await readLocalProjectSerialised(projectId);
    if (raw) localDoc = JSON.parse(raw);
  } catch {
    localDoc = null;
  }

  const serverAt = parseServerUpdatedAt(remote.updatedAt);
  const localEditAt = getLocalEditAt(projectId) ?? 0;

  const pendingOrLocal =
    (await getPendingOrCachedProjectDoc(projectId)) ?? localDoc;

  const placementSource = pendingOrLocal ?? localDoc;
  const { mergeProjectDocuments } = await import('../projectDocumentMerge.js');
  const { merged: mergedPayload, skipWrite } = mergeProjectDocuments(
    localDoc,
    remote.payload,
    {
      localEditAt,
      serverAt,
      projectId,
      placementSource,
      reason: 'pull',
    },
  );

  if (skipWrite || !mergedPayload) {
    return { pulled: false, payload: null, localCacheWritten: true };
  }

  let normalizedMerged = mergedPayload;
  try {
    const { normalizeLoadedProject } = await import('../persistence.js');
    normalizedMerged = normalizeLoadedProject(mergedPayload);
  } catch {
    /* keep merged */
  }

  auditPlacementStep('pull:merged', normalizedMerged, { projectId });

  const fencedMerged = await fencePullPayload(projectId, normalizedMerged);

  const localCacheWritten = await writeLocalProjectSerialised(
    projectId,
    JSON.stringify(fencedMerged),
  );
  applyServerProjectRevision(projectId, remote.updatedAt, remote.revision);
  await patchIndexDocumentRevision(projectId, remote.revision, remote.updatedAt);
  notifySyncLock(projectId, 'live');
  return {
    pulled: true,
    payload: fencedMerged,
    localCacheWritten,
  };
}
export async function reconcileProjectDocumentOnSwitch(projectId) {
  if (!projectId || !getServerSyncEnabled()) {
    return { pulled: false, payload: null, localCacheWritten: true, keptLocal: true };
  }

  const localRaw = await readLocalProjectSerialised(projectId);
  let localDoc = null;
  try {
    if (localRaw) localDoc = JSON.parse(localRaw);
  } catch {
    localDoc = null;
  }

  const localCards = projectCardCount(localDoc);
  if (localDoc && localCards > 0) {
    const pushResult = await pushProjectDocumentIfLocalNewer(projectId, localDoc);
    if (pushResult.ok) {
      return {
        pulled: false,
        payload: localDoc,
        localCacheWritten: true,
        keptLocal: true,
        pushed: true,
      };
    }
  }

  let meta;
  try {
    meta = await fetchCanvasProjectMeta(projectId);
  } catch {
    return {
      pulled: false,
      payload: localDoc,
      localCacheWritten: true,
      keptLocal: true,
    };
  }

  await ensureClientRevision(projectId);
  const serverRev = meta?.revision ?? 0;
  const clientRev = getClientRevision(projectId);
  const serverAt = parseServerUpdatedAt(meta?.updatedAt);
  const localEditAt = getLocalEditAt(projectId) ?? 0;

  let serverDoc = null;
  try {
    const remote = await fetchCanvasProjectDocument(projectId);
    serverDoc = remote?.payload ?? null;
  } catch {
    return {
      pulled: false,
      payload: localDoc,
      localCacheWritten: true,
      keptLocal: true,
    };
  }

  const serverCards = projectCardCount(serverDoc);
  const layoutDiffers =
    localDoc
    && serverDoc
    && !payloadsEquivalent(localDoc, serverDoc);
  const placementShouldWin =
    localDoc
    && serverDoc
    && localPlacementShouldWin(localDoc, serverDoc, localEditAt, serverAt);
  const localLayoutNewer =
    layoutDiffers
    && localCards > 0
    && (
      (localEditAt > serverAt && localCards >= serverCards)
      || placementShouldWin
    );

  if (localLayoutNewer) {
    const retryPush = await pushProjectDocumentIfLocalNewer(projectId, localDoc);
    if (meta) {
      applyServerProjectRevision(projectId, meta.updatedAt, meta.revision);
    }
    notifySyncLock(projectId, 'live');
    return {
      pulled: false,
      payload: localDoc,
      localCacheWritten: true,
      keptLocal: true,
      pushed: Boolean(retryPush.ok),
    };
  }

  const lastGoodCards = getLastGoodLocalCardCount(projectId);
  const localFresherWithLayout =
    (localEditAt > serverAt && localCards > 0 && localCards >= serverCards)
    || placementShouldWin;
  const serverWins =
    serverRev > clientRev
    && serverAt >= localEditAt
    && serverCards > 0
    && (serverCards > localCards || localCards === 0)
    && !localFresherWithLayout
    && !placementShouldWin;
  const serverUndercutsLastGood =
    serverWins
    && lastGoodCards > 0
    && serverCards < lastGoodCards;

  if (!localDoc && serverDoc && serverCards > 0) {
    return pullProjectDocumentIfServerNewer(projectId, { force: true });
  }

  if (localFresherWithLayout && layoutDiffers) {
    const retryPush = await pushProjectDocumentIfLocalNewer(projectId, localDoc);
    if (meta) {
      applyServerProjectRevision(projectId, meta.updatedAt, meta.revision);
    }
    notifySyncLock(projectId, 'live');
    return {
      pulled: false,
      payload: localDoc,
      localCacheWritten: true,
      keptLocal: true,
      pushed: Boolean(retryPush.ok),
    };
  }

  if (
    serverWins
    && serverDoc
    && !serverUndercutsLastGood
    && !placementShouldWin
  ) {
    return pullProjectDocumentIfServerNewer(projectId, { force: true });
  }

  if (
    placementShouldWin
    && layoutDiffers
    && localDoc
    && serverDoc
    && placementMapDiffers(
      localDoc.artifactPlacements,
      serverDoc.artifactPlacements,
    )
  ) {
    const retryPush = await pushProjectDocumentIfLocalNewer(projectId, localDoc);
    if (meta) {
      applyServerProjectRevision(projectId, meta.updatedAt, meta.revision);
    }
    notifySyncLock(projectId, 'live');
    return {
      pulled: false,
      payload: localDoc,
      localCacheWritten: true,
      keptLocal: true,
      pushed: Boolean(retryPush.ok),
      placementKeptLocal: true,
    };
  }

  if (serverUndercutsLastGood) {
    if (meta) {
      applyServerProjectRevision(projectId, meta.updatedAt, meta.revision);
    }
    notifySyncLock(projectId, 'live');
    return {
      pulled: false,
      payload: localDoc,
      localCacheWritten: true,
      keptLocal: true,
      rejectedStaleServer: true,
    };
  }

  if (meta) {
    applyServerProjectRevision(projectId, meta.updatedAt, meta.revision);
  }
  notifySyncLock(projectId, 'live');
  return {
    pulled: false,
    payload: localDoc,
    localCacheWritten: true,
    keptLocal: true,
  };
}

/** @deprecated Use checkServerRevisionAhead for meta-only checks */
export async function peekServerProjectRevision(projectId) {
  const check = await checkServerRevisionAhead(projectId);
  if (!check) return null;
  return {
    hasNewerOnServer: check.ahead,
    serverMs: 0,
  };
}

/**
 * @deprecated External callers: use {@link loadProjectStructure}. Sync-layer internal only.
 */
export async function loadSyncedProjectDocument(projectId, { localOnly = false } = {}) {
  const { initializeProjectSync } = await import('./projectSyncInit.js');
  await initializeProjectSync();
  const localDoc = await readLocalProjectDocument(projectId);
  if (!getServerSyncEnabled() || localOnly) {
    return localDoc;
  }
  try {
    const remote = await fetchCanvasProjectDocument(projectId);
    if (remote?.payload) {
      const { mergeProjectDocuments } = await import('../projectDocumentMerge.js');
      const { merged, skipWrite, decision } = mergeProjectDocuments(
        localDoc,
        remote.payload,
        {
          projectId,
          reason: 'load',
        },
      );
      if (skipWrite || decision === 'keptLocal') {
        if (remote.revision != null) {
          applyServerProjectRevision(
            projectId,
            remote.updatedAt,
            remote.revision,
          );
        }
        notifySyncLock(projectId, 'live');
        return localDoc ?? merged;
      }
      if (merged) {
        await writeLocalProjectSerialised(
          projectId,
          JSON.stringify(merged),
        );
        applyServerProjectRevision(
          projectId,
          remote.updatedAt,
          remote.revision,
        );
        notifySyncLock(projectId, 'live');
        return merged;
      }
    }
  } catch (e) {
    console.warn(`Could not load project ${projectId} from server:`, e.message);
    notifySyncLock(projectId, 'offline');
  }
  return localDoc;
}

export async function saveSyncedProjectDocument(projectId, payload, serialised) {
  if (!getServerSyncEnabled()) {
    await writeLocalProjectSerialised(projectId, serialised);
    return;
  }
  scheduleProjectRemoteSave(projectId, payload);
}

export async function deleteSyncedProjectDocument(projectId) {
  flushProjectTimer(projectId);
  getPendingProjectPayloads().delete(projectId);
  deleteRevisionStateForProject(projectId);
  await clearCachedRevision(projectId);
  try {
    await deleteProjectDocumentSerialised(projectId);
    localStorage.removeItem(projectStorageKey(projectId));
  } catch {
    /* ignore */
  }
  if (getServerSyncEnabled()) {
    try {
      await deleteCanvasProject(projectId);
    } catch (e) {
      console.error(`Failed to delete project ${projectId} on server:`, e);
    }
  }
}

export async function hasLocalProjectDocument(projectId) {
  if (!projectId) return false;
  const raw = await readLocalProjectSerialised(projectId);
  return Boolean(raw);
}

/** Fetch project JSON from server into local cache when missing (cold browser). */
export async function prefetchProjectDocumentFromServer(projectId) {
  if (!projectId || !getServerSyncEnabled()) return false;
  const { pulled } = await pullProjectDocumentIfServerNewer(projectId);
  if (pulled) return true;
  return Boolean(await readLocalProjectSerialised(projectId));
}

export async function flushProjectSync() {
  const indexPayload = takePendingIndexPayloadForFlush();

  const projectEntries = takePendingProjectEntriesForFlush();

  let pushedDocuments = false;
  if (getServerSyncEnabled()) {
    for (const [projectId, doc] of projectEntries) {
      await pushProjectDocumentIfLocalNewer(projectId, doc);
      pushedDocuments = true;
    }
  }

  if (getServerSyncEnabled() && pushedDocuments) {
    try {
      const remote = await fetchCanvasIndexDocument();
      if (remote?.index) {
        const local = await readLocalIndex();
        const { index: merged } = mergeProjectIndices(local ?? remote.index, remote.index, {});
        await writeLocalIndex(merged);
        if (remote.revision != null) {
          applyServerWorkspaceIndexRevision(remote.revision);
        }
      }
    } catch (e) {
      console.warn('Could not refresh workspace index after document flush:', e.message);
    }
  }

  let indexToPush = indexPayload;
  if (getServerSyncEnabled()) {
    if (pushedDocuments && !indexPayload) {
      return;
    }
    const current = await readLocalIndex();
    if (current) {
      indexToPush = current;
    }
  }

  if (indexToPush && getServerSyncEnabled()) {
    try {
      await saveCanvasIndex(indexToPush);
    } catch (e) {
      console.error('Canvas index flush failed:', e);
    }
  }
}
