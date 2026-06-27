import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSyncLockListener } from '../sync/useSyncLockListener.js';
import { useSyncStreams } from '../sync/useSyncStreams.js';
import { useWorkspaceIndexSync } from '../sync/useWorkspaceIndexSync.js';
import { useActionSync } from '../sync/useActionSync.js';
import { useProjectSyncLifecycle } from '../sync/useProjectSyncLifecycle.js';
import { useFolderLinkScan } from '../sync/useFolderLinkScan.js';
import { useAgentChatShell } from '../agent/useAgentChatShell.js';
import { useClusterContext } from '../cluster/useClusterContext.js';
import { useCanvasDocument } from '../canvas/useCanvasDocument.js';
import { useProjectWorkspace } from './useProjectWorkspace.js';
import { useVisibilitySync } from '../sync/useVisibilitySync.js';
import { useProjectCacheEviction } from '../sync/useProjectCacheEviction.js';
import { DEFAULT_SINGLE_CONNECTOR_ID } from '../../lib/agentConnectors.js';
import { strings } from '../../content/strings.js';
import {
  getClientRevision,
  projectsForMenuFromIndex,
  saveProjectIndex,
} from '../../lib/projects.js';
import { getCommittedPayload } from '../../lib/persistence.js';
import {
  fetchCanvasIndexDocument,
  fetchCanvasProjectDocument,
} from '../../lib/canvasProjectsApi.js';
import { buildProjectionSnapshot } from '../../lib/syncProjectionInvariants.js';
import { resolveProjectDisplayName } from '../../lib/projectDisplayName.js';
import { buildWorkspaceViewBundles } from './buildWorkspaceViewBundles.js';
import { useWorkspaceProjection } from './useWorkspaceProjection.js';

/**
 * Composes all feature hooks and builds view props for CanvasWorkspaceView (Phase 2).
 */
export function useAppShell() {
  const [state, setState] = useState({
    projectName: strings.defaultProjectName,
    cards: [],
    canvasView: { x: 0, y: 0, zoom: 1 },
  });
  const [loaded, setLoaded] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [projectList, setProjectList] = useState([]);
  const [indexActiveProjectId, setIndexActiveProjectId] = useState(null);
  const [projectDeleteTarget, setProjectDeleteTarget] = useState(null);
  const [archiveLastTarget, setArchiveLastTarget] = useState(null);
  const [createProjectPromptOpen, setCreateProjectPromptOpen] = useState(false);
  const [projectSwitchLoading, setProjectSwitchLoading] = useState(false);
  /** Menu highlight during switch before React activeProjectId commits. */
  const [pendingSwitchProjectId, setPendingSwitchProjectId] = useState(null);
  const switchingProjectRef = useRef(false);
  const creatingProjectRef = useRef(false);
  const projectSwitchSeqRef = useRef(0);
  /** Project ids that finished at least one successful loadProjectIntoState. */
  const projectHydratedRef = useRef(new Set());
  /** When set, post-switch useEffect skips redundant folder restore/scan. */
  const folderRestoreHandledSeqRef = useRef(
    /** @type {{ projectId: string, switchSeq: number } | null} */ (null),
  );
  const bootCompletedRef = useRef(false);
  const initialHydratedRef = useRef(false);
  /** @type {import('react').MutableRefObject<{ projectId: string, traceId?: string | null, options?: object } | null>} */
  const pendingPlacementTransferSyncRef = useRef(null);
  const lastLoadedCardsRef = useRef([]);
  const attemptRestoreRef = useRef(async () => {});
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeProjectIdRef = useRef(activeProjectId);
  const clusterContextProjectIdRef = useRef(null);
  const refreshGraphRef = useRef(async () => {});
  const applyClusterContextForProjectRef = useRef(async () => null);
  const refreshProjectClusterStateRef = useRef(async () => ({
    ok: false,
    clusterId: null,
  }));
  const refreshClusterApiHealthRef = useRef(async () => ({
    available: false,
    reason: 'db_unavailable',
  }));
  const activeThreadIdRef = useRef(null);
  const agentChatThreadIndexRef = useRef({
    version: 1,
    activeThreadId: null,
    threads: [],
  });
  const loadAgentChatThreadIndexEarlyRef = useRef(async () => {});
  const singleConnectorIdRef = useRef(DEFAULT_SINGLE_CONNECTOR_ID);
  const flushPendingPlacementTransferSyncRef = useRef(() => {});
  /** @type {import('react').MutableRefObject<{ projectId: string, artifactPlacements?: object | null, reason?: string, traceId?: string | null } | null>} */
  const pendingPlacementCommitRef = useRef(null);
  const flushPendingPlacementCommitRef = useRef(async () => {});
  const flushPendingPlacementCommitForSwitchRef = useRef(async () => {});
  const projectNameDirtyRef = useRef(false);
  const canMutateCanvasRef = useRef(false);
  const committedProjectIdRef = useRef(null);
  const projectionBootRef = useRef(
    /** @type {{ commitBootWithRecovery?: Function; selectProject?: Function } | null} */ (
      null
    ),
  );
  const syncLockRef = useRef('live');
  const lastAppliedSyncLockRef = useRef('live');
  const {
    syncLock,
    setSyncLock,
    syncStatus,
    setSyncStatus,
  } = useSyncLockListener({
    activeProjectIdRef,
    syncLockRef,
    lastAppliedSyncLockRef,
  });
  const refreshingFromServerRef = useRef(false);
  const canEditCanvas = loaded && syncLock !== 'offline';

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const alignProjectTitleFromIndex = useCallback(
    (projectId, index) => {
      if (!projectId) return;
      projectNameDirtyRef.current = false;
      const name = resolveProjectDisplayName(
        index,
        projectId,
        strings.defaultProjectName,
      );
      stateRef.current = { ...stateRef.current, projectName: name };
      setState((prev) => ({ ...prev, projectName: name }));
    },
    [setState],
  );

  const [folderHandle, setFolderHandle] = useState(null);
  /** True when this browser has a persisted folder handle for the active project. */
  const [folderStoredOnDevice, setFolderStoredOnDevice] = useState(false);
  const [folderLinkProbeComplete, setFolderLinkProbeComplete] = useState(false);
  const [folderLinkInProgress, setFolderLinkInProgress] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [architectureOpen, setArchitectureOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const stagedSyncCardsRef = useRef([]);
  const userAdjustedViewRef = useRef(false);
  const pendingFitToExtentRef = useRef(false);
  const pendingFitCardsRef = useRef(null);
  const canvasViewportSizeRef = useRef({ width: 0, height: 0 });
  const agentChatArtifactMetaRef = useRef({
    artifactRef: null,
    filename: null,
    cardId: null,
  });
  const clusterMemberOptionsRef = useRef({
    threads: [],
    connectorId: DEFAULT_SINGLE_CONNECTOR_ID,
  });
  const folderScanSeqRef = useRef(0);
  const folderPickerInFlightRef = useRef(false);
  const invalidateFolderScan = useCallback(() => {
    folderScanSeqRef.current += 1;
  }, []);
  const requestStructuralSyncRef = useRef(() => Promise.resolve());
  const requestPlacementTransferSyncRef = useRef(async () => {});
  const commitPlacementStateRef = useRef(async () => {});
  const setAgentChatThreadIndexRef = useRef(() => {});
  const [changeFolderDialog, setChangeFolderDialog] = useState(false);
  /** Keys seen on disk at last successful folder scan; null = never scanned or no folder */
  const [folderPresentKeys, setFolderPresentKeys] = useState(null);
  const folderPresentKeysRef = useRef(null);
  const [primitiveTableOpen, setPrimitiveTableOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createClusterOpen, setCreateClusterOpen] = useState(false);
  const [creatingCluster, setCreatingCluster] = useState(false);

  const {
    refreshProjectListFromServer,
    refreshProjectListFromServerRef,
    syncActiveProjectNameFromIndex,
    applyDuplicateNameBanner,
  } = useWorkspaceIndexSync({
    activeProjectIdRef,
    committedProjectIdRef,
    switchingProjectRef,
    projectSwitchLoading,
    projectNameDirtyRef,
    stateRef,
    attemptRestoreRef,
    lastLoadedCardsRef,
    setProjectList,
    setIndexActiveProjectId,
    setSyncStatus,
    setState,
    loaded,
  });

  const {
    clusterId,
    setClusterId,
    inspectorOpen,
    inspectorSelection,
    selectedClusterId,
    setSelectedClusterId,
    clusterInspectorReload,
    clusterApiAvailable,
    clusterApiReason,
    canvasEdges,
    linkCountByCardId,
    clusterHullSource,
    workspaceTreeOpen,
    setWorkspaceTreeOpen,
    workspaceTreeReloadKey,
    selectedCardIds,
    removeCardFromSelection,
    toggleCardSelect,
    clearCardSelection,
    refreshGraph,
    applyClusterContextForProject,
    handleClusterRenamed,
    closeInspector,
    openInspector,
    closeWorkspaceTree,
    toggleWorkspaceTree,
    handleCreateClusterFromSelection,
    highlightedClusterId,
    clusterApiUnavailableMessage,
    resetClusterUi,
    refreshClusterApiHealth,
  } = useClusterContext({
    refs: {
      activeProjectIdRef,
      stateRef,
      clusterContextProjectIdRef,
      refreshGraphRef,
      applyClusterContextForProjectRef,
      refreshProjectClusterStateRef,
      refreshClusterApiHealthRef,
    },
    deps: {
      loaded,
      activeProjectId,
      projectSwitchLoading,
      state,
      setSyncStatus,
      switchingProjectRef,
      refreshingFromServerRef,
      clusterMemberOptionsRef,
      setCreatingCluster,
      setCreateClusterOpen,
    },
  });

  const folderKeySet = useMemo(
    () => (folderPresentKeys ? new Set(folderPresentKeys) : null),
    [folderPresentKeys],
  );

  const {
    activeCardId,
    setActiveCardId,
    openCardId,
    setOpenCardId,
    closeOpenCard,
    registerFlowFlush,
    versionStackOpen,
    setVersionStackOpen,
    confirmChanges,
    setConfirmChanges,
    stagedSyncCards,
    setStagedSyncCards,
    stagingDragActive,
    stagingDragActiveRef,
    trayRevealActive,
    setTrayRevealActive,
    cardDockHover,
    trayDropRectRef,
    canvasElement,
    setCanvasElement,
    canvasViewportSize,
    setCanvasViewportSize,
    savingNote,
    savingTask,
    savingLink,
    savingFlow,
    savingLive,
    savingAgent,
    savingSonicStudio,
    savingCardId,
    setCanvasView,
    fitCanvasViewToCards,
    handleInteractionCommit,
    handleCommitCanvasView,
    handleStagingDragActiveChange,
    resetCanvasUi,
    handleRestoreDockToCanvas,
    applySyncChanges,
    applySyncChangesFromList,
    handleCardDragMove,
    handleCardDragEnd,
    dockCardToTray,
    placeStagedSyncCard,
    updateCard,
    batchUpdateCardPositions,
    handleCommitCardPosition,
    pinVersion,
    handleUpdateVersion,
    handleNoteSaveStatus,
    persistCardEdits,
    handleInlineSaveUserNote,
    handleInlineSaveUserTask,
    handleInlineSaveMarkdown,
    handleInlineSaveBookmark,
    handleSaveNoteToProject,
    handleSaveTaskToProject,
    handleSaveNewNote,
    handleSaveNewTask,
    handleSaveNewLink,
    handleSaveNewFlow,
    handleSaveNewLive,
    handleSaveNewAgent,
    handleSaveNewBeatAgent,
    handleSaveNewSonicStudio,
    handleUpdateSonicStudioCard,
    appendGeneratedCards,
    handleFlowCardRefresh,
    removeCard,
    rehydratePreview,
    filteredCards,
  } = useCanvasDocument({
    refs: {
      activeProjectIdRef,
      stateRef,
      stagedSyncCardsRef,
      switchingProjectRef,
      initialHydratedRef,
      agentChatThreadIndexRef,
      activeThreadIdRef,
      agentChatArtifactMetaRef,
      userAdjustedViewRef,
      pendingFitToExtentRef,
      pendingFitCardsRef,
      canvasViewportSizeRef,
      clusterContextProjectIdRef,
      singleConnectorIdRef,
      canMutateCanvasRef,
    },
    deps: {
      state,
      setState,
      loaded,
      folderHandle,
      folderKeySet,
      clusterId,
      searchQuery,
      setSyncStatus,
      setAgentChatThreadIndex: (...args) => setAgentChatThreadIndexRef.current(...args),
      commitPlacementState: (...args) => commitPlacementStateRef.current(...args),
      requestStructuralSync: (...args) => requestStructuralSyncRef.current(...args),
      requestPlacementTransferSync: (...args) =>
        requestPlacementTransferSyncRef.current(...args),
      invalidateFolderScan,
      refreshGraph,
      removeCardFromSelection,
      setFolderPresentKeys,
      setClusterId,
      setNewNoteOpen,
      setNewTaskOpen,
      setAddLinkOpen,
    },
  });

  const {
    applyServerPullResult,
    applyReconcileFromServer,
    handleRefreshFromServer,
    resolveProjectConflictUseServer,
    resolveProjectConflictKeepLocal,
    loadProjectIntoState,
    loadProjectIntoStateRef,
    handleClearLocalCache,
    flushOutgoingProjectToServer,
    finishBootUi,
    continueProjectSwitchBackground,
    pullActiveProjectFromServer,
    syncCanvasFromServerAfterFolderConnect,
    persistProjectDisplayName,
    commitProjectDisplayName,
    applyServerPullResultRef,
    backgroundSyncStartedRef,
  } = useProjectSyncLifecycle({
    refs: {
      activeProjectIdRef,
      committedProjectIdRef,
      projectNameDirtyRef,
      stateRef,
      stagedSyncCardsRef,
      folderPresentKeysRef,
      lastLoadedCardsRef,
      userAdjustedViewRef,
      projectHydratedRef,
      switchingProjectRef,
      initialHydratedRef,
      projectSwitchSeqRef,
      bootCompletedRef,
      refreshingFromServerRef,
      lastAppliedSyncLockRef,
      attemptRestoreRef,
      folderRestoreHandledSeqRef,
    },
    ui: {
      setLoaded,
      setSyncStatus,
      setSyncLock,
      setState,
      setStagedSyncCards,
      setProjectList,
      setActiveProjectId,
      setProjectSwitchLoading,
      setFolderPresentKeys,
    },
    deps: {
      loaded,
      activeProjectId,
      singleConnectorIdRef,
      folderHandle,
      projectSwitchLoading,
      state,
      fitCanvasViewToCards,
      syncActiveProjectNameFromIndex,
      applyDuplicateNameBanner,
      refreshProjectListFromServer,
      refreshProjectListFromServerRef,
      refreshClusterApiHealth: () => refreshClusterApiHealthRef.current(),
      applyClusterContextForProject: (...args) =>
        applyClusterContextForProjectRef.current(...args),
      applyClusterContextForProjectRef,
      flushPendingPlacementTransferSync: () =>
        flushPendingPlacementTransferSyncRef.current(),
      flushPendingPlacementCommit: () =>
        flushPendingPlacementCommitRef.current(),
      flushPendingPlacementCommitForSwitch: (projectId) =>
        flushPendingPlacementCommitForSwitchRef.current(projectId),
      loadAgentChatThreadIndexEarlyRef,
      agentChatThreadIndexRef,
      activeThreadIdRef,
      projectionBootRef,
      projectListLength: projectList.length,
    },
  });

  /** @deprecated alias */
  const applySyncLockFromServer = applyReconcileFromServer;

  const {
    requestStructuralSync,
    requestPlacementTransferSync,
    flushPendingPlacementTransferSync,
    flushPendingPlacementCommit,
    flushPendingPlacementCommitForSwitch,
    commitPlacementState,
  } = useActionSync({
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
    setAgentChatThreadIndex: (...args) => setAgentChatThreadIndexRef.current(...args),
    setSyncStatus,
  });

  useEffect(() => {
    flushPendingPlacementTransferSyncRef.current = flushPendingPlacementTransferSync;
    flushPendingPlacementCommitRef.current = flushPendingPlacementCommit;
    flushPendingPlacementCommitForSwitchRef.current =
      flushPendingPlacementCommitForSwitch;
  }, [
    flushPendingPlacementTransferSync,
    flushPendingPlacementCommit,
    flushPendingPlacementCommitForSwitch,
  ]);

  const {
    agentPanelOpen,
    setAgentPanelOpen,
    agentContextMode,
    setAgentContextMode,
    enabledAgentIds,
    toggleEnabledAgent,
    agentMessages,
    setAgentMessages,
    agentPanelMode,
    setAgentPanelMode,
    singleConnectorId,
    setSingleConnectorId,
    agentConnectors,
    agentTemplates,
    activeAgentTemplateId,
    activeAgentTemplate,
    activeAgentThread,
    threadAgentTemplate,
    selectedAgentTypeDiffersFromThread,
    activeThreadAgentTypeCompatible,
    selectedThreadNeedsDefaultAgentType,
    handleSelectAgentTemplate,
    handleSaveAgentTemplate,
    handleDeleteAgentTemplate,
    handleImportMasterAgentTemplates,
    handleApplyAgentTypeToActiveThread,
    handleUseDefaultAgentTypeForActiveThread,
    agentSecretsConfigured,
    agentConnectorsOffline,
    agentOpenaiReachable,
    agentOpenaiReachabilityError,
    ollamaPullState,
    refreshAgentConnectors,
    retryOllamaPull,
    registerEmbeddedAgentPanelOpen,
    handleSaveAgentApiKey,
    apiKeySaving,
    handleClearAgentApiKey,
    agentContextStatusByCardId,
    setAgentContextStatusByCardId,
    agentExtendedContext,
    setAgentExtendedContext,
    setAgentExtendedContextPersisted,
    agentContextEstimates,
    agentLastTokenEstimate,
    agentChatMessages,
    setAgentChatMessages,
    agentChatLoading,
    agentChatError,
    setAgentChatError,
    agentChatArtifactRef,
    agentChatArtifactSyncReason,
    agentChatPersistTrimmed,
    chatSyncRetrying,
    agentChatTranscriptRevision,
    activeThreadId,
    setActiveThreadId,
    agentChatThreadIndex,
    setAgentChatThreadIndex,
    threadPickerOpen,
    setThreadPickerOpen,
    loadAgentChatThreadIndexEarly,
    persistAgentChatSession,
    requestThreadTranscriptSync,
    ensureThreadChatCardOnCanvas,
    reconcileAllThreadChatCards,
    loadThreadSessionIntoState,
    refreshAgentChatThreads,
    handleCreateAgentThread,
    handleSelectAgentThread,
    handleRenameAgentThread,
    handleSwitchAgentThread,
    handleDeleteAgentThread,
    handleRetryChatSync,
    handleClearAgentChat,
    handleRefreshContextSession,
    handleRemoveContextCard,
    handleAgentSendMessage,
    handleAgentChatCardActivate,
    showAgentComingSoon,
    agentContextCards,
    contextDeliveryState,
    agentContextDeliveryByCardId,
    agentChatLiveCardId,
    clusterMemberOptions,
    closeAgentPanel,
    toggleAgentPanel,
    registerFlowContextLoader,
    agentPanelCollapsedSections,
    handleAgentPanelCollapsedSectionsChange,
    chatScrollResetKey,
  } = useAgentChatShell({
    refs: {
      activeProjectIdRef,
      stateRef,
      stagedSyncCardsRef,
      switchingProjectRef,
      activeThreadIdRef,
      agentChatThreadIndexRef,
      loadAgentChatThreadIndexEarlyRef,
      singleConnectorIdRef,
      agentChatArtifactMetaRef,
    },
    deps: {
      activeProjectId,
      projectSwitchLoading,
      folderHandle,
      state,
      stateProjectName: state.projectName,
      selectedCardIds,
      canvasViewportSize,
      canvasView: state.canvasView,
      requestStructuralSync,
      removeCardFromSelection,
      setActiveCardId,
      setSyncStatus,
      setState,
      setStagedSyncCards,
      setTrayRevealActive,
      initialHydratedRef,
    },
  });

  useEffect(() => {
    requestStructuralSyncRef.current = requestStructuralSync;
    requestPlacementTransferSyncRef.current = requestPlacementTransferSync;
    commitPlacementStateRef.current = commitPlacementState;
    setAgentChatThreadIndexRef.current = setAgentChatThreadIndex;
  }, [requestStructuralSync, requestPlacementTransferSync, commitPlacementState, setAgentChatThreadIndex]);

  useEffect(() => {
    clusterMemberOptionsRef.current = clusterMemberOptions;
  }, [clusterMemberOptions]);

  useSyncStreams({
    loaded,
    activeProjectId,
    activeProjectIdRef,
    committedProjectIdRef,
    loadProjectIntoStateRef,
    refreshProjectListFromServerRef,
    switchingProjectRef,
  });

  useProjectCacheEviction({
    activeProjectId,
    projectListLength: projectList.length,
  });

  useEffect(() => {
    folderPresentKeysRef.current = folderPresentKeys;
  }, [folderPresentKeys]);

  const {
    linkProjectFolder,
    warnFolderNameMismatch,
    scanFolder,
    probeFolderStoredOnDevice,
    attemptRestoreFolderForProject,
    requestFolder,
    importFilesToDock,
    pickProjectDirectory,
    applyFolderHandleAndScan,
    handleReconnectFolder,
    handleSyncClick,
    beginChangeFolder,
  } = useFolderLinkScan({
    refs: {
      activeProjectIdRef,
      committedProjectIdRef,
      projectSwitchSeqRef,
      folderRestoreHandledSeqRef,
      lastLoadedCardsRef,
      attemptRestoreRef,
      stateRef,
      stagedSyncCardsRef,
      folderScanSeqRef,
      folderPresentKeysRef,
      folderPickerInFlightRef,
      switchingProjectRef,
      setChangeFolderDialog,
    },
    ui: {
      setFolderHandle,
      setFolderStoredOnDevice,
      setFolderLinkProbeComplete,
      setFolderLinkInProgress,
      setSyncStatus,
      setState,
      setStagedSyncCards,
      setProjectList,
      setConfirmChanges,
      setOpenCardId,
      setActiveCardId,
      setVersionStackOpen,
      setTrayRevealActive,
      setClusterId,
      setFolderPresentKeys,
    },
    deps: {
      loaded,
      activeProjectId,
      projectSwitchLoading,
      folderHandle,
      folderStoredOnDevice,
      folderLinkInProgress,
      folderLinkProbeComplete,
      folderPresentKeys,
      projectList,
      commitPlacementState,
      flushPendingPlacementCommit,
      applySyncChangesFromList,
      refreshGraph,
      refreshProjectClusterState: (...args) =>
        refreshProjectClusterStateRef.current(...args),
      syncCanvasFromServerAfterFolderConnect,
      loadProjectIntoStateRef,
      pullActiveProjectFromServer,
      invalidateFolderScan,
      agentChatThreadIndexRef,
      stagingDragActiveRef,
      clusterContextProjectIdRef,
    },
  });

  attemptRestoreRef.current = attemptRestoreFolderForProject;

  const clearStaleSyncBannersForProjection = useCallback((prev) => {
    if (
      prev?.banner === strings.projects.serverRevisionStale
      || prev?.banner === strings.projects.remoteChangesWhileEditing
    ) {
      return null;
    }
    return prev;
  }, []);

  const resetProjectUiForProjection = useCallback(async () => {
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
    setDiagnosticsOpen(false);
    setAgentPanelOpen(false);
    setAgentMessages([]);
    setActiveThreadId(null);
    setAgentChatThreadIndex({ version: 1, activeThreadId: null, threads: [] });
    setThreadPickerOpen(false);
    await resetCanvasUi?.();
    resetClusterUi?.();
  }, [
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
  ]);

  const {
    projection,
    selectProject,
    commitBootWithRecovery,
    restoreWorkspaceProject,
  } = useWorkspaceProjection({
    refs: {
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
      canMutateCanvasRef,
      committedProjectIdRef,
    },
    ui: {
      activeProjectId,
      pendingSwitchProjectId,
      projectSwitchLoading,
      projectList,
      loaded,
      indexActiveProjectId,
      stateProjectName: state.projectName,
      setActiveProjectId,
      setPendingSwitchProjectId,
      setProjectSwitchLoading,
      setProjectList,
      setIndexActiveProjectId,
      setSyncStatus,
      setSyncLock,
      setState,
      setFolderLinkInProgress,
    },
    deps: {
      folderHandle,
      getClientRevision,
      loadProjectIntoState,
      loadProjectIntoStateRef,
      loadAgentChatThreadIndexEarly,
      singleConnectorId,
      syncActiveProjectNameFromIndex,
      alignProjectTitleFromIndex,
      continueProjectSwitchBackground,
      linkProjectFolder,
      warnFolderNameMismatch,
      scanFolder,
      reconcileAllThreadChatCards,
      requestStructuralSync,
      resetProjectUi: resetProjectUiForProjection,
      clearStaleSyncBanners: clearStaleSyncBannersForProjection,
      flushPendingPlacementCommit,
      flushPendingPlacementCommitForSwitch,
      refreshProjectClusterState: (...args) =>
        refreshProjectClusterStateRef.current(...args),
    },
  });

  projectionBootRef.current = {
    commitBootWithRecovery,
    selectProject,
  };

  useEffect(() => {
    if (!projection.canMutateCanvas) return;
    void flushPendingPlacementCommitRef.current();
  }, [projection.canMutateCanvas]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    window.__canvasProjectionSnapshot = () => ({
      ...buildProjectionSnapshot({
        pendingSwitchProjectId,
        activeProjectId,
        loadedProjectId: activeProjectIdRef.current,
        projectName: stateRef.current.projectName,
        cardCount: stateRef.current.cards?.length ?? 0,
        clientRevision: projection.effectiveProjectId
          ? getClientRevision(projection.effectiveProjectId)
          : null,
        projectListLength: projectList.length,
        projectSwitchLoading,
      }),
      phase: projection.phase,
      hydrated: projection.hydrated,
      canMutateCanvas: projection.canMutateCanvas,
      canMutateCanvasRef: canMutateCanvasRef.current,
      pendingPlacementCommit: Boolean(pendingPlacementCommitRef.current),
      switchingProject: switchingProjectRef.current,
      creatingProject: creatingProjectRef.current,
    });
    window.__canvasDocumentSnapshot = (projectId) => {
      const id = projectId ?? activeProjectIdRef.current;
      const payload = getCommittedPayload(id);
      const placements = payload?.artifactPlacements ?? {};
      const canvasKeys = Object.entries(placements)
        .filter(([, v]) => v?.surface === 'canvas')
        .map(([k]) => k);
      return {
        projectId: id,
        cardCount: payload?.cards?.length ?? 0,
        stagedCount: payload?.stagedSyncCards?.length ?? 0,
        canvasPlacementKeys: canvasKeys,
      };
    };
    window.__canvasPlacementPersistenceCheck = async (projectId) => {
      const id = projectId ?? activeProjectIdRef.current;
      const liveCards = stateRef.current.cards ?? [];
      const liveStaged = stagedSyncCardsRef.current ?? [];
      const committed = getCommittedPayload(id);
      const server = id ? await fetchCanvasProjectDocument(id) : null;
      const serverPayload = server?.payload ?? null;
      const placementSummary = (payload) => {
        const placements = payload?.artifactPlacements ?? {};
        const canvasPlacementKeys = Object.entries(placements)
          .filter(([, v]) => v?.surface === 'canvas')
          .map(([k]) => k);
        const dockPlacementKeys = Object.entries(placements)
          .filter(([, v]) => v?.surface === 'dock')
          .map(([k]) => k);
        return {
          cardCount: payload?.cards?.length ?? 0,
          stagedCount: payload?.stagedSyncCards?.length ?? 0,
          canvasPlacementKeys,
          dockPlacementKeys,
        };
      };
      const live = {
        cardCount: liveCards.length,
        stagedCount: liveStaged.length,
        canvasKeys: liveCards.map((c) => c.key).filter(Boolean),
        stagedKeys: liveStaged.map((s) => s.key).filter(Boolean),
      };
      const local = placementSummary(committed);
      const remote = placementSummary(serverPayload);
      const liveCanvas = new Set(live.canvasKeys);
      const remoteCanvas = new Set(remote.canvasPlacementKeys);
      const missingOnServer = [...liveCanvas].filter((key) => !remoteCanvas.has(key));
      const serverCanvasWithoutCard = remote.canvasPlacementKeys.filter(
        (key) =>
          !(serverPayload?.cards ?? []).some((card) => card?.key === key),
      );
      const issues = [];
      if (!id) issues.push('No active project id');
      if (!serverPayload) issues.push('No server document for project');
      if (missingOnServer.length) {
        issues.push(`Canvas keys missing on server: ${missingOnServer.join(', ')}`);
      }
      if (serverCanvasWithoutCard.length) {
        issues.push(
          `Server canvas placements without cards: ${serverCanvasWithoutCard.join(', ')}`,
        );
      }
      if (live.cardCount !== remote.cardCount) {
        issues.push(`Live/server card count mismatch: ${live.cardCount}/${remote.cardCount}`);
      }
      if (live.stagedCount !== remote.stagedCount) {
        issues.push(
          `Live/server staged count mismatch: ${live.stagedCount}/${remote.stagedCount}`,
        );
      }
      const result = {
        ok: issues.length === 0,
        projectId: id,
        projectName: stateRef.current.projectName,
        revision: server?.revision ?? 0,
        updatedAt: server?.updatedAt ?? null,
        live,
        local,
        server: remote,
        issues,
      };
      console.info('[canvas-placement-check]', result);
      return result;
    };
    return () => {
      delete window.__canvasProjectionSnapshot;
      delete window.__canvasDocumentSnapshot;
      delete window.__canvasPlacementPersistenceCheck;
    };
  }, [
    pendingSwitchProjectId,
    activeProjectId,
    projection,
    projectList.length,
    projectSwitchLoading,
    getClientRevision,
  ]);

  useVisibilitySync({
    loaded,
    activeProjectIdRef,
    refreshProjectListFromServer,
    refreshClusterApiHealth,
  });

  const {
    switchProject,
    handleCreateProject,
    handleRequestCreateProject,
    handleUnarchiveProject,
    handleArchiveProject,
    handleConfirmDeleteProject,
    connectedFolderName,
    folderDisplayName,
  } = useProjectWorkspace({
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
      initialHydratedRef,
    },
    ui: {
      setActiveProjectId,
      setProjectList,
      setIndexActiveProjectId,
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
      diagnosticsOpen,
      setDiagnosticsOpen,
    },
    deps: {
      loaded,
      activeProjectId,
      effectiveProjectId: projection.effectiveProjectId,
      projectSwitchLoading,
      projectList,
      projectDeleteTarget,
      folderHandle,
      resetProjectUiParts: { resetCanvasUi, resetClusterUi },
      loadProjectIntoState,
      continueProjectSwitchBackground,
      selectProject,
      restoreWorkspaceProject,
      fitCanvasViewToCards,
      setAgentMessages,
      setAgentPanelOpen,
      setActiveThreadId,
      setAgentChatThreadIndex,
      setThreadPickerOpen,
    },
  });

  const handleRefreshProjectsFromServer = useCallback(async () => {
    try {
      const remote = await fetchCanvasIndexDocument();
      const index = remote.index;
      if (index?.projects) {
        await saveProjectIndex(index, { immediate: false });
        setProjectList(projectsForMenuFromIndex(index));
        setIndexActiveProjectId(index.activeProjectId ?? null);
      } else {
        await refreshProjectListFromServer({ reconcileScope: 'none' });
      }
      const targetId =
        index?.activeProjectId
        ?? index?.projects?.find((p) => !p.archived)?.id
        ?? index?.projects?.[0]?.id
        ?? null;
      if (targetId && !activeProjectIdRef.current) {
        await selectProject(targetId);
      }
      setSyncStatus({ syncSuccess: strings.projects.projectsRefreshed });
      setTimeout(() => {
        setSyncStatus((prev) =>
          prev?.syncSuccess === strings.projects.projectsRefreshed ? null : prev,
        );
      }, 4000);
      return index;
    } catch (e) {
      setSyncStatus({
        error: e?.message || strings.projects.projectsRefreshFailed,
      });
      setTimeout(() => setSyncStatus(null), 6000);
      return null;
    }
  }, [
    refreshProjectListFromServer,
    selectProject,
    setProjectList,
    setSyncStatus,
  ]);

  // Cmd-K to open search
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(s => !s);
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
        if (openCardId) {
          void closeOpenCard();
        } else {
          setOpenCardId(null);
          setActiveCardId(null);
        }
        setChangeFolderDialog(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeOpenCard, openCardId, setActiveCardId, setOpenCardId]);

  useEffect(() => {
    if (!folderHandle) setFolderPresentKeys(null);
  }, [folderHandle]);

  const viewProps = buildWorkspaceViewBundles({
    state,
    setState,
    canEditCanvas,
    activeProjectId,
    pendingSwitchProjectId,
    workspaceProjection: projection,
    projectList,
    projectSwitchLoading,
    projectNameDirtyRef,
    folderHandle,
    folderStoredOnDevice,
    folderLinkInProgress,
    folderLinkProbeComplete,
    folderKeySet,
    folderPresentKeys,
    setFolderPresentKeys,
    connectedFolderName,
    folderDisplayName,
    syncStatus,
    syncLock,
    loaded,
    filteredCards,
    activeCardId,
    setActiveCardId,
    openCardId,
    setOpenCardId,
    closeOpenCard,
    registerFlowFlush,
    versionStackOpen,
    setVersionStackOpen,
    confirmChanges,
    setConfirmChanges,
    stagedSyncCards,
    stagingDragActive,
    trayRevealActive,
    cardDockHover,
    trayDropRectRef,
    canvasElement,
    setCanvasElement,
    canvasViewportSize,
    savingNote,
    savingTask,
    savingLink,
    savingFlow,
    savingLive,
    savingAgent,
    savingSonicStudio,
    savingCardId,
    setCanvasView,
    fitCanvasViewToCards,
    handleInteractionCommit,
    handleCommitCanvasView,
    handleStagingDragActiveChange,
    handleRestoreDockToCanvas,
    applySyncChanges,
    handleCardDragMove,
    handleCardDragEnd,
    dockCardToTray,
    placeStagedSyncCard,
    updateCard,
    batchUpdateCardPositions,
    handleCommitCardPosition,
    pinVersion,
    handleUpdateVersion,
    handleNoteSaveStatus,
    handleInlineSaveUserNote,
    handleInlineSaveUserTask,
    handleInlineSaveMarkdown,
    handleInlineSaveBookmark,
    handleSaveNoteToProject,
    handleSaveTaskToProject,
    handleSaveNewNote,
    handleSaveNewTask,
    handleSaveNewLink,
    handleSaveNewFlow,
    handleSaveNewLive,
    handleSaveNewAgent,
    handleSaveNewBeatAgent,
    handleSaveNewSonicStudio,
    handleUpdateSonicStudioCard,
    appendGeneratedCards,
    handleFlowCardRefresh,
    removeCard,
    rehydratePreview,
    clusterId,
    canvasEdges,
    linkCountByCardId,
    refreshGraph,
    openInspector,
    closeInspector,
    selectedCardIds,
    toggleCardSelect,
    clearCardSelection,
    removeCardFromSelection,
    clusterHullSource,
    highlightedClusterId,
    setSelectedClusterId,
    setCanvasViewportSize,
    workspaceTreeOpen,
    workspaceTreeReloadKey,
    closeWorkspaceTree,
    toggleWorkspaceTree,
    clusterInspectorReload,
    handleClusterRenamed,
    handleCreateClusterFromSelection,
    clusterApiAvailable,
    clusterApiUnavailableMessage,
    setSyncStatus,
    setCreateClusterOpen,
    creatingCluster,
    createClusterOpen,
    agentPanelOpen,
    setAgentPanelOpen,
    closeAgentPanel,
    toggleAgentPanel,
    agentPanelMode,
    setAgentPanelMode,
    singleConnectorId,
    setSingleConnectorId,
    agentConnectors,
    agentTemplates,
    activeAgentTemplateId,
    activeAgentTemplate,
    activeAgentThread,
    threadAgentTemplate,
    selectedAgentTypeDiffersFromThread,
    activeThreadAgentTypeCompatible,
    selectedThreadNeedsDefaultAgentType,
    handleSelectAgentTemplate,
    handleSaveAgentTemplate,
    handleDeleteAgentTemplate,
    handleImportMasterAgentTemplates,
    handleApplyAgentTypeToActiveThread,
    handleUseDefaultAgentTypeForActiveThread,
    agentSecretsConfigured,
    agentConnectorsOffline,
    agentOpenaiReachable,
    agentOpenaiReachabilityError,
    ollamaPullState,
    handleSaveAgentApiKey,
    apiKeySaving,
    handleClearAgentApiKey,
    agentChatMessages,
    agentChatLoading,
    agentChatError,
    agentContextMode,
    setAgentContextMode,
    enabledAgentIds,
    toggleEnabledAgent,
    agentContextCards,
    agentContextStatusByCardId,
    agentContextDeliveryByCardId,
    contextDeliveryState,
    handleRefreshContextSession,
    agentExtendedContext,
    setAgentExtendedContextPersisted,
    agentContextEstimates,
    agentLastTokenEstimate,
    agentChatArtifactRef,
    agentChatArtifactSyncReason,
    agentChatPersistTrimmed,
    chatSyncRetrying,
    handleRetryChatSync,
    handleClearAgentChat,
    refreshAgentConnectors,
    retryOllamaPull,
    registerEmbeddedAgentPanelOpen,
    handleRemoveContextCard,
    activeThreadId,
    agentChatThreadIndex,
    threadPickerOpen,
    handleSelectAgentThread,
    handleCreateAgentThread,
    handleRenameAgentThread,
    handleSwitchAgentThread,
    handleDeleteAgentThread,
    agentMessages,
    handleAgentSendMessage,
    showAgentComingSoon,
    handleAgentChatCardActivate,
    agentChatLiveCardId,
    agentChatTranscriptRevision,
    clusterMemberOptions,
    registerFlowContextLoader,
    agentPanelCollapsedSections,
    handleAgentPanelCollapsedSectionsChange,
    chatScrollResetKey,
    inspectorOpen,
    inspectorSelection,
    showSearch,
    setShowSearch,
    searchQuery,
    setSearchQuery,
    architectureOpen,
    setArchitectureOpen,
    diagnosticsOpen,
    setDiagnosticsOpen,
    changeFolderDialog,
    setChangeFolderDialog,
    projectDeleteTarget,
    setProjectDeleteTarget,
    archiveLastTarget,
    setArchiveLastTarget,
    createProjectPromptOpen,
    setCreateProjectPromptOpen,
    primitiveTableOpen,
    setPrimitiveTableOpen,
    newNoteOpen,
    setNewNoteOpen,
    newTaskOpen,
    setNewTaskOpen,
    addLinkOpen,
    setAddLinkOpen,
    createTaskOpen,
    setCreateTaskOpen,
    commitProjectDisplayName,
    switchProject,
    handleRequestCreateProject,
    handleRefreshProjectsFromServer,
    handleArchiveProject,
    handleUnarchiveProject,
    handleConfirmDeleteProject,
    handleCreateProject,
    resolveProjectConflictUseServer,
    resolveProjectConflictKeepLocal,
    handleClearLocalCache,
    handleSyncClick,
    handleReconnectFolder,
    requestFolder,
    importFilesToDock,
    beginChangeFolder,
  });

  return { loaded, viewProps };
}
