import { isCanvasInteractionActive } from '../canvasInteraction.js';
import { applyProjectOps } from './projectPatchOps.js';
import { mergeProjectDocuments, preserveCanvasCardsInMergedPayload } from '../projectDocumentMerge.js';
import { mergeOptimisticCardsIntoDoc } from '../optimisticCards.js';
import { applyServerProjectRevision, getClientRevision } from './projectSyncRevision.js';
import {
  writeLocalProjectSerialised,
  readLocalProjectSerialised,
  getLastKnownProjectPayloadById,
} from './projectSyncLocal.js';
import { auditPlacementStep } from '../placementAudit.js';
import { syncTraceLog } from './syncTrace.js';
import { applyProjectLoadFence } from '../project/loadProjectStructure.js';

/** @type {{ revision: number, ops: object[], clientId?: string, traceId?: string | null } | null} */
let pendingRemotePatch = null;

/** @type {((projectId: string, applied: object) => void) | null} */
let onRemotePatchApplied = null;

export function setRemotePatchAppliedListener(listener) {
  onRemotePatchApplied = listener;
}

/**
 * @param {string} projectId
 * @param {object[]} ops
 * @param {number} serverRevision
 * @param {{ clientId?: string, localClientId?: string, traceId?: string | null }} [options]
 */
export async function applyRemoteProjectPatch(projectId, ops, serverRevision, options = {}) {
  const { clientId, localClientId, traceId = null } = options;
  if (clientId && localClientId && clientId === localClientId) {
    syncTraceLog(traceId, 'remote:echo-skip', { projectId, serverRevision });
    return { applied: false, reason: 'echo' };
  }

  if (isCanvasInteractionActive()) {
    syncTraceLog(traceId, 'remote:queued', { projectId, serverRevision });
    pendingRemotePatch = { revision: serverRevision, ops, clientId, traceId };
    return { applied: false, queued: true };
  }

  return applyRemoteProjectPatchNow(projectId, ops, serverRevision, traceId);
}

/**
 * Flush a patch deferred during canvas interaction.
 */
export async function flushPendingRemoteProjectPatch(projectId, localClientId) {
  if (!pendingRemotePatch || !projectId) return null;
  const pending = pendingRemotePatch;
  pendingRemotePatch = null;
  if (pending.clientId && pending.clientId === localClientId) {
    return null;
  }
  return applyRemoteProjectPatchNow(
    projectId,
    pending.ops,
    pending.revision,
    pending.traceId ?? null,
  );
}

async function readLocalDoc(projectId) {
  try {
    const raw = await readLocalProjectSerialised(projectId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function applyRemoteProjectPatchNow(projectId, ops, serverRevision, traceId = null) {
  syncTraceLog(traceId, 'remote:apply-start', { projectId, serverRevision });
  const localDoc = await readLocalDoc(projectId);
  const patched = applyProjectOps(localDoc ?? {}, ops);

  const clientRev = getClientRevision(projectId);
  let merged;
  let decision;
  let skipWrite = false;

  if (serverRevision > clientRev) {
    merged = mergeOptimisticCardsIntoDoc(
      projectId,
      patched,
      localDoc?.cards ?? [],
    );
    merged = preserveCanvasCardsInMergedPayload(merged, {
      localDoc,
      placementSource: patched,
      projectId,
    });
    decision = 'adoptedRemote';
  } else {
    const result = mergeProjectDocuments(localDoc, patched, {
      projectId,
      reason: 'remote-patch',
      serverAt: Date.now(),
      localEditAt: 0,
    });
    merged = result.merged;
    skipWrite = result.skipWrite;
    decision = result.decision;
  }

  if (skipWrite || !merged) {
    syncTraceLog(traceId, 'remote:apply-skip', { projectId, decision, skipWrite });
    if (serverRevision > 0) {
      applyServerProjectRevision(projectId, null, serverRevision);
    }
    return { applied: false, decision };
  }

  auditPlacementStep('remote-patch:applied', merged, { projectId });
  const fenced = (await applyProjectLoadFence(projectId, merged)) ?? merged;
  await writeLocalProjectSerialised(projectId, JSON.stringify(fenced));
  getLastKnownProjectPayloadById().set(projectId, fenced);
  applyServerProjectRevision(projectId, null, serverRevision);
  onRemotePatchApplied?.(projectId, fenced);
  syncTraceLog(traceId, 'remote:apply-done', { projectId, decision });
  return { applied: true, payload: fenced, decision };
}

/** @internal */
export function resetProjectSyncRemoteApplyForTests() {
  pendingRemotePatch = null;
  onRemotePatchApplied = null;
}
