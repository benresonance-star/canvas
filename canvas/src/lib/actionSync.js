/**
 * Phase 4: local commits go through registered `commitProjectDocument` handlers;
 * server push uses `flushOutgoingProjectDocument`. Do not bypass commit for layout edits.
 */
import { isCanvasInteractionActive } from './canvasInteraction.js';
import {
  cancelPendingProjectSave,
  flushOutgoingProjectDocument,
  isServerSyncEnabled,
  persistProjectDocumentLocally,
  reconcileActiveProject,
} from './projectSync.js';
import { slimProjectPayloadForCache } from './projectSlim.js';
import { clearOptimisticCard } from './optimisticCards.js';
import { getSyncGateLabel, runSyncGate } from './syncGate.js';
import { getLastKnownProjectPayloadById } from './sync/projectSyncLocal.js';
import {
  getCommittedPayload,
  getPriorPayloadForPatch,
} from './projectDocumentCommit.js';
import { alignClientRevisionWithServerMeta } from './sync/projectSyncRevision.js';
import { auditPlacementStep } from './placementAudit.js';
import { syncTraceLog } from './sync/syncTrace.js';

/**
 * @typedef {'layoutCommit' | 'viewCommit' | 'structuralChange' | 'placementTransfer' | 'projectSwitch' | 'folderScan' | 'visibilityResume' | 'boot' | 'pagehide' | 'stagedChange'} ActionSyncReason
 */

/** @type {{
 *   getProjectId: () => string | null,
 *   getState: () => object,
 *   getStagedSyncCards: () => object[],
 *   buildPayload: (state: object, staged: object[], authoritativePlacements?: Record<string, object> | null) => object,
 *   getStripNoteContent?: () => boolean,
 *   touchIndex: (projectId: string) => Promise<void>,
 *   onLocalCacheFailed: (projectId: string) => void,
 *   onStructuralPushFailed?: (projectId: string, pushResult: object) => void,
 *   reconcileInbound: (projectId: string, options: { showPullToast?: boolean }) => Promise<object>,
 *   flushActiveProject?: (projectId: string, options?: object) => Promise<void>,
 *   flushAll: () => Promise<void>,
 *   commitProjectDocument?: (projectId: string, options: object) => Promise<object>,
 * } | null} */
let handlers = null;

/** @type {{ projectId: string, allowEmptyRemoteOverwrite?: boolean, skipInboundReconcile?: boolean } | null} */
let pendingFolderScanRequest = null;

/** @type {Map<string, number>} */
const structuralPushRetryCountByProject = new Map();

export function registerActionSyncHandlers(h) {
  handlers = h;
}

export function unregisterActionSyncHandlers() {
  handlers = null;
}

/** Notify UI when a structural or create-time document push failed. */
export function notifyStructuralPushFailed(projectId, pushResult) {
  handlers?.onStructuralPushFailed?.(projectId, pushResult);
}

/**
 * Flush a folder scan that was deferred while the user was dragging on canvas.
 */
export function flushPendingFolderScanIfAny() {
  if (!handlers || !pendingFolderScanRequest) return Promise.resolve();
  if (isCanvasInteractionActive()) return Promise.resolve();
  const request = pendingFolderScanRequest;
  pendingFolderScanRequest = null;
  return requestActionSync('folderScan', request);
}

function buildPayloadForProject(projectId, { useAuthoritativePlacements = false } = {}) {
  if (!handlers || handlers.getProjectId() !== projectId) return null;
  const state = handlers.getState();
  const staged = handlers.getStagedSyncCards();
  const authoritativePlacements =
    useAuthoritativePlacements ? getCommittedPayload(projectId)?.artifactPlacements : null;
  const payload = handlers.buildPayload(state, staged, authoritativePlacements);
  const stripNoteContent = handlers.getStripNoteContent?.() ?? false;
  const { serialised } = slimProjectPayloadForCache(payload, { stripNoteContent });
  return { payload, serialised, stripNoteContent };
}

/**
 * Persist via commit coordinator when available, else legacy build+persist.
 * @param {string} projectId
 * @param {string} reason
 */
async function persistViaCommit(projectId, reason) {
  if (handlers?.commitProjectDocument) {
    const result = await handlers.commitProjectDocument(projectId, { reason });
    return {
      payload: result?.payload ?? getCommittedPayload(projectId),
      localOk: Boolean(result?.localCacheWritten ?? result?.ok),
    };
  }
  const built = buildPayloadForProject(projectId);
  if (!built) return { payload: null, localOk: false };
  cancelPendingProjectSave(projectId);
  const localOk = await persistProjectDocumentLocally(projectId, built.serialised, {
    stripNoteContent: built.stripNoteContent,
  });
  return { payload: built.payload, localOk };
}

/**
 * Persist current canvas + dock to local IDB only (no server push).
 * @param {string} projectId
 * @returns {Promise<boolean>}
 */
export async function persistPlacementLocally(projectId) {
  const { localOk } = await persistViaCommit(projectId, 'persistPlacementLocally');
  if (!localOk && handlers) {
    handlers.onLocalCacheFailed(projectId);
  }
  return localOk;
}

function isPlacementPushReason(reason) {
  return reason === 'structuralChange' || reason === 'placementTransfer';
}

async function pushPayloadForProject(
  projectId,
  payload,
  reason,
  traceId = null,
  beforePayload = null,
  {
    allowEmptyRemoteOverwrite = false,
    allowDockOnlyRemoteOverwrite = false,
    allowCleanupOverwrite = false,
  } = {},
) {
  syncTraceLog(traceId, 'actionSync:push-start', {
    projectId,
    reason,
    serverSyncEnabled: isServerSyncEnabled(),
    cardCount: (payload.cards ?? []).length,
    stagedCount: (payload.stagedSyncCards ?? []).length,
    hasBeforePayload: Boolean(beforePayload),
  });
  const flushOptions = {
    reason,
    traceId,
    beforePayload,
    allowEmptyRemoteOverwrite,
    allowDockOnlyRemoteOverwrite,
  };
  if (allowCleanupOverwrite) {
    flushOptions.allowCleanupOverwrite = true;
  }
  const pushResult = await flushOutgoingProjectDocument(projectId, payload, flushOptions);
  syncTraceLog(traceId, 'actionSync:push-done', {
    projectId,
    ok: pushResult?.ok,
    skipped: pushResult?.skipped,
    patched: pushResult?.patched,
    conflict: pushResult?.conflict,
  });
  if (pushResult?.ok && isPlacementPushReason(reason)) {
    for (const c of payload.cards ?? []) {
      if (c?.id) clearOptimisticCard(projectId, c.id);
    }
    structuralPushRetryCountByProject.delete(projectId);
  } else if (
    isPlacementPushReason(reason)
    && !pushResult?.ok
    && !pushResult?.skipped
  ) {
    handlers?.onStructuralPushFailed?.(projectId, pushResult);
    schedulePlacementPushRetry(projectId, reason);
  }
  return pushResult;
}

function schedulePlacementPushRetry(projectId, reason = 'structuralChange') {
  if (!handlers || !projectId) return;
  const attempts = structuralPushRetryCountByProject.get(projectId) ?? 0;
  if (attempts >= 2) return;
  structuralPushRetryCountByProject.set(projectId, attempts + 1);

  setTimeout(() => {
    void runSyncGate('structural-retry', async () => {
      if (!handlers || handlers.getProjectId() !== projectId) return;
      try {
        await reconcileActiveProject(projectId);
      } catch {
        /* best effort */
      }
      const { payload } = await persistViaCommit(projectId, 'structural-retry');
      if (!payload) return;
      const beforePayload = getPriorPayloadForPatch(projectId);
      await pushPayloadForProject(projectId, payload, reason, null, beforePayload);
    }).catch((error) => {
      console.warn('Structural sync retry failed:', error);
    });
  }, 2000);
}

/**
 * Action-based sync — not timer-driven.
 * @param {ActionSyncReason} reason
 * @param {{ projectId?: string, awaitLocal?: boolean, traceId?: string | null, allowEmptyRemoteOverwrite?: boolean, allowCleanupOverwrite?: boolean, skipInboundReconcile?: boolean }} [options]
 */
export function requestActionSync(reason, options = {}) {
  const {
    awaitLocal = false,
    traceId = null,
    allowEmptyRemoteOverwrite = false,
    allowCleanupOverwrite = false,
    skipInboundReconcile = false,
  } = options;
  if (!handlers) {
    if (reason === 'placementTransfer') {
      syncTraceLog(traceId, 'actionSync:skipped', { reason: 'handlers_not_registered' });
    }
    return Promise.resolve();
  }
  const busy = getSyncGateLabel();
  if (reason === 'placementTransfer' && busy) {
    syncTraceLog(traceId, 'actionSync:gate-busy', {
      busy,
      willBypass: busy !== 'action:placementTransfer',
    });
  }
  const scopedProjectId = options.projectId ?? null;
  return runSyncGate(`action:${reason}`, async () => {
    if (reason === 'placementTransfer') {
      syncTraceLog(traceId, 'actionSync:gate-enter', {
        projectId: options.projectId ?? handlers.getProjectId(),
      });
    }
    const projectId = options.projectId ?? handlers.getProjectId();
    if (!projectId && reason !== 'pagehide') return;

    if (reason === 'pagehide') {
      await handlers.flushAll();
      return;
    }

    if (!projectId) return;

    if (
      (reason === 'visibilityResume' || reason === 'folderScan')
      && isCanvasInteractionActive()
    ) {
      if (reason === 'folderScan') {
        pendingFolderScanRequest = {
          projectId,
          allowEmptyRemoteOverwrite,
          allowCleanupOverwrite,
          skipInboundReconcile,
        };
      }
      return;
    }

    if (
      reason === 'layoutCommit'
      || reason === 'viewCommit'
      || reason === 'structuralChange'
      || reason === 'placementTransfer'
      || reason === 'stagedChange'
    ) {
      const persistFirst =
        reason === 'placementTransfer'
        || (awaitLocal && reason === 'structuralChange');
      if (persistFirst) {
        if (reason === 'placementTransfer') {
          const payload = getCommittedPayload(projectId);
          if (payload) {
            const beforePayload = getPriorPayloadForPatch(projectId);
            await alignClientRevisionWithServerMeta(projectId, traceId);
            auditPlacementStep(`actionSync:${reason}:push`, payload, { projectId });
            syncTraceLog(traceId, 'actionSync:placement-push', { projectId });
            await pushPayloadForProject(
              projectId,
              payload,
              reason,
              traceId,
              beforePayload,
            );
            await handlers.touchIndex(projectId);
            return;
          }
          syncTraceLog(traceId, 'actionSync:placement-no-commit', { projectId });
        }
        const { payload, localOk } = await persistViaCommit(projectId, reason);
        if (!payload) return;
        if (!localOk) handlers.onLocalCacheFailed(projectId);
        const beforePayload = getPriorPayloadForPatch(projectId);
        void pushPayloadForProject(
          projectId,
          payload,
          reason,
          traceId,
          beforePayload,
          { allowCleanupOverwrite },
        );
        await handlers.touchIndex(projectId);
        return;
      }
      await flushLocalAndPush(projectId, reason, { allowCleanupOverwrite });
      await handlers.touchIndex(projectId);
      return;
    }

    if (reason === 'projectSwitch') {
      await flushLocalAndPush(projectId, reason);
      return;
    }

    if (reason === 'boot') {
      return;
    }

    if (reason === 'visibilityResume') {
      if (handlers.flushActiveProject && handlers.getProjectId() === projectId) {
        await handlers.flushActiveProject(projectId);
      }
      await handlers.reconcileInbound(projectId, { showPullToast: true });
      return;
    }

    if (reason === 'folderScan') {
      pendingFolderScanRequest = null;
      if (handlers.flushActiveProject && handlers.getProjectId() === projectId) {
        await handlers.flushActiveProject(projectId, { allowEmptyRemoteOverwrite });
      }
      const builtBefore = getCommittedPayload(projectId)
        ?? buildPayloadForProject(projectId)?.payload;
      const serverSnapshot = getLastKnownProjectPayloadById().get(projectId);
      if (builtBefore) {
        auditPlacementStep('folderScan:before-flush', builtBefore, { projectId });
      }
      const { shouldSkipInboundReconcileAfterLocalCommit } = await import(
        './projectDocumentMerge.js'
      );
      const skipReconcile = shouldSkipInboundReconcileAfterLocalCommit(
        builtBefore,
        serverSnapshot,
      );
      await flushLocalAndPush(projectId, reason, { allowEmptyRemoteOverwrite });
      if (!skipInboundReconcile && !skipReconcile) {
        await handlers.reconcileInbound(projectId, { showPullToast: false });
      }
    }
  }, { scope: scopedProjectId ? `project:${scopedProjectId}` : 'global' });
}

async function flushLocalAndPush(projectId, reason, pushOptions = {}) {
  if (!handlers) return null;
  if (handlers.getProjectId() !== projectId) {
    return null;
  }
  const { payload, localOk } = await persistViaCommit(projectId, reason);
  if (!payload) return null;

  if (!localOk) {
    handlers.onLocalCacheFailed(projectId);
  }

  const beforePayload = getPriorPayloadForPatch(projectId);
  return pushPayloadForProject(projectId, payload, reason, null, beforePayload, pushOptions);
}

/**
 * Dock ↔ canvas placement — commit in UI, then push via action sync.
 * @param {{ projectId?: string, traceId?: string | null }} [options]
 */
export function requestPlacementSync(options = {}) {
  return requestActionSync('placementTransfer', {
    ...options,
    awaitLocal: true,
  });
}

/** @internal */
export function resetActionSyncForTests() {
  handlers = null;
  pendingFolderScanRequest = null;
  structuralPushRetryCountByProject.clear();
}
