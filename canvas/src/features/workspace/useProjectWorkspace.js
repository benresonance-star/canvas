import { useCallback, useMemo } from 'react';
import {
  archiveProject,
  unarchiveProject,
  deleteProject,
  ensureProjectIndex,
  loadProjectIndex,
  createProject as createNewProject,
  setActiveProjectId as persistActiveProjectId,
  isServerSyncEnabled,
  consumeDuplicateMergeNotice,
  projectsForMenuFromIndex,
} from '../../lib/projects.js';
import {
  commitProjectDocument,
  clearCommittedPayloadCache,
  getCommittedPayload,
  saveProjectById,
} from '../../lib/persistence.js';
import { patchPlacementsMapFromArrays } from '../../lib/artifactPlacementsMap.js';
import { suppressedKeysForSave } from '../../lib/syncSuppressedKeys.js';
import { buildSwitchPlaceholderState } from '../../lib/projectSwitch.js';
import { perfMark, perfMeasure } from '../../lib/loadPerfMarks.js';
import { strings } from '../../content/strings.js';

/**
 * Project create/switch/archive/delete workflow extracted from App.jsx.
 */
export function useProjectWorkspace({
  refs: {
    activeProjectIdRef,
    stateRef,
    stagedSyncCardsRef,
    switchingProjectRef,
    creatingProjectRef,
    projectSwitchSeqRef,
    projectHydratedRef,
    folderRestoreHandledSeqRef,
    folderPresentKeysRef,
    projectNameDirtyRef,
    lastAppliedSyncLockRef,
    userAdjustedViewRef,
    initialHydratedRef: _initialHydratedRef,
  },
  ui: {
    setActiveProjectId,
    setProjectList,
    setSyncStatus,
    setSyncLock,
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
    showSearch,
    setShowSearch,
    searchQuery,
    setSearchQuery,
    architectureOpen,
    setArchitectureOpen,
  },
  deps: {
    loaded: _loaded,
    activeProjectId,
    projectList,
    projectDeleteTarget,
    folderHandle,
    resetProjectUiParts: { resetCanvasUi, resetClusterUi, resetAgentUi },
    loadProjectIntoState,
    continueProjectSwitchBackground,
    loadAgentChatThreadIndexEarly,
    singleConnectorId,
    syncActiveProjectNameFromIndex,
    linkProjectFolder,
    warnFolderNameMismatch,
    scanFolder,
    reconcileAllThreadChatCards,
    requestStructuralSync,
    fitCanvasViewToCards,
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
    resetCanvasUi,
    resetClusterUi,
    resetAgentUi,
  ]);

  const switchProject = useCallback(async (targetId) => {
    if (!targetId || targetId === activeProjectIdRef.current) return;
    perfMark('switch/start');
    const switchSeq = ++projectSwitchSeqRef.current;
    switchingProjectRef.current = true;
    setProjectSwitchLoading(true);
    setPendingSwitchProjectId(targetId);

    const previousActiveId = activeProjectIdRef.current;
    const outgoingProjectId = previousActiveId;
    const outgoingState =
      outgoingProjectId ? { ...stateRef.current } : null;
    const outgoingStaged = outgoingProjectId
      ? [...stagedSyncCardsRef.current]
      : [];
    const outgoingPlacements = outgoingProjectId
      ? patchPlacementsMapFromArrays(
        getCommittedPayload(outgoingProjectId)?.artifactPlacements ?? {},
        outgoingState?.cards ?? [],
        outgoingStaged,
      )
      : null;

    try {
      if (outgoingProjectId) {
        await commitProjectDocument(outgoingProjectId, {
          state: outgoingState,
          stagedSyncCards: outgoingStaged,
          artifactPlacements: outgoingPlacements,
          suppressedSyncKeys: suppressedKeysForSave(outgoingProjectId, outgoingState),
          stripNoteContent:
            Boolean(folderHandle)
            && Boolean(folderPresentKeysRef.current?.length)
            && isServerSyncEnabled(),
          reason: 'projectSwitch:outgoing',
        });
        clearCommittedPayloadCache(outgoingProjectId);
      }

      resetProjectUi();
      projectHydratedRef.current.delete(targetId);

      activeProjectIdRef.current = targetId;
      const index = await loadProjectIndex();
      const row = index?.projects?.find((p) => p.id === targetId);
      projectNameDirtyRef.current = false;
      setSyncLock('live');
      lastAppliedSyncLockRef.current = 'live';
      setSyncStatus(clearStaleSyncBanners);
      setState((prev) => ({
        ...prev,
        ...buildSwitchPlaceholderState(row, strings.defaultProjectName),
      }));

      folderRestoreHandledSeqRef.current = null;

      const [, cards] = await Promise.all([
        loadAgentChatThreadIndexEarly(targetId, singleConnectorId),
        loadProjectIntoState(targetId, {
          switchSeq,
          hydratePreviews: false,
          localOnly: true,
        }),
      ]);
      perfMark('switch/paint');
      perfMeasure('switch/paint', 'switch/start', 'switch/paint');

      const switchStillCurrent = projectSwitchSeqRef.current === switchSeq;

      if (switchStillCurrent && cards != null && reconcileAllThreadChatCards()) {
        requestStructuralSync();
      }

      if (cards == null) {
        if (switchStillCurrent) {
          activeProjectIdRef.current = previousActiveId ?? null;
          setSyncStatus({ error: strings.projects.switchLoadFailed });
          setTimeout(() => setSyncStatus(null), 6000);
        }
      } else if (switchStillCurrent) {
        setActiveProjectId(targetId);
        await persistActiveProjectId(targetId);
        const view = stateRef.current.canvasView;
        userAdjustedViewRef.current = Boolean(
          view
          && Number.isFinite(view.x)
          && Number.isFinite(view.y)
          && Number.isFinite(view.zoom),
        );
        const refreshedIndex = await loadProjectIndex();
        syncActiveProjectNameFromIndex(refreshedIndex);
        void continueProjectSwitchBackground(targetId, switchSeq, {
          projectId: outgoingProjectId,
          state: outgoingState,
          stagedSyncCards: outgoingStaged,
          artifactPlacements: outgoingPlacements,
        });
        void (async () => {
          if (projectSwitchSeqRef.current !== switchSeq) return;
          setFolderLinkInProgress(true);
          let switchLinkResult = {
            granted: false,
            handle: null,
            stored: false,
          };
          try {
            switchLinkResult = await linkProjectFolder(targetId, {
              requestIfNeeded: true,
              switchSeq,
            });
            if (projectSwitchSeqRef.current !== switchSeq) return;
            if (switchLinkResult.granted && switchLinkResult.handle) {
              warnFolderNameMismatch(targetId, switchLinkResult.handle);
              try {
                await scanFolder(switchLinkResult.handle, {
                  baseCards: cards ?? [],
                  projectId: targetId,
                });
                if (projectSwitchSeqRef.current === switchSeq) {
                  folderRestoreHandledSeqRef.current = { projectId: targetId, switchSeq };
                }
              } catch (scanErr) {
                console.warn('Folder scan after project switch failed:', scanErr);
              }
            }
          } finally {
            if (projectSwitchSeqRef.current === switchSeq) {
              setFolderLinkInProgress(false);
            }
          }
        })();
      }
    } catch (e) {
      console.error('Project switch failed:', e);
      if (projectSwitchSeqRef.current === switchSeq) {
        activeProjectIdRef.current = previousActiveId ?? null;
        setSyncStatus({ error: strings.projects.switchLoadFailed });
        setTimeout(() => setSyncStatus(null), 6000);
      }
    } finally {
      if (projectSwitchSeqRef.current === switchSeq) {
        switchingProjectRef.current = false;
        setPendingSwitchProjectId(null);
        setFolderLinkInProgress(false);
      }
      setProjectSwitchLoading(false);
    }
  }, [
    activeProjectIdRef,
    stateRef,
    stagedSyncCardsRef,
    switchingProjectRef,
    projectSwitchSeqRef,
    projectHydratedRef,
    folderRestoreHandledSeqRef,
    folderPresentKeysRef,
    projectNameDirtyRef,
    lastAppliedSyncLockRef,
    userAdjustedViewRef,
    setProjectSwitchLoading,
    setPendingSwitchProjectId,
    setFolderLinkInProgress,
    setActiveProjectId,
    setSyncLock,
    setSyncStatus,
    setState,
    resetProjectUi,
    folderHandle,
    clearStaleSyncBanners,
    loadProjectIntoState,
    loadAgentChatThreadIndexEarly,
    singleConnectorId,
    syncActiveProjectNameFromIndex,
    continueProjectSwitchBackground,
    linkProjectFolder,
    warnFolderNameMismatch,
    scanFolder,
    reconcileAllThreadChatCards,
    requestStructuralSync,
  ]);

  const handleCreateProject = useCallback(async (projectName = strings.defaultProjectName) => {
    if (creatingProjectRef.current || switchingProjectRef.current) return;
    creatingProjectRef.current = true;
    const switchSeq = ++projectSwitchSeqRef.current;
    switchingProjectRef.current = true;
    setProjectSwitchLoading(true);

    const outgoingProjectId = activeProjectIdRef.current;
    const outgoingState =
      outgoingProjectId ? { ...stateRef.current } : null;
    const outgoingStaged = outgoingProjectId
      ? [...stagedSyncCardsRef.current]
      : [];

    try {
      if (outgoingProjectId) {
        await saveProjectById(
          outgoingProjectId,
          outgoingState,
          outgoingStaged,
          { persistLocal: true },
        );
      }
      resetProjectUi();
      const { index, projectId } = await createNewProject(projectName);
      const duplicatesMerged = consumeDuplicateMergeNotice();
      if (duplicatesMerged > 0) {
        setSyncStatus({
          toast: strings.projects.mergedDuplicates(duplicatesMerged),
        });
        setTimeout(() => setSyncStatus(null), 6000);
      }
      const row = index.projects.find((p) => p.id === projectId);
      const placeholder = buildSwitchPlaceholderState(
        row,
        strings.defaultProjectName,
      );
      activeProjectIdRef.current = projectId;
      setActiveProjectId(projectId);
      setProjectList(projectsForMenuFromIndex(index));
      setState((prev) => {
        const next = {
          ...prev,
          ...placeholder,
          stagedSyncCards: [],
          suppressedSyncKeys: [],
        };
        stateRef.current = next;
        return next;
      });
      stagedSyncCardsRef.current = [];
      await persistActiveProjectId(projectId);
      const cards = await loadProjectIntoState(projectId, {
        switchSeq,
        hydratePreviews: false,
        localOnly: true,
      });
      if (cards == null) {
        setSyncStatus({ error: strings.projects.switchLoadFailed });
        setTimeout(() => setSyncStatus(null), 6000);
        setProjectSwitchLoading(false);
      } else {
        fitCanvasViewToCards(cards);
        setProjectSwitchLoading(false);
      }
    } catch (e) {
      console.error('Create project switch failed:', e);
      setSyncStatus({ error: strings.projects.switchLoadFailed });
      setTimeout(() => setSyncStatus(null), 6000);
    } finally {
      creatingProjectRef.current = false;
      switchingProjectRef.current = false;
      setProjectSwitchLoading(false);
    }
    if (activeProjectIdRef.current) {
      void continueProjectSwitchBackground(activeProjectIdRef.current, switchSeq, {
        projectId: outgoingProjectId,
        state: outgoingState,
        stagedSyncCards: outgoingStaged,
      });
    } else {
      setProjectSwitchLoading(false);
    }
  }, [
    activeProjectIdRef,
    stateRef,
    stagedSyncCardsRef,
    creatingProjectRef,
    switchingProjectRef,
    projectSwitchSeqRef,
    setProjectSwitchLoading,
    setActiveProjectId,
    setProjectList,
    setState,
    setSyncStatus,
    resetProjectUi,
    loadProjectIntoState,
    fitCanvasViewToCards,
    continueProjectSwitchBackground,
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
    const result = await deleteProject(id);
    if (!result.ok) {
      setSyncStatus({ error: strings.projects.cannotDeleteLast });
      setTimeout(() => setSyncStatus(null), 2500);
      return;
    }
    setProjectList(projectsForMenuFromIndex(result.index));
    if (result.switchToId) {
      await switchProject(result.switchToId);
    } else {
      const index = await ensureProjectIndex();
      setProjectList(projectsForMenuFromIndex(index));
    }
  }, [
    projectDeleteTarget,
    switchProject,
    setProjectDeleteTarget,
    setProjectList,
    setSyncStatus,
  ]);

  const connectedFolderName = useMemo(() => {
    if (!activeProjectId) return null;
    const row = projectList.find((p) => p.id === activeProjectId);
    return row?.connectedFolderName ?? null;
  }, [projectList, activeProjectId]);

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
