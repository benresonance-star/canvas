import { isCanvasInteractionActive } from './canvasInteraction.js';
import {
  cancelPendingProjectSave,
  flushOutgoingProjectDocument,
  persistProjectDocumentLocally,
} from './projectSync.js';
import { slimProjectPayloadForCache } from './projectSlim.js';
import { clearOptimisticCard } from './optimisticCards.js';
import { runSyncGate } from './syncGate.js';

/**
 * @typedef {'layoutCommit' | 'structuralChange' | 'projectSwitch' | 'folderScan' | 'visibilityResume' | 'boot' | 'pagehide' | 'stagedChange'} ActionSyncReason
 */

/** @type {{
 *   getProjectId: () => string | null,
 *   getState: () => object,
 *   getStagedSyncCards: () => object[],
 *   buildPayload: (state: object, staged: object[]) => object,
 *   getStripNoteContent?: () => boolean,
 *   touchIndex: (projectId: string) => Promise<void>,
 *   onLocalCacheFailed: (projectId: string) => void,
 *   onStructuralPushFailed?: (projectId: string, pushResult: object) => void,
 *   reconcileInbound: (projectId: string, options: { showPullToast?: boolean }) => Promise<object>,
 *   flushActiveProject?: (projectId: string) => Promise<void>,
 *   flushAll: () => Promise<void>,
 * } | null} */
let handlers = null;

/** @type {string | null} */
let pendingFolderScanProjectId = null;

export function registerActionSyncHandlers(h) {
  handlers = h;
}

export function unregisterActionSyncHandlers() {
  handlers = null;
}

/**
 * Flush a folder scan that was deferred while the user was dragging on canvas.
 */
export function flushPendingFolderScanIfAny() {
  if (!handlers || !pendingFolderScanProjectId) return Promise.resolve();
  if (isCanvasInteractionActive()) return Promise.resolve();
  const projectId = pendingFolderScanProjectId;
  pendingFolderScanProjectId = null;
  return requestActionSync('folderScan', { projectId });
}

/**
 * Action-based sync — not timer-driven.
 * @param {ActionSyncReason} reason
 * @param {{ projectId?: string }} [options]
 */
export function requestActionSync(reason, options = {}) {
  if (!handlers) return Promise.resolve();
  return runSyncGate(`action:${reason}`, async () => {
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
        pendingFolderScanProjectId = projectId;
      }
      return;
    }

    if (reason === 'layoutCommit' || reason === 'structuralChange' || reason === 'stagedChange') {
      await flushLocalAndPush(projectId, reason);
      await handlers.touchIndex(projectId);
      return;
    }

    if (reason === 'projectSwitch') {
      await flushLocalAndPush(projectId, reason);
      return;
    }

    if (reason === 'visibilityResume' || reason === 'boot') {
      if (handlers.flushActiveProject && handlers.getProjectId() === projectId) {
        await handlers.flushActiveProject(projectId);
      }
      await handlers.reconcileInbound(projectId, {
        showPullToast: reason === 'visibilityResume',
      });
      return;
    }

    if (reason === 'folderScan') {
      pendingFolderScanProjectId = null;
      await flushLocalAndPush(projectId, reason);
      await handlers.reconcileInbound(projectId, { showPullToast: false });
    }
  });
}

async function flushLocalAndPush(projectId, reason) {
  if (!handlers) return;
  if (handlers.getProjectId() !== projectId) {
    return;
  }
  const state = handlers.getState();
  const staged = handlers.getStagedSyncCards();
  const payload = handlers.buildPayload(state, staged);
  const stripNoteContent = handlers.getStripNoteContent?.() ?? false;
  const { serialised } = slimProjectPayloadForCache(payload, { stripNoteContent });

  cancelPendingProjectSave(projectId);
  const localOk = await persistProjectDocumentLocally(projectId, serialised, {
    stripNoteContent,
  });
  if (!localOk) {
    handlers.onLocalCacheFailed(projectId);
  }

  const pushResult = await flushOutgoingProjectDocument(projectId, payload);
  if (pushResult?.ok && reason === 'structuralChange') {
    for (const c of payload.cards ?? []) {
      if (c?.id) clearOptimisticCard(projectId, c.id);
    }
  } else if (
    reason === 'structuralChange'
    && !pushResult?.ok
    && !pushResult?.skipped
  ) {
    handlers.onStructuralPushFailed?.(projectId, pushResult);
  }
}

/** @internal */
export function resetActionSyncForTests() {
  handlers = null;
  pendingFolderScanProjectId = null;
}
