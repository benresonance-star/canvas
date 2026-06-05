import { useCallback, useMemo } from 'react';
import {
  archiveProject,
  unarchiveProject,
  deleteProject,
  loadProjectIndex,
  isServerSyncEnabled,
  createProject as createNewProject,
  createEmptyProjectState,
  setActiveProjectId as persistActiveProjectId,
  consumeDuplicateMergeNotice,
  projectsForMenuFromIndex,
} from '../../lib/projects.js';
import { strings } from '../../content/strings.js';
import { flowTrace } from '../../lib/sync/syncTrace.js';

/**
 * Project create/switch/archive/delete workflow extracted from App.jsx.
 */
export function useProjectWorkspace({
  refs: {
    activeProjectIdRef,
    stateRef,
    switchingProjectRef,
    creatingProjectRef,
    folderRestoreHandledSeqRef,
    projectNameDirtyRef,
  },
  ui: {
    setActiveProjectId,
    setProjectList,
    setSyncStatus,
    setState,
    setProjectSwitchLoading,
    setPendingSwitchProjectId,
    setFolderLinkInProgress,
    setCreateProjectPromptOpen,
    setProjectDeleteTarget,
    setArchiveLastTarget,
    setFolderHandle,
    setFolderStoredOnDevice,
    setFolderLinkProbeComplete,
    setFolderPresentKeys,
    setChangeFolderDialog,
    setShowSearch,
    setSearchQuery,
    setArchitectureOpen,
  },
  deps: {
    loaded,
    activeProjectId,
    effectiveProjectId,
    projectSwitchLoading,
    projectList,
    projectDeleteTarget,
    folderHandle,
    resetProjectUiParts: { resetCanvasUi, resetClusterUi, resetAgentUi },
    selectProject,
    setAgentMessages,
    setAgentPanelOpen,
    setActiveThreadId,
    setAgentChatThreadIndex,
    setThreadPickerOpen,
  },
}) {
  const clearStaleSyncBanners = useCallback((prev) => {
    if (
      prev?.banner === strings.projects.serverRevisionStale
      || prev?.banner === strings.projects.remoteChangesWhileEditing
    ) {
      return null;
    }
    return prev;
  }, []);

  const resetProjectUi = useCallback(() => {
    folderRestoreHandledSeqRef.current = null;
    setFolderLinkInProgress(false);
    setFolderLinkProbeComplete(false);
    setFolderHandle(null);
    setFolderStoredOnDevice(false);
    setFolderPresentKeys(null);
    setChangeFolderDialog(false);
    setSearchQuery('');
    setShowSearch(false);
    setArchitectureOpen(false);
    setAgentPanelOpen(false);
    setAgentMessages([]);
    setActiveThreadId(null);
    setAgentChatThreadIndex({ version: 1, activeThreadId: null, threads: [] });
    setThreadPickerOpen(false);
    resetCanvasUi?.();
    resetClusterUi?.();
    resetAgentUi?.();
  }, [
    folderRestoreHandledSeqRef,
    setFolderLinkInProgress,
    setFolderLinkProbeComplete,
    setFolderHandle,
    setFolderStoredOnDevice,
    setFolderPresentKeys,
    setChangeFolderDialog,
    setAgentPanelOpen,
    setAgentMessages,
    setActiveThreadId,
    setAgentChatThreadIndex,
    setThreadPickerOpen,
    setSearchQuery,
    setShowSearch,
    setArchitectureOpen,
    resetCanvasUi,
    resetClusterUi,
    resetAgentUi,
  ]);

  const switchProject = selectProject;

  const handleCreateProject = useCallback(async (projectName = strings.defaultProjectName) => {
    const staleSwitchGuard =
      switchingProjectRef.current
      && loaded
      && !projectSwitchLoading
      && effectiveProjectId === activeProjectId;
    if (staleSwitchGuard) {
      flowTrace('project:create-clear-stale-switch', {
        projectId: activeProjectId,
      });
      switchingProjectRef.current = false;
    }
    if (creatingProjectRef.current || switchingProjectRef.current) {
      setSyncStatus({ toast: strings.projects.projectChangeInProgress });
      setTimeout(() => setSyncStatus(null), 3500);
      return;
    }
    creatingProjectRef.current = true;
    switchingProjectRef.current = true;
    setProjectSwitchLoading(true);

    try {
      flowTrace('project:create-ui-start', {
        projectId: null,
        outgoingProjectId: activeProjectIdRef.current,
      });
      const { index, projectId } = await createNewProject(projectName);
      flowTrace('project:create-ui-loaded', { projectId });
      const duplicatesMerged = consumeDuplicateMergeNotice();
      if (duplicatesMerged > 0) {
        setSyncStatus({
          toast: strings.projects.mergedDuplicates(duplicatesMerged),
        });
        setTimeout(() => setSyncStatus(null), 6000);
      }
      setProjectList(projectsForMenuFromIndex(index));
      const switchResult = await selectProject(projectId, {
        reason: 'create',
        showSwitchLoading: true,
        force: true,
      });
      if (!switchResult?.ok) {
        setSyncStatus({ error: strings.projects.switchLoadFailed });
        setTimeout(() => setSyncStatus(null), 6000);
      }
    } catch (e) {
      console.error('Create project switch failed:', e);
      setSyncStatus({ error: strings.projects.switchLoadFailed });
      setTimeout(() => setSyncStatus(null), 6000);
    } finally {
      creatingProjectRef.current = false;
      switchingProjectRef.current = false;
      setPendingSwitchProjectId(null);
      setProjectSwitchLoading(false);
    }
  }, [
    activeProjectIdRef,
    creatingProjectRef,
    switchingProjectRef,
    setProjectSwitchLoading,
    setPendingSwitchProjectId,
    setProjectList,
    setSyncStatus,
    selectProject,
    loaded,
    projectSwitchLoading,
    activeProjectId,
    effectiveProjectId,
  ]);

  const handleRequestCreateProject = useCallback(() => {
    setCreateProjectPromptOpen(true);
  }, [setCreateProjectPromptOpen]);

  const handleUnarchiveProject = useCallback(async (projectId) => {
    const index = await unarchiveProject(projectId);
    setProjectList(projectsForMenuFromIndex(index));
  }, [setProjectList]);

  const handleArchiveProject = useCallback(async (projectId) => {
    const row = projectList.find((p) => p.id === projectId);
    const { index, needsSwitch, switchToId, needsCreate } =
      await archiveProject(projectId);
    setProjectList(projectsForMenuFromIndex(index));
    if (needsCreate) {
      setArchiveLastTarget({
        id: projectId,
        name: row?.name ?? strings.defaultProjectName,
      });
      return;
    }
    if (needsSwitch && switchToId) {
      await switchProject(switchToId);
    }
  }, [switchProject, projectList, setProjectList, setArchiveLastTarget]);

  const handleConfirmDeleteProject = useCallback(async () => {
    if (!projectDeleteTarget) return;
    const { id } = projectDeleteTarget;
    setProjectDeleteTarget(null);
    flowTrace('project:delete-ui-start', { projectId: id });
    try {
      const result = await deleteProject(id);
      if (!result.ok) {
        setSyncStatus({ error: strings.projects.cannotDeleteLast });
        setTimeout(() => setSyncStatus(null), 2500);
        return;
      }
      setProjectList(projectsForMenuFromIndex(result.index));
      if (result.switchToId) {
        const deletingActive = id === activeProjectIdRef.current;
        await switchProject(result.switchToId, {
          reason: 'delete',
          commitOutgoing: !deletingActive,
          rollbackProjectId: deletingActive ? null : undefined,
        });
      } else if (result.index.projects.length === 0) {
        activeProjectIdRef.current = null;
        projectNameDirtyRef.current = false;
        await persistActiveProjectId(null);
        setActiveProjectId(null);
        resetProjectUi();
        const empty = createEmptyProjectState();
        stateRef.current = { ...stateRef.current, ...empty };
        setState((prev) => ({ ...prev, ...empty }));
      }
      if (isServerSyncEnabled()) {
        const index = await loadProjectIndex();
        if (index?.projects?.some((p) => p.id === id)) {
          setSyncStatus({
            banner: strings.projects.deleteServerMayPersist,
          });
        }
      }
    } catch (e) {
      console.error('Delete project failed:', e);
      setSyncStatus({ error: strings.projects.deleteFailed });
      setTimeout(() => setSyncStatus(null), 6000);
    }
  }, [
    projectDeleteTarget,
    switchProject,
    setProjectDeleteTarget,
    setProjectList,
    setSyncStatus,
    activeProjectIdRef,
    projectNameDirtyRef,
    stateRef,
    setState,
    resetProjectUi,
    setActiveProjectId,
  ]);

  const connectedFolderName = useMemo(() => {
    const id = effectiveProjectId ?? activeProjectId;
    if (!id) return null;
    const row = projectList.find((p) => p.id === id);
    return row?.connectedFolderName ?? null;
  }, [projectList, activeProjectId, effectiveProjectId]);

  const folderDisplayName = folderHandle?.name ?? connectedFolderName;

  return {
    clearStaleSyncBanners,
    resetProjectUi,
    switchProject,
    handleCreateProject,
    handleRequestCreateProject,
    handleUnarchiveProject,
    handleArchiveProject,
    handleConfirmDeleteProject,
    connectedFolderName,
    folderDisplayName,
  };
}
