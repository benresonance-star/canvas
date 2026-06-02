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
import { buildWorkspaceViewBundles } from './buildWorkspaceViewBundles.js';

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
  const projectNameDirtyRef = useRef(false);
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

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  const [folderHandle, setFolderHandle] = useState(null);
  /** True when this browser has a persisted folder handle for the active project. */
  const [folderStoredOnDevice, setFolderStoredOnDevice] = useState(false);
  const [folderLinkProbeComplete, setFolderLinkProbeComplete] = useState(false);
  const [folderLinkInProgress, setFolderLinkInProgress] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [architectureOpen, setArchitectureOpen] = useState(false);
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
    projectNameDirtyRef,
    stateRef,
    attemptRestoreRef,
    lastLoadedCardsRef,
    setProjectList,
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
    savingLink,
    savingCardId,
    setCanvasView,
    fitCanvasViewToCards,
    handleInteractionCommit,
    handleCommitCanvasView,
    handleStagingDragActiveChange,
    resetCanvasUi,
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
    persistCardEdits,
    handleInlineSaveUserNote,
    handleInlineSaveBookmark,
    handleSaveNoteToProject,
    handleSaveNewNote,
    handleSaveNewLink,
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
      loadAgentChatThreadIndexEarlyRef,
      agentChatThreadIndexRef,
      activeThreadIdRef,
    },
  });

  /** @deprecated alias */
  const applySyncLockFromServer = applyReconcileFromServer;

  const {
    requestStructuralSync,
    requestPlacementTransferSync,
    flushPendingPlacementTransferSync,
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
      pendingPlacementTransferSyncRef,
    },
    folderHandle,
    applyReconcileFromServer,
    setSyncStatus,
  });

  useEffect(() => {
    flushPendingPlacementTransferSyncRef.current = flushPendingPlacementTransferSync;
  }, [flushPendingPlacementTransferSync]);

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
    agentSecretsConfigured,
    agentConnectorsOffline,
    agentOpenaiReachable,
    agentOpenaiReachabilityError,
    refreshAgentConnectors,
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
    pickProjectDirectory,
    applyFolderHandleAndScan,
    handleReconnectFolder,
    handleSyncClick,
    beginChangeFolder,
  } = useFolderLinkScan({
    refs: {
      activeProjectIdRef,
      projectSwitchSeqRef,
      folderRestoreHandledSeqRef,
      lastLoadedCardsRef,
      attemptRestoreRef,
      stateRef,
      stagedSyncCardsRef,
      folderScanSeqRef,
      folderPresentKeysRef,
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
      refreshGraph,
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
      loaded,
      activeProjectId,
      projectList,
      projectDeleteTarget,
      folderHandle,
      resetProjectUiParts: { resetCanvasUi, resetClusterUi },
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
  });

  // Cmd-K to open search
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(s => !s);
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
        setOpenCardId(null);
        setActiveCardId(null);
        setChangeFolderDialog(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!folderHandle) setFolderPresentKeys(null);
  }, [folderHandle]);

  const viewProps = buildWorkspaceViewBundles({
    state,
    setState,
    canEditCanvas,
    activeProjectId,
    pendingSwitchProjectId,
    projectList,
    projectSwitchLoading,
    projectNameDirtyRef,
    folderHandle,
    folderStoredOnDevice,
    folderLinkInProgress,
    folderLinkProbeComplete,
    folderKeySet,
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
    savingLink,
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
    handleInlineSaveBookmark,
    handleSaveNoteToProject,
    handleSaveNewNote,
    handleSaveNewLink,
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
    agentSecretsConfigured,
    agentConnectorsOffline,
    agentOpenaiReachable,
    agentOpenaiReachabilityError,
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
    inspectorOpen,
    inspectorSelection,
    showSearch,
    setShowSearch,
    searchQuery,
    setSearchQuery,
    architectureOpen,
    setArchitectureOpen,
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
    addLinkOpen,
    setAddLinkOpen,
    createTaskOpen,
    setCreateTaskOpen,
    commitProjectDisplayName,
    switchProject,
    handleRequestCreateProject,
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
    beginChangeFolder,
  });

  return { loaded, viewProps };
}
