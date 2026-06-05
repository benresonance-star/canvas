import { patchCanvasProject } from '../canvasProjectsApi.js';
import {
  buildPatchOpsFromCommit,
  shouldUsePatchForOps,
} from './projectPatchOps.js';
import {
  getCommittedPayload,
  getPriorPayloadForPatch,
} from '../projectDocumentCommit.js';
import { getProjectSyncClientId } from './projectSyncClientId.js';
import { isProjectPatchSyncEnabled } from './projectPatchSync.js';
import {
  alignClientRevisionWithServerMeta,
  applyServerProjectRevision,
  ensureClientRevision,
  getClientRevision,
  notifySyncLock,
} from './projectSyncRevision.js';
import { getServerSyncEnabled } from './projectSyncState.js';
import { patchIndexDocumentRevision } from './projectSyncIndex.js';
import { writeLocalProjectSerialised } from './projectSyncLocal.js';
import { projectCardCount } from './projectSyncMerge.js';
import {
  needsProjectConflictResolution,
  recordProjectConflict,
  clearProjectConflict,
  projectPayloadsStructurallyEqual,
} from './projectSyncConflict.js';
import { runSyncGate } from '../syncGate.js';
import { summarizePatchOps, syncTraceLog } from './syncTrace.js';

/**
 * Whether a failed PATCH should fall through to full-document PUT.
 * @param {object | null} patchResult
 * @returns {boolean}
 */
export function shouldFallbackToPutAfterPatch(patchResult) {
  if (patchResult == null) return false;
  if (patchResult.ok) return false;
  if (patchResult.needsResolution) return false;
  if (patchResult.pulled) return false;
  return true;
}

/**
 * Push via PATCH when ops are small; returns null to signal PUT fallback.
 * @param {string} projectId
 * @param {object} payload
 * @param {string} reason
 * @param {object | null} [beforePayload]
 * @param {string | null} [traceId]
 * @param {boolean} [allowEmptyRemoteOverwrite]
 * @param {boolean} [allowDockOnlyRemoteOverwrite]
 */
export async function pushProjectPatchIfEnabled(
  projectId,
  payload,
  reason,
  beforePayload = null,
  traceId = null,
  allowEmptyRemoteOverwrite = false,
  allowDockOnlyRemoteOverwrite = false,
) {
  if (!getServerSyncEnabled() || !isProjectPatchSyncEnabled()) {
    syncTraceLog(traceId, 'patch:skipped', { projectId, reason: 'sync_disabled' });
    return null;
  }
  const before =
    beforePayload
    ?? getPriorPayloadForPatch(projectId)
    ?? getCommittedPayload(projectId);
  const ops = buildPatchOpsFromCommit(before, payload, reason);
  if (!shouldUsePatchForOps(ops)) {
    syncTraceLog(traceId, 'patch:skipped', {
      projectId,
      reason: 'ops_not_eligible',
      hadBefore: Boolean(before),
      ...summarizePatchOps(ops),
    });
    return null;
  }

  syncTraceLog(traceId, 'patch:send', {
    projectId,
    ...summarizePatchOps(ops),
  });

  return runSyncGate('patch-push', async () => {
    await alignClientRevisionWithServerMeta(projectId, traceId);
    await ensureClientRevision(projectId);
    const expectedRevision = getClientRevision(projectId);
    syncTraceLog(traceId, 'patch:http', { projectId, expectedRevision });
    const result = await patchCanvasProject(projectId, {
      ops,
      expectedRevision,
      clientId: getProjectSyncClientId(),
      reason,
      traceId,
      allowEmptyRemoteOverwrite,
      allowDockOnlyRemoteOverwrite,
    });
    syncTraceLog(traceId, 'patch:response', {
      projectId,
      ok: result.ok,
      conflict: result.conflict,
      badRequest: result.badRequest,
      revision: result.revision,
    });
    if (result.ok) {
      applyServerProjectRevision(projectId, result.updatedAt, result.revision);
      await writeLocalProjectSerialised(projectId, JSON.stringify(payload));
      await patchIndexDocumentRevision(
        projectId,
        result.revision,
        result.updatedAt,
      );
      notifySyncLock(projectId, 'live');
      return { ok: true, patched: true, revision: result.revision, ops };
    }
    if (result.conflict) {
      if (result.badRequest) {
        return null;
      }
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
          patched: true,
        };
      }
      if (serverPayload && projectPayloadsStructurallyEqual(payload, serverPayload)) {
        applyServerProjectRevision(projectId, result.updatedAt, result.revision);
        clearProjectConflict(projectId);
        notifySyncLock(projectId, 'live');
        return { ok: true, adopted: true, patched: true };
      }
      applyServerProjectRevision(projectId, result.updatedAt, result.revision);
      const localCards = projectCardCount(payload);
      const serverCards = projectCardCount(serverPayload);
      if (serverPayload && serverCards > localCards) {
        await writeLocalProjectSerialised(
          projectId,
          JSON.stringify(serverPayload),
        );
        notifySyncLock(projectId, 'live');
        return { ok: true, pulled: true, patched: true };
      }
      const clientBehind = getClientRevision(projectId) < (Number(result.revision) || 0);
      if (serverPayload && (localCards > serverCards || clientBehind)) {
        const retry = await patchCanvasProject(projectId, {
          ops,
          expectedRevision: result.revision,
          clientId: getProjectSyncClientId(),
          reason,
          traceId,
          allowEmptyRemoteOverwrite,
          allowDockOnlyRemoteOverwrite,
        });
        if (retry.ok) {
          applyServerProjectRevision(projectId, retry.updatedAt, retry.revision);
          await writeLocalProjectSerialised(projectId, JSON.stringify(payload));
          clearProjectConflict(projectId);
          notifySyncLock(projectId, 'live');
          return { ok: true, patched: true, revision: retry.revision };
        }
      }
      notifySyncLock(projectId, 'stale');
      return { ok: false, conflict: true, patched: true, keptLocal: true };
    }
    return { ok: false, patched: true };
  });
}
