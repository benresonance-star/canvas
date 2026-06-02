import { useEffect } from 'react';
import { normalizeLoadedProject } from '../../lib/persistence.js';
import {
  isServerSyncEnabled,
  isProjectPatchSyncEnabled,
  startProjectSyncStream,
  stopProjectSyncStream,
  startWorkspaceIndexSyncStream,
  stopWorkspaceIndexSyncStream,
  setRemotePatchAppliedListener,
  setCanvasInteractionIdleListener,
  flushPendingRemoteProjectPatch,
  getProjectSyncClientId,
} from '../../lib/projects.js';
import { isBootSyncCompleted } from '../../lib/projectSyncCoordinator.js';
import { isCanvasInteractionActive } from '../../lib/canvasInteraction.js';
import { runExclusive } from '../../lib/projectSyncCoordinator.js';

/**
 * SSE streams + remote patch idle apply.
 * @param {object} params
 * @param {boolean} params.loaded
 * @param {string | null} params.activeProjectId
 * @param {import('react').MutableRefObject<string | null>} params.activeProjectIdRef
 * @param {import('react').MutableRefObject<Function>} params.loadProjectIntoStateRef
 * @param {import('react').MutableRefObject<Function>} params.refreshProjectListFromServerRef
 * @param {import('react').MutableRefObject<boolean>} params.switchingProjectRef
 */
export function useSyncStreams({
  loaded,
  activeProjectId,
  activeProjectIdRef,
  loadProjectIntoStateRef,
  refreshProjectListFromServerRef,
  switchingProjectRef,
}) {
  useEffect(() => {
    if (!loaded || !isBootSyncCompleted() || !isProjectPatchSyncEnabled()) {
      return undefined;
    }
    setRemotePatchAppliedListener((projectId, merged) => {
      if (projectId !== activeProjectIdRef.current) return;
      if (isCanvasInteractionActive() || switchingProjectRef.current) return;
      void loadProjectIntoStateRef.current(projectId, {
        localOnly: true,
        document: normalizeLoadedProject(merged),
        hydratePreviews: false,
      });
    });
    setCanvasInteractionIdleListener(() => {
      const projectId = activeProjectIdRef.current;
      if (!projectId) return;
      void flushPendingRemoteProjectPatch(projectId, getProjectSyncClientId()).then(
        (result) => {
          if (result?.applied && result.payload && projectId === activeProjectIdRef.current) {
            void loadProjectIntoStateRef.current(projectId, {
              localOnly: true,
              document: normalizeLoadedProject(result.payload),
              hydratePreviews: false,
            });
          }
        },
      );
    });
    return () => {
      setRemotePatchAppliedListener(null);
      setCanvasInteractionIdleListener(null);
    };
  }, [loaded, activeProjectIdRef, loadProjectIntoStateRef, switchingProjectRef]);

  useEffect(() => {
    if (!loaded || !isBootSyncCompleted() || !isServerSyncEnabled()) {
      stopProjectSyncStream();
      return undefined;
    }
    if (!activeProjectId || !isProjectPatchSyncEnabled()) {
      stopProjectSyncStream();
      return undefined;
    }
    startProjectSyncStream(activeProjectId);
    return () => stopProjectSyncStream();
  }, [loaded, activeProjectId]);

  useEffect(() => {
    if (!loaded || !isBootSyncCompleted() || !isServerSyncEnabled()) {
      stopWorkspaceIndexSyncStream();
      return undefined;
    }
    startWorkspaceIndexSyncStream(() => {
      void runExclusive('index-sse', async () => {
        await refreshProjectListFromServerRef.current({ reconcileScope: 'none' });
      }, { mode: 'skip' });
    });
    return () => stopWorkspaceIndexSyncStream();
  }, [loaded, refreshProjectListFromServerRef]);
}
