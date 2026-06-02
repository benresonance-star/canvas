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
import { strings } from '../../content/strings.js';

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
    pendingPlacementTransferSyncRef,
  },
  folderHandle,
  applyReconcileFromServer,
  setSyncStatus,
}) {
  const requestStructuralSync = useCallback((options = {}) => {
    const projectId = activeProjectIdRef.current;
    if (
      !projectId
      || switchingProjectRef.current
      || creatingProjectRef.current
      || !initialHydratedRef.current
    ) {
      return Promise.resolve();
    }
    const { awaitLocal = false } = options;
    return requestActionSync('structuralChange', { projectId, awaitLocal });
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
    if (switchingProjectRef.current) {
      syncTraceLog(traceId, 'placement-sync:skipped', {
        projectId,
        reason: 'switching_project',
      });
      return Promise.resolve();
    }
    if (creatingProjectRef.current) {
      syncTraceLog(traceId, 'placement-sync:skipped', {
        projectId,
        reason: 'creating_project',
      });
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
    [folderHandle, stateRef, stagedSyncCardsRef, folderPresentKeysRef],
  );

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
        commitPlacementState(projectId, opts),
      getStripNoteContent: () =>
        Boolean(folderHandle)
        && Boolean(folderPresentKeysRef.current?.length)
        && isServerSyncEnabled(),
      touchIndex: (projectId) => touchActiveProjectInIndex(projectId),
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
      flushActiveProject: async (projectId) => {
        if (projectId !== activeProjectIdRef.current) return;
        if (projectNameDirtyRef.current) {
          await setProjectDisplayName(projectId, stateRef.current.projectName);
          projectNameDirtyRef.current = false;
        }
        await saveProjectById(
          projectId,
          stateRef.current,
          stagedSyncCardsRef.current,
          { pushRemote: true },
        );
      },
      flushAll: async () => {
        const projectId = activeProjectIdRef.current;
        if (projectId) {
          if (projectNameDirtyRef.current) {
            await setProjectDisplayName(projectId, stateRef.current.projectName);
            projectNameDirtyRef.current = false;
          }
          await saveProjectById(
            projectId,
            stateRef.current,
            stagedSyncCardsRef.current,
            { pushRemote: true },
          );
        }
        await flushProjectSync();
      },
    });
    return () => unregisterActionSyncHandlers();
  }, [
    applyReconcileFromServer,
    commitPlacementState,
    folderHandle,
    activeProjectIdRef,
    stateRef,
    stagedSyncCardsRef,
    folderPresentKeysRef,
    projectNameDirtyRef,
    setSyncStatus,
  ]);

  return {
    requestStructuralSync,
    requestPlacementTransferSync,
    flushPendingPlacementTransferSync,
    commitPlacementState,
  };
}
