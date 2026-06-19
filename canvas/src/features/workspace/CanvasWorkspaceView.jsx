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
import { ProjectDeleteConfirm } from '../../components/ProjectDeleteConfirm.jsx';
import { DeleteLinkConfirm } from '../../components/DeleteLinkConfirm.jsx';
import { ProjectArchiveLastConfirm } from '../../components/ProjectArchiveLastConfirm.jsx';
import { ProjectCreateNamePrompt } from '../../components/ProjectCreateNamePrompt.jsx';
import { EmptyWorkspacePrompt } from '../../components/EmptyWorkspacePrompt.jsx';
import { RightDock } from '../../components/RightDock.jsx';
import { CreateClusterDialog } from '../../components/CreateClusterDialog.jsx';
import { CreateFlowDialog } from '../flow/components/CreateFlowDialog.jsx';
import { patchFlowCard } from '../flow/domain/flowDocument.js';

const ARTIFACT_AUDIT_RETRY_MS = 500;
const ARTIFACT_AUDIT_MAX_RETRIES = 10;
const RIGHT_DOCK_RESERVED_WIDTH_PX = 448;
const ARTIFACT_ZOOM_PADDING_PX = 220;

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
    savingLink,
    savingFlow,
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
    handleInlineSaveMarkdown,
    handleInlineSaveBookmark,
    handleSaveNoteToProject,
    handleSaveNewNote,
    handleSaveNewLink,
    handleSaveNewFlow,
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
  } = dialogs;
  const isMobile = useIsMobile();
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [deleteLinkTarget, setDeleteLinkTarget] = useState(null);

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
          onNewNote={() => setNewNoteOpen(true)}
          onAddLink={() => setAddLinkOpen(true)}
          onAddFlow={() => setCreateFlowOpen(true)}
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
            onRetryConnectors: refreshAgentConnectors,
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

      {createFlowOpen && (
        <CreateFlowDialog
          saving={savingFlow}
          onClose={() => setCreateFlowOpen(false)}
          onSave={async (values) => {
            const view = state.canvasView ?? { x: 0, y: 0, zoom: 1 };
            const position = {
              x: (canvasViewportSize.width / 2 - view.x) / view.zoom - 180,
              y: (canvasViewportSize.height / 2 - view.y) / view.zoom - 120,
            };
            const card = await handleSaveNewFlow({ ...values, position });
            if (card) setCreateFlowOpen(false);
          }}
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
          folderConnected={folderConnected}
          folderKeySet={folderKeySet}
          projectId={effectiveProjectId}
          projectName={state.projectName}
          onClose={() => setOpenCardId(null)}
          onPinVersion={pinVersion}
          onDeleteCard={requestDeleteCard}
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
          flowArtifactCandidates={state.cards}
          onFlowCardRefresh={(flow, nodes, edges) => {
            const updates = patchFlowCard(openCard, flow, nodes, edges);
            void handleFlowCardRefresh(openCard.id, updates);
          }}
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
            onRetryConnectors: refreshAgentConnectors,
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
