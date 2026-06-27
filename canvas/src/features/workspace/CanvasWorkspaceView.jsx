import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import {
  getProjectSyncMode,
  isServerSyncEnabled,
  getClientRevision,
} from '../../lib/projects.js';
import { deriveFolderLinkState } from '../../lib/folderLinkState.js';
import {
  computeUserNoteDisabled,
  isCardMissingFromFolder,
} from '../../lib/filename.js';
import { strings } from '../../content/strings.js';
import {
  canShowEmptyWorkspace,
  shouldShowSelectProjectPrompt,
} from '../../lib/syncProjectionInvariants.js';
import { SelectProjectPrompt } from '../../components/SelectProjectPrompt.jsx';
import {
  CANVAS_FIT_HORIZONTAL_PADDING_PX,
  clampCanvasZoom,
  canvasViewForCards,
  clientToWorldPoint,
  setViewZoomAtViewportCenter,
} from '../../lib/canvasView.js';
import { getContextLimits } from '../../lib/agentContextContent.js';
import { externalUrlForCard } from '../../lib/bookmarkCardOpen.js';
import { clusterSelectionStatsFromCards } from '../../lib/clusterMembers.js';
import {
  buildPrimitiveSelectionIndex,
  primitivePlacementKey,
} from '../../lib/workspacePlacementIndex.js';
import { fetchCanvasProjectDocument } from '../../lib/canvasProjectsApi.js';
import {
  artifactCountAuditStatus,
  summarizeArtifactDatabaseCounts,
} from '../../lib/artifactCountAudit.js';
import { SyncHoldingTray } from '../../components/SyncHoldingTray.jsx';
import { PrimitiveTableModal } from '../../components/PrimitiveTableModal.jsx';
import { NewNoteDialog } from '../../components/NewNoteDialog.jsx';
import { NewTaskDialog } from '../../components/NewTaskDialog.jsx';
import { AddLinkDialog } from '../../components/AddLinkDialog.jsx';
import { CreateTaskDialog } from '../../components/CreateTaskDialog.jsx';
import { Canvas } from '../../components/Canvas.jsx';
import { CardModal } from '../../components/CardModal.jsx';
import { MobileView } from '../../components/MobileView.jsx';
import { SearchOverlay } from '../../components/SearchOverlay.jsx';
import { ChangeFolderDialog } from '../../components/ChangeFolderDialog.jsx';
import { SyncConfirm } from '../../components/SyncConfirm.jsx';
import { CanvasChrome } from '../../components/CanvasChrome.jsx';
import { SystemArchitectureModal } from '../../components/SystemArchitectureModal.jsx';
import { DiagnosticsCanvasView } from '../diagnostics/DiagnosticsCanvasView.jsx';
import { ProjectDeleteConfirm } from '../../components/ProjectDeleteConfirm.jsx';
import { DeleteLinkConfirm } from '../../components/DeleteLinkConfirm.jsx';
import { ProjectArchiveLastConfirm } from '../../components/ProjectArchiveLastConfirm.jsx';
import { ProjectCreateNamePrompt } from '../../components/ProjectCreateNamePrompt.jsx';
import { EmptyWorkspacePrompt } from '../../components/EmptyWorkspacePrompt.jsx';
import { RightDock } from '../../components/RightDock.jsx';
import { CreateClusterDialog } from '../../components/CreateClusterDialog.jsx';
import { CreateFlowDialog } from '../flow/components/CreateFlowDialog.jsx';
import { patchFlowCard } from '../flow/domain/flowDocument.js';
import { CreateLiveArtifactDialog } from '../live/components/CreateLiveArtifactDialog.jsx';
import { CreateAgentDialog } from '../agents/components/CreateAgentDialog.jsx';
import { AgentControlRoom } from '../agents/components/AgentControlRoom.jsx';
import { CreateBeatAgentDialog } from '../music/agents/beat/components/CreateBeatAgentDialog.jsx';
import { BeatAgentFullscreen } from '../music/agents/beat/components/BeatAgentFullscreen.jsx';
import { CreateSonicStudioDialog } from '../sonicStudio/components/CreateSonicStudioDialog.jsx';
import { AddMenu, shouldOpenCanvasAddMenu } from '../../components/AddMenu.jsx';
import { resolveNewCardPosition } from './resolveNewCardPosition.js';
import { executeAgent } from '../agents/api/agentsApi.js';
import { completeAgentImageGeneration } from '../agents/domain/completeAgentImageGeneration.js';
import { resolveAgentReferenceImages } from '../agents/domain/referenceImages.js';

const ARTIFACT_AUDIT_RETRY_MS = 500;
const ARTIFACT_AUDIT_MAX_RETRIES = 10;
const RIGHT_DOCK_RESERVED_WIDTH_PX = 448;
const ARTIFACT_ZOOM_PADDING_PX = 220;

function artifactIdForCanvasCard(card) {
  const pinned = card?.versions?.find((v) => v.version === card.pinnedVersion) ?? card?.versions?.[0];
  return pinned?.artifactRef?.id ?? null;
}

/**
 * Loaded-state workspace UI extracted from App.jsx (Phase 1c).
 * Props are grouped by feature boundary (Phase 2 bundling).
 */
export function CanvasWorkspaceView({
  workspace,
  folder,
  sync,
  canvas,
  cluster,
  agent,
  dialogs,
}) {
  const {
    state,
    setState,
    canEditCanvas,
    activeProjectId: _activeProjectId,
    pendingSwitchProjectId,
    workspaceProjection,
    projectList,
    projectSwitchLoading,
    projectNameDirtyRef,
    loaded,
    filteredCards,
    commitProjectDisplayName,
    switchProject,
    handleRequestCreateProject,
    handleRefreshProjectsFromServer,
    handleArchiveProject,
    handleUnarchiveProject,
    handleConfirmDeleteProject,
    handleCreateProject,
  } = workspace;

  const {
    effectiveProjectId,
    committedProjectId,
    displayProjectName,
    phase,
  } = workspaceProjection ?? {};

  const {
    folderHandle,
    folderStoredOnDevice,
    folderLinkInProgress,
    folderLinkProbeComplete,
    folderKeySet,
    connectedFolderName,
    folderDisplayName,
    handleSyncClick,
    handleReconnectFolder,
    requestFolder,
    importFilesToDock,
    beginChangeFolder,
    folderPresentKeys,
    setFolderPresentKeys,
  } = folder;

  const {
    syncStatus,
    syncLock,
    setSyncStatus,
    confirmChanges,
    setConfirmChanges,
    stagedSyncCards,
    requestStructuralSync,
    applySyncChanges,
    resolveProjectConflictUseServer,
    resolveProjectConflictKeepLocal,
    handleClearLocalCache,
  } = sync;

  const {
    activeCardId,
    setActiveCardId,
    openCardId,
    setOpenCardId,
    closeOpenCard,
    registerFlowFlush,
    versionStackOpen,
    setVersionStackOpen,
    stagingDragActive,
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
    handleRestoreDockToCanvas,
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
  } = canvas;

  const {
    clusterId,
    canvasEdges,
    linkCountByCardId,
    refreshGraph,
    openInspector,
    closeInspector,
    selectedCardIds,
    toggleCardSelect,
    clearCardSelection,
    clusterHullSource,
    highlightedClusterId,
    setSelectedClusterId,
    workspaceTreeOpen,
    workspaceTreeReloadKey,
    closeWorkspaceTree,
    toggleWorkspaceTree,
    clusterInspectorReload,
    handleClusterRenamed,
    handleCreateClusterFromSelection,
    clusterApiAvailable,
    clusterApiUnavailableMessage,
    setCreateClusterOpen,
    creatingCluster,
    createClusterOpen,
    inspectorOpen,
    inspectorSelection,
    clusterMemberOptions,
  } = cluster;

  const [generatingAgentCardId, setGeneratingAgentCardId] = useState(null);

  const handleGenerateAgentFromCanvas = useCallback(async (card) => {
    const agentId =
      card?.agentArtifactId ||
      card?.versions?.[0]?.agentArtifactId ||
      artifactIdForCanvasCard(card);
    if (!agentId) {
      setSyncStatus({ error: 'Agent artifact is missing its database reference.' });
      setTimeout(() => setSyncStatus(null), 5000);
      return;
    }

    const agentArtifactId = artifactIdForCanvasCard(card);
    const promptEdge = canvasEdges.find(
      (edge) =>
        edge.kind === 'relationship'
        && edge.type === 'prompt_input_to'
        && edge.toId === agentArtifactId,
    );
    const referenceArtifactIds = canvasEdges
      .filter(
        (edge) =>
          edge.kind === 'relationship'
          && edge.type === 'reference_input_to'
          && edge.toId === agentArtifactId,
      )
      .map((edge) => edge.fromId)
      .filter(Boolean);

    if (!promptEdge?.fromId) {
      setSyncStatus({ error: 'Connect a Note card to this Agent as the prompt before generating.' });
      setTimeout(() => setSyncStatus(null), 6000);
      return;
    }

    setGeneratingAgentCardId(card.id);
    setSyncStatus({ toast: 'Generating image...' });
    try {
      const referenceImages = await resolveAgentReferenceImages({
        cards: state.cards,
        referenceArtifactIds,
        folderHandle,
      });
      const result = await executeAgent(agentId, {
        promptNoteArtifactId: promptEdge.fromId,
        referenceArtifactIds,
        referenceImages,
      });
      const outputs = result.execution?.outputs?.artifacts ?? [];
      if (outputs.length) {
        const baseX = (card?.x ?? 100) + (card?.w ?? card?.width ?? 240) + 60;
        const baseY = card?.y ?? 100;
        const positions = outputs.map((output, index) => ({
          x: baseX + (index % 2) * 300,
          y: baseY + Math.floor(index / 2) * 250,
        }));
        const { folderWriteOk } = await completeAgentImageGeneration({
          folderHandle,
          folderPresentKeys,
          setFolderPresentKeys,
          outputs,
          positions,
          executionId: result.execution?.id,
          agentArtifactRef: { id: agentId, type: 'artifact' },
          clusterId,
          projectId: effectiveProjectId,
          projectName: state.projectName,
          appendGeneratedCards,
          refreshGraph,
        });
        if (folderHandle && !folderWriteOk) {
          setSyncStatus({
            toast: `Generated ${outputs.length} image${outputs.length === 1 ? '' : 's'}, but folder save was denied or failed.`,
          });
          setTimeout(() => setSyncStatus(null), 7000);
          return;
        }
      } else {
        await refreshGraph?.({ clusterId, projectId: effectiveProjectId, force: true });
      }
      setSyncStatus({ toast: `Generated ${outputs.length || 0} image${outputs.length === 1 ? '' : 's'}.` });
      setTimeout(() => setSyncStatus(null), 5000);
    } catch (error) {
      setSyncStatus({ error: error.message || 'Agent image generation failed.' });
      setTimeout(() => setSyncStatus(null), 7000);
    } finally {
      setGeneratingAgentCardId(null);
    }
  }, [
    appendGeneratedCards,
    canvasEdges,
    clusterId,
    effectiveProjectId,
    folderHandle,
    folderPresentKeys,
    refreshGraph,
    setFolderPresentKeys,
    setSyncStatus,
    state.cards,
    state.projectName,
  ]);

  const {
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
    retryOllamaPull,
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
    registerFlowContextLoader,
    agentPanelCollapsedSections,
    handleAgentPanelCollapsedSectionsChange,
    chatScrollResetKey,
  } = agent;

  const primitiveSelectionIndex = useMemo(() =>
    buildPrimitiveSelectionIndex({
      cards: state.cards,
      stagedSyncCards,
      threads: agentChatThreadIndex.threads,
      connectorId: singleConnectorId,
    }),
  [state.cards, stagedSyncCards, agentChatThreadIndex.threads, singleConnectorId]);
  const activeCardPrimitiveKey = activeCardId
    ? primitiveSelectionIndex.byCardId.get(activeCardId) ?? ''
    : '';
  const [workspaceSelectedPrimitiveKey, setWorkspaceSelectedPrimitiveKey] = useState('');
  const selectedWorkspacePrimitiveKey = activeCardPrimitiveKey || workspaceSelectedPrimitiveKey;

  const handleWorkspaceSelectPrimitive = useCallback((ref, options = {}) => {
    if (!ref?.type || !ref?.id) return;
    if (options.syncSelection !== false) {
      const key = primitivePlacementKey(ref.type, ref.id);
      const hit = primitiveSelectionIndex.byPrimitiveKey.get(key);
      if (key && hit) {
        setWorkspaceSelectedPrimitiveKey(key);
        clearCardSelection?.();
        if (hit.surface === 'canvas' && hit.cardId) {
          setActiveCardId(hit.cardId);
        } else if (hit.surface === 'dock') {
          setActiveCardId(null);
        }
      }
    }
    openInspector(ref);
  }, [
    clearCardSelection,
    openInspector,
    primitiveSelectionIndex,
    setActiveCardId,
  ]);

  const zoomCardsWithSidePanelPadding = useCallback((cardsToFit) => {
    if (!cardsToFit.length) return;
    clearCardSelection?.();
    const sidePanelReservedWidth = Math.min(
      RIGHT_DOCK_RESERVED_WIDTH_PX,
      Math.max(0, canvasViewportSize.width - 320),
    );
    setCanvasView(() =>
      canvasViewForCards(cardsToFit, canvasViewportSize, {
        paddingTop: ARTIFACT_ZOOM_PADDING_PX,
        paddingRight: ARTIFACT_ZOOM_PADDING_PX + sidePanelReservedWidth,
        paddingBottom: ARTIFACT_ZOOM_PADDING_PX,
        paddingLeft: ARTIFACT_ZOOM_PADDING_PX,
      }),
    );
  }, [
    canvasViewportSize,
    clearCardSelection,
    setCanvasView,
  ]);

  const handleWorkspaceZoomPrimitive = useCallback((ref) => {
    if (!ref?.type || !ref?.id) return;
    if (ref.type === 'artifact') {
      const key = primitivePlacementKey(ref.type, ref.id);
      const hit = primitiveSelectionIndex.byPrimitiveKey.get(key);
      if (!key || hit?.surface !== 'canvas' || !hit.cardId) return;
      const card = state.cards.find((candidate) => candidate.id === hit.cardId);
      if (!card) return;

      setWorkspaceSelectedPrimitiveKey(key);
      setActiveCardId(card.id);
      zoomCardsWithSidePanelPadding([card]);
      return;
    }

    if (ref.type === 'cluster') {
      const memberRefs = clusterHullSource.membersByClusterId?.get(ref.id) ?? [];
      const cardsById = new Map(state.cards.map((card) => [card.id, card]));
      const cardsToFit = memberRefs
        .map((memberRef) => {
          if (memberRef?.type !== 'artifact' || !memberRef?.id) return null;
          const key = primitivePlacementKey('artifact', memberRef.id);
          const hit = primitiveSelectionIndex.byPrimitiveKey.get(key);
          if (hit?.surface !== 'canvas' || !hit.cardId) return null;
          return cardsById.get(hit.cardId) ?? null;
        })
        .filter(Boolean);
      if (!cardsToFit.length) return;

      setWorkspaceSelectedPrimitiveKey(primitivePlacementKey(ref.type, ref.id));
      setActiveCardId(null);
      zoomCardsWithSidePanelPadding(cardsToFit);
    }
  }, [
    clusterHullSource.membersByClusterId,
    primitiveSelectionIndex,
    setActiveCardId,
    state.cards,
    zoomCardsWithSidePanelPadding,
  ]);

  const {
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
  } = dialogs;

  const [createLiveOpen, setCreateLiveOpen] = useState(false);
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  const [createBeatAgentOpen, setCreateBeatAgentOpen] = useState(false);
  const [createSonicStudioOpen, setCreateSonicStudioOpen] = useState(false);
  const isMobile = useIsMobile();
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [deleteLinkTarget, setDeleteLinkTarget] = useState(null);
  const pendingCardPlacementRef = useRef(null);
  const [addMenu, setAddMenu] = useState({
    open: false,
    variant: 'button',
    anchor: null,
  });

  const closeAddMenu = useCallback(() => {
    setAddMenu({ open: false, variant: 'button', anchor: null });
  }, []);

  const openAddMenuFromButton = useCallback((anchor) => {
    pendingCardPlacementRef.current = null;
    setAddMenu({ open: true, variant: 'button', anchor });
  }, []);

  const consumeCardPosition = useCallback(({
    mode = 'grid',
    offset = { x: 0, y: 0 },
  } = {}) => {
    const pending = pendingCardPlacementRef.current;
    pendingCardPlacementRef.current = null;
    const view = state.canvasView ?? { x: 0, y: 0, zoom: 1 };
    const resolved = resolveNewCardPosition({
      pendingPlacement: pending,
      cardCount: state.cards.length,
      canvasView: view,
      viewportSize: canvasViewportSize,
      offset,
      mode,
    });
    return { x: resolved.x, y: resolved.y };
  }, [state.canvasView, state.cards.length, canvasViewportSize]);

  const handleAddMenuSelect = useCallback((itemId) => {
    switch (itemId) {
      case 'sonic':
        setCreateSonicStudioOpen(true);
        break;
      case 'beat':
        setCreateBeatAgentOpen(true);
        break;
      case 'agent':
        setCreateAgentOpen(true);
        break;
      case 'live':
        setCreateLiveOpen(true);
        break;
      case 'flow':
        setCreateFlowOpen(true);
        break;
      case 'link':
        setAddLinkOpen(true);
        break;
      case 'task':
        setNewTaskOpen(true);
        break;
      case 'note':
        setNewNoteOpen(true);
        break;
      default:
        break;
    }
  }, [
    setAddLinkOpen,
    setCreateBeatAgentOpen,
    setCreateSonicStudioOpen,
    setCreateAgentOpen,
    setCreateLiveOpen,
    setCreateFlowOpen,
    setNewNoteOpen,
    setNewTaskOpen,
  ]);

  const handleCanvasContextMenu = useCallback((event) => {
    if (!shouldOpenCanvasAddMenu(event)) return;
    event.preventDefault();
    const rect = canvasElement?.getBoundingClientRect();
    if (!rect) return;
    const view = state.canvasView ?? { x: 0, y: 0, zoom: 1 };
    const world = clientToWorldPoint(view, rect, event.clientX, event.clientY);
    pendingCardPlacementRef.current = world;
    setAddMenu({
      open: true,
      variant: 'context',
      anchor: { clientX: event.clientX, clientY: event.clientY },
    });
  }, [canvasElement, state.canvasView]);

  const requestDeleteCard = useCallback((id) => {
    const card = state.cards.find((c) => c.id === id);
    if (card?.type === 'bookmark') {
      setDeleteLinkTarget({
        id,
        name: card.name?.trim() || strings.bookmark.untitled,
      });
      return;
    }
    void removeCard(id);
  }, [removeCard, state.cards]);

  const handleConfirmDeleteLink = useCallback(() => {
    if (!deleteLinkTarget?.id) return;
    const id = deleteLinkTarget.id;
    setDeleteLinkTarget(null);
    void removeCard(id);
  }, [deleteLinkTarget, removeCard]);

  const closeRightDock = useCallback(() => {
    closeWorkspaceTree();
    closeAgentPanel();
    closeInspector();
  }, [closeInspector, closeAgentPanel, closeWorkspaceTree]);

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

  const showChangeFolder =
    folderConnected
    || folderStoredOnDevice
    || Boolean(connectedFolderName?.trim());

  const folderNeedsConnectUi =
    folderNeedsConnect
    || (
      Boolean(effectiveProjectId)
      && !folderConnected
      && !folderNeedsReconnect
      && folderLinkState.phase === 'unlinked'
    );

  const emptyDesktopHint = useMemo(() => {
    if (folderNeedsReconnect && connectedFolderName) {
      return strings.empty.desktopHintReconnectFolder(connectedFolderName);
    }
    if (folderNeedsConnectUi && connectedFolderName) {
      return strings.empty.desktopHintConnectFolderNamed(connectedFolderName);
    }
    if (folderNeedsConnectUi) {
      return strings.empty.desktopHint;
    }
    return strings.empty.desktopHint;
  }, [folderNeedsReconnect, folderNeedsConnectUi, connectedFolderName]);

  const rightDockOpen = workspaceTreeOpen || agentPanelOpen || inspectorOpen;
  const sidePanelReservedWidth = useMemo(
    () =>
      rightDockOpen
        ? Math.min(
          RIGHT_DOCK_RESERVED_WIDTH_PX,
          Math.max(0, canvasViewportSize.width - 320),
        )
        : 0,
    [canvasViewportSize.width, rightDockOpen],
  );

  const handleResetCanvasView = useCallback(() => {
    const fitOverrides =
      sidePanelReservedWidth > 0
        ? {
            paddingRight:
              CANVAS_FIT_HORIZONTAL_PADDING_PX + sidePanelReservedWidth,
          }
        : {};
    fitCanvasViewToCards(filteredCards, fitOverrides);
  }, [filteredCards, fitCanvasViewToCards, sidePanelReservedWidth]);

  const openCardOrExternalLink = useCallback((cardOrId) => {
    const card = typeof cardOrId === 'string'
      ? state.cards.find((candidate) => candidate.id === cardOrId)
      : cardOrId;
    const externalUrl = externalUrlForCard(card);
    if (externalUrl) {
      window.open(externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (card?.id) setOpenCardId(card.id);
  }, [state.cards, setOpenCardId]);

  const handleOpenLatestOutput = useCallback(({ artifactId }) => {
    if (!artifactId) return;
    const outputCard = state.cards.find((entry) => artifactIdForCanvasCard(entry) === artifactId);
    closeOpenCard();
    if (outputCard) {
      openCardOrExternalLink(outputCard.id);
      return;
    }
    openInspector({ type: 'artifact', id: artifactId });
  }, [closeOpenCard, openCardOrExternalLink, openInspector, state.cards]);

  const userTaskCards = useMemo(
    () => state.cards.filter((card) => card.type === 'user_task'),
    [state.cards],
  );
  const openCard = openCardId ? state.cards.find(c => c.id === openCardId) : null;
  const cardsRef = useRef(state.cards);
  const openCardIdRef = useRef(openCardId);
  const handleFlowCardRefreshRef = useRef(handleFlowCardRefresh);
  cardsRef.current = state.cards;
  openCardIdRef.current = openCardId;
  handleFlowCardRefreshRef.current = handleFlowCardRefresh;

  const onFlowCardRefresh = useCallback((flow, nodes, edges) => {
    const cardId = openCardIdRef.current;
    if (!cardId) return undefined;
    const card = cardsRef.current.find((entry) => entry.id === cardId);
    if (!card) return undefined;
    const updates = patchFlowCard(card, flow, nodes, edges);
    return handleFlowCardRefreshRef.current(cardId, updates);
  }, []);
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
  const artifactAgentSelectedCardIds = useMemo(
    () => new Set(openCard ? [openCard.id] : []),
    [openCard?.id],
  );

  const clusterSelectionStats = useMemo(() => {
    const cards = state.cards.filter((c) => selectedCardIds.has(c.id));
    return clusterSelectionStatsFromCards(cards, clusterMemberOptions);
  }, [state.cards, selectedCardIds, clusterMemberOptions]);

  const [artifactCountAudit, setArtifactCountAudit] = useState(null);
  const [artifactAuditRetry, setArtifactAuditRetry] = useState({
    signature: '',
    attempt: 0,
  });
  const artifactAuditRetryTimerRef = useRef(null);
  const artifactAuditSyncRequestRef = useRef('');

  useEffect(() => {
    if (!effectiveProjectId || !isServerSyncEnabled()) {
      setArtifactCountAudit(null);
      return undefined;
    }
    let cancelled = false;
    const signature = `${effectiveProjectId}:${state.cards.length}:${stagedSyncCards.length}`;
    const attempt =
      artifactAuditRetry.signature === signature ? artifactAuditRetry.attempt : 0;
    const scheduleRetry = () => {
      if (attempt >= ARTIFACT_AUDIT_MAX_RETRIES) return false;
      artifactAuditRetryTimerRef.current = setTimeout(() => {
        setArtifactAuditRetry({ signature, attempt: attempt + 1 });
      }, ARTIFACT_AUDIT_RETRY_MS);
      return true;
    };
    setArtifactCountAudit((prev) => ({
      ...(prev?.projectId === effectiveProjectId ? prev : {}),
      projectId: effectiveProjectId,
      loading: true,
      syncing: true,
      status: 'unknown',
    }));
    void fetchCanvasProjectDocument(effectiveProjectId)
      .then((remote) => {
        if (cancelled) return;
        const counts = summarizeArtifactDatabaseCounts(remote?.payload);
        if (!counts) {
          if (scheduleRetry()) {
            setArtifactCountAudit({
              projectId: effectiveProjectId,
              loading: true,
              syncing: true,
              status: 'unknown',
            });
            return;
          }
          setArtifactCountAudit({
            projectId: effectiveProjectId,
            loading: false,
            missing: true,
            status: 'unknown',
          });
          return;
        }
        const status = artifactCountAuditStatus(
          { canvas: state.cards.length, dock: stagedSyncCards.length },
          counts,
        );
        const syncRequestKey = `${signature}:${attempt}`;
        if (status !== 'match' && artifactAuditSyncRequestRef.current !== syncRequestKey) {
          artifactAuditSyncRequestRef.current = syncRequestKey;
          if (typeof requestStructuralSync === 'function') {
            void requestStructuralSync({
              awaitLocal: true,
              allowCleanupOverwrite: true,
            });
          }
        }
        if (status === 'match') {
          artifactAuditSyncRequestRef.current = '';
        }
        if (status !== 'match' && scheduleRetry()) {
          setArtifactCountAudit({
            projectId: effectiveProjectId,
            loading: true,
            syncing: true,
            revision: remote?.revision ?? 0,
            updatedAt: remote?.updatedAt ?? null,
            ...counts,
            status: 'unknown',
          });
          return;
        }
        setArtifactCountAudit({
          projectId: effectiveProjectId,
          loading: false,
          revision: remote?.revision ?? 0,
          updatedAt: remote?.updatedAt ?? null,
          ...counts,
          status,
        });
      })
      .catch(() => {
        if (cancelled) return;
        if (scheduleRetry()) {
          setArtifactCountAudit((prev) => ({
            ...(prev?.projectId === effectiveProjectId ? prev : {}),
            projectId: effectiveProjectId,
            loading: true,
            syncing: true,
            status: 'unknown',
          }));
          return;
        }
        setArtifactCountAudit((prev) => {
          if (
            prev?.projectId === effectiveProjectId
            && typeof prev.dbTotal === 'number'
          ) {
            return {
              ...prev,
              loading: false,
              syncing: false,
              error: false,
            };
          }
          return {
            projectId: effectiveProjectId,
            loading: false,
            error: true,
            status: 'unknown',
          };
        });
      });
    return () => {
      cancelled = true;
      if (artifactAuditRetryTimerRef.current) {
        clearTimeout(artifactAuditRetryTimerRef.current);
        artifactAuditRetryTimerRef.current = null;
      }
    };
  }, [
    effectiveProjectId,
    state.cards.length,
    stagedSyncCards.length,
    artifactAuditRetry,
    requestStructuralSync,
  ]);

  const visibleArtifactCountAudit =
    artifactCountAudit?.projectId === effectiveProjectId ? artifactCountAudit : null;

  return (
    <div className="h-screen w-screen overflow-hidden bg-canvas text-primary sans">
      {/* Canvas or Mobile view */}
      {isMobile ? (
        <MobileView
          cards={filteredCards}
          onOpen={openCardOrExternalLink}
          onPinVersion={pinVersion}
          onDeleteCard={requestDeleteCard}
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
          onOpenCard={openCardOrExternalLink}
          onPinVersion={pinVersion}
          onUpdateCard={updateCard}
          onBatchUpdateCardPositions={batchUpdateCardPositions}
          onDeleteCard={requestDeleteCard}
          onGenerateAgent={handleGenerateAgentFromCanvas}
          agentGeneratingCardId={generatingAgentCardId}
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
          projectId={effectiveProjectId}
          projectName={state.projectName}
          onPatchCardVersion={handleUpdateVersion}
          onInlineSaveUserNote={handleInlineSaveUserNote}
          onInlineSaveUserTask={handleInlineSaveUserTask}
          onInlineSaveMarkdown={handleInlineSaveMarkdown}
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
          onCanvasContextMenu={handleCanvasContextMenu}
        />
      )}

      {!isMobile && (
        <SyncHoldingTray
          stagedCards={stagedSyncCards}
          canvasView={state.canvasView}
          canvasElement={canvasElement}
          onPlace={placeStagedSyncCard}
          onDragActiveChange={handleStagingDragActiveChange}
          visible
          dropZoneHighlight={cardDockHover}
          onDropZoneRectChange={(rect) => {
            trayDropRectRef.current = rect;
          }}
        />
      )}

      <CanvasChrome
          showDesktopControls={!isMobile}
          projectList={projectList}
          activeProjectId={effectiveProjectId}
          projectName={displayProjectName}
          onProjectNameChange={(name) => {
            projectNameDirtyRef.current = true;
            setState((prev) => ({ ...prev, projectName: name }));
          }}
          onProjectNameBlur={() => void commitProjectDisplayName()}
          onSwitchProject={switchProject}
          projectSwitchLoading={projectSwitchLoading}
          onCreateProject={handleRequestCreateProject}
          onRefreshProjects={handleRefreshProjectsFromServer}
          onArchiveProject={handleArchiveProject}
          onUnarchiveProject={handleUnarchiveProject}
          onDeleteProjectRequest={(p) => setProjectDeleteTarget({ id: p.id, name: p.name })}
          onViewPrimitives={() => setPrimitiveTableOpen(true)}
          onCreateTask={() => setCreateTaskOpen(true)}
          onOpenAgentMode={() => {
            setAgentPanelOpen(true);
          }}
          addMenuOpen={addMenu.open && addMenu.variant === 'button'}
          addMenuAnchor={addMenu.variant === 'button' ? addMenu.anchor : null}
          onOpenAddMenuButton={openAddMenuFromButton}
          onCloseAddMenu={closeAddMenu}
          onAddMenuSelect={handleAddMenuSelect}
          onOpenLiveArtifact={(liveArtifactId) => {
            const card = state.cards.find((item) =>
              item.liveArtifactId === liveArtifactId
              || item.versions?.some((version) => version.liveArtifactId === liveArtifactId),
            );
            if (card) setOpenCardId(card.id);
          }}
          userTaskCards={userTaskCards}
          onOpenTaskCard={(cardId) => {
            setOpenCardId(cardId);
            setActiveCardId(cardId);
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
          onResetView={handleResetCanvasView}
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
          dockRestoreCount={syncStatus?.dockRestore?.count ?? 0}
          onRestoreDockToCanvas={
            (syncStatus?.dockRestore?.count ?? 0) > 0
              ? handleRestoreDockToCanvas
              : undefined
          }
          folderDisplayName={folderDisplayName}
          connectedFolderName={connectedFolderName}
          folderNeedsReconnect={folderNeedsReconnect}
          folderNeedsConnect={folderNeedsConnectUi}
          folderLinkInProgress={folderLinkInProgress}
          folderFooterSyncHidden={folderNeedsConnectUi || folderNeedsReconnect}
          folderLinked={folderConnected}
          showChangeFolder={showChangeFolder}
          onChangeFolder={() => setChangeFolderDialog(true)}
          onImportFiles={importFilesToDock}
          onSync={() => {
            void handleSyncClick();
          }}
          onReconnectFolder={
            folderNeedsReconnect ? () => void handleReconnectFolder() : undefined
          }
          onConnectFolder={
            folderNeedsConnectUi ? () => void requestFolder() : undefined
          }
          cardCount={state.cards.length}
          artifactCountAudit={visibleArtifactCountAudit}
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

      {/* Loading project (user switch only — boot/repair use phase without this overlay) */}
      {!isMobile && projectSwitchLoading && pendingSwitchProjectId && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <p className="sans text-sm text-muted uppercase tracking-wider">
            {strings.projects.loadingProject}
          </p>
        </div>
      )}

      {!isMobile
        && loaded
        && canShowEmptyWorkspace({
          projectListLength: projectList.length,
          committedProjectId,
          phase,
        }) && (
        <EmptyWorkspacePrompt
          onCreateProject={handleRequestCreateProject}
          onRefreshProjects={handleRefreshProjectsFromServer}
        />
      )}

      {!isMobile
        && loaded
        && shouldShowSelectProjectPrompt({
          projectListLength: projectList.length,
          committedProjectId,
          phase,
        }) && <SelectProjectPrompt />}

      {/* Empty state desktop — only when selection settled (not mid-switch / folder link) */}
      {!isMobile
        && phase === 'ready'
        && effectiveProjectId
        && state.cards.length === 0
        && !projectSwitchLoading
        && !folderLinkInProgress && (
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
          onOpenDiagnostics={() => {
            setArchitectureOpen(false);
            setDiagnosticsOpen(true);
          }}
          runtime={{
            generatedAt: new Date().toISOString(),
            syncMode: getProjectSyncMode(),
            serverSyncEnabled: isServerSyncEnabled(),
            activeProjectId: effectiveProjectId,
            syncLock,
            clientRevision: effectiveProjectId ? getClientRevision(effectiveProjectId) : 0,
            cardCount: state.cards.length,
            stagedCount: stagedSyncCards.length,
            folderLinked: folderConnected,
            folderLinkPhase: folderLinkState.phase,
          }}
        />
      )}

      {diagnosticsOpen && (
        <DiagnosticsCanvasView
          onClose={() => setDiagnosticsOpen(false)}
          runtime={{
            generatedAt: new Date().toISOString(),
            syncMode: getProjectSyncMode(),
            serverSyncEnabled: isServerSyncEnabled(),
            activeProjectId: effectiveProjectId,
            syncLock,
            clientRevision: effectiveProjectId ? getClientRevision(effectiveProjectId) : 0,
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
            openCardOrExternalLink(card);
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

      {deleteLinkTarget && (
        <DeleteLinkConfirm
          linkName={deleteLinkTarget.name}
          folderConnected={folderConnected}
          onConfirm={handleConfirmDeleteLink}
          onCancel={() => setDeleteLinkTarget(null)}
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
            cards: state.cards,
            stagedSyncCards,
            threads: agentChatThreadIndex.threads,
            connectorId: singleConnectorId,
            selectedPrimitiveKey: selectedWorkspacePrimitiveKey,
            onSelectPrimitive: handleWorkspaceSelectPrimitive,
            onZoomPrimitive: handleWorkspaceZoomPrimitive,
          }}
          agentPanelOpen={agentPanelOpen}
          onCloseAgentPanel={closeAgentPanel}
          agentProps={{
            panelMode: agentPanelMode,
            onPanelModeChange: setAgentPanelMode,
            singleConnectorId,
            onSingleConnectorChange: setSingleConnectorId,
            connectors: agentConnectors,
            agentTemplates,
            activeAgentTemplateId,
            activeAgentThread,
            threadAgentTemplate,
            selectedAgentTypeDiffersFromThread,
            activeThreadAgentTypeCompatible,
            selectedThreadNeedsDefaultAgentType,
            onAgentTemplateChange: handleSelectAgentTemplate,
            onSaveAgentTemplate: handleSaveAgentTemplate,
            onDeleteAgentTemplate: handleDeleteAgentTemplate,
            onImportMasterAgentTemplates: handleImportMasterAgentTemplates,
            onApplyAgentTypeToActiveThread: handleApplyAgentTypeToActiveThread,
            onUseDefaultAgentTypeForActiveThread: handleUseDefaultAgentTypeForActiveThread,
            secretsConfigured: agentSecretsConfigured,
            connectorsOffline: agentConnectorsOffline,
            openaiReachable: agentOpenaiReachable,
            openaiReachabilityError: agentOpenaiReachabilityError,
            ollamaPullState,
            onRetryOllamaPull: retryOllamaPull,
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
            onRemoveContextCard: handleRemoveContextCard,
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
            initialCollapsedSections: agentPanelCollapsedSections,
            onCollapsedSectionsChange: handleAgentPanelCollapsedSectionsChange,
            chatScrollResetKey,
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
              if (card) openCardOrExternalLink(card);
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
          onSave={async (values) => {
            const position = consumeCardPosition({ mode: 'grid' });
            await handleSaveNewNote({ ...values, position });
          }}
          saving={savingNote}
          linkableCards={state.cards.filter((c) => c.type !== 'user_note' && c.type !== 'user_task')}
        />
      )}

      {newTaskOpen && (
        <NewTaskDialog
          onClose={() => setNewTaskOpen(false)}
          onSave={async (values) => {
            const position = consumeCardPosition({ mode: 'grid' });
            await handleSaveNewTask({ ...values, position });
          }}
          saving={savingTask}
          linkableCards={state.cards.filter((c) => c.type !== 'user_task')}
        />
      )}

      {addLinkOpen && (
        <AddLinkDialog
          onClose={() => setAddLinkOpen(false)}
          onSave={async (values) => {
            const position = consumeCardPosition({ mode: 'grid' });
            await handleSaveNewLink({ ...values, position });
          }}
          saving={savingLink}
          linkableCards={state.cards.filter((c) => c.type !== 'user_note' && c.type !== 'bookmark')}
        />
      )}

      {createFlowOpen && (
        <CreateFlowDialog
          saving={savingFlow}
          onClose={() => setCreateFlowOpen(false)}
          onSave={async (values) => {
            const position = consumeCardPosition({
              mode: 'center',
              offset: { x: -180, y: -120 },
            });
            const card = await handleSaveNewFlow({ ...values, position });
            if (card) setCreateFlowOpen(false);
          }}
        />
      )}

      {createSonicStudioOpen && (
        <CreateSonicStudioDialog
          saving={savingSonicStudio}
          onClose={() => setCreateSonicStudioOpen(false)}
          onSave={async (values) => {
            const position = consumeCardPosition({
              mode: 'center',
              offset: { x: -190, y: -140 },
            });
            const card = await handleSaveNewSonicStudio({ ...values, position });
            if (card) setCreateSonicStudioOpen(false);
          }}
        />
      )}

      {createLiveOpen && (
        <CreateLiveArtifactDialog
          saving={savingLive}
          onClose={() => setCreateLiveOpen(false)}
          onSave={async (values) => {
            const position = consumeCardPosition({
              mode: 'center',
              offset: { x: -190, y: -140 },
            });
            const card = await handleSaveNewLive({ ...values, position });
            if (card) setCreateLiveOpen(false);
          }}
        />
      )}

      {createAgentOpen && (
        <CreateAgentDialog
          saving={savingAgent}
          onClose={() => setCreateAgentOpen(false)}
          onSave={async (values) => {
            const position = consumeCardPosition({
              mode: 'center',
              offset: { x: -120, y: -120 },
            });
            const card = await handleSaveNewAgent({ ...values, position });
            if (card) setCreateAgentOpen(false);
          }}
        />
      )}

      {createBeatAgentOpen && (
        <CreateBeatAgentDialog
          saving={savingAgent}
          onClose={() => setCreateBeatAgentOpen(false)}
          onSave={async (values) => {
            const position = consumeCardPosition({
              mode: 'center',
              offset: { x: -180, y: -130 },
            });
            const card = await handleSaveNewBeatAgent({ ...values, position });
            if (card) setCreateBeatAgentOpen(false);
          }}
        />
      )}

      {addMenu.open && addMenu.variant === 'context' && (
        <AddMenu
          variant="context"
          open
          anchor={addMenu.anchor}
          onClose={closeAddMenu}
          onSelect={handleAddMenuSelect}
          syncLock={syncLock}
          activeProjectId={effectiveProjectId}
          folderLinked={folderConnected}
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

      {openCardId && openCard?.type === 'agent' && (
        <AgentControlRoom
          card={openCard}
          cards={state.cards}
          folderHandle={folderHandle}
          folderPresentKeys={folderPresentKeys}
          setFolderPresentKeys={setFolderPresentKeys}
          clusterId={clusterId}
          projectId={effectiveProjectId}
          projectName={state.projectName}
          refreshGraph={refreshGraph}
          onClose={closeOpenCard}
          onDeleteCard={requestDeleteCard}
          onUpdateCard={(updates) => updateCard(openCard.id, updates)}
          onAddOutputCards={appendGeneratedCards}
          onOpenLatestOutput={handleOpenLatestOutput}
        />
      )}

      {openCardId && openCard?.type === 'music-agent' && (
        <CardModal
          card={openCard}
          cards={state.cards}
          clusterId={clusterId}
          folderHandle={folderHandle}
          folderConnected={folderConnected}
          folderKeySet={folderKeySet}
          projectId={effectiveProjectId}
          projectName={state.projectName}
          onClose={closeOpenCard}
          onPinVersion={pinVersion}
          onDeleteCard={requestDeleteCard}
          onUpdateVersion={(versionNum, updatedVersion) =>
            handleUpdateVersion(openCard.id, versionNum, updatedVersion)
          }
          missingFromFolder={false}
          onUpdateCard={(updates) => updateCard(openCard.id, updates)}
          onInspectArtifact={openInspector}
          onFocusCard={(id) => {
            setOpenCardId(id);
            setActiveCardId(id);
          }}
          onGraphRefresh={refreshGraph}
          onSaveStatus={handleNoteSaveStatus}
          onRehydratePreview={rehydratePreview}
          customContent={
            <BeatAgentFullscreen
              card={openCard}
              projectId={effectiveProjectId}
              folderHandle={folderHandle}
              onUpdateCard={(updates) => updateCard(openCard.id, updates)}
            />
          }
        />
      )}

      {openCardId && openCard && openCard.type !== 'agent' && openCard.type !== 'music-agent' && (
        <CardModal
          card={openCard}
          cards={state.cards}
          clusterId={clusterId}
          folderHandle={folderHandle}
          folderConnected={folderConnected}
          folderKeySet={folderKeySet}
          projectId={effectiveProjectId}
          projectName={state.projectName}
          onClose={closeOpenCard}
          registerFlowFlush={registerFlowFlush}
          onPinVersion={pinVersion}
          onDeleteCard={requestDeleteCard}
          onUpdateVersion={(versionNum, updatedVersion) =>
            handleUpdateVersion(openCard.id, versionNum, updatedVersion)
          }
          missingFromFolder={openCardMissingFromFolder}
          userNoteDisabled={openCardUserNoteDisabled}
          userTaskDisabled={openCardUserNoteDisabled}
          bookmarkEditDisabled={!canEditCanvas}
          bookmarkSaving={savingCardId === openCard.id}
          onSaveBookmark={(payload) => handleInlineSaveBookmark(openCard, payload)}
          onSaveNoteToProject={(payload) => handleSaveNoteToProject(openCard, payload)}
          onSaveTaskToProject={(payload) => handleSaveTaskToProject(openCard, payload)}
          onUpdateCard={(updates) => {
            if (openCard.type === 'sonic_studio') {
              void handleUpdateSonicStudioCard(openCard.id, updates);
              return;
            }
            updateCard(openCard.id, updates);
          }}
          onInspectArtifact={openInspector}
          onFocusCard={(id) => {
            setOpenCardId(id);
            setActiveCardId(id);
          }}
          onGraphRefresh={refreshGraph}
          onSaveStatus={handleNoteSaveStatus}
          flowArtifactCandidates={state.cards}
          onFlowCardRefresh={onFlowCardRefresh}
          onRehydratePreview={rehydratePreview}
          agentPanelProps={{
            panelMode: 'single',
            panelModeLocked: true,
            contextScope: 'artifact',
            onOpen: refreshAgentConnectors,
            onRetryConnectors: refreshAgentConnectors,
            registerEmbeddedAgentPanelOpen,
            singleConnectorId,
            onSingleConnectorChange: setSingleConnectorId,
            connectors: agentConnectors,
            agentTemplates,
            activeAgentTemplateId,
            activeAgentThread,
            threadAgentTemplate,
            selectedAgentTypeDiffersFromThread,
            activeThreadAgentTypeCompatible,
            selectedThreadNeedsDefaultAgentType,
            onAgentTemplateChange: handleSelectAgentTemplate,
            onSaveAgentTemplate: handleSaveAgentTemplate,
            onDeleteAgentTemplate: handleDeleteAgentTemplate,
            onImportMasterAgentTemplates: handleImportMasterAgentTemplates,
            onApplyAgentTypeToActiveThread: handleApplyAgentTypeToActiveThread,
            onUseDefaultAgentTypeForActiveThread: handleUseDefaultAgentTypeForActiveThread,
            secretsConfigured: agentSecretsConfigured,
            connectorsOffline: agentConnectorsOffline,
            openaiReachable: agentOpenaiReachable,
            openaiReachabilityError: agentOpenaiReachabilityError,
            ollamaPullState,
            onRetryOllamaPull: retryOllamaPull,
            onSaveApiKey: handleSaveAgentApiKey,
            apiKeySaving,
            onClearApiKey: handleClearAgentApiKey,
            chatMessages: agentChatMessages,
            chatLoading: agentChatLoading,
            chatError: agentChatError,
            contextMode: 'artifact',
            onContextModeChange: () => {},
            enabledAgentIds,
            onToggleAgent: toggleEnabledAgent,
            cards: state.cards,
            contextCards: [openCard],
            selectedCardIds: artifactAgentSelectedCardIds,
            canvasView: state.canvasView,
            viewportSize: canvasViewportSize,
            onFocusContextCard: (cardId) => setActiveCardId(cardId),
            agentSelectionClick: false,
            onComingSoon: showAgentComingSoon,
            messages: agentMessages,
            onSendMessage: handleAgentSendMessage,
            folderLinked: Boolean(folderHandle),
            folderNeedsReconnect,
            folderNeedsConnect,
            connectedFolderName,
            contextStatusByCardId: agentContextStatusByCardId,
            contextDeliveryByCardId: agentContextDeliveryByCardId,
            contextDeliveryState: { sentKeys: new Set(), pendingAdd: [], pendingRemove: [], stable: [] },
            agentExtendedContext,
            onAgentExtendedContextChange: setAgentExtendedContextPersisted,
            contextEstimates: [],
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
            onRefreshContextSession: handleRefreshContextSession,
            registerFlowContextLoader,
          }}
        />
      )}
    </div>
  );
}
