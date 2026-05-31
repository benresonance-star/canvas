import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useIsMobile } from './hooks/useIsMobile.js';
import {
  loadProjectById,
  saveProjectById,
  normalizeLoadedProject,
  buildProjectSavePayload,
} from './lib/persistence.js';
import {
  ensureProjectIndex,
  loadProjectIndex,
  createEmptyProjectState,
  createProject as createNewProject,
  archiveProject,
  unarchiveProject,
  deleteProject,
  setProjectDisplayName,
  refreshReconciledProjectList,
  adoptDocumentNameToIndex,
  sortProjectListForMenu,
  setConnectedFolder,
  setActiveProjectId as persistActiveProjectId,
  touchActiveProjectInIndex,
  resolveActiveProjectId,
  getProjectSyncMode,
  flushProjectSync,
  runProjectSyncBackground,
  isServerSyncEnabled,
  hasLocalProjectDocument,
  prefetchProjectDocumentFromServer,
  consumeProjectSyncRecoveryNotice,
  consumeOrphanPurgeNotice,
  consumeOrphanRecoveryNotice,
  consumeServerProjectsSyncedNotice,
  consumeIntegrityGhostNotice,
  repairWorkspaceIndex,
  consumeDuplicateMergeNotice,
  projectsForMenuFromIndex,
  shouldShowOpenInCursorToSync,
  shouldShowDatabaseUnavailable,
  pullAndMergeProjectIndex,
  pullProjectDocumentIfServerNewer,
  pushProjectDocumentIfLocalNewer,
  flushOutgoingProjectDocument,
  reconcileProjectDocumentOnSwitch,
  recordGoodLocalCardCount,
  setSyncLockListener,
  reconcileSyncLock,
  reconcileActiveProject,
  seedClientRevisionFromMeta,
  getClientRevision,
  getProjectConflict,
  clearProjectConflict,
  setCacheEvictionContext,
  estimateLocalStorageUsage,
  clearLocalProjectCaches,
  subscribeProjectCacheChanges,
} from './lib/projects.js';
import { projectStorageKey } from './lib/constants.js';
import { suppressedKeysForSave } from './lib/syncSuppressedKeys.js';
import {
  runExclusive,
  isBootSyncCompleted,
  markBootSyncCompleted,
  markBootPulledProject,
  wasBootPulledThisSession,
  PROJECT_SYNC_INDEX_POLL_INTERVAL_MS,
} from './lib/projectSyncCoordinator.js';
import {
  registerActionSyncHandlers,
  unregisterActionSyncHandlers,
  requestActionSync,
} from './lib/actionSync.js';
import { isCanvasInteractionActive } from './lib/canvasInteraction.js';
import { registerOptimisticCard } from './lib/optimisticCards.js';
import { loadFolderHandle } from './lib/folderStore.js';
import { verifyFolderHandleStored } from './lib/folderPersist.js';
import {
  linkFolderForProject,
  reconnectFolderForProject,
} from './lib/restoreFolder.js';
import { setCachedFolderHandle } from './lib/folderSessionCache.js';
import { deriveFolderLinkState, resolveFolderSyncAction } from './lib/folderLinkState.js';
import { buildDirectoryPickerOptions } from './lib/folderPicker.js';
import { readFileEntry } from './lib/readFile.js';
import {
  parseFilename,
  fileTypeFromExt,
  toCanonicalSyncKey,
  syncKeysMatch,
  computeUserNoteDisabled,
  noteRequiresProjectOnlySave,
  isCardMissingFromFolder,
} from './lib/filename.js';
import { cardTypeFromSync } from './lib/ingest/artifactType.js';
import { ensureWritePermission } from './lib/folderWrite.js';
import { createUserNoteArtifact } from './lib/ingest/createUserNote.js';
import { createBookmarkArtifact } from './lib/ingest/createBookmarkArtifact.js';
import { saveUserNote } from './lib/ingest/saveUserNote.js';
import { saveUserNoteToProject, saveBookmarkToProject } from './lib/projectCardEdits.js';
import { fetchBookmarkPreview } from './lib/bookmarkPreviewApi.js';
import { previewCacheKey } from './lib/previewStore.js';
import {
  hydrateCardsPreviews,
  hydrateVersion,
  cardsPreviewsChanged,
  PREVIEW_HYDRATE_CHUNK_SIZE,
} from './lib/previewHydrate.js';
import { hydrateStrippedCardContent } from './lib/projectHydrate.js';
import { perfMark, perfMeasure } from './lib/loadPerfMarks.js';
import { mergeDiskPreviewIntoCardVersions } from './lib/sync.js';
import { strings } from './content/strings.js';
import {
  clampCanvasZoom,
  canvasFitInsets,
  canvasViewForCards,
  setViewZoomAtViewportCenter,
  shouldAutoFitCanvasOnLoad,
} from './lib/canvasView.js';
import {
  buildStagedSyncCardFromChange,
  buildConfirmChangesForDialog,
  buildSyncChangesFromFolder,
  findSyncEntryByFolderKey,
  mergeNewlyStaged,
  mergeVersionsForSyncUpdate,
  partitionSyncChanges,
} from './lib/syncStaging.js';
import {
  enforceExclusivePlacement,
  moveToCanvas,
  moveToDock,
  resolvePlacement,
  upsertOnSurface,
} from './lib/artifactPlacement.js';
import {
  getFallbackTrayDropRect,
  isPointerInTrayDropZone,
  isPointerNearTrayBottom,
} from './lib/syncHoldingTrayHitTest.js';
import { SyncHoldingTray } from './components/SyncHoldingTray.jsx';
import { PrimitiveTableModal } from './components/PrimitiveTableModal.jsx';
import { NewNoteDialog } from './components/NewNoteDialog.jsx';
import { AddLinkDialog } from './components/AddLinkDialog.jsx';
import { CreateTaskDialog } from './components/CreateTaskDialog.jsx';
import { Canvas } from './components/Canvas.jsx';
import { CardModal } from './components/CardModal.jsx';
import { MobileView } from './components/MobileView.jsx';
import { SearchOverlay } from './components/SearchOverlay.jsx';
import { ChangeFolderDialog } from './components/ChangeFolderDialog.jsx';
import { SyncConfirm } from './components/SyncConfirm.jsx';
import { CanvasChrome } from './components/CanvasChrome.jsx';
import { SystemArchitectureModal } from './components/SystemArchitectureModal.jsx';
import { ProjectDeleteConfirm } from './components/ProjectDeleteConfirm.jsx';
import { ProjectArchiveLastConfirm } from './components/ProjectArchiveLastConfirm.jsx';
import { ProjectCreateNamePrompt } from './components/ProjectCreateNamePrompt.jsx';
import { EmptyWorkspacePrompt } from './components/EmptyWorkspacePrompt.jsx';
import { findDuplicateDisplayNameGroups } from './lib/projectIndexNormalize.js';
import { RightDock } from './components/RightDock.jsx';
import { DEFAULT_ENABLED_AGENT_IDS } from './lib/agentProfiles.js';
import {
  CONNECTORS,
  DEFAULT_SINGLE_CONNECTOR_ID,
  getConnectorById,
  getConnectorProvider,
} from './lib/agentConnectors.js';
import {
  loadAgentChatSession,
  saveAgentChatSession,
  flushAgentChatSync,
  flushAgentChatThreadIndexSync,
  clearAgentChatSession,
  clearAgentChatSessionsForProject,
  serializeRegistry,
  deserializeRegistry,
  maxAgentChatMessageId,
} from './lib/agentChatPersistence.js';
import {
  syncAgentChatArtifact,
  parseAgentChatTranscript,
  loadThreadTranscript,
} from './lib/agentChatArtifact.js';
import {
  loadThreadIndex,
  saveThreadIndexLocal,
  createThreadMeta,
  upsertThreadInIndex,
  setActiveThreadInIndex,
  renameThreadInIndex,
  removeThreadFromIndex,
  collectKnownAgentChatKeys,
  discoverThreadsFromCanvas,
  discoverThreadsFromStaged,
  mergeDiscoveredThreads,
  migrateLegacyAgentChatToThreads,
  deleteThreadSession,
  clearCardIdFromThreadIndex,
  linkCardToThreadInIndex,
  resolveThreadForCard,
  emptyThreadIndex,
} from './lib/agentChatThreads.js';
import { addSuppressedSyncKey, readSuppressedSyncKeys } from './lib/syncSuppressedKeys.js';
import {
  BOOT_LOADING_TIMEOUT_MS,
  withBootTimeout,
  clearSyncingFromServerBanner,
} from './lib/bootSync.js';
import { resolveScanExitStatus } from './lib/syncScanning.js';
import {
  mergePersistedCardsIntoCanvas,
  removeStagedCardsByKey,
  sanitizeAgentChatProjectState,
} from './lib/canvasCardMerge.js';
import { ensureAgentChatCardOnCanvas } from './lib/ensureAgentChatCardOnCanvas.js';
import { stageAgentChatCard } from './lib/stageAgentChatCard.js';
import {
  getAgentHealth,
  listAgentConnectors,
  saveAgentCredential,
  deleteAgentCredential,
  estimateAgentChat,
  sendAgentChat,
} from './lib/agentApi.js';
import {
  resolveEffectiveAgentContextCards,
  cardLabel,
} from './lib/agentContext.js';
import {
  buildContextDocuments,
  applyContextAddBudget,
  formatTruncationSummary,
  formatContextRemoveMessage,
  contextAddMessageFields,
  MINIMAL_AGENT_SYSTEM_CONTEXT,
  estimateContextDocuments,
  getContextLimits,
} from './lib/agentContextContent.js';
import {
  createContextRegistry,
  registerContextCard,
  unregisterContextCard,
  diffContextRegistry,
  computeContextDeliveryState,
  getContextDeliveryStatus,
  buildApiMessageHistoryAsync,
} from './lib/agentContextSession.js';

const AGENT_EXTENDED_CONTEXT_KEY = 'canvas:agent-extended-context';
const AGENT_TOKEN_CONFIRM_THRESHOLD = 25_000;

function readAgentExtendedContext() {
  try {
    return sessionStorage.getItem(AGENT_EXTENDED_CONTEXT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeAgentExtendedContext(value) {
  try {
    sessionStorage.setItem(AGENT_EXTENDED_CONTEXT_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

import {
  ingestFoundFiles,
  buildPreviousArtifactMap,
  applyArtifactRefsToGrouped,
  mergeArtifactRefsIntoCards,
} from './lib/ingest/syncIngest.js';
import {
  createSubCluster,
  listSubClusters,
  fetchClusterMembers,
  fetchHealth,
  clusterApiStatusFromHealth,
  isApiAvailable,
} from './lib/primitivesApi.js';
import {
  resolveWorkspaceClusterId,
  isClusterContextValid,
  EMPTY_CLUSTER_HULL_SOURCE,
} from './lib/clusterProjectContext.js';
import {
  shouldApplyProjectLoad,
  buildSwitchPlaceholderState,
} from './lib/projectSwitch.js';
import {
  artifactMembersFromCards,
  clusterSelectionStatsFromCards,
} from './lib/clusterMembers.js';
import { CreateClusterDialog } from './components/CreateClusterDialog.jsx';
import { loadCanvasGraph } from './lib/graph/clusterGraph.js';

export default function ProjectCanvas() {
  const isMobile = useIsMobile();
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
  const lastLoadedCardsRef = useRef([]);
  const attemptRestoreRef = useRef(async () => {});
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeProjectIdRef = useRef(activeProjectId);
  const clusterContextProjectIdRef = useRef(null);
  const refreshGraphRef = useRef(async () => {});
  const loadProjectIntoStateRef = useRef(async () => []);
  const applyClusterContextForProjectRef = useRef(async () => null);
  const projectNameDirtyRef = useRef(false);
  const [syncStatus, setSyncStatus] = useState(null);
  /** @type {'live' | 'stale' | 'offline'} */
  const [syncLock, setSyncLock] = useState('live');
  const syncLockRef = useRef(syncLock);
  const lastAppliedSyncLockRef = useRef('live');
  const refreshingFromServerRef = useRef(false);
  const canEditCanvas = loaded && syncLock !== 'offline';

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    syncLockRef.current = syncLock;
  }, [syncLock]);

  useEffect(() => {
    setSyncLockListener((projectId, lock) => {
      if (projectId !== activeProjectIdRef.current) return;
      // Dedupe against React state, not lastAppliedSyncLockRef (switch may preset ref without setSyncLock).
      if (syncLockRef.current === lock) {
        lastAppliedSyncLockRef.current = lock;
        return;
      }
      lastAppliedSyncLockRef.current = lock;
      setSyncLock(lock);
      if (lock === 'live') {
        setSyncStatus((prev) =>
          prev?.banner === strings.projects.serverRevisionStale
            || prev?.banner === strings.projects.remoteChangesWhileEditing
            || prev?.banner === strings.projects.projectSyncConflict
            ? null
            : prev,
        );
      } else if (lock === 'stale') {
        setSyncStatus((prev) =>
          prev?.conflictActions
            ? prev
            : {
              banner: strings.projects.projectSyncConflict,
              conflictActions: true,
            },
        );
      } else if (lock === 'offline') {
        setSyncStatus((prev) =>
          prev?.banner ? prev : { banner: strings.projects.localOnlyBanner },
        );
      }
    });
    return () => setSyncLockListener(null);
  }, []);

  const [activeCardId, setActiveCardId] = useState(null);
  const [openCardId, setOpenCardId] = useState(null);
  const [folderHandle, setFolderHandle] = useState(null);
  /** True when this browser has a persisted folder handle for the active project. */
  const [folderStoredOnDevice, setFolderStoredOnDevice] = useState(false);
  const [folderLinkProbeComplete, setFolderLinkProbeComplete] = useState(false);
  const [folderLinkInProgress, setFolderLinkInProgress] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [architectureOpen, setArchitectureOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmChanges, setConfirmChanges] = useState(null);
  const [stagedSyncCards, setStagedSyncCards] = useState([]);
  const stagedSyncCardsRef = useRef(stagedSyncCards);
  const [stagingDragActive, setStagingDragActive] = useState(false);
  const stagingDragActiveRef = useRef(false);
  const folderScanSeqRef = useRef(0);
  const invalidateFolderScan = useCallback(() => {
    folderScanSeqRef.current += 1;
  }, []);

  useEffect(() => {
    stagedSyncCardsRef.current = stagedSyncCards;
  }, [stagedSyncCards]);

  useEffect(() => {
    stagingDragActiveRef.current = stagingDragActive;
  }, [stagingDragActive]);

  const [canvasElement, setCanvasElement] = useState(null);
  const [trayRevealActive, setTrayRevealActive] = useState(false);
  const [cardDockHover, setCardDockHover] = useState(false);
  const trayDropRectRef = useRef(null);
  const [versionStackOpen, setVersionStackOpen] = useState(null);
  const [changeFolderDialog, setChangeFolderDialog] = useState(false);
  /** Keys seen on disk at last successful folder scan; null = never scanned or no folder */
  const [folderPresentKeys, setFolderPresentKeys] = useState(null);
  const folderPresentKeysRef = useRef(null);
  const [clusterId, setClusterId] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorSelection, setInspectorSelection] = useState(null);
  const [selectedClusterId, setSelectedClusterId] = useState(null);
  const [clusterInspectorReload, setClusterInspectorReload] = useState(0);
  const [primitiveTableOpen, setPrimitiveTableOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [savingCardId, setSavingCardId] = useState(null);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createClusterOpen, setCreateClusterOpen] = useState(false);
  const [creatingCluster, setCreatingCluster] = useState(false);
  const [clusterApiAvailable, setClusterApiAvailable] = useState(false);
  /** @type {'ok' | 'api_unreachable' | 'db_unavailable'} */
  const [clusterApiReason, setClusterApiReason] = useState('db_unavailable');
  const lastClusterErrorToastRef = useRef('');
  const [selectedCardIds, setSelectedCardIds] = useState(() => new Set());
  const removeCardFromSelection = useCallback((cardId) => {
    setSelectedCardIds((prev) => {
      if (!prev.has(cardId)) return prev;
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
  }, []);
  const [canvasEdges, setCanvasEdges] = useState([]);
  const [linkCountByCardId, setLinkCountByCardId] = useState(() => new Map());
  const [clusterHullSource, setClusterHullSource] = useState({
    clusters: [],
    membersByClusterId: new Map(),
  });
  const [workspaceTreeOpen, setWorkspaceTreeOpen] = useState(false);
  const [workspaceTreeReloadKey, setWorkspaceTreeReloadKey] = useState(0);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [agentContextMode, setAgentContextMode] = useState('selected');
  const [enabledAgentIds, setEnabledAgentIds] = useState(
    () => new Set(DEFAULT_ENABLED_AGENT_IDS),
  );
  const [agentMessages, setAgentMessages] = useState([]);
  const [agentPanelMode, setAgentPanelMode] = useState('single');
  const [singleConnectorId, setSingleConnectorId] = useState(DEFAULT_SINGLE_CONNECTOR_ID);
  const [agentConnectors, setAgentConnectors] = useState([]);
  const [agentSecretsConfigured, setAgentSecretsConfigured] = useState(true);
  const [agentConnectorsOffline, setAgentConnectorsOffline] = useState(false);
  const [agentOpenaiReachable, setAgentOpenaiReachable] = useState(null);
  const [agentOpenaiReachabilityError, setAgentOpenaiReachabilityError] = useState(null);
  const [agentContextStatusByCardId, setAgentContextStatusByCardId] = useState({});
  const [agentExtendedContext, setAgentExtendedContext] = useState(readAgentExtendedContext);
  const [agentContextEstimates, setAgentContextEstimates] = useState([]);
  const [agentLastTokenEstimate, setAgentLastTokenEstimate] = useState(null);
  const [agentChatMessages, setAgentChatMessages] = useState([]);
  const [agentChatLoading, setAgentChatLoading] = useState(false);
  const [agentChatError, setAgentChatError] = useState(null);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const agentChatIdRef = useRef(0);
  const agentContextRegistryRef = useRef(createContextRegistry());
  const agentChatArtifactMetaRef = useRef({
    artifactRef: null,
    filename: null,
    cardId: null,
  });
  const agentChatPersistSkipRef = useRef(false);
  const [agentChatArtifactRef, setAgentChatArtifactRef] = useState(null);
  /** @type {'api_unavailable' | 'ingest_failed' | null} */
  const [agentChatArtifactSyncReason, setAgentChatArtifactSyncReason] = useState(null);
  const [agentChatPersistTrimmed, setAgentChatPersistTrimmed] = useState(false);
  const [chatSyncRetrying, setChatSyncRetrying] = useState(false);
  const [agentChatTranscriptRevision, setAgentChatTranscriptRevision] = useState(0);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [agentChatThreadIndex, setAgentChatThreadIndex] = useState({
    version: 1,
    activeThreadId: null,
    threads: [],
  });
  const [threadPickerOpen, setThreadPickerOpen] = useState(false);
  const activeThreadIdRef = useRef(null);
  const agentChatThreadIndexRef = useRef(agentChatThreadIndex);
  const agentChatMessagesRef = useRef(agentChatMessages);
  const transcriptSyncInFlightRef = useRef(false);
  const transcriptSyncPendingRef = useRef(null);
  const persistAgentChatSessionRef = useRef(async () => ({ ok: false }));

  useEffect(() => {
    agentChatMessagesRef.current = agentChatMessages;
  }, [agentChatMessages]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    agentChatThreadIndexRef.current = agentChatThreadIndex;
  }, [agentChatThreadIndex]);

  const prevAgentConnectorsOfflineRef = useRef(false);
  const agentPanelOpenSyncRetryRef = useRef(false);
  const [canvasViewportSize, setCanvasViewportSize] = useState({ width: 0, height: 0 });
  const canvasViewportSizeRef = useRef(canvasViewportSize);
  const pendingFitToExtentRef = useRef(false);
  const pendingFitCardsRef = useRef(null);
  const userAdjustedViewRef = useRef(false);

  const setCanvasView = useCallback((updater) => {
    userAdjustedViewRef.current = true;
    setState((prev) => ({
      ...prev,
      canvasView: typeof updater === 'function' ? updater(prev.canvasView) : updater,
    }));
  }, []);

  const resolveCanvasFitOptions = useCallback(() => {
    const viewport = canvasViewportSizeRef.current;
    const trayVisible =
      !isMobile
      && (
        stagedSyncCards.length > 0
        || trayRevealActive
        || stagingDragActive
      );
    return {
      ...canvasFitInsets(viewport.height, {
        trayVisible,
        trayDropRect: trayDropRectRef.current,
      }),
      clearDesktopChrome: !isMobile,
    };
  }, [
    isMobile,
    stagedSyncCards.length,
    trayRevealActive,
    stagingDragActive,
  ]);

  const fitCanvasViewToCards = useCallback((cards) => {
    const viewport = canvasViewportSizeRef.current;
    if (viewport.width <= 0 || viewport.height <= 0) {
      pendingFitToExtentRef.current = true;
      pendingFitCardsRef.current = cards;
      return;
    }
    pendingFitToExtentRef.current = false;
    pendingFitCardsRef.current = null;
    const applyFit = () => {
      setCanvasView(canvasViewForCards(cards, viewport, resolveCanvasFitOptions()));
    };
    applyFit();
    const trayVisible =
      !isMobile
      && (
        stagedSyncCards.length > 0
        || trayRevealActive
        || stagingDragActive
      );
    if (trayVisible) {
      requestAnimationFrame(applyFit);
    }
  }, [setCanvasView, resolveCanvasFitOptions, isMobile, stagedSyncCards.length, trayRevealActive, stagingDragActive]);

  const fitCanvasViewToCardsRef = useRef(fitCanvasViewToCards);
  useEffect(() => {
    fitCanvasViewToCardsRef.current = fitCanvasViewToCards;
  }, [fitCanvasViewToCards]);

  const applyServerPullResult = useCallback(
    async (
      projectId,
      { pulled, payload, localCacheWritten },
      { showToast = false, hydratePreviews = true, allowFit = false } = {},
    ) => {
      if (!pulled || !payload || !projectId) return null;
      if (isCanvasInteractionActive()) return null;
      if (!projectNameDirtyRef.current) {
        await adoptDocumentNameToIndex(projectId, payload);
      }
      const cards = await loadProjectIntoStateRef.current(projectId, {
        localOnly: true,
        document: localCacheWritten ? undefined : payload,
        hydratePreviews,
      });
      if (cards != null && allowFit && !userAdjustedViewRef.current) {
        fitCanvasViewToCards(cards);
      }
      if (!localCacheWritten) {
        setSyncStatus({
          banner:
            strings.projects.localStorageFull
            + strings.projects.projectIdHint(projectId),
        });
      } else if (showToast) {
        setSyncStatus({ toast: strings.projects.syncedFromServer });
        setTimeout(() => setSyncStatus(null), 4000);
      }
      return cards;
    },
    [fitCanvasViewToCards],
  );

  const clearStaleSyncBanners = useCallback((prev) => {
    if (
      prev?.banner === strings.projects.serverRevisionStale
      || prev?.banner === strings.projects.remoteChangesWhileEditing
    ) {
      return null;
    }
    return prev;
  }, []);

  const applyReconcileFromServer = useCallback(async (projectId, { showPullToast = false } = {}) => {
    const id = projectId ?? activeProjectIdRef.current;
    if (!id || !isServerSyncEnabled()) {
      if (lastAppliedSyncLockRef.current !== 'live') {
        lastAppliedSyncLockRef.current = 'live';
        setSyncLock('live');
        setSyncStatus(clearStaleSyncBanners);
      }
      return { lock: 'live', serverRevision: 0, action: 'none' };
    }
    if (isCanvasInteractionActive()) {
      return { lock: 'live', serverRevision: 0, action: 'none' };
    }
    const result = await reconcileActiveProject(id);
    if (id !== activeProjectIdRef.current) return result;
    if (result.pulled && result.payload) {
      await applyServerPullResult(
        id,
        {
          pulled: true,
          payload: result.payload,
          localCacheWritten: result.localCacheWritten ?? true,
        },
        { showToast: showPullToast, hydratePreviews: true },
      );
    }
    return result;
  }, [applyServerPullResult, clearStaleSyncBanners]);

  /** @deprecated alias */
  const applySyncLockFromServer = applyReconcileFromServer;

  const handleRefreshFromServer = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    if (!projectId || !isServerSyncEnabled()) return;
    refreshingFromServerRef.current = true;
    try {
      await runExclusive('refresh', async () => {
        await flushProjectSync();
        await applyReconcileFromServer(projectId, { showPullToast: true });
        const pullResult = await pullProjectDocumentIfServerNewer(projectId, {
          force: true,
        });
        if (pullResult.pulled) {
          await applyServerPullResult(projectId, pullResult, {
            showToast: true,
            hydratePreviews: true,
          });
        }
      });
    } finally {
      refreshingFromServerRef.current = false;
    }
  }, [applyReconcileFromServer, applyServerPullResult]);

  const resolveProjectConflictUseServer = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    const conflict = getProjectConflict(projectId);
    if (!conflict?.server) {
      await handleRefreshFromServer();
      return;
    }
    clearProjectConflict(projectId);
    await applyServerPullResult(
      projectId,
      {
        pulled: true,
        payload: conflict.server,
        localCacheWritten: true,
      },
      { showToast: true, hydratePreviews: true },
    );
    setSyncLock('live');
    setSyncStatus(null);
  }, [applyServerPullResult, handleRefreshFromServer]);

  const resolveProjectConflictKeepLocal = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    const conflict = getProjectConflict(projectId);
    const payload =
      conflict?.local
      ?? buildProjectSavePayload(
        stateRef.current,
        stagedSyncCardsRef.current,
        suppressedKeysForSave(projectId, stateRef.current),
      );
    clearProjectConflict(projectId);
    const pushResult = await flushOutgoingProjectDocument(projectId, payload);
    if (pushResult?.ok) {
      setSyncLock('live');
      setSyncStatus(null);
    }
  }, []);

  useEffect(() => {
    applyServerPullResultRef.current = applyServerPullResult;
  }, [applyServerPullResult]);

  const requestStructuralSync = useCallback(() => {
    const projectId = activeProjectIdRef.current;
    if (
      !projectId
      || switchingProjectRef.current
      || creatingProjectRef.current
      || !initialHydratedRef.current
    ) {
      return;
    }
    void requestActionSync('structuralChange', { projectId });
  }, []);

  const handleInteractionCommit = useCallback(({ kind }) => {
    if (kind === 'layoutCommit') {
      userAdjustedViewRef.current = true;
      const projectId = activeProjectIdRef.current;
      if (projectId) void requestActionSync('layoutCommit', { projectId });
    }
  }, []);

  const handleCommitCanvasView = useCallback((view) => {
    userAdjustedViewRef.current = true;
    setCanvasView(view);
  }, [setCanvasView]);

  useEffect(() => {
    registerActionSyncHandlers({
      getProjectId: () => activeProjectIdRef.current,
      getState: () => stateRef.current,
      getStagedSyncCards: () => stagedSyncCardsRef.current,
      buildPayload: (state, staged) =>
        buildProjectSavePayload(
          state,
          staged,
          suppressedKeysForSave(activeProjectIdRef.current, state),
          {
            stripNoteContent:
              Boolean(folderHandle)
              && Boolean(folderPresentKeysRef.current?.length)
              && isServerSyncEnabled(),
          },
        ),
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
  }, [applyReconcileFromServer, folderHandle]);

  useEffect(() => {
    folderPresentKeysRef.current = folderPresentKeys;
  }, [folderPresentKeys]);

  useEffect(() => {
    void (async () => {
      const index = await loadProjectIndex();
      const ids = (index?.projects ?? []).map((p) => p.id).filter(Boolean);
      setCacheEvictionContext({
        activeProjectId: activeProjectId ?? null,
        indexProjectIds: ids,
      });
    })();
  }, [activeProjectId, projectList.length]);

  useEffect(() => {
    canvasViewportSizeRef.current = canvasViewportSize;
    if (!pendingFitToExtentRef.current) return;
    if (canvasViewportSize.width <= 0 || canvasViewportSize.height <= 0) return;
    const cards = pendingFitCardsRef.current ?? stateRef.current.cards;
    fitCanvasViewToCards(cards);
  }, [canvasViewportSize, fitCanvasViewToCards]);

  const reportClusterError = useCallback((message) => {
    const msg = message || strings.cluster.hullsLoadFailed;
    if (lastClusterErrorToastRef.current === msg) return;
    lastClusterErrorToastRef.current = msg;
    setSyncStatus({ error: msg });
    setTimeout(() => {
      setSyncStatus((prev) => (prev?.error === msg ? null : prev));
      if (lastClusterErrorToastRef.current === msg) {
        lastClusterErrorToastRef.current = '';
      }
    }, 6000);
  }, []);

  const refreshClusterApiHealth = useCallback(async () => {
    const health = await fetchHealth();
    const status = clusterApiStatusFromHealth(health);
    setClusterApiAvailable(status.available);
    setClusterApiReason(status.reason);
    return status;
  }, []);

  const loadClusterHullSource = useCallback(async (projectIdOverride) => {
    const projectId = projectIdOverride ?? activeProjectIdRef.current;
    if (!projectId) {
      setClusterHullSource(EMPTY_CLUSTER_HULL_SOURCE);
      return { ok: true };
    }
    try {
      const { clusters } = await listSubClusters(projectId);
      const membersByClusterId = new Map();
      await Promise.all(
        (clusters || []).map(async (c) => {
          const { members } = await fetchClusterMembers(c.id);
          membersByClusterId.set(c.id, members || []);
        }),
      );
      setClusterHullSource({ clusters: clusters || [], membersByClusterId });
      return { ok: true };
    } catch (e) {
      setClusterHullSource(EMPTY_CLUSTER_HULL_SOURCE);
      const msg = e?.message || strings.cluster.hullsLoadFailed;
      return { ok: false, error: msg };
    }
  }, []);

  const refreshCanvasEdges = useCallback(async (opts = {}) => {
    const {
      clusterId: cidOverride,
      projectId: projectIdOverride,
      force = false,
    } = opts;
    const projectId = projectIdOverride ?? activeProjectIdRef.current;
    if (
      !force
      && !isClusterContextValid(projectId, clusterContextProjectIdRef.current)
    ) {
      return;
    }
    const cid = cidOverride ?? clusterId;
    const cards = stateRef.current.cards;
    if (!cid) {
      setCanvasEdges([]);
      setLinkCountByCardId(new Map());
      return;
    }
    try {
      const graphResult = await loadCanvasGraph(cid, cards);
      setCanvasEdges(graphResult.canvasEdges);
      setLinkCountByCardId(graphResult.linkCountByCardId);
    } catch (e) {
      setCanvasEdges([]);
      setLinkCountByCardId(new Map());
      reportClusterError(e?.message);
    }
  }, [clusterId, reportClusterError]);

  const refreshGraph = useCallback(async (opts = {}) => {
    const {
      clusterId: cidOverride,
      projectId: projectIdOverride,
      force = false,
    } = opts;
    const projectId = projectIdOverride ?? activeProjectIdRef.current;
    if (
      !force
      && !isClusterContextValid(projectId, clusterContextProjectIdRef.current)
    ) {
      return;
    }
    const cid = cidOverride ?? clusterId;
    const cards = stateRef.current.cards;
    if (!cid) {
      setCanvasEdges([]);
      setLinkCountByCardId(new Map());
      const hullResult = await loadClusterHullSource(projectId);
      if (hullResult?.ok === false && hullResult.error) {
        reportClusterError(hullResult.error);
      }
      setClusterInspectorReload((k) => k + 1);
      return;
    }
    try {
      const [graphResult, hullResult] = await Promise.all([
        loadCanvasGraph(cid, cards),
        loadClusterHullSource(projectId),
      ]);
      const { canvasEdges: edges, linkCountByCardId: counts } = graphResult;
      setCanvasEdges(edges);
      setLinkCountByCardId(counts);
      if (hullResult?.ok === false && hullResult.error) {
        reportClusterError(hullResult.error);
      }
    } catch (e) {
      setCanvasEdges([]);
      setLinkCountByCardId(new Map());
      const hullResult = await loadClusterHullSource(projectId);
      if (hullResult?.ok === false && hullResult.error) {
        reportClusterError(hullResult.error);
      } else {
        reportClusterError(e?.message);
      }
    }
    setClusterInspectorReload((k) => k + 1);
    setWorkspaceTreeReloadKey((k) => k + 1);
  }, [clusterId, loadClusterHullSource, reportClusterError]);

  useEffect(() => {
    refreshGraphRef.current = refreshGraph;
  }, [refreshGraph]);

  const syncActiveProjectNameFromIndex = useCallback((index) => {
    if (projectNameDirtyRef.current) return;
    const activeId = activeProjectIdRef.current;
    if (!activeId || !index?.projects?.length) return;
    const row = index.projects.find((p) => p.id === activeId);
    if (row?.name && row.name !== stateRef.current.projectName) {
      setState((prev) => ({ ...prev, projectName: row.name }));
    }
  }, []);

  const applyDuplicateNameBanner = useCallback((index) => {
    const groups = findDuplicateDisplayNameGroups(index?.projects ?? []);
    if (groups.length === 0) return;
    const top = [...groups].sort((a, b) => b.count - a.count)[0];
    setSyncStatus((prev) => ({
      ...(prev ?? {}),
      banner: strings.projects.duplicateNamesBanner(top.name, top.count),
    }));
  }, []);

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
  }, [syncActiveProjectNameFromIndex, loaded, applyDuplicateNameBanner]);

  const applyClusterContextForProject = useCallback(
    async (projectId, projectName, { refresh = true } = {}) => {
      if (!projectId) {
        clusterContextProjectIdRef.current = null;
        setClusterId(null);
        return null;
      }
      try {
        const healthStatus = await refreshClusterApiHealth();
        if (!healthStatus.available) {
          clusterContextProjectIdRef.current = projectId;
          setClusterId(null);
          return null;
        }
        const cid = await resolveWorkspaceClusterId(projectId, projectName);
        if (!cid) {
          reportClusterError(strings.cluster.workspaceClusterFailed);
          clusterContextProjectIdRef.current = projectId;
          setClusterId(null);
          return null;
        }
        clusterContextProjectIdRef.current = projectId;
        setClusterId(cid);
        if (refresh) {
          await refreshGraphRef.current({
            clusterId: cid,
            projectId,
            force: true,
          });
        }
        return cid;
      } catch (e) {
        reportClusterError(e?.message || strings.cluster.workspaceClusterFailed);
        clusterContextProjectIdRef.current = projectId;
        setClusterId(null);
        return null;
      }
    },
    [refreshClusterApiHealth, reportClusterError],
  );

  const handleClusterRenamed = useCallback((renamedClusterId, name) => {
    setClusterHullSource((prev) => ({
      ...prev,
      clusters: prev.clusters.map((c) =>
        c.id === renamedClusterId ? { ...c, name } : c,
      ),
    }));
  }, []);

  const highlightedClusterId =
    selectedClusterId ??
    (inspectorOpen && inspectorSelection?.type === 'cluster'
      ? inspectorSelection.id
      : null);

  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    setInspectorSelection(null);
  }, []);

  const closeAgentPanel = useCallback(() => {
    setAgentPanelOpen(false);
  }, []);

  const closeWorkspaceTree = useCallback(() => {
    setWorkspaceTreeOpen(false);
  }, []);

  const closeRightDock = useCallback(() => {
    setWorkspaceTreeOpen(false);
    setAgentPanelOpen(false);
    closeInspector();
  }, [closeInspector]);

  const toggleWorkspaceTree = useCallback(() => {
    setWorkspaceTreeOpen((open) => !open);
  }, []);

  const toggleAgentPanel = useCallback(() => {
    setAgentPanelOpen((open) => !open);
  }, []);

  const toggleEnabledAgent = useCallback((agentId) => {
    setEnabledAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }, []);

  const refreshAgentConnectors = useCallback(async () => {
    try {
      const [data, health] = await Promise.all([
        listAgentConnectors(),
        getAgentHealth().catch(() => ({ openaiReachable: null })),
      ]);
      setAgentConnectors(data.connectors || []);
      setAgentSecretsConfigured(data.secretsConfigured !== false);
      setAgentConnectorsOffline(false);
      setAgentOpenaiReachable(
        health.openaiReachable === true || health.openaiReachable === false
          ? health.openaiReachable
          : null,
      );
      setAgentOpenaiReachabilityError(health.openaiReachabilityError ?? null);
    } catch {
      setAgentConnectors(
        CONNECTORS.map((c) => ({
          ...c,
          configured: false,
          keyHint: null,
        })),
      );
      setAgentSecretsConfigured(false);
      setAgentConnectorsOffline(true);
      setAgentOpenaiReachable(null);
      setAgentOpenaiReachabilityError(null);
    }
  }, []);

  useEffect(() => {
    if (agentPanelOpen) refreshAgentConnectors();
  }, [agentPanelOpen, refreshAgentConnectors]);

  const handleSaveAgentApiKey = useCallback(
    async (provider, apiKey) => {
      setApiKeySaving(true);
      try {
        await saveAgentCredential(provider, apiKey);
        await refreshAgentConnectors();
        setSyncStatus({ toast: 'API key saved.' });
        setTimeout(() => setSyncStatus(null), 2500);
      } catch (e) {
        setSyncStatus({ error: e.message });
        setTimeout(() => setSyncStatus(null), 4000);
        throw e;
      } finally {
        setApiKeySaving(false);
      }
    },
    [refreshAgentConnectors],
  );

  const persistAgentChatSession = useCallback(
    async (messages, options = {}) => {
      const projectId = options.projectId ?? activeProjectIdRef.current;
      const connectorId = options.connectorId ?? singleConnectorId;
      const threadId = options.threadId ?? activeThreadIdRef.current;
      if (!projectId || !connectorId || !threadId || agentChatPersistSkipRef.current) {
        return { ok: false, reason: 'skipped' };
      }

      const isActiveThread = threadId === activeThreadIdRef.current;
      const registry = isActiveThread
        ? agentContextRegistryRef.current
        : options.registrySerialized
          ? deserializeRegistry(options.registrySerialized)
          : options.registry ?? createContextRegistry();
      const threadMeta = agentChatThreadIndexRef.current.threads.find(
        (t) => t.threadId === threadId,
      );
      const title = threadMeta?.title ?? options.title ?? null;
      const meta = isActiveThread
        ? agentChatArtifactMetaRef.current
        : {
            artifactRef: threadMeta?.artifactRef ?? null,
            filename: threadMeta?.filename ?? null,
            cardId: threadMeta?.cardId ?? null,
          };

      const savePayload = {
        messages,
        registry: serializeRegistry(registry),
        artifactRef: meta.artifactRef,
        filename: meta.filename,
        title,
        cardId: meta.cardId,
      };

      const saveResult = saveAgentChatSession(
        projectId,
        connectorId,
        threadId,
        savePayload,
      );
      if (saveResult.trimmed) setAgentChatPersistTrimmed(true);

      try {
        const connector = getConnectorById(connectorId);
        const syncResult = await syncAgentChatArtifact({
          projectId,
          projectName: state.projectName,
          folderHandle,
          connectorId,
          connectorLabel: connector?.label ?? connectorId,
          threadId,
          title: title ?? undefined,
          messages,
          artifactRef: meta.artifactRef,
          filename: meta.filename,
        });
        if (syncResult.ok) {
          setAgentChatArtifactSyncReason(null);
          if (syncResult.artifactRef) {
            agentChatArtifactMetaRef.current = {
              artifactRef: syncResult.artifactRef,
              filename: syncResult.filename ?? meta.filename,
              cardId: meta.cardId,
            };
            setAgentChatArtifactRef(syncResult.artifactRef);

            let nextIndex = upsertThreadInIndex(agentChatThreadIndexRef.current, {
              ...threadMeta,
              threadId,
              filename: syncResult.filename ?? meta.filename,
              artifactRef: syncResult.artifactRef,
              updatedAt: Date.now(),
            });

            const threadIdx = nextIndex.threads.findIndex((t) => t.threadId === threadId);
            const filename = syncResult.filename ?? meta.filename;
            const suppressedKeys = readSuppressedSyncKeys(projectId, stateRef.current);
            const prevCards = stateRef.current.cards;
            const prevStaged = stagedSyncCardsRef.current;
            let nextCards = prevCards;
            let nextStaged = prevStaged;
            let resolvedCardId = meta.cardId;

            const cardResult = ensureAgentChatCardOnCanvas(
              nextCards,
              {
                filename,
                cardId: meta.cardId,
                title,
                threadId,
                threadIndex: threadIdx >= 0 ? threadIdx : 0,
                syncResult,
              },
              {
                suppressedKeys,
                stagedSyncCards: nextStaged,
                threads: nextIndex.threads,
              },
            );
            nextCards = cardResult.cards;
            nextStaged = cardResult.stagedSyncCards ?? nextStaged;
            if (cardResult.suppressed || cardResult.removedFromCanvas) {
              resolvedCardId = null;
            } else {
              resolvedCardId = cardResult.cardId;
            }

            agentChatArtifactMetaRef.current.cardId = resolvedCardId;
            nextIndex = upsertThreadInIndex(nextIndex, {
              ...threadMeta,
              threadId,
              cardId: resolvedCardId,
              filename,
              artifactRef: syncResult.artifactRef,
              updatedAt: Date.now(),
            });

            setState((prev) => ({ ...prev, cards: nextCards }));
            setStagedSyncCards(nextStaged);
            stagedSyncCardsRef.current = nextStaged;

            setAgentChatThreadIndex(nextIndex);
            saveThreadIndexLocal(projectId, connectorId, nextIndex);

            saveAgentChatSession(projectId, connectorId, threadId, {
              ...savePayload,
              artifactRef: syncResult.artifactRef,
              filename: syncResult.filename ?? meta.filename,
              cardId: resolvedCardId,
            });
            setAgentChatTranscriptRevision((r) => r + 1);
            if (nextCards !== prevCards || nextStaged !== prevStaged) {
              requestStructuralSync();
            }
          } else {
            const nextIndex = upsertThreadInIndex(agentChatThreadIndexRef.current, {
              ...threadMeta,
              threadId,
              updatedAt: Date.now(),
            });
            setAgentChatThreadIndex(nextIndex);
            saveThreadIndexLocal(projectId, connectorId, nextIndex);
          }
        } else {
          setAgentChatArtifactSyncReason(
            syncResult.reason === 'ingest_failed' ? 'ingest_failed' : 'api_unavailable',
          );
        }
        return syncResult;
      } catch {
        setAgentChatArtifactSyncReason('api_unavailable');
        return { ok: false, reason: 'api_unavailable' };
      }
    },
    [singleConnectorId, folderHandle, state.projectName, requestStructuralSync],
  );

  persistAgentChatSessionRef.current = persistAgentChatSession;

  const requestThreadTranscriptSync = useCallback(
    async (messages, options = {}) => {
      if (agentChatPersistSkipRef.current) {
        return { ok: false, reason: 'skipped' };
      }
      const runSync = async (payload) => {
        transcriptSyncInFlightRef.current = true;
        try {
          let result = await persistAgentChatSessionRef.current(payload.messages, {
            projectId: payload.projectId,
            connectorId: payload.connectorId,
            threadId: payload.threadId,
            registrySerialized: payload.registrySerialized,
            title: payload.title,
          });
          while (transcriptSyncPendingRef.current) {
            const pending = transcriptSyncPendingRef.current;
            transcriptSyncPendingRef.current = null;
            result = await persistAgentChatSessionRef.current(pending.messages, {
              projectId: pending.projectId,
              connectorId: pending.connectorId,
              threadId: pending.threadId,
              registrySerialized: pending.registrySerialized,
              title: pending.title,
            });
          }
          return result;
        } finally {
          transcriptSyncInFlightRef.current = false;
        }
      };
      const payload = {
        messages,
        projectId: options.projectId,
        connectorId: options.connectorId,
        threadId: options.threadId,
        registrySerialized: options.registrySerialized,
        title: options.title,
      };
      if (transcriptSyncInFlightRef.current) {
        transcriptSyncPendingRef.current = payload;
        return { ok: false, reason: 'coalesced' };
      }
      return runSync(payload);
    },
    [],
  );

  const ensureThreadChatCardOnCanvas = useCallback(
    (threadId, syncResult = null, { persistCanvas = true } = {}) => {
      const projectId = activeProjectIdRef.current;
      if (!projectId || !threadId) return null;
      const threadMeta = agentChatThreadIndexRef.current.threads.find(
        (t) => t.threadId === threadId,
      );
      if (!threadMeta?.filename) return null;

      const threadIdx = agentChatThreadIndexRef.current.threads.findIndex(
        (t) => t.threadId === threadId,
      );
      const suppressedKeys = readSuppressedSyncKeys(projectId, stateRef.current);
      const prevCards = stateRef.current.cards;
      const prevStaged = stagedSyncCardsRef.current;
      const cardResult = ensureAgentChatCardOnCanvas(
        prevCards,
        {
          filename: threadMeta.filename,
          cardId: threadMeta.cardId,
          title: threadMeta.title,
          threadId,
          threadIndex: threadIdx >= 0 ? threadIdx : 0,
          syncResult: syncResult ?? {
            artifactRef: threadMeta.artifactRef,
            content_hash: '',
          },
        },
        {
          suppressedKeys,
          stagedSyncCards: stagedSyncCardsRef.current,
          threads: agentChatThreadIndexRef.current.threads,
        },
      );
      if (cardResult.suppressed) return null;
      const cardsChanged =
        cardResult.cards !== prevCards
        || cardResult.stagedSyncCards !== prevStaged;
      if (cardsChanged) {
        stateRef.current = { ...stateRef.current, cards: cardResult.cards };
        setState((prev) => ({ ...prev, cards: cardResult.cards }));
        setStagedSyncCards(cardResult.stagedSyncCards);
        stagedSyncCardsRef.current = cardResult.stagedSyncCards;
        if (persistCanvas) {
          requestStructuralSync();
        }
      }
      return cardResult.cardId;
    },
    [requestStructuralSync],
  );

  const reconcileAllThreadChatCards = useCallback(() => {
    const projectId = activeProjectIdRef.current;
    const connectorId = singleConnectorId;
    if (!projectId || !connectorId) return false;

    let index = agentChatThreadIndexRef.current;
    let anyChanged = false;
    let indexDirty = false;

    for (const thread of index.threads) {
      if (!thread.filename) continue;
      const prevCards = stateRef.current.cards;
      const prevStaged = stagedSyncCardsRef.current;
      const cardId = ensureThreadChatCardOnCanvas(thread.threadId, null, {
        persistCanvas: false,
      });
      if (
        stateRef.current.cards !== prevCards
        || stagedSyncCardsRef.current !== prevStaged
      ) {
        anyChanged = true;
      }
      if (cardId && cardId !== thread.cardId) {
        index = linkCardToThreadInIndex(index, thread.threadId, { cardId });
        indexDirty = true;
      }
    }

    if (indexDirty) {
      agentChatThreadIndexRef.current = index;
      setAgentChatThreadIndex(index);
      saveThreadIndexLocal(projectId, connectorId, index);
    }

    return anyChanged;
  }, [singleConnectorId, ensureThreadChatCardOnCanvas]);

  const loadThreadSessionIntoState = useCallback(async (projectId, connectorId, threadId) => {
    agentChatPersistSkipRef.current = true;
    const session = await loadAgentChatSession(projectId, connectorId, threadId);
    const threadMeta = agentChatThreadIndexRef.current.threads.find(
      (t) => t.threadId === threadId,
    );
    const artifactRef =
      session?.artifactRef ?? threadMeta?.artifactRef ?? null;
    const filename = session?.filename ?? threadMeta?.filename ?? null;
    const cardId = session?.cardId ?? threadMeta?.cardId ?? null;

    let messages = [];
    const markdown = await loadThreadTranscript({
      folderHandle,
      artifactRef,
      filename,
    });
    if (markdown) {
      messages = parseAgentChatTranscript(markdown);
    }
    if (!messages.length && session?.messages?.length) {
      messages = session.messages;
    }

    agentContextRegistryRef.current = session?.registry
      ?? createContextRegistry();
    setAgentChatMessages(messages);
    agentChatArtifactMetaRef.current = {
      artifactRef,
      filename,
      cardId,
    };
    setAgentChatArtifactRef(artifactRef);
    agentChatIdRef.current = maxAgentChatMessageId(messages);

    const cardIdResolved = ensureThreadChatCardOnCanvas(threadId, {
      artifactRef,
      content_hash: '',
    });
    if (cardIdResolved && cardIdResolved !== cardId) {
      agentChatArtifactMetaRef.current.cardId = cardIdResolved;
      const index = linkCardToThreadInIndex(
        agentChatThreadIndexRef.current,
        threadId,
        { cardId: cardIdResolved },
      );
      agentChatThreadIndexRef.current = index;
      setAgentChatThreadIndex(index);
      saveThreadIndexLocal(projectId, connectorId, index);
      if (session) {
        await saveAgentChatSession(projectId, connectorId, threadId, {
          messages,
          registry: serializeRegistry(agentContextRegistryRef.current),
          artifactRef,
          filename,
          title: threadMeta?.title ?? session.title,
          cardId: cardIdResolved,
        });
      }
    }

    if (cardIdResolved) {
      setActiveCardId(cardIdResolved);
      removeCardFromSelection(cardIdResolved);
    }

    setAgentChatArtifactSyncReason(null);
    setAgentChatPersistTrimmed(false);
    agentChatPersistSkipRef.current = false;

    if (
      session?.messages?.length
      && messages.length
      && messages.length !== session.messages.length
    ) {
      void requestThreadTranscriptSync(messages, {
        reason: 'reconcileAfterLoad',
        projectId,
        connectorId,
        threadId,
      });
    }
  }, [
    folderHandle,
    ensureThreadChatCardOnCanvas,
    requestThreadTranscriptSync,
    removeCardFromSelection,
  ]);

  const loadAgentChatThreadIndexEarly = useCallback(async (projectId, connectorId) => {
    if (!projectId || !connectorId) {
      const empty = emptyThreadIndex();
      agentChatThreadIndexRef.current = empty;
      setAgentChatThreadIndex(empty);
      return empty;
    }
    await migrateLegacyAgentChatToThreads(projectId, connectorId);
    const index = await loadThreadIndex(projectId, connectorId);
    agentChatThreadIndexRef.current = index;
    setAgentChatThreadIndex(index);
    return index;
  }, []);

  const loadAgentChatThreadIndexEarlyRef = useRef(loadAgentChatThreadIndexEarly);
  useEffect(() => {
    loadAgentChatThreadIndexEarlyRef.current = loadAgentChatThreadIndexEarly;
  }, [loadAgentChatThreadIndexEarly]);

  const refreshAgentChatThreads = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    const connectorId = singleConnectorId;
    if (!projectId || !connectorId) return;

    await migrateLegacyAgentChatToThreads(projectId, connectorId);

    let index = await loadThreadIndex(projectId, connectorId);
    const discoveredCanvas = discoverThreadsFromCanvas(
      stateRef.current.cards,
      connectorId,
    );
    const discoveredStaged = discoverThreadsFromStaged(
      stagedSyncCardsRef.current,
      connectorId,
    );
    const discovered = [...discoveredCanvas, ...discoveredStaged];
    index = mergeDiscoveredThreads(index, discovered, connectorId);
    await saveThreadIndexLocal(projectId, connectorId, index);
    setAgentChatThreadIndex(index);
    return index;
  }, [singleConnectorId]);

  const handleCreateAgentThread = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    const connectorId = singleConnectorId;
    if (!projectId || !connectorId) return;

    const meta = createThreadMeta({ connectorId });
    let index = upsertThreadInIndex(agentChatThreadIndexRef.current, meta);
    index = setActiveThreadInIndex(index, meta.threadId);
    saveThreadIndexLocal(projectId, connectorId, index);
    agentChatThreadIndexRef.current = index;
    setAgentChatThreadIndex(index);
    setActiveThreadId(meta.threadId);
    setThreadPickerOpen(false);

    setAgentChatMessages([]);
    setAgentChatError(null);
    agentContextRegistryRef.current = createContextRegistry();
    agentChatArtifactMetaRef.current = {
      artifactRef: null,
      filename: meta.filename,
      cardId: null,
    };
    setAgentChatArtifactRef(null);
    agentChatIdRef.current = 0;

    await requestThreadTranscriptSync([], {
      reason: 'threadCreated',
      projectId,
      connectorId,
      threadId: meta.threadId,
      title: meta.title,
    });
    const cardId = ensureThreadChatCardOnCanvas(meta.threadId);
    if (cardId) {
      index = linkCardToThreadInIndex(index, meta.threadId, { cardId });
      agentChatThreadIndexRef.current = index;
      setAgentChatThreadIndex(index);
      saveThreadIndexLocal(projectId, connectorId, index);
      agentChatArtifactMetaRef.current.cardId = cardId;
      setActiveCardId(cardId);
      removeCardFromSelection(cardId);
    }
  }, [
    singleConnectorId,
    requestThreadTranscriptSync,
    ensureThreadChatCardOnCanvas,
    removeCardFromSelection,
  ]);

  const handleSelectAgentThread = useCallback(
    async (threadId) => {
      const projectId = activeProjectIdRef.current;
      const connectorId = singleConnectorId;
      if (!projectId || !connectorId) return;

      const outgoingId = activeThreadIdRef.current;
      if (outgoingId && outgoingId !== threadId) {
        await requestThreadTranscriptSync(agentChatMessagesRef.current, {
          reason: 'threadSwitching',
          projectId,
          connectorId,
          threadId: outgoingId,
          registrySerialized: serializeRegistry(agentContextRegistryRef.current),
        });
      }

      const index = setActiveThreadInIndex(
        agentChatThreadIndexRef.current,
        threadId,
      );
      saveThreadIndexLocal(projectId, connectorId, index);
      agentChatThreadIndexRef.current = index;
      setAgentChatThreadIndex(index);
      setActiveThreadId(threadId);
      setThreadPickerOpen(false);
      await loadThreadSessionIntoState(projectId, connectorId, threadId);
    },
    [singleConnectorId, loadThreadSessionIntoState, requestThreadTranscriptSync],
  );

  const handleRenameAgentThread = useCallback(
    async (threadId, title) => {
      const projectId = activeProjectIdRef.current;
      const connectorId = singleConnectorId;
      if (!projectId || !connectorId) return;
      const trimmed = String(title).trim();
      if (!trimmed) return;

      const index = renameThreadInIndex(
        agentChatThreadIndexRef.current,
        threadId,
        trimmed,
      );
      await saveThreadIndexLocal(projectId, connectorId, index, {
        awaitRemote: true,
      });
      agentChatThreadIndexRef.current = index;
      setAgentChatThreadIndex(index);

      const threadMeta = index.threads.find((t) => t.threadId === threadId);
      if (threadMeta?.filename) {
        const threadIdx = index.threads.findIndex((t) => t.threadId === threadId);
        const suppressedKeys = readSuppressedSyncKeys(projectId, stateRef.current);
        const prevCards = stateRef.current.cards;
        const prevStaged = stagedSyncCardsRef.current;

        const cardResult = ensureAgentChatCardOnCanvas(
          prevCards,
          {
            filename: threadMeta.filename,
            cardId: threadMeta.cardId,
            title: trimmed,
            threadId,
            threadIndex: threadIdx >= 0 ? threadIdx : 0,
            syncResult: {
              artifactRef: threadMeta.artifactRef,
              content_hash: '',
            },
          },
          {
            suppressedKeys,
            stagedSyncCards: prevStaged,
            threads: index.threads,
          },
        );

        const stagedResult = stageAgentChatCard(
          cardResult.stagedSyncCards ?? prevStaged,
          cardResult.cards,
          { filename: threadMeta.filename, title: trimmed },
        );

        const nextCards = cardResult.cards;
        const nextStaged = stagedResult.stagedCards;
        if (nextCards !== prevCards || nextStaged !== prevStaged) {
          stateRef.current = { ...stateRef.current, cards: nextCards };
          setState((prev) => ({ ...prev, cards: nextCards }));
          setStagedSyncCards(nextStaged);
          stagedSyncCardsRef.current = nextStaged;
          requestStructuralSync();
        }
      }

      const messages =
        threadId === activeThreadIdRef.current
          ? agentChatMessagesRef.current
          : (await loadAgentChatSession(projectId, connectorId, threadId))?.messages ?? [];

      await requestThreadTranscriptSync(messages, {
        reason: 'threadRenamed',
        projectId,
        connectorId,
        threadId,
        title: trimmed,
      });
    },
    [singleConnectorId, requestThreadTranscriptSync, requestStructuralSync],
  );

  const handleSwitchAgentThread = useCallback(() => {
    setThreadPickerOpen(true);
  }, []);

  const handleDeleteAgentThread = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    const connectorId = singleConnectorId;
    const threadId = activeThreadIdRef.current;
    if (!projectId || !connectorId || !threadId) return;
    if (!window.confirm(strings.agent.threadsDeleteConfirm)) return;

    const threadMeta = agentChatThreadIndexRef.current.threads.find(
      (t) => t.threadId === threadId,
    );
    if (threadMeta?.cardId) {
      const card = stateRef.current.cards.find((c) => c.id === threadMeta.cardId);
      if (card?.key) addSuppressedSyncKey(projectId, card.key);
      const nextState = {
        ...stateRef.current,
        cards: stateRef.current.cards.filter((c) => c.id !== threadMeta.cardId),
      };
      stateRef.current = nextState;
      setState(nextState);
    }

    await deleteThreadSession(projectId, connectorId, threadId);
    let index = removeThreadFromIndex(agentChatThreadIndexRef.current, threadId);
    saveThreadIndexLocal(projectId, connectorId, index);
    setAgentChatThreadIndex(index);
    setActiveThreadId(null);
    setAgentChatMessages([]);
    setThreadPickerOpen(true);
    agentChatArtifactMetaRef.current = { artifactRef: null, filename: null, cardId: null };
    setAgentChatArtifactRef(null);
  }, [singleConnectorId]);

  const handleRetryChatSync = useCallback(async () => {
    if (!agentChatMessages.length || chatSyncRetrying) return;
    setChatSyncRetrying(true);
    try {
      const result = await requestThreadTranscriptSync(agentChatMessages);
      if (result?.ok) {
        setSyncStatus({ toast: strings.agent.agentChatRetrySuccess });
        setTimeout(() => setSyncStatus(null), 2500);
      } else if (result?.reason !== 'skipped') {
        setSyncStatus({ error: strings.agent.agentChatRetryFailed });
        setTimeout(() => setSyncStatus(null), 4000);
      }
    } finally {
      setChatSyncRetrying(false);
    }
  }, [agentChatMessages, chatSyncRetrying, persistAgentChatSession]);

  useEffect(() => {
    if (
      !activeProjectId
      || !singleConnectorId
      || projectSwitchLoading
      || switchingProjectRef.current
    ) {
      return undefined;
    }
    let cancelled = false;
    agentChatPersistSkipRef.current = true;
    (async () => {
      const index = await refreshAgentChatThreads();
      if (cancelled) return;

      if (reconcileAllThreadChatCards()) {
        requestStructuralSync();
      }

      if (!index?.activeThreadId) {
        setActiveThreadId(null);
        setThreadPickerOpen(true);
        setAgentChatMessages([]);
        agentContextRegistryRef.current = createContextRegistry();
        agentChatArtifactMetaRef.current = {
          artifactRef: null,
          filename: null,
          cardId: null,
        };
        setAgentChatArtifactRef(null);
        agentChatIdRef.current = 0;
        agentChatPersistSkipRef.current = false;
        return;
      }

      setActiveThreadId(index.activeThreadId);
      setThreadPickerOpen(false);
      await loadThreadSessionIntoState(
        activeProjectId,
        singleConnectorId,
        index.activeThreadId,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeProjectId,
    singleConnectorId,
    refreshAgentChatThreads,
    loadThreadSessionIntoState,
    reconcileAllThreadChatCards,
    requestStructuralSync,
    projectSwitchLoading,
  ]);

  useEffect(() => {
    const wasOffline = prevAgentConnectorsOfflineRef.current;
    prevAgentConnectorsOfflineRef.current = agentConnectorsOffline;
    if (
      wasOffline &&
      !agentConnectorsOffline &&
      agentChatArtifactSyncReason &&
      agentChatMessages.length > 0 &&
      !agentChatPersistSkipRef.current
    ) {
      void requestThreadTranscriptSync(agentChatMessagesRef.current, {
        reason: 'connectivityRetry',
      });
    }
  }, [
    agentConnectorsOffline,
    agentChatArtifactSyncReason,
    requestThreadTranscriptSync,
  ]);

  useEffect(() => {
    if (!agentPanelOpen) {
      agentPanelOpenSyncRetryRef.current = false;
      return undefined;
    }
    if (agentPanelMode !== 'single') return undefined;
    if (agentPanelOpenSyncRetryRef.current) return undefined;
    if (!agentChatArtifactSyncReason || !agentChatMessages.length) return undefined;
    if (agentChatPersistSkipRef.current) return undefined;

    let cancelled = false;
    agentPanelOpenSyncRetryRef.current = true;
    (async () => {
      try {
        const available = await isApiAvailable();
        if (!cancelled && available) {
          await requestThreadTranscriptSync(agentChatMessagesRef.current, {
            reason: 'connectivityRetry',
          });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    agentPanelOpen,
    agentPanelMode,
    agentChatArtifactSyncReason,
    requestThreadTranscriptSync,
  ]);

  const handleClearAgentChat = useCallback(() => {
    if (!window.confirm(strings.agent.agentChatClearConfirm)) return;
    const projectId = activeProjectIdRef.current;
    const threadId = activeThreadIdRef.current;
    if (projectId && singleConnectorId && threadId) {
      const threadMeta = agentChatThreadIndexRef.current.threads.find(
        (t) => t.threadId === threadId,
      );
      clearAgentChatSession(projectId, singleConnectorId, threadId);
      saveAgentChatSession(projectId, singleConnectorId, threadId, {
        messages: [],
        registry: serializeRegistry(createContextRegistry()),
        artifactRef: threadMeta?.artifactRef ?? null,
        filename: threadMeta?.filename ?? null,
        title: threadMeta?.title ?? null,
        cardId: threadMeta?.cardId ?? null,
      });
    }
    setAgentChatMessages([]);
    setAgentChatError(null);
    agentContextRegistryRef.current = createContextRegistry();
    const threadMeta = agentChatThreadIndexRef.current.threads.find(
      (t) => t.threadId === activeThreadIdRef.current,
    );
    agentChatArtifactMetaRef.current = {
      artifactRef: threadMeta?.artifactRef ?? null,
      filename: threadMeta?.filename ?? null,
      cardId: threadMeta?.cardId ?? null,
    };
    setAgentChatArtifactRef(threadMeta?.artifactRef ?? null);
    void requestThreadTranscriptSync([], {
      reason: 'threadCleared',
      projectId,
      connectorId: singleConnectorId,
      threadId,
    });
    setSyncStatus({ toast: strings.agent.agentChatCleared });
    setTimeout(() => setSyncStatus(null), 3000);
  }, [singleConnectorId, requestThreadTranscriptSync]);

  const handleClearAgentApiKey = useCallback(
    async (provider) => {
      try {
        const projectId = activeProjectIdRef.current;
        if (projectId && singleConnectorId) {
          clearAgentChatSessionsForProject(projectId);
        }
        await deleteAgentCredential(provider);
        setAgentChatMessages([]);
        setAgentChatError(null);
        agentContextRegistryRef.current = createContextRegistry();
        agentChatArtifactMetaRef.current = { artifactRef: null, filename: null };
        setAgentChatArtifactRef(null);
        await refreshAgentConnectors();
      } catch (e) {
        setSyncStatus({ error: e.message });
        setTimeout(() => setSyncStatus(null), 4000);
      }
    },
    [refreshAgentConnectors, singleConnectorId],
  );

  const setAgentExtendedContextPersisted = useCallback((value) => {
    setAgentExtendedContext(value);
    writeAgentExtendedContext(value);
  }, []);

  const agentContextCards = useMemo(() => {
    if (!agentPanelOpen || agentPanelMode !== 'single') return [];
    return resolveEffectiveAgentContextCards({
      mode: agentContextMode,
      cards: state.cards,
      selectedCardIds,
      viewportSize: canvasViewportSize,
      canvasView: state.canvasView,
      registry: agentContextRegistryRef.current,
      activeThreadId,
      threadIndex: agentChatThreadIndex,
      connectorId: singleConnectorId,
    });
  }, [
    agentPanelOpen,
    agentPanelMode,
    agentContextMode,
    state.cards,
    selectedCardIds,
    canvasViewportSize,
    state.canvasView,
    activeThreadId,
    agentChatThreadIndex,
    singleConnectorId,
    agentChatMessages.length,
  ]);

  useEffect(() => {
    if (!agentPanelOpen || agentPanelMode !== 'single') {
      setAgentContextEstimates([]);
      return undefined;
    }
    const cards = agentContextCards;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const profile = agentExtendedContext ? 'extended' : 'standard';
      try {
        const estimates = await estimateContextDocuments(cards, {
          folderHandle,
          profile,
        });
        if (!cancelled) setAgentContextEstimates(estimates);
      } catch {
        if (!cancelled) setAgentContextEstimates([]);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    agentPanelOpen,
    agentPanelMode,
    agentContextMode,
    agentExtendedContext,
    agentContextCards,
    folderHandle,
  ]);

  const contextDeliveryState = useMemo(() => {
    if (!agentPanelOpen || agentPanelMode !== 'single') {
      return { sentKeys: new Set(), pendingAdd: [], pendingRemove: [], stable: [] };
    }
    return computeContextDeliveryState(agentContextRegistryRef.current, agentContextCards);
  }, [agentPanelOpen, agentPanelMode, agentContextCards, agentChatMessages.length]);

  const agentContextDeliveryByCardId = useMemo(() => {
    const folderLinked = Boolean(folderHandle);
    const registry = agentContextRegistryRef.current;
    return Object.fromEntries(
      agentContextCards.map((c) => [
        c.id,
        getContextDeliveryStatus(c, registry, { folderLinked }),
      ]),
    );
  }, [agentContextCards, folderHandle, contextDeliveryState]);

  const handleRefreshContextSession = useCallback(() => {
    if (!window.confirm(strings.agent.contextRefreshConfirm)) return;
    agentContextRegistryRef.current = createContextRegistry();
    const nextMessages = agentChatMessagesRef.current.filter(
      (m) => m.kind !== 'context_add' && m.kind !== 'context_remove',
    );
    setAgentChatMessages(nextMessages);
    void requestThreadTranscriptSync(nextMessages, { reason: 'contextRefresh' });
    setSyncStatus({ toast: strings.agent.contextRefresh });
    setTimeout(() => setSyncStatus(null), 3000);
  }, [requestThreadTranscriptSync]);

  const handleAgentSendMessage = useCallback(
    async (payload) => {
      const { text, contextMode: mode, contextCards = [] } =
        typeof payload === 'string' ? { text: payload } : payload;
      const contextLabels = contextCards.map((c) => cardLabel(c));

      if (agentPanelMode !== 'single') {
        setAgentMessages((prev) => [
          ...prev,
          {
            text,
            at: Date.now(),
            contextMode: mode,
            contextLabels,
          },
        ]);
        return;
      }

      const provider = getConnectorProvider(singleConnectorId);
      if (!provider) return;

      const registry = agentContextRegistryRef.current;
      const diff = diffContextRegistry(registry, contextCards);
      const profile = agentExtendedContext ? 'extended' : 'standard';
      const systemContext = MINIMAL_AGENT_SYSTEM_CONTEXT;

      setAgentChatLoading(true);
      setAgentChatError(null);
      setAgentLastTokenEstimate(null);

      let userMsg = null;
      try {
        let addDocuments = [];
        if (diff.added.length) {
          const rawDocuments = await buildContextDocuments(diff.added, {
            folderHandle,
            profile,
          });
          addDocuments = applyContextAddBudget(rawDocuments, profile);
          setAgentContextStatusByCardId((prev) => ({
            ...prev,
            ...Object.fromEntries(
              addDocuments.map((d) => [
                d.cardId,
                d.truncated && d.status === 'included' ? 'included' : d.status,
              ]),
            ),
          }));
        }

        const deltaMessages = [];
        const now = Date.now();
        if (diff.added.length && addDocuments.length) {
          const ctxFields = contextAddMessageFields(
            mode,
            addDocuments,
            diff.added.map((c) => c.id),
          );
          deltaMessages.push({
            id: `ctx-add-${++agentChatIdRef.current}`,
            role: 'user',
            kind: 'context_add',
            contextMode: mode,
            at: now,
            ...ctxFields,
          });
        }
        if (diff.removed.length) {
          deltaMessages.push({
            id: `ctx-rm-${++agentChatIdRef.current}`,
            role: 'user',
            kind: 'context_remove',
            content: formatContextRemoveMessage(diff.removed),
            labels: diff.removed.map((r) => r.label),
            at: now,
          });
        }

        const userId = `u-${++agentChatIdRef.current}`;
        userMsg = { id: userId, role: 'user', content: text, at: now };
        const outgoingMessages = [...deltaMessages, userMsg];
        const hydrateOpts = {
          cards: stateRef.current.cards,
          folderHandle,
          contextMode: mode,
          profile,
        };
        const historyForApi = await buildApiMessageHistoryAsync(
          [...agentChatMessages, ...outgoingMessages],
          hydrateOpts,
        );

        try {
          const estimate = await estimateAgentChat({
            provider,
            messages: historyForApi,
            systemContext,
          });
          setAgentLastTokenEstimate(estimate);
          if (estimate.inputTokens > AGENT_TOKEN_CONFIRM_THRESHOLD) {
            const ok = window.confirm(
              strings.agent.contextLargeTokenConfirm(
                estimate.inputTokens,
                estimate.estimatedInputUsd ?? 0,
              ),
            );
            if (!ok) return;
          }
        } catch {
          /* estimate is optional */
        }

        const { reply } = await sendAgentChat({
          provider,
          messages: historyForApi,
          systemContext,
        });

        for (const card of diff.added) {
          registerContextCard(registry, card);
        }
        for (const entry of diff.removed) {
          unregisterContextCard(registry, entry.cardId);
        }

        const assistantMsg = {
          id: `a-${++agentChatIdRef.current}`,
          role: 'assistant',
          content: reply,
          at: Date.now(),
        };
        const finalMessages = [
          ...agentChatMessages,
          ...deltaMessages,
          userMsg,
          assistantMsg,
        ];
        setAgentChatMessages(finalMessages);
        await requestThreadTranscriptSync(finalMessages, { reason: 'chatTurnComplete' });

        if (diff.added.length) {
          setSyncStatus({
            toast: strings.agent.contextFilesAddedToast(diff.added.length),
          });
          setTimeout(() => setSyncStatus(null), 4000);
        } else if (diff.removed.length) {
          setSyncStatus({
            toast: strings.agent.contextFilesRemovedToast(diff.removed.length),
          });
          setTimeout(() => setSyncStatus(null), 4000);
        }

        const truncSummary = formatTruncationSummary(addDocuments);
        if (truncSummary) {
          setTimeout(() => {
            setSyncStatus({
              toast: strings.agent.contextTruncatedAfterSend(truncSummary),
            });
            setTimeout(() => setSyncStatus(null), 5000);
          }, diff.added.length ? 4500 : 0);
        }
      } catch (e) {
        if (userMsg) {
          const rolledBack = agentChatMessagesRef.current.filter(
            (m) => m.id !== userMsg.id,
          );
          setAgentChatMessages(rolledBack);
          void requestThreadTranscriptSync(rolledBack, { reason: 'chatTurnFailed' });
        }
        setAgentChatError(e.message || strings.agent.chatError);
      } finally {
        setAgentChatLoading(false);
      }
    },
    [
      agentPanelMode,
      singleConnectorId,
      agentChatMessages,
      folderHandle,
      agentExtendedContext,
      requestThreadTranscriptSync,
    ],
  );

  const handleAgentChatCardActivate = useCallback(
    (card) => {
      if (!card || card.type !== 'agent_chat' || !singleConnectorId) return;
      const thread = resolveThreadForCard(
        agentChatThreadIndexRef.current,
        card,
        singleConnectorId,
      );
      if (!thread?.threadId) return;
      setAgentPanelOpen(true);
      void handleSelectAgentThread(thread.threadId);
    },
    [singleConnectorId, handleSelectAgentThread],
  );

  const agentChatLiveCardId = useMemo(() => {
    const thread = agentChatThreadIndex.threads.find(
      (t) => t.threadId === activeThreadId,
    );
    return thread?.cardId ?? null;
  }, [agentChatThreadIndex, activeThreadId]);

  const showAgentComingSoon = useCallback(() => {
    setSyncStatus({ toast: strings.agent.addAgentComingSoon });
    setTimeout(() => setSyncStatus(null), 3000);
  }, []);

  const openInspector = useCallback((selection) => {
    setInspectorSelection(selection);
    setInspectorOpen(true);
    if (selection.type === 'cluster') {
      setSelectedClusterId(selection.id);
    }
  }, []);

  const toggleCardSelect = useCallback((cardId) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const clearCardSelection = useCallback(() => {
    setSelectedCardIds(new Set());
  }, []);

  const clusterMemberOptions = useMemo(
    () => ({
      threads: agentChatThreadIndex.threads,
      connectorId: singleConnectorId,
    }),
    [agentChatThreadIndex.threads, singleConnectorId],
  );

  const clusterSelectionStats = useMemo(() => {
    const cards = state.cards.filter((c) => selectedCardIds.has(c.id));
    return clusterSelectionStatsFromCards(cards, clusterMemberOptions);
  }, [state.cards, selectedCardIds, clusterMemberOptions]);

  const handleCreateClusterFromSelection = useCallback(
    async ({ name, purpose }) => {
      const projectId = activeProjectIdRef.current;
      if (!projectId) {
        setSyncStatus({ error: strings.inspector.emptyNoCluster });
        setTimeout(() => setSyncStatus(null), 4000);
        return;
      }
      const cards = stateRef.current.cards.filter((c) => selectedCardIds.has(c.id));
      const members = artifactMembersFromCards(cards, clusterMemberOptions);
      if (members.length === 0) {
        setSyncStatus({ error: strings.cluster.noArtifactsSelected });
        setTimeout(() => setSyncStatus(null), 4000);
        return;
      }
      const healthStatus = await refreshClusterApiHealth();
      if (!healthStatus.available) {
        const msg =
          healthStatus.reason === 'api_unreachable'
            ? strings.cluster.apiUnreachableBanner
            : strings.cluster.dbUnavailableBanner;
        setSyncStatus({ error: msg });
        setTimeout(() => setSyncStatus(null), 6000);
        return;
      }
      setCreatingCluster(true);
      try {
        const parentClusterId = await resolveWorkspaceClusterId(
          projectId,
          stateRef.current.projectName,
        );
        if (parentClusterId) {
          clusterContextProjectIdRef.current = projectId;
          setClusterId(parentClusterId);
        }
        if (!parentClusterId) {
          setSyncStatus({ error: strings.inspector.emptyNoCluster });
          setTimeout(() => setSyncStatus(null), 4000);
          return;
        }
        const { cluster } = await createSubCluster({
          parentClusterId,
          projectId,
          name,
          purpose,
          members,
        });
        setCreateClusterOpen(false);
        clearCardSelection();
        openInspector({ type: 'cluster', id: cluster.id });
        await refreshGraph();
        setSyncStatus({ toast: strings.cluster.created });
        setTimeout(() => setSyncStatus(null), 4000);
      } catch (e) {
        setSyncStatus({ error: e.message || strings.cluster.createFailed });
        setTimeout(() => setSyncStatus(null), 4000);
      } finally {
        setCreatingCluster(false);
      }
    },
    [
      selectedCardIds,
      clearCardSelection,
      openInspector,
      refreshGraph,
      refreshClusterApiHealth,
      clusterMemberOptions,
    ],
  );

  const loadProjectIntoState = useCallback(async (
    projectId,
    {
      localOnly = false,
      switchSeq,
      document: documentOverride,
      hydratePreviews = true,
    } = {},
  ) => {
    const seqAtStart = switchSeq ?? null;
    const saved =
      documentOverride ?? (await loadProjectById(projectId, { localOnly }));
    const base = saved || createEmptyProjectState();
    const normalized = normalizeLoadedProject(base);
    const preferredCardId = agentChatThreadIndexRef.current.threads.find(
      (t) => t.threadId === activeThreadIdRef.current,
    )?.cardId;
    const suppressedKeys = readSuppressedSyncKeys(projectId, normalized);
    const sanitized = sanitizeAgentChatProjectState(
      normalized.cards,
      normalized.stagedSyncCards,
      {
        connectorId: singleConnectorId,
        preferredCardId,
        suppressedKeys,
        threads: agentChatThreadIndexRef.current?.threads ?? [],
      },
    );
    let rawCards = sanitized.cards;
    if (folderHandle && folderPresentKeysRef.current?.length) {
      rawCards = await hydrateStrippedCardContent(rawCards, {
        folderHandle,
        folderPresentKeys: folderPresentKeysRef.current,
      });
    }
    const stagedRaw = sanitized.stagedSyncCards;
    const cleanedPersist =
      rawCards.length !== (normalized.cards ?? []).length
      || stagedRaw.length !== (normalized.stagedSyncCards ?? []).length
      || sanitized.keysMigrated;
    const hydrateOpts = {
      localOnly,
      chunkSize: hydratePreviews && localOnly ? PREVIEW_HYDRATE_CHUNK_SIZE : 0,
    };
    let cards = hydratePreviews
      ? await hydrateCardsPreviews(rawCards, hydrateOpts)
      : rawCards;
    const stagedHydrated =
      hydratePreviews && stagedRaw.length > 0
        ? await hydrateCardsPreviews(stagedRaw, hydrateOpts)
        : stagedRaw;
    const seqNow = switchSeq != null ? projectSwitchSeqRef.current : null;
    if (
      !shouldApplyProjectLoad(
        projectId,
        activeProjectIdRef.current,
        seqAtStart,
        seqNow,
      )
    ) {
      return null;
    }
    if (switchSeq != null) {
      const liveCards = stateRef.current.cards ?? [];
      if (liveCards.length > 0) {
        cards = mergePersistedCardsIntoCanvas(liveCards, cards, {
          preferLiveMembership: false,
        });
      }
    }
    lastLoadedCardsRef.current = cards;
    projectHydratedRef.current.add(projectId);
    recordGoodLocalCardCount(projectId, cards.length);
    const { stagedSyncCards: _staged, ...stateWithoutStaged } = normalized;
    setState((prev) => ({
      ...stateWithoutStaged,
      cards,
      projectName: projectNameDirtyRef.current
        ? prev.projectName
        : (stateWithoutStaged.projectName ?? prev.projectName),
    }));
    setStagedSyncCards(stagedHydrated);
    if (
      cleanedPersist
      && !switchingProjectRef.current
      && initialHydratedRef.current
    ) {
      void saveProjectById(
        projectId,
        { ...stateWithoutStaged, cards },
        stagedHydrated,
        { pushRemote: true },
      );
    }
    if (projectId && isServerSyncEnabled()) {
      void seedClientRevisionFromMeta(projectId);
    }
    return cards;
  }, [singleConnectorId, folderHandle]);

  const handleClearLocalCache = useCallback(async () => {
    if (!isServerSyncEnabled()) {
      setSyncStatus({ banner: strings.projects.clearLocalCacheUnavailable });
      return;
    }
    const projectId = activeProjectIdRef.current;
    clearLocalProjectCaches({ activeProjectId: projectId, keepActive: false });
    setSyncStatus({ toast: strings.projects.clearLocalCacheDone });
    if (projectId) {
      const pullResult = await pullProjectDocumentIfServerNewer(projectId, {
        force: true,
      });
      if (pullResult.pulled) {
        await applyServerPullResult(projectId, pullResult, { allowFit: false });
      } else {
        await loadProjectIntoState(projectId, { hydratePreviews: true });
      }
    }
    setTimeout(() => setSyncStatus(null), 6000);
  }, [applyServerPullResult, loadProjectIntoState]);

  useEffect(() => {
    if (!loaded) return undefined;
    return subscribeProjectCacheChanges((projectId) => {
      if (projectId !== activeProjectIdRef.current) return;
      if (isCanvasInteractionActive()) return;
      void runExclusive('cache-tab', async () => {
        await applyReconcileFromServer(projectId, { showPullToast: true });
        if (!isCanvasInteractionActive()) {
          await loadProjectIntoStateRef.current(projectId, { localOnly: true });
        }
      }, { mode: 'skip' });
    });
  }, [loaded, applyReconcileFromServer]);

  useEffect(() => {
    loadProjectIntoStateRef.current = loadProjectIntoState;
  }, [loadProjectIntoState]);

  useEffect(() => {
    applyClusterContextForProjectRef.current = applyClusterContextForProject;
  }, [applyClusterContextForProject]);

  const persistFolderConnection = useCallback(async (handle) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId || !handle) return;
    let stored = false;
    try {
      stored = await verifyFolderHandleStored(projectId, handle);
    } catch {
      stored = false;
    }
    if (!stored) {
      setFolderHandle(null);
      setFolderStoredOnDevice(false);
      setSyncStatus({ toast: strings.sync.folderSaveFailed });
      setTimeout(() => setSyncStatus(null), 5000);
      return;
    }
    setFolderHandle(handle);
    setFolderStoredOnDevice(true);
    setCachedFolderHandle(projectId, handle);
    const index = await setConnectedFolder(projectId, handle.name);
    if (index?.projects) setProjectList(projectsForMenuFromIndex(index));
  }, []);

  const resetProjectUi = useCallback(() => {
    folderRestoreHandledSeqRef.current = null;
    setFolderLinkInProgress(false);
    setFolderLinkProbeComplete(false);
    setFolderHandle(null);
    setFolderStoredOnDevice(false);
    setFolderPresentKeys(null);
    setActiveCardId(null);
    setOpenCardId(null);
    setVersionStackOpen(null);
    setConfirmChanges(null);
    setSearchQuery('');
    setShowSearch(false);
    setChangeFolderDialog(false);
    setAgentPanelOpen(false);
    setAgentMessages([]);
    setInspectorOpen(false);
    setInspectorSelection(null);
    setStagedSyncCards([]);
    setStagingDragActive(false);
    setTrayRevealActive(false);
    setCardDockHover(false);
    trayDropRectRef.current = null;
    setActiveThreadId(null);
    setAgentChatThreadIndex({ version: 1, activeThreadId: null, threads: [] });
    setThreadPickerOpen(false);
    setClusterId(null);
    clusterContextProjectIdRef.current = null;
    setSelectedClusterId(null);
    setClusterHullSource(EMPTY_CLUSTER_HULL_SOURCE);
    setCanvasEdges([]);
    setLinkCountByCardId(new Map());
    setInspectorSelection((sel) => {
      if (sel?.type === 'cluster') {
        setInspectorOpen(false);
        return null;
      }
      return sel;
    });
  }, []);

  const flushOutgoingProjectToServer = useCallback(
    async (projectId, state, stagedSyncCards) => {
      if (!projectId || !isServerSyncEnabled()) {
        return { pushOk: true, pushResult: { ok: true, skipped: true } };
      }
      perfMark('switch/flush-out-start');
      const payload = buildProjectSavePayload(state, stagedSyncCards);
      const pushResult = await flushOutgoingProjectDocument(projectId, payload);
      await setProjectDisplayName(
        projectId,
        state.projectName,
        state,
        stagedSyncCards,
      );
      await flushProjectSync();
      perfMark('switch/flush-out-end');
      perfMeasure(
        'switch/flush-out',
        'switch/flush-out-start',
        'switch/flush-out-end',
      );
      return { pushOk: Boolean(pushResult.ok), pushResult };
    },
    [],
  );

  const backgroundSyncStartedRef = useRef(false);
  const applyServerPullResultRef = useRef(async () => null);

  const finishBootUi = useCallback(() => {
    setLoaded(true);
    setProjectSwitchLoading(false);
  }, []);

  // Load saved state (once per mount — do not re-run when cluster callbacks change)
  useEffect(() => {
    if (bootCompletedRef.current) {
      initialHydratedRef.current = true;
      finishBootUi();
      clearSyncingFromServerBanner(setSyncStatus);
      return undefined;
    }
    let cancelled = false;

    (async () => {
      try {
        const index = await ensureProjectIndex();
        if (cancelled) return;
        const activeId = resolveActiveProjectId(index);
        activeProjectIdRef.current = activeId;
        setActiveProjectId(activeId);
        setProjectList(projectsForMenuFromIndex(index));
        if (activeId) {
          await persistActiveProjectId(activeId);
        }
        if (cancelled) return;
        perfMark('boot/local');
        if (activeId) {
          await loadAgentChatThreadIndexEarlyRef.current(
            activeId,
            singleConnectorId,
          );
          await loadProjectIntoStateRef.current(activeId, {
            localOnly: true,
            hydratePreviews: false,
          });
        } else {
          setState((prev) => ({
            ...prev,
            cards: [],
            projectName: strings.defaultProjectName,
          }));
        }
        perfMark('boot/local-done');
        perfMeasure('boot/local', 'boot/local', 'boot/local-done');
        if (cancelled) return;
        finishBootUi();
        const orphanPurged = consumeOrphanPurgeNotice();
        if (orphanPurged > 0) {
          setSyncStatus({
            toast: strings.projects.purgedOrphanCaches(orphanPurged),
          });
          setTimeout(() => setSyncStatus(null), 6000);
        }
        const serverSynced = consumeServerProjectsSyncedNotice();
        if (serverSynced > 0) {
          const refreshed = await loadProjectIndex();
          if (refreshed?.projects) {
            setProjectList(projectsForMenuFromIndex(refreshed));
            applyDuplicateNameBanner(refreshed);
          }
          setSyncStatus({
            toast: strings.projects.syncedFromServer(serverSynced),
          });
          setTimeout(() => setSyncStatus(null), 6000);
        }
        const duplicatesMerged = consumeDuplicateMergeNotice();
        if (duplicatesMerged > 0) {
          const refreshed = await loadProjectIndex();
          if (refreshed?.projects) setProjectList(projectsForMenuFromIndex(refreshed));
          setSyncStatus({
            toast: strings.projects.mergedDuplicates(duplicatesMerged),
          });
          setTimeout(() => setSyncStatus(null), 6000);
        }
        const missingBody = consumeIntegrityGhostNotice();
        if (missingBody > 0) {
          setSyncStatus({
            toast: strings.projects.projectsMissingBody(missingBody),
          });
          setTimeout(() => setSyncStatus(null), 8000);
        }
        if (shouldShowDatabaseUnavailable()) {
          setSyncStatus({ banner: strings.projects.databaseUnavailable });
        } else if (getProjectSyncMode() === 'local-only') {
          setSyncStatus({ banner: strings.projects.localOnlyBanner });
        } else if (shouldShowOpenInCursorToSync()) {
          setSyncStatus({ banner: strings.projects.openInCursorToSync });
        }
      } catch (e) {
        console.error('Canvas boot failed:', e);
        if (!cancelled) {
          setSyncStatus({ banner: strings.projects.loadFailed });
        }
      } finally {
        if (!cancelled) {
          bootCompletedRef.current = true;
          initialHydratedRef.current = true;
        }
      }

      if (cancelled) return;
      const activeId = activeProjectIdRef.current;
      try {
        await withBootTimeout(
          runExclusive('boot', async () => {
            if (activeId && isServerSyncEnabled()) {
              setSyncStatus((prev) =>
                prev?.banner ? prev : { banner: strings.projects.syncingFromServer },
              );
              perfMark('boot/server-pull');
              const pullResult = await pullProjectDocumentIfServerNewer(activeId, {
                force: true,
              });
              if (cancelled) return;
              if (pullResult.pulled) {
                markBootPulledProject();
                await applyServerPullResultRef.current(activeId, pullResult, {
                  hydratePreviews: false,
                  allowFit: true,
                });
              }
              perfMark('boot/server-pull-done');
              perfMeasure(
                'boot/server-pull',
                'boot/server-pull',
                'boot/server-pull-done',
              );
              void requestActionSync('boot', { projectId: activeId });
            }
            if (cancelled) return;
            await refreshProjectListFromServer({
              reconcileScope: 'active',
              activeProjectId: activeId,
            });
            await touchActiveProjectInIndex(activeId);
            if (!cancelled && activeId) {
              void attemptRestoreRef.current(
                activeId,
                lastLoadedCardsRef.current,
              );
            }
          }),
          BOOT_LOADING_TIMEOUT_MS,
        );
      } catch (e) {
        if (e?.code === 'BOOT_TIMEOUT') {
          console.warn('Canvas post-boot sync timed out');
          if (!cancelled) {
            setSyncStatus({ banner: strings.projects.bootSyncTimeout });
          }
        } else {
          console.error('Canvas post-boot sync failed:', e);
          if (!cancelled) {
            setSyncStatus((prev) =>
              prev?.banner === strings.projects.localStorageFull
                ? prev
                : { banner: strings.projects.loadFailed },
            );
          }
        }
      } finally {
        clearSyncingFromServerBanner(setSyncStatus);
        if (!cancelled) {
          markBootSyncCompleted();
        }
      }
    })();
    return () => {
      cancelled = true;
      setProjectSwitchLoading(false);
      clearSyncingFromServerBanner(setSyncStatus);
    };
  }, [finishBootUi, refreshProjectListFromServer, applyReconcileFromServer]);

  // Background project + preview sync after UI is visible
  useEffect(() => {
    if (!loaded || !isBootSyncCompleted() || backgroundSyncStartedRef.current) {
      return undefined;
    }
    backgroundSyncStartedRef.current = true;
    let cancelled = false;
    const projectId = activeProjectId;
    (async () => {
      try {
        await runExclusive('background', async () => {
          let serverPulled = wasBootPulledThisSession();
          if (projectId && isServerSyncEnabled() && !serverPulled) {
            const pullResult = await pullProjectDocumentIfServerNewer(projectId);
            if (cancelled) return;
            if (pullResult.pulled) {
              serverPulled = true;
              await applyServerPullResult(projectId, pullResult, {
                hydratePreviews: false,
              });
              if (cancelled) return;
            }
          }
          await runProjectSyncBackground();
          const syncedCount = consumeProjectSyncRecoveryNotice();
          if (!cancelled) {
            await refreshProjectListFromServer({
              reconcileScope: 'all',
              activeProjectId: projectId,
            });
          }
          if (!cancelled && syncedCount > 0) {
            setSyncStatus({
              toast: strings.projects.recoveredFromBrowser(syncedCount),
            });
            setTimeout(() => setSyncStatus(null), 6000);
          }
          if (cancelled || !projectId) return;

          perfMark('background/hydrate-start');
          const saved = await loadProjectById(projectId, { localOnly: true });
          if (cancelled) return;
          const base = saved || createEmptyProjectState();
          const normalized = normalizeLoadedProject(base);
          const preferredCardId = agentChatThreadIndexRef.current.threads.find(
            (t) => t.threadId === activeThreadIdRef.current,
          )?.cardId;
          const sanitized = sanitizeAgentChatProjectState(
            normalized.cards,
            normalized.stagedSyncCards,
            {
              connectorId: singleConnectorId,
              preferredCardId,
              suppressedKeys: readSuppressedSyncKeys(projectId, normalized),
              threads: agentChatThreadIndexRef.current?.threads ?? [],
            },
          );
          const remoteCards = await hydrateCardsPreviews(sanitized.cards, {
            localOnly: true,
            chunkSize: PREVIEW_HYDRATE_CHUNK_SIZE,
          });
          perfMark('background/hydrate-end');
          perfMeasure(
            'background/hydrate',
            'background/hydrate-start',
            'background/hydrate-end',
          );
          const stagedChanged =
            sanitized.cards.length !== (normalized.cards ?? []).length
            || sanitized.stagedSyncCards.length !== (normalized.stagedSyncCards ?? []).length
            || sanitized.keysMigrated;
          if (stagedChanged) {
            const { stagedSyncCards: _s, cards: _c, ...rest } = normalized;
            void saveProjectById(
              projectId,
              { ...rest, cards: sanitized.cards },
              sanitized.stagedSyncCards,
              { pushRemote: true },
            );
          }
          if (!cancelled) {
            setStagedSyncCards(sanitized.stagedSyncCards);
            stagedSyncCardsRef.current = sanitized.stagedSyncCards;
          }
          if (cancelled) return;

          const { stagedSyncCards: _staged, cards: _cards, ...stateFields } = normalized;
          setState((prev) => {
            if (activeProjectIdRef.current !== projectId) return prev;
            const mergedCards = mergePersistedCardsIntoCanvas(
              prev.cards ?? [],
              remoteCards,
              {
                preferLiveMembership: !serverPulled,
                authoritativePersisted: serverPulled,
              },
            );
            return {
              ...prev,
              projectName: projectNameDirtyRef.current
                ? prev.projectName
                : (stateFields.projectName ?? prev.projectName),
              canvasView: stateFields.canvasView ?? prev.canvasView,
              cards: mergedCards,
            };
          });

          if (!cancelled) await refreshClusterApiHealth();
          await applyClusterContextForProjectRef.current(
            projectId,
            stateRef.current.projectName,
          );
        });
      } catch (e) {
        console.error('Background canvas sync failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, activeProjectId, refreshProjectListFromServer, applyServerPullResult, refreshClusterApiHealth]);

  useEffect(() => {
    if (!loaded) return undefined;
    void refreshClusterApiHealth();
  }, [loaded, refreshClusterApiHealth]);

  useEffect(() => {
    if (!loaded || !activeProjectId || switchingProjectRef.current) return;
    if (!clusterApiAvailable) return;
    if (clusterContextProjectIdRef.current === activeProjectId && clusterId) return;
    void applyClusterContextForProject(
      activeProjectId,
      stateRef.current.projectName,
    );
  }, [activeProjectId, loaded, clusterApiAvailable, clusterId, applyClusterContextForProject]);

  useEffect(() => {
    if (!loaded) return undefined;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void runExclusive('visibility', async () => {
        await refreshClusterApiHealth();
        await refreshProjectListFromServer();
        const projectId = activeProjectIdRef.current;
        if (projectId && isServerSyncEnabled()) {
          void requestActionSync('visibilityResume', { projectId });
        }
        await refreshProjectListFromServer({
          adoptDocumentNameFor:
            projectNameDirtyRef.current ? null : projectId,
        });
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [loaded, refreshProjectListFromServer, applyReconcileFromServer, refreshClusterApiHealth]);

  // Workspace index refresh only (no periodic project-document poll).
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

  useEffect(() => {
    if (
      switchingProjectRef.current
      || projectSwitchLoading
      || refreshingFromServerRef.current
    ) {
      return;
    }
    void refreshCanvasEdges();
  }, [refreshCanvasEdges, state.cards, projectSwitchLoading]);

  const persistProjectDisplayName = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    if (!projectId || !projectNameDirtyRef.current) return;
    await setProjectDisplayName(
      projectId,
      stateRef.current.projectName,
      stateRef.current,
      stagedSyncCardsRef.current,
    );
    const index = await loadProjectIndex();
    if (index?.projects) setProjectList(projectsForMenuFromIndex(index));
  }, []);

  const commitProjectDisplayName = useCallback(async () => {
    if (!projectNameDirtyRef.current) return;
    await persistProjectDisplayName();
    projectNameDirtyRef.current = false;
  }, [persistProjectDisplayName]);

  useEffect(() => {
    if (!loaded || !activeProjectId || switchingProjectRef.current || !initialHydratedRef.current) {
      return undefined;
    }
    if (!projectNameDirtyRef.current) return undefined;
    const timer = setTimeout(() => {
      void persistProjectDisplayName();
    }, 600);
    return () => clearTimeout(timer);
  }, [state.projectName, loaded, activeProjectId, persistProjectDisplayName]);

  // Flush on tab close / refresh
  useEffect(() => {
    const onPageHide = () => {
      const projectId = activeProjectIdRef.current;
      if (!projectId || !initialHydratedRef.current) return;
      void requestActionSync('pagehide', { projectId });
      if (activeThreadIdRef.current) {
        void persistAgentChatSessionRef.current(agentChatMessagesRef.current, {
          projectId,
          threadId: activeThreadIdRef.current,
          registrySerialized: serializeRegistry(agentContextRegistryRef.current),
        });
      }
      void flushAgentChatSync();
      if (singleConnectorId) {
        void flushAgentChatThreadIndexSync(projectId, singleConnectorId);
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [singleConnectorId]);

  const linkProjectFolder = useCallback(
    async (projectId, { requestIfNeeded = false, switchSeq = null } = {}) => {
      if (!projectId || !window.showDirectoryPicker) {
        setFolderStoredOnDevice(false);
        setFolderLinkProbeComplete(true);
        return {
          handle: null,
          granted: false,
          stored: false,
          needsPermission: false,
        };
      }
      const stale = () =>
        switchSeq != null && projectSwitchSeqRef.current !== switchSeq;
      try {
        const result = await linkFolderForProject(projectId, { requestIfNeeded });
        if (stale()) return result;
        setFolderStoredOnDevice(result.stored);
        if (result.granted && result.handle) {
          setFolderHandle(result.handle);
        } else {
          setFolderHandle(null);
        }
        return result;
      } catch {
        try {
          const handle = await loadFolderHandle(projectId);
          setFolderStoredOnDevice(Boolean(handle));
        } catch {
          setFolderStoredOnDevice(false);
        }
        setFolderHandle(null);
        return {
          handle: null,
          granted: false,
          stored: false,
          needsPermission: false,
        };
      } finally {
        if (!stale()) {
          setFolderLinkProbeComplete(true);
        }
      }
    },
    [],
  );

  const warnFolderNameMismatch = useCallback((projectId, handle) => {
    if (!handle?.name || !projectId) return;
    const row = projectList.find((p) => p.id === projectId);
    const expected = row?.connectedFolderName?.trim();
    if (expected && handle.name !== expected) {
      setSyncStatus({
        toast: strings.sync.folderNameMismatch(expected, handle.name),
      });
      setTimeout(() => setSyncStatus(null), 6000);
    }
  }, [projectList]);

  const continueProjectSwitchBackground = useCallback(
    async (targetId, switchSeq, outgoing = null) => {
      const stillActive = () =>
        activeProjectIdRef.current === targetId
        && projectSwitchSeqRef.current === switchSeq;

      try {
        const outgoingId = outgoing?.projectId;
        if (
          outgoingId
          && outgoingId !== targetId
          && outgoing.state
        ) {
          const flushResult = await runExclusive('switch-flush', async () =>
            flushOutgoingProjectToServer(
              outgoingId,
              outgoing.state,
              outgoing.stagedSyncCards ?? [],
            ),
          );
          if (
            flushResult
            && !flushResult.pushOk
            && flushResult.pushResult
            && !flushResult.pushResult.skipped
            && (outgoing.state.cards?.length ?? 0) > 0
          ) {
            setSyncStatus({ toast: strings.projects.switchPushFailed });
            setTimeout(() => setSyncStatus(null), 6000);
          }
          const refreshed = await loadProjectIndex();
          if (refreshed?.projects) {
            setProjectList(projectsForMenuFromIndex(refreshed));
          }
        }

        let serverPulled = false;
        if (isServerSyncEnabled()) {
          const pullResult = await reconcileProjectDocumentOnSwitch(targetId);
          if (!stillActive()) return;
          if (pullResult.pulled) {
            serverPulled = true;
            const pulledCards = await loadProjectIntoStateRef.current(targetId, {
              switchSeq,
              localOnly: true,
              document: pullResult.localCacheWritten
                ? undefined
                : pullResult.payload,
              hydratePreviews: true,
            });
            if (!stillActive()) return;
            if (!projectNameDirtyRef.current && pullResult.payload) {
              await adoptDocumentNameToIndex(targetId, pullResult.payload);
            }
            if (
              pulledCards != null
              && shouldAutoFitCanvasOnLoad(
                stateRef.current.canvasView,
                pulledCards,
              )
            ) {
              fitCanvasViewToCards(pulledCards);
            }
            if (!pullResult.localCacheWritten) {
              setSyncStatus({
                banner:
                  strings.projects.localStorageFull
                  + strings.projects.projectIdHint(targetId),
              });
            } else if (stillActive()) {
              await applyReconcileFromServer(targetId);
            }
          } else if (stillActive()) {
            await applyReconcileFromServer(targetId);
          }
        }

        if (!stillActive()) return;
        if (!serverPulled) {
          let hydrated = await loadProjectIntoStateRef.current(targetId, {
            switchSeq,
            localOnly: true,
            hydratePreviews: true,
          });
          if (
            !stillActive()
          ) {
            return;
          }
          if (
            (hydrated == null || hydrated.length === 0)
            && isServerSyncEnabled()
          ) {
            const cacheMissPull = await pullProjectDocumentIfServerNewer(targetId, {
              force: true,
            });
            if (!stillActive()) return;
            if (cacheMissPull.pulled) {
              hydrated = await loadProjectIntoStateRef.current(targetId, {
                switchSeq,
                localOnly: true,
                document: cacheMissPull.payload ?? undefined,
                hydratePreviews: true,
              });
            }
          }
          if (!stillActive()) return;
          if (
            hydrated != null
            && shouldAutoFitCanvasOnLoad(stateRef.current.canvasView, hydrated)
          ) {
            fitCanvasViewToCards(hydrated);
          }
        }

        perfMark('switch/background-done');
        perfMeasure('switch/background', 'switch/start', 'switch/background-done');

        await applyClusterContextForProjectRef.current(
          targetId,
          stateRef.current.projectName,
        );
        if (!stillActive()) return;

        await touchActiveProjectInIndex(targetId);
        void refreshProjectListFromServer({
          reconcileScope: 'none',
          activeProjectId: targetId,
        });
        const refreshedIndex = await loadProjectIndex();
        if (stillActive()) {
          syncActiveProjectNameFromIndex(refreshedIndex);
        }
      } catch (e) {
        console.error('Project switch background sync failed:', e);
      } finally {
        if (projectSwitchSeqRef.current === switchSeq) {
          setProjectSwitchLoading(false);
        }
        if (stillActive()) {
          await applyReconcileFromServer(targetId);
          const handled = folderRestoreHandledSeqRef.current;
          if (
            handled?.projectId !== targetId
            || handled?.switchSeq !== switchSeq
          ) {
            void attemptRestoreRef.current(targetId, lastLoadedCardsRef.current, {
              requestIfNeeded: false,
            });
          }
        }
      }
    },
    [
      refreshProjectListFromServer,
      syncActiveProjectNameFromIndex,
      fitCanvasViewToCards,
      applyReconcileFromServer,
      flushOutgoingProjectToServer,
    ],
  );

  const pullAndReloadActiveProject = useCallback(
    async ({ force = false, showToast = false } = {}) => {
      const projectId = activeProjectIdRef.current;
      if (!projectId || !isServerSyncEnabled()) return false;
      await flushProjectSync();
      if (force) {
        const pullResult = await pullProjectDocumentIfServerNewer(projectId, { force: true });
        if (pullResult.pulled) {
          await applyServerPullResult(projectId, pullResult, { showToast });
        }
      }
      const reconcile = await applyReconcileFromServer(projectId, { showPullToast: showToast });
      return reconcile.pulled ?? false;
    },
    [applyServerPullResult, applyReconcileFromServer],
  );

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
    resetProjectUi,
    loadProjectIntoState,
    fitCanvasViewToCards,
    continueProjectSwitchBackground,
  ]);

  const handleRequestCreateProject = useCallback(() => {
    setCreateProjectPromptOpen(true);
  }, []);

  const handleUnarchiveProject = useCallback(async (projectId) => {
    const index = await unarchiveProject(projectId);
    setProjectList(projectsForMenuFromIndex(index));
  }, []);

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

  const folderKeySet = useMemo(
    () => (folderPresentKeys ? new Set(folderPresentKeys) : null),
    [folderPresentKeys],
  );

  const prevBlobUrlsRef = useRef(new Set());
  useEffect(() => {
    const next = new Set();
    for (const c of state.cards) {
      for (const v of c.versions) {
        if (v.objectUrl) next.add(v.objectUrl);
      }
    }
    prevBlobUrlsRef.current.forEach((url) => {
      if (!next.has(url)) URL.revokeObjectURL(url);
    });
    prevBlobUrlsRef.current = next;
  }, [state.cards]);

  // ============================================================
  // Sync workflow
  // ============================================================
  const scanFolder = useCallback(async (handle, options = {}) => {
    const { baseCards, replaceCanvas = false, projectId: projectIdOption, signal } = options;
    const scanSeq = ++folderScanSeqRef.current;
    const isScanStale = () => scanSeq !== folderScanSeqRef.current || signal?.aborted;
    const cardsBaseline =
      baseCards !== undefined
        ? (baseCards ?? [])
        : (stateRef.current.cards ?? []);
    const projectId = projectIdOption ?? activeProjectIdRef.current;
    setSyncStatus({ scanning: true });
    let exitStatus = null;
    try {
    const found = [];
    try {
      for await (const entry of handle.values()) {
        if (isScanStale()) break;
        if (entry.kind === 'file') {
          const parsed = parseFilename(entry.name);
          const cacheKey = projectId
            ? previewCacheKey(projectId, parsed.fullBase, parsed.version)
            : null;
          const file = await readFileEntry(entry, { cacheKey });
          found.push(file);
        }
      }
    } catch (e) {
      exitStatus = { error: e.message };
      return;
    }
    // Group by base (prefix__name) to build version stacks
    const grouped = {};
    found.forEach(f => {
      const parsed = parseFilename(f.filename);
      const key = parsed.fullBase;
      if (!grouped[key]) grouped[key] = { parsed, versions: [] };
      grouped[key].versions.push({ ...f, ...parsed });
    });
    Object.values(grouped).forEach(g => g.versions.sort((a, b) => b.version - a.version));

    let groupedFinal = grouped;
    if (projectId) {
      const flat = [];
      Object.entries(grouped).forEach(([cardKey, group]) => {
        const existing = findSyncEntryByFolderKey(cardsBaseline, cardKey);
        group.versions.forEach((v) => {
          const cardType = cardTypeFromSync({
            ext: v.ext || group.parsed.ext,
            existingCardType: existing?.type,
            prefix: v.prefix || group.parsed.prefix,
            name: v.name || group.parsed.name,
          });
          flat.push({ ...v, cardKey, cardType });
        });
      });
      try {
        const ingest = await ingestFoundFiles(
          projectId,
          stateRef.current.projectName,
          flat,
          buildPreviousArtifactMap(cardsBaseline),
        );
        if (ingest.ok) {
          groupedFinal = applyArtifactRefsToGrouped(grouped, ingest.byFilename);
          if (ingest.clusterId) {
            clusterContextProjectIdRef.current = projectId;
            setClusterId(ingest.clusterId);
          }
          setState((prev) => ({
            ...prev,
            cards: mergeArtifactRefsIntoCards(prev.cards, groupedFinal),
          }));
          setTimeout(
            () =>
              void refreshGraph({
                clusterId: ingest.clusterId,
                projectId,
                force: true,
              }),
            0,
          );
        } else if (ingest.reason === 'api_unavailable') {
          exitStatus = { toast: strings.sync.primitivesNotUpdated };
          setTimeout(() => setSyncStatus(null), 4000);
        }
      } catch {
        /* primitives API optional when server is down */
      }
    }

    // On read errors we keep the previous key set; on success refresh presence for missing-file UI
    setFolderPresentKeys(Object.keys(groupedFinal));

    const stagedBaseline = stagedSyncCardsRef.current ?? [];
    const suppressedKeys = readSuppressedSyncKeys(projectId, stateRef.current);
    const { changes, refreshPatches, stagedRefreshPatches } = buildSyncChangesFromFolder(
      groupedFinal,
      cardsBaseline,
      stagedBaseline,
    );
    const filteredChanges = changes
      .filter((c) => !suppressedKeys.has(c.key))
      .filter((c) => !suppressedKeys.has(toCanonicalSyncKey(c.key)));
    const knownAgentChatKeys = collectKnownAgentChatKeys(
      agentChatThreadIndexRef.current,
    );
    const { autoStageAgentChat } = partitionSyncChanges(filteredChanges);

    if (isScanStale()) {
      exitStatus = { noChanges: true };
      return;
    }

    if (autoStageAgentChat.length > 0) {
      let nextStaged = stagedBaseline;
      let nextCards = cardsBaseline;
      for (const change of autoStageAgentChat) {
        if (isScanStale()) break;
        if (resolvePlacement(nextCards, nextStaged, change.key) === 'canvas') {
          continue;
        }
        const staged = buildStagedSyncCardFromChange(change);
        const upserted = upsertOnSurface(nextCards, nextStaged, {
          key: change.key,
          surface: 'dock',
          payload: staged,
          opts: { threads: agentChatThreadIndexRef.current?.threads ?? [] },
        });
        nextCards = upserted.cards;
        nextStaged = upserted.stagedSyncCards;
      }
      const exclusive = enforceExclusivePlacement(nextCards, nextStaged, {
        threads: agentChatThreadIndexRef.current?.threads ?? [],
      });
      setStagedSyncCards(exclusive.stagedSyncCards);
      stagedSyncCardsRef.current = exclusive.stagedSyncCards;
      if (exclusive.changed) {
        setState((prev) => ({ ...prev, cards: exclusive.cards }));
      }
      if (
        autoStageAgentChat.some(
          (c) => !findSyncEntryByFolderKey(stagedBaseline, c.key),
        )
      ) {
        setTrayRevealActive(true);
      }
    }

    if (stagedRefreshPatches.length > 0) {
      const stagedRefreshByKey = new Map(stagedRefreshPatches.map((p) => [p.key, p.group]));
      setStagedSyncCards((prev) =>
        prev.map((s) => {
          const group = stagedRefreshByKey.get(s.key);
          if (!group) return s;
          return {
            ...s,
            versions: mergeDiskPreviewIntoCardVersions(s.versions, group.versions),
          };
        }),
      );
    }

    const refreshByCanonical = new Map(
      refreshPatches.map((p) => [toCanonicalSyncKey(p.key), p.group]),
    );

    const canvasNow = stateRef.current.cards ?? [];
    const stagedNow = stagedSyncCardsRef.current ?? [];
    const confirmChangesList =
      scanSeq === folderScanSeqRef.current
      && !stagingDragActiveRef.current
        ? buildConfirmChangesForDialog(groupedFinal, canvasNow, stagedNow, {
          suppressedKeys,
          knownAgentChatKeys,
        })
        : [];

    const willClearCanvas = confirmChangesList.length === 0 && replaceCanvas;
    if (refreshPatches.length > 0 && !willClearCanvas) {
      let mergedCards = null;
      setState((prev) => {
        mergedCards = (prev.cards ?? []).map((c) => {
          const group =
            refreshByCanonical.get(toCanonicalSyncKey(c.key))
            ?? refreshByCanonical.get(toCanonicalSyncKey(c.versions?.[0]?.filename));
          if (!group) return c;
          return { ...c, versions: mergeDiskPreviewIntoCardVersions(c.versions, group.versions) };
        });
        return { ...prev, cards: mergedCards };
      });
      const hydrated = await hydrateCardsPreviews(mergedCards);
      if (cardsPreviewsChanged(mergedCards, hydrated)) {
        setState((prev) => ({ ...prev, cards: hydrated }));
      }
    }

    if (confirmChangesList.length === 0) {
      exitStatus =
        refreshPatches.length > 0 ? { previewsRestored: true } : { noChanges: true };
      if (replaceCanvas) {
        setState(prev => ({ ...prev, cards: [] }));
        setOpenCardId(null);
        setActiveCardId(null);
        setVersionStackOpen(null);
      }
      setTimeout(() => setSyncStatus(null), 2000);
    } else if (scanSeq === folderScanSeqRef.current) {
      setConfirmChanges({
        changes: confirmChangesList,
        applyMode: replaceCanvas ? 'replace' : 'merge',
      });
      exitStatus = null;
    } else {
      exitStatus = { noChanges: true };
      setTimeout(() => setSyncStatus(null), 2000);
    }
    } catch (e) {
      exitStatus = { error: e.message };
    } finally {
      setSyncStatus((prev) => resolveScanExitStatus(prev, exitStatus));
      const projectId = projectIdOption ?? activeProjectIdRef.current;
      if (projectId && !exitStatus?.error) {
        void requestActionSync('folderScan', { projectId });
      }
    }
  }, [refreshGraph, invalidateFolderScan]);

  const probeFolderStoredOnDevice = useCallback(async (projectId) => {
    if (!projectId) {
      setFolderStoredOnDevice(false);
      return false;
    }
    try {
      const handle = await loadFolderHandle(projectId);
      setFolderStoredOnDevice(Boolean(handle));
      return Boolean(handle);
    } catch {
      setFolderStoredOnDevice(false);
      return false;
    }
  }, []);

  const attemptRestoreFolderForProject = useCallback(
    async (projectId, cardsBaseline, options = {}) => {
      const {
        requestIfNeeded = false,
        scan = true,
        switchSeq = null,
      } = options;
      if (!projectId || !window.showDirectoryPicker) {
        setFolderStoredOnDevice(false);
        setFolderLinkProbeComplete(true);
        return;
      }
      if (projectId === activeProjectIdRef.current) {
        setFolderLinkProbeComplete(false);
      }
      const stale = () =>
        switchSeq != null && projectSwitchSeqRef.current !== switchSeq;
      const scanBaseline =
        cardsBaseline !== undefined
          ? (cardsBaseline ?? [])
          : projectId === activeProjectIdRef.current
            ? (stateRef.current.cards ?? [])
            : [];
      try {
        const result = await linkProjectFolder(projectId, {
          requestIfNeeded,
          switchSeq,
        });
        if (stale()) return;
        if (result.granted && result.handle && scan) {
          warnFolderNameMismatch(projectId, result.handle);
          await scanFolder(result.handle, {
            baseCards: scanBaseline,
            projectId,
          });
        }
      } catch {
        try {
          const handle = await loadFolderHandle(projectId);
          setFolderStoredOnDevice(Boolean(handle));
        } catch {
          setFolderStoredOnDevice(false);
        }
        setFolderHandle(null);
      } finally {
        if (
          projectId === activeProjectIdRef.current
          && (switchSeq == null || projectSwitchSeqRef.current === switchSeq)
        ) {
          setFolderLinkProbeComplete(true);
        }
      }
    },
    [linkProjectFolder, scanFolder, warnFolderNameMismatch],
  );

  attemptRestoreRef.current = attemptRestoreFolderForProject;

  const switchProject = useCallback(async (targetId) => {
    if (!targetId || targetId === activeProjectIdRef.current) return;
    perfMark('switch/start');
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
      if (
        outgoingProjectId
        && projectHydratedRef.current.has(outgoingProjectId)
      ) {
        await saveProjectById(
          outgoingProjectId,
          outgoingState,
          outgoingStaged,
          { persistLocal: true },
        );
      }

      resetProjectUi();
      projectHydratedRef.current.delete(targetId);

      const index = await loadProjectIndex();
      const row = index?.projects?.find((p) => p.id === targetId);
      activeProjectIdRef.current = targetId;
      projectNameDirtyRef.current = false;
      setSyncLock('live');
      lastAppliedSyncLockRef.current = 'live';
      setSyncStatus(clearStaleSyncBanners);
      setState((prev) => ({
        ...prev,
        ...buildSwitchPlaceholderState(row, strings.defaultProjectName),
      }));
      await persistActiveProjectId(targetId);

      folderRestoreHandledSeqRef.current = null;
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
        if (switchLinkResult.granted && switchLinkResult.handle) {
          warnFolderNameMismatch(targetId, switchLinkResult.handle);
        }
      } finally {
        if (!switchLinkResult.granted) {
          setFolderLinkInProgress(false);
        }
      }

      await loadAgentChatThreadIndexEarly(targetId, singleConnectorId);

      let cards = await loadProjectIntoState(targetId, {
        switchSeq,
        hydratePreviews: false,
        localOnly: true,
      });
      perfMark('switch/paint');
      perfMeasure('switch/paint', 'switch/start', 'switch/paint');

      if (projectSwitchSeqRef.current === switchSeq) {
        setActiveProjectId(targetId);
        if (cards != null && reconcileAllThreadChatCards()) {
          requestStructuralSync();
        }
      }

      if (cards == null) {
        setSyncStatus({ error: strings.projects.switchLoadFailed });
        setTimeout(() => setSyncStatus(null), 6000);
      } else {
        const view = stateRef.current.canvasView;
        userAdjustedViewRef.current = Boolean(
          view
          && Number.isFinite(view.x)
          && Number.isFinite(view.y)
          && Number.isFinite(view.zoom),
        );
      }

      setProjectSwitchLoading(false);
      setFolderLinkInProgress(false);

      if (cards != null) {
        if (
          switchLinkResult.granted
          && switchLinkResult.handle
          && projectSwitchSeqRef.current === switchSeq
        ) {
          try {
            await scanFolder(switchLinkResult.handle, {
              baseCards: cards ?? [],
              projectId: targetId,
            });
            folderRestoreHandledSeqRef.current = { projectId: targetId, switchSeq };
          } catch (scanErr) {
            console.warn('Folder scan after project switch failed:', scanErr);
          }
        }
        const refreshedIndex = await loadProjectIndex();
        syncActiveProjectNameFromIndex(refreshedIndex);
        if (activeProjectIdRef.current === targetId) {
          void continueProjectSwitchBackground(targetId, switchSeq, {
            projectId: outgoingProjectId,
            state: outgoingState,
            stagedSyncCards: outgoingStaged,
          });
        }
      }
    } catch (e) {
      console.error('Project switch failed:', e);
      setSyncStatus({ error: strings.projects.switchLoadFailed });
      setTimeout(() => setSyncStatus(null), 6000);
    } finally {
      switchingProjectRef.current = false;
      setProjectSwitchLoading(false);
      setFolderLinkInProgress(false);
    }
  }, [
    resetProjectUi,
    loadProjectIntoState,
    loadAgentChatThreadIndexEarly,
    singleConnectorId,
    syncActiveProjectNameFromIndex,
    continueProjectSwitchBackground,
    clearStaleSyncBanners,
    linkProjectFolder,
    warnFolderNameMismatch,
    scanFolder,
    reconcileAllThreadChatCards,
    requestStructuralSync,
  ]);

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
  }, [switchProject, projectList]);

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
  }, [projectDeleteTarget, switchProject]);

  useEffect(() => {
    if (!activeProjectId) {
      setFolderStoredOnDevice(false);
      return;
    }
    void probeFolderStoredOnDevice(activeProjectId);
  }, [activeProjectId, probeFolderStoredOnDevice]);

  useEffect(() => {
    if (
      !loaded
      || projectSwitchLoading
      || !activeProjectId
      || switchingProjectRef.current
      || folderLinkInProgress
    ) {
      return;
    }
    const handled = folderRestoreHandledSeqRef.current;
    if (
      handled?.projectId === activeProjectId
      && handled.switchSeq === projectSwitchSeqRef.current
    ) {
      return;
    }
    void attemptRestoreRef.current(activeProjectId, lastLoadedCardsRef.current, {
      requestIfNeeded: false,
    });
  }, [loaded, projectSwitchLoading, activeProjectId, folderLinkInProgress]);

  useEffect(() => {
    if (!loaded || !activeProjectId || folderHandle) return;
    if (!folderStoredOnDevice) return;

    const onGesture = () => {
      void attemptRestoreRef.current(
        activeProjectIdRef.current,
        lastLoadedCardsRef.current,
        { requestIfNeeded: true },
      );
    };

    document.addEventListener('pointerdown', onGesture, { once: true, capture: true });
    return () => {
      document.removeEventListener('pointerdown', onGesture, { capture: true });
    };
  }, [loaded, activeProjectId, folderHandle, folderStoredOnDevice]);

  useEffect(() => {
    if (!loaded || !activeProjectId) return;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (projectSwitchLoading || switchingProjectRef.current) return;
      void attemptRestoreRef.current(
        activeProjectIdRef.current,
        lastLoadedCardsRef.current,
      );
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [loaded, activeProjectId, projectSwitchLoading]);

  const pickProjectDirectory = useCallback(async (projectId) => {
    const base = buildDirectoryPickerOptions(projectId);
    try {
      return await window.showDirectoryPicker(base);
    } catch (e) {
      if (base.id && (e?.name === 'TypeError' || e?.name === 'NotSupportedError')) {
        return window.showDirectoryPicker({ mode: 'readwrite' });
      }
      throw e;
    }
  }, []);

  const requestFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      setSyncStatus({ error: strings.sync.folderUnsupported });
      return;
    }
    try {
      const projectId = activeProjectIdRef.current;
      const handle = await pickProjectDirectory(projectId);
      await persistFolderConnection(handle);
      warnFolderNameMismatch(projectId, handle);
      await scanFolder(handle, { baseCards: stateRef.current.cards });
    } catch (e) {
      if (e.name !== 'AbortError') setSyncStatus({ error: e.message });
    }
  }, [scanFolder, persistFolderConnection, pickProjectDirectory, warnFolderNameMismatch]);

  const applyFolderHandleAndScan = useCallback(
    async (handle) => {
      const projectId = activeProjectIdRef.current;
      if (projectId && handle) {
        setCachedFolderHandle(projectId, handle);
      }
      setFolderHandle(handle);
      await scanFolder(handle, {
        baseCards: lastLoadedCardsRef.current ?? stateRef.current.cards ?? [],
        projectId,
      });
    },
    [scanFolder],
  );

  const handleReconnectFolder = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    if (!projectId || !window.showDirectoryPicker) {
      setSyncStatus({ error: strings.sync.folderUnsupported });
      return;
    }
    try {
      const result = await reconnectFolderForProject(projectId);
      if (result.ok && result.handle) {
        setFolderStoredOnDevice(true);
        warnFolderNameMismatch(projectId, result.handle);
        await loadProjectIntoState(projectId, {
          localOnly: true,
          hydratePreviews: false,
        });
        await applyFolderHandleAndScan(result.handle);
        return;
      }
      if (result.reason === 'not_stored') {
        await requestFolder();
        return;
      }
      if (result.reason === 'denied') {
        setSyncStatus({ error: strings.sync.folderPermissionDenied });
        setTimeout(() => setSyncStatus(null), 4000);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setSyncStatus({ error: e.message || strings.sync.folderPermissionDenied });
        setTimeout(() => setSyncStatus(null), 4000);
      }
    }
  }, [applyFolderHandleAndScan, loadProjectIntoState, requestFolder, warnFolderNameMismatch]);

  const handleSyncClick = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    const linkState = deriveFolderLinkState({
      folderHandle,
      folderStoredOnDevice,
      folderLinkInProgress,
      folderLinkProbeComplete,
      connectedFolderName: projectId
        ? projectList.find((p) => p.id === projectId)?.connectedFolderName ?? null
        : null,
    });
    const syncAction = resolveFolderSyncAction(linkState);
    try {
      await runExclusive('manual-sync', async () => {
        if (projectId && isServerSyncEnabled()) {
          await pullAndReloadActiveProject({ force: true, showToast: true });
        }
        if (syncAction === 'scan' && folderHandle) {
          await scanFolder(folderHandle, {
            baseCards: lastLoadedCardsRef.current ?? stateRef.current.cards ?? [],
            projectId,
          });
          if (projectId) {
            await applyReconcileFromServer(projectId);
          }
          return;
        }
        if (syncAction === 'reconnect') {
          await handleReconnectFolder();
          return;
        }
        if (projectId && isServerSyncEnabled()) {
          const row = projectList.find((p) => p.id === projectId);
          const folderName = row?.connectedFolderName ?? null;
          if (folderName) {
            setSyncStatus({
              toast: strings.sync.serverSyncedConnectFolderNamed(folderName),
            });
            setTimeout(() => setSyncStatus(null), 6000);
          }
        }
        await requestFolder();
      });
    } catch (e) {
      if (e.name !== 'AbortError') {
        setSyncStatus({ error: e.message });
        setTimeout(() => setSyncStatus(null), 4000);
      }
    } finally {
      setSyncStatus((prev) => (prev?.scanning ? null : prev));
    }
  }, [
    folderHandle,
    folderStoredOnDevice,
    folderLinkProbeComplete,
    scanFolder,
    requestFolder,
    pullAndReloadActiveProject,
    projectList,
    handleReconnectFolder,
    applyReconcileFromServer,
  ]);

  const beginChangeFolder = useCallback(async (replaceCanvas) => {
    setChangeFolderDialog(false);
    if (!window.showDirectoryPicker) {
      setSyncStatus({ error: strings.sync.folderUnsupported });
      return;
    }
    try {
      const projectId = activeProjectIdRef.current;
      const handle = await pickProjectDirectory(projectId);
      await persistFolderConnection(handle);
      warnFolderNameMismatch(projectId, handle);
      await scanFolder(
        handle,
        replaceCanvas
          ? {
            baseCards: [],
            replaceCanvas: true,
            projectId,
          }
          : {
            baseCards: stateRef.current.cards,
            projectId,
          },
      );
    } catch (e) {
      if (e.name !== 'AbortError') setSyncStatus({ error: e.message });
    }
  }, [scanFolder, persistFolderConnection, pickProjectDirectory, warnFolderNameMismatch]);

  const applySyncChanges = useCallback(() => {
    if (!confirmChanges) return;
    const { changes, applyMode = 'merge' } = confirmChanges;
    const newlyStaged = changes
      .filter((c) => c.type === 'new')
      .map(buildStagedSyncCardFromChange);

    const stagedVersionUpdates = new Map();

    setState((prev) => {
      const cardsCopy = applyMode === 'replace' ? [] : [...prev.cards];
      changes.forEach((change) => {
        if (change.type !== 'updated') return;
        const idx = cardsCopy.findIndex((c) => syncKeysMatch(c.key, change.key));
        if (idx >= 0) {
          const merged = mergeVersionsForSyncUpdate(
            cardsCopy[idx].versions,
            change.newVersions,
            change.group.versions,
          );
          cardsCopy[idx] = { ...cardsCopy[idx], versions: merged };
        } else {
          stagedVersionUpdates.set(
            change.key,
            mergeVersionsForSyncUpdate(
              change.existing.versions ?? [],
              change.newVersions,
              change.group.versions,
            ),
          );
        }
      });
      return { ...prev, cards: cardsCopy };
    });

    if (newlyStaged.length > 0 || stagedVersionUpdates.size > 0) {
      setStagedSyncCards((prev) => {
        let next = prev;
        if (stagedVersionUpdates.size > 0) {
          next = next.map((s) => {
            const versions = stagedVersionUpdates.get(s.key);
            return versions ? { ...s, versions } : s;
          });
        }
        if (newlyStaged.length > 0) {
          next = mergeNewlyStaged(next, newlyStaged);
        }
        const exclusive = enforceExclusivePlacement(
          stateRef.current.cards ?? [],
          next,
          { threads: agentChatThreadIndexRef.current?.threads ?? [] },
        );
        stagedSyncCardsRef.current = exclusive.stagedSyncCards;
        if (exclusive.changed) {
          setState((s) => ({ ...s, cards: exclusive.cards }));
        }
        return exclusive.stagedSyncCards;
      });
    }
    invalidateFolderScan();
    setConfirmChanges(null);
    requestStructuralSync();
    void refreshGraph();
  }, [confirmChanges, refreshGraph, requestStructuralSync]);

  const getTrayDropRect = useCallback(() => {
    return trayDropRectRef.current ?? getFallbackTrayDropRect();
  }, []);

  const handleCardDragMove = useCallback((clientX, clientY) => {
    const nearBottom = isPointerNearTrayBottom(clientY);
    const rect = getTrayDropRect();
    const inZone = isPointerInTrayDropZone(clientX, clientY, rect);
    setTrayRevealActive(nearBottom || inZone);
    setCardDockHover(inZone);
  }, [getTrayDropRect]);

  const handleCardDragEnd = useCallback(() => {
    setTrayRevealActive(false);
    setCardDockHover(false);
  }, []);

  const dockCardToTray = useCallback(
    (cardId, clientX, clientY) => {
      const rect = getTrayDropRect();
      if (!isPointerInTrayDropZone(clientX, clientY, rect)) return false;

      const result = moveToDock(
        stateRef.current.cards,
        stagedSyncCardsRef.current,
        cardId,
      );
      if (!result.docked) return false;

      invalidateFolderScan();
      stateRef.current = { ...stateRef.current, cards: result.cards };
      setState((s) => ({ ...s, cards: result.cards }));
      setStagedSyncCards(result.stagedSyncCards);
      stagedSyncCardsRef.current = result.stagedSyncCards;
      setTrayRevealActive(false);
      setCardDockHover(false);
      setOpenCardId((o) => (o === cardId ? null : o));
      setActiveCardId((a) => (a === cardId ? null : a));
      setVersionStackOpen((v) => (v === cardId ? null : v));
      removeCardFromSelection(cardId);
      requestStructuralSync();
      void refreshGraph();
      return true;
    },
    [getTrayDropRect, refreshGraph, removeCardFromSelection, requestStructuralSync],
  );

  const placeStagedSyncCard = useCallback(
    (stagingId, worldX, worldY) => {
      const staged = stagedSyncCardsRef.current.find(
        (s) => s.stagingId === stagingId,
      );
      if (!staged) return;

      const result = moveToCanvas(
        stateRef.current.cards,
        stagedSyncCardsRef.current,
        stagingId,
        worldX,
        worldY,
      );
      if (!result.placed) return;

      const prevIds = new Set((stateRef.current.cards ?? []).map((c) => c.id));
      const projectId = activeProjectIdRef.current;
      invalidateFolderScan();
      stateRef.current = { ...stateRef.current, cards: result.cards };
      setState((s) => ({ ...s, cards: result.cards }));
      setStagedSyncCards(result.stagedSyncCards);
      stagedSyncCardsRef.current = result.stagedSyncCards;
      setStagingDragActive(false);
      for (const c of result.cards) {
        if (c?.id && !prevIds.has(c.id)) {
          registerOptimisticCard(projectId, c.id);
        }
      }
      if (
        staged.type === 'agent_chat'
        && singleConnectorId
        && projectId
      ) {
        const placed = result.cards.find((c) => !prevIds.has(c.id));
        if (placed) {
          const thread = resolveThreadForCard(
            agentChatThreadIndexRef.current,
            placed,
            singleConnectorId,
          );
          const threadId = thread?.threadId
            ?? placed.agentThreadId;
          if (threadId) {
            let index = linkCardToThreadInIndex(
              agentChatThreadIndexRef.current,
              threadId,
              { cardId: placed.id },
            );
            agentChatThreadIndexRef.current = index;
            setAgentChatThreadIndex(index);
            saveThreadIndexLocal(projectId, singleConnectorId, index);
            if (threadId === activeThreadIdRef.current) {
              agentChatArtifactMetaRef.current.cardId = placed.id;
            }
          }
        }
      }
      requestStructuralSync();
      void refreshGraph();
    },
    [refreshGraph, requestStructuralSync, singleConnectorId],
  );

  // ============================================================
  // Card actions
  // ============================================================
  const commitCardsToStateRef = useCallback((nextCards) => {
    stateRef.current = { ...stateRef.current, cards: nextCards };
  }, []);

  const updateCard = useCallback((id, updates) => {
    const prevCards = stateRef.current.cards ?? [];
    const nextCards = prevCards.map((c) =>
      c.id === id ? { ...c, ...updates } : c,
    );
    commitCardsToStateRef(nextCards);
    setState((prev) => ({ ...prev, cards: nextCards }));
  }, [commitCardsToStateRef]);

  const batchUpdateCardPositions = useCallback((updates) => {
    const byId = new Map(updates.map((u) => [u.id, u]));
    const prevCards = stateRef.current.cards ?? [];
    const nextCards = prevCards.map((c) => {
      const u = byId.get(c.id);
      return u ? { ...c, x: u.x, y: u.y } : c;
    });
    commitCardsToStateRef(nextCards);
    setState((prev) => ({ ...prev, cards: nextCards }));
  }, [commitCardsToStateRef]);

  const handleCommitCardPosition = useCallback((id, x, y) => {
    updateCard(id, { x, y });
  }, [updateCard]);

  const pinVersion = useCallback((cardId, version) => {
    updateCard(cardId, { pinnedVersion: version });
  }, [updateCard]);

  const handleUpdateVersion = useCallback((cardId, versionNum, updatedVersion) => {
    setState((prev) => ({
      ...prev,
      cards: (prev.cards ?? []).map((c) => {
        if (c.id !== cardId) return c;
        return {
          ...c,
          versions: (c.versions ?? []).map((v) =>
            v.version === versionNum ? { ...v, ...updatedVersion } : v,
          ),
        };
      }),
    }));
  }, []);

  const handleNoteSaveStatus = useCallback(({ toast, error }) => {
    if (toast) {
      setSyncStatus({ toast });
      setTimeout(() => setSyncStatus(null), 4000);
    }
    if (error) {
      setSyncStatus({ error });
      setTimeout(() => setSyncStatus(null), 4000);
    }
  }, []);

  const persistCardEdits = useCallback((cardId, cardUpdates) => {
    const oldCard = stateRef.current.cards.find((c) => c.id === cardId);
    if (!oldCard) return;
    const merged = { ...oldCard, ...cardUpdates };
    updateCard(cardId, cardUpdates);
    const projectId = activeProjectIdRef.current;
    if (projectId) {
      void requestActionSync('structuralChange', { projectId });
    }
    if (cardUpdates.key && cardUpdates.key !== oldCard.key && folderKeySet) {
      setFolderPresentKeys((keys) => {
        const next = new Set(keys || []);
        next.delete(oldCard.key);
        if (cardUpdates.key) next.add(cardUpdates.key);
        return [...next];
      });
    }
  }, [updateCard, folderKeySet]);

  const handleInlineSaveUserNote = useCallback(async (card, { body, name }) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;

    const projectOnly = noteRequiresProjectOnlySave({
      folderHandle,
      folderConnected: Boolean(folderHandle),
      folderKeySet,
      card,
    });

    setSavingCardId(card.id);
    try {
      if (projectOnly || !folderHandle) {
        const result = saveUserNoteToProject(card, {
          body,
          name,
          versionNum: card.pinnedVersion,
        });
        if (result.reason === 'name_required') {
          handleNoteSaveStatus({ error: strings.userNote.nameRequired });
          return;
        }
        if (result.reason === 'name_invalid') {
          handleNoteSaveStatus({ error: strings.userNote.nameInvalid });
          return;
        }
        if (!result.ok || !result.cardUpdates) {
          handleNoteSaveStatus({ error: strings.userNote.saveFailed });
          return;
        }
        persistCardEdits(card.id, result.cardUpdates);
        handleNoteSaveStatus({ toast: strings.userNote.savedProjectOnly });
        return;
      }

      const result = await saveUserNote({
        projectId,
        projectName: stateRef.current.projectName,
        folderHandle,
        clusterId,
        card,
        versionNum: card.pinnedVersion,
        body,
        name,
        cards: stateRef.current.cards,
      });
      if (result.reason === 'no_folder') {
        handleNoteSaveStatus({ error: strings.userNote.needFolder });
        return;
      }
      if (result.reason === 'write_denied') {
        handleNoteSaveStatus({ error: strings.userNote.writeDenied });
        return;
      }
      if (result.reason === 'name_required') {
        handleNoteSaveStatus({ error: strings.userNote.nameRequired });
        return;
      }
      if (result.reason === 'name_invalid') {
        handleNoteSaveStatus({ error: strings.userNote.nameInvalid });
        return;
      }
      if (result.reason === 'name_collision') {
        handleNoteSaveStatus({ error: strings.userNote.nameCollision });
        return;
      }
      if (!result.ok) {
        handleNoteSaveStatus({ error: strings.userNote.saveFailed });
        return;
      }
      if (result.cardUpdates) {
        persistCardEdits(card.id, result.cardUpdates);
      } else {
        handleUpdateVersion(card.id, result.versionNum, result.version);
      }
      if (result.apiUnavailable) {
        handleNoteSaveStatus({ toast: strings.sync.primitivesNotUpdated });
      }
      await refreshGraph();
    } catch (e) {
      handleNoteSaveStatus({ error: e.message });
    } finally {
      setSavingCardId(null);
    }
  }, [
    folderHandle,
    clusterId,
    folderKeySet,
    persistCardEdits,
    handleUpdateVersion,
    handleNoteSaveStatus,
    refreshGraph,
  ]);

  const handleInlineSaveBookmark = useCallback(async (card, { url, title, preview }) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    setSavingCardId(card.id);
    try {
      let previewPayload = preview;
      if (!previewPayload) {
        previewPayload = await fetchBookmarkPreview(url);
      }
      const result = await saveBookmarkToProject(card, {
        url,
        title,
        preview: previewPayload ?? card.versions?.[0]?.bookmarkPreview,
      });
      if (result.reason === 'invalid_url') {
        handleNoteSaveStatus({ error: strings.bookmark.invalidUrl });
        return;
      }
      if (!result.ok || !result.cardUpdates) {
        handleNoteSaveStatus({ error: strings.userNote.saveFailed });
        return;
      }
      persistCardEdits(card.id, result.cardUpdates);
      await refreshGraph();
    } catch (e) {
      handleNoteSaveStatus({ error: e.message });
    } finally {
      setSavingCardId(null);
    }
  }, [persistCardEdits, handleNoteSaveStatus, refreshGraph]);

  const handleSaveNoteToProject = useCallback(async (card, { body, name, versionNum }) => {
    const result = saveUserNoteToProject(card, { body, name, versionNum });
    if (!result.ok) {
      return result;
    }
    persistCardEdits(card.id, result.cardUpdates);
    handleNoteSaveStatus({ toast: strings.userNote.savedProjectOnly });
    return { ok: true };
  }, [persistCardEdits, handleNoteSaveStatus]);

  const handleSaveNewNote = useCallback(async ({ prefix, name, body, linkTargetRefs = [] }) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    if (!folderHandle) {
      setSyncStatus({ error: strings.userNote.needFolder });
      setTimeout(() => setSyncStatus(null), 4000);
      return;
    }
    const canWrite = await ensureWritePermission(folderHandle);
    if (!canWrite) {
      setSyncStatus({ error: strings.userNote.writeDenied });
      setTimeout(() => setSyncStatus(null), 4000);
      return;
    }
    setSavingNote(true);
    try {
      const result = await createUserNoteArtifact({
        projectId,
        projectName: stateRef.current.projectName,
        folderHandle,
        prefix,
        name,
        body,
        linkTargetRefs,
        clusterId,
        cards: stateRef.current.cards,
      });
      if (result.ingest.ok && result.ingest.clusterId) {
        clusterContextProjectIdRef.current = projectId;
        setClusterId(result.ingest.clusterId);
        void refreshGraph({
          clusterId: result.ingest.clusterId,
          projectId,
          force: true,
        });
      } else if (result.ingest.reason === 'api_unavailable') {
        setSyncStatus({ toast: strings.sync.primitivesNotUpdated });
        setTimeout(() => setSyncStatus(null), 4000);
      }
      const newCard = {
        ...result.card,
        x: 100 + (stateRef.current.cards.length % 4) * 320,
        y: 100 + Math.floor(stateRef.current.cards.length / 4) * 240,
      };
      setState((prev) => ({
        ...prev,
        cards: [...prev.cards, newCard],
      }));
      if (projectId && newCard.id) {
        registerOptimisticCard(projectId, newCard.id);
      }
      requestStructuralSync();
      setFolderPresentKeys((keys) => {
        const next = new Set(keys || []);
        next.add(result.card.key);
        return [...next];
      });
      setNewNoteOpen(false);
      await refreshGraph();
    } catch (e) {
      setSyncStatus({ error: e.message });
      setTimeout(() => setSyncStatus(null), 4000);
    } finally {
      setSavingNote(false);
    }
  }, [folderHandle, clusterId, refreshGraph]);

  const handleSaveNewLink = useCallback(async ({
    url,
    preview,
    titleOverride,
    linkTargetRefs = [],
  }) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    setSavingLink(true);
    try {
      const result = await createBookmarkArtifact({
        projectId,
        projectName: stateRef.current.projectName,
        url,
        preview,
        titleOverride,
        linkTargetRefs,
        clusterId,
        cards: stateRef.current.cards,
      });
      if (result.ingest.ok && result.ingest.clusterId) {
        clusterContextProjectIdRef.current = projectId;
        setClusterId(result.ingest.clusterId);
        void refreshGraph({
          clusterId: result.ingest.clusterId,
          projectId,
          force: true,
        });
      } else if (result.ingest.reason === 'api_unavailable') {
        setSyncStatus({ toast: strings.bookmark.primitivesNotUpdated });
        setTimeout(() => setSyncStatus(null), 4000);
      }
      const newCard = {
        ...result.card,
        x: 100 + (stateRef.current.cards.length % 4) * 320,
        y: 100 + Math.floor(stateRef.current.cards.length / 4) * 240,
      };
      const nextState = {
        ...stateRef.current,
        cards: [...stateRef.current.cards, newCard],
      };
      stateRef.current = nextState;
      setState(nextState);
      if (projectId && newCard.id) {
        registerOptimisticCard(projectId, newCard.id);
      }
      requestStructuralSync();
      setAddLinkOpen(false);
      await refreshGraph();
    } catch (e) {
      setSyncStatus({ error: e.message });
      setTimeout(() => setSyncStatus(null), 4000);
    } finally {
      setSavingLink(false);
    }
  }, [clusterId, refreshGraph]);

  const removeCard = useCallback(async (id) => {
    const projectId = activeProjectIdRef.current;
    const card = stateRef.current.cards.find((c) => c.id === id);
    const nextState = {
      ...stateRef.current,
      cards: stateRef.current.cards.filter((c) => c.id !== id),
    };
    stateRef.current = nextState;
    setState(nextState);
    setOpenCardId((o) => (o === id ? null : o));
    setActiveCardId((a) => (a === id ? null : a));
    setVersionStackOpen((v) => (v === id ? null : v));

    if (card?.key && projectId) {
      addSuppressedSyncKey(projectId, card.key);
    }
    const stagedBefore = stagedSyncCardsRef.current;
    const nextStaged = removeStagedCardsByKey(stagedBefore, card?.key);
    if (nextStaged.length !== stagedBefore.length) {
      stagedSyncCardsRef.current = nextStaged;
      setStagedSyncCards(nextStaged);
    }

    if (card?.type === 'agent_chat' && projectId && singleConnectorId) {
      const nextIndex = clearCardIdFromThreadIndex(
        agentChatThreadIndexRef.current,
        id,
      );
      if (nextIndex !== agentChatThreadIndexRef.current) {
        agentChatThreadIndexRef.current = nextIndex;
        setAgentChatThreadIndex(nextIndex);
        saveThreadIndexLocal(projectId, singleConnectorId, nextIndex);
      }
      if (agentChatArtifactMetaRef.current.cardId === id) {
        agentChatArtifactMetaRef.current = {
          ...agentChatArtifactMetaRef.current,
          cardId: null,
        };
      }
      const threadId = activeThreadIdRef.current;
      if (threadId) {
        const session = await loadAgentChatSession(projectId, singleConnectorId, threadId);
        if (session?.cardId === id) {
          await saveAgentChatSession(projectId, singleConnectorId, threadId, {
            ...session,
            cardId: null,
          });
        }
      }
    }

    if (projectId && !switchingProjectRef.current && initialHydratedRef.current) {
      requestStructuralSync();
    }
  }, [singleConnectorId, requestStructuralSync]);

  const rehydratePreview = useCallback(async (cardId, versionNum, { force = false } = {}) => {
    const card = state.cards.find((c) => c.id === cardId);
    if (!card) return false;
    const ver = card.versions.find((x) => x.version === versionNum);
    if (!ver) return false;
    const hydrated = await hydrateVersion(ver, { force });
    if (
      hydrated.objectUrl === ver.objectUrl
      && hydrated.dataUrl === ver.dataUrl
      && hydrated.previewStripped === ver.previewStripped
    ) {
      return false;
    }
    setState((prev) => ({
      ...prev,
      cards: (prev.cards ?? []).map((c) => {
        if (c.id !== cardId) return c;
        return {
          ...c,
          versions: (c.versions ?? []).map((v) => (v.version === versionNum ? hydrated : v)),
        };
      }),
    }));
    return true;
  }, [state.cards]);

  // Filtered cards for search
  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return state.cards;
    const q = searchQuery.toLowerCase();
    return state.cards.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.prefix.toLowerCase().includes(q)
    );
  }, [state.cards, searchQuery]);

  const connectedFolderName = useMemo(() => {
    if (!activeProjectId) return null;
    const row = projectList.find((p) => p.id === activeProjectId);
    return row?.connectedFolderName ?? null;
  }, [projectList, activeProjectId]);

  const folderDisplayName = folderHandle?.name ?? connectedFolderName;
  const folderLinkState = useMemo(
    () =>
      deriveFolderLinkState({
        folderHandle,
        folderStoredOnDevice,
        connectedFolderName,
        folderLinkInProgress,
        folderLinkProbeComplete,
      }),
    [
      folderHandle,
      folderStoredOnDevice,
      connectedFolderName,
      folderLinkInProgress,
      folderLinkProbeComplete,
    ],
  );
  const {
    folderLinked: folderConnected,
    folderNeedsReconnect,
    folderNeedsConnect,
  } = folderLinkState;

  const emptyDesktopHint = useMemo(() => {
    if (folderNeedsReconnect && connectedFolderName) {
      return strings.empty.desktopHintReconnectFolder(connectedFolderName);
    }
    if (folderNeedsConnect && connectedFolderName) {
      return strings.empty.desktopHintConnectFolderNamed(connectedFolderName);
    }
    return strings.empty.desktopHint;
  }, [folderNeedsReconnect, folderNeedsConnect, connectedFolderName]);

  const clusterApiUnavailableMessage = useMemo(() => {
    if (clusterApiAvailable) return null;
    if (clusterApiReason === 'api_unreachable') {
      return strings.cluster.apiUnreachableBanner;
    }
    return strings.cluster.dbUnavailableBanner;
  }, [clusterApiAvailable, clusterApiReason]);

  const openCard = openCardId ? state.cards.find(c => c.id === openCardId) : null;
  const openCardMissingFromFolder = Boolean(
    openCard
      && isCardMissingFromFolder({
        folderConnected,
        folderKeySet,
        card: openCard,
      }),
  );
  const openCardUserNoteDisabled = Boolean(
    openCard
      && computeUserNoteDisabled({
        folderHandle,
        folderConnected,
        folderKeySet,
        cardKey: openCard.key,
      }),
  );

  if (!loaded) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-canvas text-muted font-serif italic">
        {strings.loadingCanvas}
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-canvas text-primary sans">
      {/* Canvas or Mobile view */}
      {isMobile ? (
        <MobileView
          cards={filteredCards}
          onOpen={setOpenCardId}
          onPinVersion={pinVersion}
          onDeleteCard={removeCard}
          folderKeySet={folderKeySet}
          folderConnected={folderConnected}
        />
      ) : (
        <Canvas
          readOnly={!canEditCanvas}
          state={state}
          setState={setState}
          cards={filteredCards}
          allCards={state.cards}
          activeCardId={activeCardId}
          setActiveCardId={setActiveCardId}
          onOpenCard={setOpenCardId}
          onPinVersion={pinVersion}
          onUpdateCard={updateCard}
          onBatchUpdateCardPositions={batchUpdateCardPositions}
          onDeleteCard={removeCard}
          folderKeySet={folderKeySet}
          folderConnected={folderConnected}
          versionStackOpen={versionStackOpen}
          setVersionStackOpen={setVersionStackOpen}
          onRehydratePreview={rehydratePreview}
          onInspectArtifact={openInspector}
          clusterId={clusterId}
          canvasEdges={canvasEdges}
          linkCountByCardId={linkCountByCardId}
          onGraphRefresh={refreshGraph}
          folderHandle={folderHandle}
          projectId={activeProjectId}
          projectName={state.projectName}
          onPatchCardVersion={handleUpdateVersion}
          onInlineSaveUserNote={handleInlineSaveUserNote}
          onInlineSaveBookmark={handleInlineSaveBookmark}
          savingCardId={savingCardId}
          onLinkDeleteStatus={handleNoteSaveStatus}
          onOpenEdgePrimitive={(edge) => {
            if (edge.kind === 'relationship') {
              openInspector({ type: 'relationship', id: edge.id });
            } else if (edge.kind === 'note_attachment') {
              const noteId = edge.noteId ?? edge.fromId;
              if (noteId) openInspector({ type: 'note', id: noteId });
            }
          }}
          selectedCardIds={selectedCardIds}
          onToggleCardSelect={toggleCardSelect}
          onClearCardSelection={clearCardSelection}
          clusterHullSource={clusterHullSource}
          highlightedClusterId={highlightedClusterId}
          onSelectCluster={setSelectedClusterId}
          onInspectCluster={(id) => openInspector({ type: 'cluster', id })}
          onClearClusterSelection={() => setSelectedClusterId(null)}
          onViewportSizeChange={setCanvasViewportSize}
          agentSelectionMode={agentPanelOpen && agentContextMode === 'selected'}
          onCanvasElementRef={setCanvasElement}
          stagingDropActive={stagingDragActive}
          onCardDragMove={handleCardDragMove}
          onDockCardToTray={dockCardToTray}
          onCardDragEnd={handleCardDragEnd}
          onInteractionCommit={handleInteractionCommit}
          onCommitCardPosition={handleCommitCardPosition}
          onCommitCanvasView={handleCommitCanvasView}
          onAgentChatCardActivate={handleAgentChatCardActivate}
          agentChatLiveMessages={agentChatMessages}
          agentChatLiveCardId={agentChatLiveCardId}
          agentChatTranscriptRevision={agentChatTranscriptRevision}
          agentChatThreadIndex={agentChatThreadIndex}
          agentChatConnectorId={singleConnectorId}
        />
      )}

      {!isMobile
        && (stagedSyncCards.length > 0 || trayRevealActive || stagingDragActive) && (
        <SyncHoldingTray
          stagedCards={stagedSyncCards}
          canvasView={state.canvasView}
          canvasElement={canvasElement}
          onPlace={placeStagedSyncCard}
          onDragActiveChange={setStagingDragActive}
          visible={
            trayRevealActive
            || stagingDragActive
            || stagedSyncCards.length > 0
          }
          dropZoneHighlight={cardDockHover}
          onDropZoneRectChange={(rect) => {
            trayDropRectRef.current = rect;
          }}
        />
      )}

      <CanvasChrome
          showDesktopControls={!isMobile}
          projectList={projectList}
          activeProjectId={activeProjectId}
          projectName={state.projectName}
          onProjectNameChange={(name) => {
            projectNameDirtyRef.current = true;
            setState((prev) => ({ ...prev, projectName: name }));
          }}
          onProjectNameBlur={() => void commitProjectDisplayName()}
          onSwitchProject={switchProject}
          projectSwitchLoading={projectSwitchLoading}
          onCreateProject={handleRequestCreateProject}
          onArchiveProject={handleArchiveProject}
          onUnarchiveProject={handleUnarchiveProject}
          onDeleteProjectRequest={(p) => setProjectDeleteTarget({ id: p.id, name: p.name })}
          onViewPrimitives={() => setPrimitiveTableOpen(true)}
          onCreateTask={() => setCreateTaskOpen(true)}
          onOpenAgentMode={() => {
            setAgentPanelOpen(true);
          }}
          workspaceTreeOpen={workspaceTreeOpen}
          onToggleWorkspaceTree={toggleWorkspaceTree}
          agentPanelOpen={agentPanelOpen}
          onToggleAgentPanel={toggleAgentPanel}
          onOpenSearch={() => setShowSearch(true)}
          onOpenArchitecture={() => setArchitectureOpen(true)}
          canvasView={state.canvasView}
          onZoomOut={() =>
            setCanvasView((v) =>
              setViewZoomAtViewportCenter(
                v,
                clampCanvasZoom(v.zoom - 0.1),
                canvasViewportSize,
              ),
            )
          }
          onZoomIn={() =>
            setCanvasView((v) =>
              setViewZoomAtViewportCenter(
                v,
                clampCanvasZoom(v.zoom + 0.1),
                canvasViewportSize,
              ),
            )
          }
          onZoomPercentCommit={(percent) => {
            const zoom = clampCanvasZoom(percent / 100);
            setCanvasView((v) =>
              setViewZoomAtViewportCenter(v, zoom, canvasViewportSize),
            );
          }}
          onResetView={() => {
            fitCanvasViewToCards(filteredCards);
          }}
          syncStatus={syncStatus}
          syncLock={syncLock}
          onRefreshFromServer={undefined}
          onUseServerProjectCopy={
            syncStatus?.conflictActions
              ? () => void resolveProjectConflictUseServer()
              : undefined
          }
          onKeepMyProjectCopy={
            syncStatus?.conflictActions
              ? () => void resolveProjectConflictKeepLocal()
              : undefined
          }
          showClearLocalCache={
            syncStatus?.banner === strings.projects.localStorageFull
          }
          onClearLocalCache={() => void handleClearLocalCache()}
          folderDisplayName={folderDisplayName}
          connectedFolderName={connectedFolderName}
          folderNeedsReconnect={folderNeedsReconnect}
          folderNeedsConnect={folderNeedsConnect}
          folderLinked={folderConnected}
          onChangeFolder={() => setChangeFolderDialog(true)}
          onNewNote={() => setNewNoteOpen(true)}
          onAddLink={() => setAddLinkOpen(true)}
          onSync={() => {
            if (folderNeedsReconnect) {
              void handleReconnectFolder();
              return;
            }
            void handleSyncClick();
          }}
          folderFooterSyncHidden={
            folderNeedsConnect && Boolean(connectedFolderName)
          }
          onReconnectFolder={
            folderNeedsReconnect ? () => void handleReconnectFolder() : undefined
          }
          onConnectFolder={
            folderNeedsConnect ? () => void requestFolder() : undefined
          }
          cardCount={state.cards.length}
          selectedCardCount={selectedCardIds.size}
          clusterApiAvailable={clusterApiAvailable}
          clusterApiUnavailableMessage={clusterApiUnavailableMessage}
          onGroupSelection={() => {
            if (!clusterApiAvailable) {
              setSyncStatus({
                error:
                  clusterApiUnavailableMessage
                  ?? strings.cluster.createApiUnavailable,
              });
              setTimeout(() => setSyncStatus(null), 6000);
              return;
            }
            setCreateClusterOpen(true);
          }}
        />

      {/* Mobile sync note */}
      {isMobile && state.cards.length === 0 && (
        <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center">
          <p className="serif italic text-secondary text-lg leading-relaxed">
            {strings.empty.mobile}
            <br />
            {strings.empty.mobileHint}
          </p>
        </div>
      )}

      {/* Loading project (switch) */}
      {!isMobile && projectSwitchLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="sans text-sm text-muted uppercase tracking-wider">
            {strings.projects.loadingProject}
          </p>
        </div>
      )}

      {!isMobile && loaded && !activeProjectId && (
        <EmptyWorkspacePrompt onCreateProject={handleRequestCreateProject} />
      )}

      {/* Empty state desktop */}
      {!isMobile
        && activeProjectId
        && state.cards.length === 0
        && !projectSwitchLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="serif italic text-muted text-2xl mb-2">{strings.empty.desktopTitle}</p>
            <p className="sans text-xs text-muted uppercase tracking-wider">
              {emptyDesktopHint}
            </p>
          </div>
        </div>
      )}

      {architectureOpen && (
        <SystemArchitectureModal
          onClose={() => setArchitectureOpen(false)}
          runtime={{
            generatedAt: new Date().toISOString(),
            syncMode: getProjectSyncMode(),
            serverSyncEnabled: isServerSyncEnabled(),
            activeProjectId,
            syncLock,
            clientRevision: activeProjectId ? getClientRevision(activeProjectId) : 0,
            cardCount: state.cards.length,
            stagedCount: stagedSyncCards.length,
            folderLinked: folderConnected,
            folderLinkPhase: folderLinkState.phase,
          }}
        />
      )}

      {/* Search */}
      {showSearch && (
        <SearchOverlay
          query={searchQuery}
          setQuery={setSearchQuery}
          cards={state.cards}
          onSelect={(card) => {
            setShowSearch(false);
            setSearchQuery('');
            setOpenCardId(card.id);
          }}
          onClose={() => { setShowSearch(false); setSearchQuery(''); }}
        />
      )}

      {/* Sync confirmation */}
      {confirmChanges && (
        <SyncConfirm
          changes={confirmChanges.changes}
          applyMode={confirmChanges.applyMode}
          onConfirm={applySyncChanges}
          onCancel={() => setConfirmChanges(null)}
        />
      )}

      {changeFolderDialog && (
        <ChangeFolderDialog
          onClose={() => setChangeFolderDialog(false)}
          onClearAndPick={() => void beginChangeFolder(true)}
          onKeepAndPick={() => void beginChangeFolder(false)}
        />
      )}

      {projectDeleteTarget && (
        <ProjectDeleteConfirm
          projectName={projectDeleteTarget.name}
          onConfirm={() => void handleConfirmDeleteProject()}
          onCancel={() => setProjectDeleteTarget(null)}
        />
      )}

      {archiveLastTarget && (
        <ProjectArchiveLastConfirm
          projectName={archiveLastTarget.name}
          onCreateNew={() => {
            setArchiveLastTarget(null);
            setCreateProjectPromptOpen(true);
          }}
          onCancel={() => setArchiveLastTarget(null)}
        />
      )}

      {createProjectPromptOpen && (
        <ProjectCreateNamePrompt
          defaultName={strings.defaultProjectName}
          onConfirm={(name) => {
            setCreateProjectPromptOpen(false);
            void handleCreateProject(name);
          }}
          onCancel={() => setCreateProjectPromptOpen(false)}
        />
      )}

      {/* Open card modal */}
      {primitiveTableOpen && (
        <PrimitiveTableModal
          clusterId={clusterId}
          open={primitiveTableOpen}
          onClose={() => setPrimitiveTableOpen(false)}
          onSelectRow={(sel) => {
            setPrimitiveTableOpen(false);
            openInspector(sel);
          }}
        />
      )}

      {(workspaceTreeOpen || agentPanelOpen || inspectorOpen) && (
        <RightDock
          workspaceTreeOpen={workspaceTreeOpen}
          onCloseWorkspaceTree={closeWorkspaceTree}
          workspaceTreeProps={{
            clusterId,
            projectName: state.projectName,
            subclusters: clusterHullSource.clusters,
            reloadKey: workspaceTreeReloadKey,
            onSelectPrimitive: (ref) => {
              openInspector(ref);
            },
          }}
          agentPanelOpen={agentPanelOpen}
          onCloseAgentPanel={closeAgentPanel}
          agentProps={{
            panelMode: agentPanelMode,
            onPanelModeChange: setAgentPanelMode,
            singleConnectorId,
            onSingleConnectorChange: setSingleConnectorId,
            connectors: agentConnectors,
            secretsConfigured: agentSecretsConfigured,
            connectorsOffline: agentConnectorsOffline,
            openaiReachable: agentOpenaiReachable,
            openaiReachabilityError: agentOpenaiReachabilityError,
            onSaveApiKey: handleSaveAgentApiKey,
            apiKeySaving,
            onClearApiKey: handleClearAgentApiKey,
            chatMessages: agentChatMessages,
            chatLoading: agentChatLoading,
            chatError: agentChatError,
            contextMode: agentContextMode,
            onContextModeChange: setAgentContextMode,
            enabledAgentIds,
            onToggleAgent: toggleEnabledAgent,
            cards: state.cards,
            contextCards: agentContextCards,
            selectedCardIds,
            canvasView: state.canvasView,
            viewportSize: canvasViewportSize,
            onFocusContextCard: (cardId) => setActiveCardId(cardId),
            agentSelectionClick: agentPanelOpen && agentContextMode === 'selected',
            onRemoveContextCard: removeCardFromSelection,
            messages: agentMessages,
            onSendMessage: handleAgentSendMessage,
            onComingSoon: showAgentComingSoon,
            folderLinked: Boolean(folderHandle),
            folderNeedsReconnect,
            folderNeedsConnect,
            connectedFolderName,
            contextStatusByCardId: agentContextStatusByCardId,
            contextDeliveryByCardId: agentContextDeliveryByCardId,
            contextDeliveryState,
            onRefreshContextSession: handleRefreshContextSession,
            agentExtendedContext,
            onAgentExtendedContextChange: setAgentExtendedContextPersisted,
            contextEstimates: agentContextEstimates,
            contextProfileLimits: getContextLimits(
              agentExtendedContext ? 'extended' : 'standard',
            ),
            lastTokenEstimate: agentLastTokenEstimate,
            chatArtifactRef: agentChatArtifactRef,
            chatArtifactSyncFailed: Boolean(agentChatArtifactSyncReason),
            chatArtifactSyncReason: agentChatArtifactSyncReason,
            chatPersistTrimmed: agentChatPersistTrimmed,
            chatSyncRetrying,
            onRetryChatSync: handleRetryChatSync,
            onOpenChatArtifact: (artifactId) => {
              openInspector({ type: 'artifact', id: artifactId });
            },
            onClearChat: handleClearAgentChat,
            chatThreads: agentChatThreadIndex.threads,
            activeThreadId,
            activeThreadTitle: agentChatThreadIndex.threads.find(
              (t) => t.threadId === activeThreadId,
            )?.title,
            threadPickerOpen,
            onSelectThread: handleSelectAgentThread,
            onCreateThread: handleCreateAgentThread,
            onRenameThread: handleRenameAgentThread,
            onSwitchThread: handleSwitchAgentThread,
            onDeleteThread: handleDeleteAgentThread,
          }}
          inspectorOpen={inspectorOpen}
          inspectorProps={{
            selection: inspectorSelection,
            clusterId,
            clusterInspectorReload,
            onClose: closeInspector,
            onSelectPrimitive: openInspector,
            onOpenCardKey: (cardKey) => {
              const card = state.cards.find((c) => c.key === cardKey);
              if (card) setOpenCardId(card.id);
            },
            cards: state.cards,
            selectedCardIds,
            activeCardId,
            agentChatThreadIndex,
            singleConnectorId,
            onGraphRefresh: refreshGraph,
            onClusterRenamed: handleClusterRenamed,
            onClusterDeleted: closeInspector,
          }}
          dockPinned={workspaceTreeOpen || inspectorOpen || agentPanelOpen}
          onCloseDock={closeRightDock}
        />
      )}

      {newNoteOpen && (
        <NewNoteDialog
          onClose={() => setNewNoteOpen(false)}
          onSave={handleSaveNewNote}
          saving={savingNote}
          linkableCards={state.cards.filter((c) => c.type !== 'user_note')}
        />
      )}

      {addLinkOpen && (
        <AddLinkDialog
          onClose={() => setAddLinkOpen(false)}
          onSave={handleSaveNewLink}
          saving={savingLink}
          linkableCards={state.cards.filter((c) => c.type !== 'user_note' && c.type !== 'bookmark')}
        />
      )}

      {createClusterOpen && (
        <CreateClusterDialog
          onClose={() => setCreateClusterOpen(false)}
          onSave={handleCreateClusterFromSelection}
          saving={creatingCluster}
          selectedCount={clusterSelectionStats.selected}
          syncableCount={clusterSelectionStats.syncable}
        />
      )}

      {createTaskOpen && (
        <CreateTaskDialog
          clusterId={clusterId}
          onClose={() => setCreateTaskOpen(false)}
          onCreated={() => setCreateTaskOpen(false)}
        />
      )}

      {openCardId && openCard && (
        <CardModal
          card={openCard}
          cards={state.cards}
          clusterId={clusterId}
          folderHandle={folderHandle}
          projectId={activeProjectId}
          projectName={state.projectName}
          onClose={() => setOpenCardId(null)}
          onPinVersion={pinVersion}
          onDeleteCard={removeCard}
          onUpdateVersion={(versionNum, updatedVersion) =>
            handleUpdateVersion(openCard.id, versionNum, updatedVersion)
          }
          missingFromFolder={openCardMissingFromFolder}
          userNoteDisabled={openCardUserNoteDisabled}
          bookmarkEditDisabled={!canEditCanvas}
          bookmarkSaving={savingCardId === openCard.id}
          onSaveBookmark={(payload) => handleInlineSaveBookmark(openCard, payload)}
          onSaveNoteToProject={(payload) => handleSaveNoteToProject(openCard, payload)}
          onUpdateCard={(updates) => updateCard(openCard.id, updates)}
          onInspectArtifact={openInspector}
          onFocusCard={(id) => {
            setOpenCardId(id);
            setActiveCardId(id);
          }}
          onGraphRefresh={refreshGraph}
          onSaveStatus={handleNoteSaveStatus}
        />
      )}
    </div>
  );
}