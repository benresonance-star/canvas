import { useCallback, useEffect, useRef } from 'react';
import {
  loadProjectIndex,
  refreshReconciledProjectList,
  isServerSyncEnabled,
} from '../../lib/projects.js';
import { resolveProjectDisplayName } from '../../lib/projectDisplayName.js';
import { findDuplicateDisplayNameGroups } from '../../lib/projectIndexNormalize.js';
import { PROJECT_SYNC_INDEX_POLL_INTERVAL_MS } from '../../lib/projectSyncCoordinator.js';
import { isBootSyncCompleted, runExclusive } from '../../lib/projectSyncCoordinator.js';
import { strings } from '../../content/strings.js';

/**
 * Workspace index refresh, poll, and active project name sync.
 */
export function useWorkspaceIndexSync({
  activeProjectIdRef,
  projectNameDirtyRef,
  stateRef,
  attemptRestoreRef,
  lastLoadedCardsRef,
  setProjectList,
  setSyncStatus,
  setState,
  loaded,
}) {
  const syncActiveProjectNameFromIndex = useCallback((index) => {
    if (projectNameDirtyRef.current) return;
    const activeId = activeProjectIdRef.current;
    if (!activeId || !index?.projects?.length) return;
    if (!index.projects.some((p) => p.id === activeId)) return;
    const displayName = resolveProjectDisplayName(index, activeId);
    stateRef.current = { ...stateRef.current, projectName: displayName };
    setState((prev) => {
      if (projectNameDirtyRef.current) return prev;
      if (prev.projectName === displayName) return prev;
      return { ...prev, projectName: displayName };
    });
  }, [activeProjectIdRef, projectNameDirtyRef, stateRef, setState]);

  const applyDuplicateNameBanner = useCallback((index) => {
    const groups = findDuplicateDisplayNameGroups(index?.projects ?? []);
    if (groups.length === 0) return;
    const top = [...groups].sort((a, b) => b.count - a.count)[0];
    setSyncStatus((prev) => ({
      ...(prev ?? {}),
      banner: strings.projects.duplicateNamesBanner(top.name, top.count),
    }));
  }, [setSyncStatus]);

  const refreshProjectListFromServer = useCallback(async (options = {}) => {
    const activeId = activeProjectIdRef.current;
    const skipProjectIds =
      projectNameDirtyRef.current && activeId
        ? new Set([activeId])
        : new Set();
    const projects = await refreshReconciledProjectList({
      skipProjectIds,
      activeProjectId: activeId,
      reconcileScope: 'active',
      ...options,
    });
    if (projects.length) setProjectList(projects);
    const index = await loadProjectIndex();
    syncActiveProjectNameFromIndex(index);
    applyDuplicateNameBanner(index);
    const currentActiveId = activeProjectIdRef.current;
    if (currentActiveId && loaded) {
      void attemptRestoreRef.current(currentActiveId, lastLoadedCardsRef.current);
    }
    return index;
  }, [
    activeProjectIdRef,
    projectNameDirtyRef,
    setProjectList,
    syncActiveProjectNameFromIndex,
    loaded,
    applyDuplicateNameBanner,
    attemptRestoreRef,
    lastLoadedCardsRef,
  ]);

  const refreshProjectListFromServerRef = useRef(refreshProjectListFromServer);
  useEffect(() => {
    refreshProjectListFromServerRef.current = refreshProjectListFromServer;
  }, [refreshProjectListFromServer]);

  useEffect(() => {
    if (!loaded || !isBootSyncCompleted() || !isServerSyncEnabled()) {
      return undefined;
    }
    let cancelled = false;
    const indexPollTimer = setInterval(() => {
      if (cancelled || document.visibilityState !== 'visible') return;
      void runExclusive('poll-index', async () => {
        await refreshProjectListFromServer({ reconcileScope: 'none' });
      }, { mode: 'skip' });
    }, PROJECT_SYNC_INDEX_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(indexPollTimer);
    };
  }, [loaded, refreshProjectListFromServer]);

  return {
    refreshProjectListFromServer,
    refreshProjectListFromServerRef,
    syncActiveProjectNameFromIndex,
    applyDuplicateNameBanner,
  };
}
