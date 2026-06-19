import { useCallback, useEffect } from 'react';
import {
  buildProjectSavePayload,
  commitProjectDocument,
  saveProjectById,
} from '../../lib/persistence.js';
import {
  registerActionSyncHandlers,
  unregisterActionSyncHandlers,
  requestActionSync,
  requestPlacementSync,
} from '../../lib/actionSync.js';
import {
  touchActiveProjectInIndex,
  setProjectDisplayName,
  flushProjectSync,
  isServerSyncEnabled,
} from '../../lib/projects.js';
import { suppressedKeysForSave } from '../../lib/syncSuppressedKeys.js';
import { syncTraceLog } from '../../lib/sync/syncTrace.js';
import { syncKeysMatch } from '../../lib/filename.js';
import { flushArtifactSyncOutbox } from '../../lib/artifactSyncOutbox.js';
import { processArtifactSyncRetryEntry } from '../../lib/artifactSyncRetry.js';
import { saveThreadIndexLocal } from '../../lib/agentChatThreads.js';
import {
  isPlacementCommitBlocked,
  placementCommitBlockedResult,
  shouldGatePlacementCommit,
  shouldDeferPlacementSyncForPendingCommit,
} from '../../lib/placementCommitGate.js';
import { strings } from '../../content/strings.js';
import { sanitizeAgentChatProjectState } from '../../lib/canvasCardMerge.js';

function inferAgentChatConnectorId(rows = []) {
  for (const row of rows ?? []) {
    const match = String(row?.key ?? '').match(/^notes__agent-chat-([a-zA-Z0-9_-]+)/);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Action-sync handler registration and placement commit helpers.
 */
export function useActionSync({
  refs: {
    activeProjectIdRef,
    stateRef,
    stagedSyncCardsRef,
    folderPresentKeysRef,
    switchingProjectRef,
    creatingProjectRef,
    initialHydratedRef,
    projectNameDirtyRef,
    agentChatThreadIndexRef,
    pendingPlacementTransferSyncRef,
    pendingPlacementCommitRef,
    canMutateCanvasRef,
  },
  folderHandle,
  applyReconcileFromServer,
  setState,
  setStagedSyncCards,
  setAgentChatThreadIndex,
  setSyncStatus,
}) {
  const sanitizeRowsForProjectSync = useCallback((projectId, state, stagedSyncCards) => {
    const threads = agentChatThreadIndexRef?.current?.threads ?? [];
    const connectorId =
      threads.find((thread) => thread?.connectorId)?.connectorId
      ?? inferAgentChatConnectorId([
        ...(state?.cards ?? []),
        ...(stagedSyncCards ?? []),
      ]);
    if (!connectorId) {
      return { state, stagedSyncCards };
    }
    const sanitized = sanitizeAgentChatProjectState(
      state?.cards ?? [],
      stagedSyncCards ?? [],
      {
        connectorId,
        suppressedKeys: suppressedKeysForSave(projectId, state),
        threads,
        activeThreadId: agentChatThreadIndexRef?.current?.activeThreadId ?? null,
      },
    );
    if (!sanitized.keysMigrated) {
      return { state, stagedSyncCards };
    }
    const nextState = { ...state, cards: sanitized.cards };
    stateRef.current = nextState;
    stagedSyncCardsRef.current = sanitized.stagedSyncCards;
    setState((prev) => ({ ...prev, cards: sanitized.cards }));
    setStagedSyncCards(sanitized.stagedSyncCards);
    return { state: nextState, stagedSyncCards: sanitized.stagedSyncCards };
  }, [
    agentChatThreadIndexRef,
    stateRef,
    stagedSyncCardsRef,
    setState,
    setStagedSyncCards,
  ]);

  const requestStructuralSync = useCallback((options = {}) => {
    const projectId = activeProjectIdRef.current;
    const { awaitLocal = false, allowCleanupOverwrite = false } = options;
    if (
      !projectId
      || switchingProjectRef.current
      || creatingProjectRef.current
    ) {
      return Promise.resolve();
    }
    if (!initialHydratedRef.current) {
      setTimeout(() => {
        if (
          activeProjectIdRef.current === projectId
          && !switchingProjectRef.current
          && !creatingProjectRef.current
          && initialHydratedRef.current
        ) {
          void requestActionSync('structuralChange', {
            projectId,
            awaitLocal,
            allowCleanupOverwrite,
          });
        }
      }, 500);
      return Promise.resolve();
    }
    return requestActionSync('structuralChange', {
      projectId,
      awaitLocal,
      allowCleanupOverwrite,
    });
  }, [
    activeProjectIdRef,
    switchingProjectRef,
    creatingProjectRef,
    initialHydratedRef,
  ]);

  const requestPlacementTransferSync = useCallback((options = {}) => {
    const { traceId = null } = options;
    const projectId = activeProjectIdRef.current;
    if (!projectId) {
      syncTraceLog(traceId, 'placement-sync:skipped', { reason: 'no_project_id' });
      return Promise.resolve();
    }
    const pendingCommit = pendingPlacementCommitRef?.current;
    if (shouldDeferPlacementSyncForPendingCommit(projectId, pendingCommit)) {
      syncTraceLog(traceId ?? pendingCommit.traceId, 'placement-sync:deferred', {
        projectId,
        reason: 'pending_placement_commit',
      });
      pendingPlacementTransferSyncRef.current = {
        projectId,
        traceId: traceId ?? pendingCommit.traceId,
        options,
      };
      return Promise.resolve();
    }
    if (switchingProjectRef.current) {
      syncTraceLog(traceId, 'placement-sync:skipped', {
        projectId,
        reason: 'switching_project',
      });
      pendingPlacementTransferSyncRef.current = { projectId, traceId, options };
      return Promise.resolve();
    }
    if (creatingProjectRef.current) {
      syncTraceLog(traceId, 'placement-sync:skipped', {
        projectId,
        reason: 'creating_project',
      });
      pendingPlacementTransferSyncRef.current = { projectId, traceId, options };
      return Promise.resolve();
    }
    if (!initialHydratedRef.current) {
      syncTraceLog(traceId, 'placement-sync:deferred', {
        projectId,
        reason: 'not_initial_hydrated',
      });
      pendingPlacementTransferSyncRef.current = { projectId, traceId, options };
      return Promise.resolve();
    }
    syncTraceLog(traceId, 'placement-sync:dispatch', { projectId });
    return requestPlacementSync({ projectId, ...options });
  }, [
    activeProjectIdRef,
    switchingProjectRef,
    creatingProjectRef,
    initialHydratedRef,
    pendingPlacementTransferSyncRef,
    pendingPlacementCommitRef,
  ]);

  const flushPendingPlacementTransferSync = useCallback(() => {
    const pending = pendingPlacementTransferSyncRef.current;
    if (!pending || !initialHydratedRef.current) return;
    pendingPlacementTransferSyncRef.current = null;
    const { projectId, traceId, options = {} } = pending;
    if (
      activeProjectIdRef.current !== projectId
      || switchingProjectRef.current
      || creatingProjectRef.current
    ) {
      return;
    }
    syncTraceLog(traceId, 'placement-sync:flush-deferred', { projectId });
    void requestPlacementSync({ projectId, traceId, ...options });
  }, [
    pendingPlacementTransferSyncRef,
    initialHydratedRef,
    activeProjectIdRef,
    switchingProjectRef,
    creatingProjectRef,
  ]);

  const commitProjectDocumentForSync = useCallback(
    async (projectId, { reason = 'commit', pushRemote = false, traceId = null } = {}) => {
      if (!projectId) return { ok: false };
      const sanitized = sanitizeRowsForProjectSync(
        projectId,
        stateRef.current,
        stagedSyncCardsRef.current,
      );
      return commitProjectDocument(projectId, {
        state: sanitized.state,
        stagedSyncCards: sanitized.stagedSyncCards,
        artifactPlacements: null,
        suppressedSyncKeys: suppressedKeysForSave(projectId, stateRef.current),
        stripNoteContent:
          Boolean(folderHandle)
          && Boolean(folderPresentKeysRef.current?.length)
          && isServerSyncEnabled(),
        reason,
        pushRemote,
        traceId,
      });
    },
    [
      folderHandle,
      stateRef,
      stagedSyncCardsRef,
      folderPresentKeysRef,
      sanitizeRowsForProjectSync,
    ],
  );

  const commitPlacementState = useCallback(
    async (
      projectId,
      {
        artifactPlacements = null,
        reason = 'commit',
        pushRemote = false,
        traceId = null,
      } = {},
    ) => {
      if (!projectId) return { ok: false };
      const blocked = shouldGatePlacementCommit(reason)
        ? placementCommitBlockedResult(canMutateCanvasRef)
        : null;
      if (blocked) {
        if (pendingPlacementCommitRef) {
          pendingPlacementCommitRef.current = {
            projectId,
            artifactPlacements,
            reason,
            traceId,
          };
        }
        syncTraceLog(traceId, 'placement:commit-deferred', {
          projectId,
          reason: 'projection_not_ready',
        });
        return blocked;
      }
      return commitProjectDocument(projectId, {
        state: stateRef.current,
        stagedSyncCards: stagedSyncCardsRef.current,
        artifactPlacements,
        suppressedSyncKeys: suppressedKeysForSave(projectId, stateRef.current),
        stripNoteContent:
          Boolean(folderHandle)
          && Boolean(folderPresentKeysRef.current?.length)
          && isServerSyncEnabled(),
        reason,
        pushRemote,
        traceId,
      });
    },
    [
      folderHandle,
      stateRef,
      stagedSyncCardsRef,
      folderPresentKeysRef,
      canMutateCanvasRef,
      pendingPlacementCommitRef,
    ],
  );

  const applyArtifactRetryResultToRows = useCallback((rows, result) =>
    (rows ?? []).map((card) => {
      let changed = false;
      const nextVersions = (card.versions ?? []).map((version) => {
        const matches =
          (result.filename && syncKeysMatch(version.filename, result.filename))
          || (!result.filename && result.cardKey && syncKeysMatch(card.key, result.cardKey));
        if (!matches) return version;
        changed = true;
        return {
          ...version,
          artifactRef: result.artifactRef ?? version.artifactRef,
          content_hash: result.contentHash ?? version.content_hash,
          artifactSyncState: result.artifactRef ? 'synced' : version.artifactSyncState,
        };
      });
      return changed ? { ...card, versions: nextVersions } : card;
    }), []);

  const flushArtifactRetriesForActiveProject = useCallback(async (projectId) => {
    if (!projectId) return { flushed: 0, remaining: 0 };
    const applied = [];
    const result = await flushArtifactSyncOutbox(async (entry) => {
      const retry = await processArtifactSyncRetryEntry(entry);
      if (retry?.ok && retry.artifactRef) {
        applied.push({
          ...retry,
          cardKey: retry.cardKey ?? entry.cardKey,
          filename: retry.filename ?? entry.filename,
        });
      }
      return retry;
    }, { projectId });

    if (applied.length > 0) {
      let nextCards = stateRef.current.cards ?? [];
      let nextStaged = stagedSyncCardsRef.current ?? [];
      for (const retry of applied) {
        nextCards = applyArtifactRetryResultToRows(nextCards, retry);
        nextStaged = applyArtifactRetryResultToRows(nextStaged, retry);
      }
      stateRef.current = { ...stateRef.current, cards: nextCards };
      stagedSyncCardsRef.current = nextStaged;
      setState((prev) => ({ ...prev, cards: nextCards }));
      setStagedSyncCards(nextStaged);
      const chatRetry = applied.find((retry) => retry.kind === 'agent_chat' && retry.threadId);
      if (chatRetry && agentChatThreadIndexRef?.current) {
        const nextIndex = {
          ...agentChatThreadIndexRef.current,
          threads: (agentChatThreadIndexRef.current.threads ?? []).map((thread) =>
            thread.threadId === chatRetry.threadId
              ? {
                  ...thread,
                  artifactRef: chatRetry.artifactRef,
                  filename: chatRetry.filename ?? thread.filename,
                  updatedAt: Date.now(),
                }
              : thread,
          ),
        };
        agentChatThreadIndexRef.current = nextIndex;
        setAgentChatThreadIndex?.(nextIndex);
        if (chatRetry.connectorId) {
          saveThreadIndexLocal(projectId, chatRetry.connectorId, nextIndex);
        }
      }
      await saveProjectById(projectId, stateRef.current, nextStaged, { pushRemote: true });
    }

    return result;
  }, [
    applyArtifactRetryResultToRows,
    stateRef,
    stagedSyncCardsRef,
    agentChatThreadIndexRef,
    setState,
    setStagedSyncCards,
    setAgentChatThreadIndex,
  ]);

  const flushPendingPlacementCommit = useCallback(async () => {
    const pending = pendingPlacementCommitRef?.current;
    if (!pending) return;
    if (isPlacementCommitBlocked(canMutateCanvasRef)) return;
    if (activeProjectIdRef.current !== pending.projectId) {
      pendingPlacementCommitRef.current = null;
      return;
    }
    pendingPlacementCommitRef.current = null;
    syncTraceLog(pending.traceId, 'placement:commit-flush', {
      projectId: pending.projectId,
    });
    const result = await commitPlacementState(pending.projectId, {
      artifactPlacements: pending.artifactPlacements,
      reason: pending.reason,
      traceId: pending.traceId,
    });
    if (!result?.deferred && !result?.skipped) {
      await requestPlacementTransferSync({ traceId: pending.traceId });
    }
  }, [
    pendingPlacementCommitRef,
    canMutateCanvasRef,
    activeProjectIdRef,
    commitPlacementState,
    requestPlacementTransferSync,
  ]);

  /** Commits deferred placement during switch-out (bypasses I6; projection may already be selecting). */
  const flushPendingPlacementCommitForSwitch = useCallback(async (projectId) => {
    const pending = pendingPlacementCommitRef?.current;
    if (!pending || pending.projectId !== projectId) return;
    pendingPlacementCommitRef.current = null;
    syncTraceLog(pending.traceId, 'placement:commit-flush', {
      projectId: pending.projectId,
      reason: 'project_switch',
    });
    await commitProjectDocument(projectId, {
      state: stateRef.current,
      stagedSyncCards: stagedSyncCardsRef.current,
      artifactPlacements: pending.artifactPlacements,
      suppressedSyncKeys: suppressedKeysForSave(projectId, stateRef.current),
      stripNoteContent:
        Boolean(folderHandle)
        && Boolean(folderPresentKeysRef.current?.length)
        && isServerSyncEnabled(),
      reason: pending.reason,
      pushRemote: true,
      traceId: pending.traceId,
    });
  }, [
    pendingPlacementCommitRef,
    stateRef,
    stagedSyncCardsRef,
    folderHandle,
    folderPresentKeysRef,
  ]);

  useEffect(() => {
    registerActionSyncHandlers({
      getProjectId: () => activeProjectIdRef.current,
      getState: () => stateRef.current,
      getStagedSyncCards: () => stagedSyncCardsRef.current,
      buildPayload: (state, staged, authoritativePlacements) =>
        buildProjectSavePayload(
          state,
          staged,
          suppressedKeysForSave(activeProjectIdRef.current, state),
          {
            stripNoteContent:
              Boolean(folderHandle)
              && Boolean(folderPresentKeysRef.current?.length)
              && isServerSyncEnabled(),
            authoritativePlacements,
          },
        ),
      commitProjectDocument: (projectId, opts) =>
        commitProjectDocumentForSync(projectId, opts),
      getStripNoteContent: () =>
        Boolean(folderHandle)
        && Boolean(folderPresentKeysRef.current?.length)
        && isServerSyncEnabled(),
      touchIndex: (projectId) => {
        if (projectId !== activeProjectIdRef.current) return null;
        return touchActiveProjectInIndex(projectId);
      },
      onLocalCacheFailed: () => {
        setSyncStatus({
          banner: strings.projects.localStorageFull,
        });
      },
      onStructuralPushFailed: () => {
        const msg = strings.projects.placementPushFailed;
        setSyncStatus({ toast: msg });
        setTimeout(() => {
          setSyncStatus((prev) => (prev?.toast === msg ? null : prev));
        }, 6000);
      },
      reconcileInbound: (projectId, opts) =>
        applyReconcileFromServer(projectId, opts),
      flushActiveProject: async (projectId, options = {}) => {
        if (projectId !== activeProjectIdRef.current) return;
        await flushArtifactRetriesForActiveProject(projectId);
        await flushPendingPlacementCommit();
        if (projectNameDirtyRef.current) {
          await setProjectDisplayName(projectId, stateRef.current.projectName);
          projectNameDirtyRef.current = false;
        }
        const sanitized = sanitizeRowsForProjectSync(
          projectId,
          stateRef.current,
          stagedSyncCardsRef.current,
        );
        await saveProjectById(
          projectId,
          sanitized.state,
          sanitized.stagedSyncCards,
          {
            pushRemote: true,
            allowEmptyRemoteOverwrite: options.allowEmptyRemoteOverwrite === true,
          },
        );
      },
      flushAll: async () => {
        const projectId = activeProjectIdRef.current;
        if (projectId) {
          await flushArtifactRetriesForActiveProject(projectId);
          await flushPendingPlacementCommitForSwitch(projectId);
          if (projectNameDirtyRef.current) {
            await setProjectDisplayName(projectId, stateRef.current.projectName);
            projectNameDirtyRef.current = false;
          }
          const sanitized = sanitizeRowsForProjectSync(
            projectId,
            stateRef.current,
            stagedSyncCardsRef.current,
          );
          await saveProjectById(
            projectId,
            sanitized.state,
            sanitized.stagedSyncCards,
            { pushRemote: true },
          );
        }
        await flushProjectSync();
      },
    });
    return () => unregisterActionSyncHandlers();
  }, [
    applyReconcileFromServer,
    commitProjectDocumentForSync,
    flushArtifactRetriesForActiveProject,
    flushPendingPlacementCommit,
    flushPendingPlacementCommitForSwitch,
    sanitizeRowsForProjectSync,
    folderHandle,
    activeProjectIdRef,
    stateRef,
    stagedSyncCardsRef,
    folderPresentKeysRef,
    projectNameDirtyRef,
    agentChatThreadIndexRef,
    setSyncStatus,
  ]);

  return {
    requestStructuralSync,
    requestPlacementTransferSync,
    flushPendingPlacementTransferSync,
    flushPendingPlacementCommit,
    flushPendingPlacementCommitForSwitch,
    commitPlacementState,
  };
}
