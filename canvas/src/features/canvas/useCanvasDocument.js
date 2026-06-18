import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import {
  saveProjectById,
  getCommittedPayload,
} from '../../lib/persistence.js';
import { recordGoodLocalCardCount } from '../../lib/projects.js';
import {
  beginCanvasInteraction,
  endCanvasInteraction,
} from '../../lib/canvasInteraction.js';
import { registerOptimisticCard } from '../../lib/optimisticCards.js';
import { ensureWritePermission, writeBookmarkFile } from '../../lib/folderWrite.js';
import { createUserNoteArtifact } from '../../lib/ingest/createUserNote.js';
import { createBookmarkArtifact } from '../../lib/ingest/createBookmarkArtifact.js';
import { saveUserNote } from '../../lib/ingest/saveUserNote.js';
import { saveUserNoteToProject, saveBookmarkToProject } from '../../lib/projectCardEdits.js';
import { fetchBookmarkPreview } from '../../lib/bookmarkPreviewApi.js';
import {
  bookmarkLinkIdFromCardId,
  domainFromUrl,
  syntheticBookmarkFilename,
} from '../../lib/bookmarkUrl.js';
import { hydrateVersion } from '../../lib/previewHydrate.js';
import { strings } from '../../content/strings.js';
import {
  canvasFitInsets,
  canvasViewForCards,
} from '../../lib/canvasView.js';
import {
  buildStagedSyncCardFromChange,
  mergeNewlyStaged,
  mergeVersionsForSyncUpdate,
} from '../../lib/syncStaging.js';
import { enforceExclusivePlacement } from '../../lib/artifactPlacement.js';
import {
  transferStagedToCanvas,
  transferCardToDock,
} from '../../lib/placementTransfer.js';
import { createSyncTraceId, syncTraceLog } from '../../lib/sync/syncTrace.js';
import { isPlacementCommitBlocked } from '../../lib/placementCommitGate.js';
import {
  getFallbackTrayDropRect,
  isPointerInTrayDropZone,
  isPointerNearTrayBottom,
} from '../../lib/syncHoldingTrayHitTest.js';
import { buildPayloadAfterDockRestore } from '../../lib/restoreDockToCanvas.js';
import { syncKeysMatch, noteRequiresProjectOnlySave } from '../../lib/filename.js';
import { addSuppressedSyncKey } from '../../lib/syncSuppressedKeys.js';
import { removeStagedCardsByKey } from '../../lib/canvasCardMerge.js';
import { requestActionSync } from '../../lib/actionSync.js';
import {
  loadAgentChatSession,
  saveAgentChatSession,
} from '../../lib/agentChatPersistence.js';
import {
  saveThreadIndexLocal,
  clearCardIdFromThreadIndex,
  linkCardToThreadInIndex,
  resolveThreadForCard,
} from '../../lib/agentChatThreads.js';

function bookmarkVersionHasLinkId(filename, cardId) {
  const safeId = bookmarkLinkIdFromCardId(cardId);
  return Boolean(safeId && String(filename ?? '').toLowerCase().includes(`-${safeId}-v`));
}

function bookmarkFilenameForInlineSave(card, version, url) {
  if (version?.filename && bookmarkVersionHasLinkId(version.filename, card.id)) {
    return version.filename;
  }
  return syntheticBookmarkFilename(domainFromUrl(url), version?.version ?? 1, card.id);
}

export function commitCanvasViewToStateRef(stateRef, view) {
  const nextState = {
    ...stateRef.current,
    canvasView: view,
  };
  stateRef.current = nextState;
  return nextState;
}

export function applyLayoutCommitPayloadToStateRef(stateRef, payload = {}) {
  const { cardUpdates = null, canvasView = null } = payload;
  let nextState = stateRef.current;

  if (Array.isArray(cardUpdates) && cardUpdates.length > 0) {
    const updatesById = new Map(cardUpdates.map((update) => [update.id, update]));
    nextState = {
      ...nextState,
      cards: (nextState.cards ?? []).map((card) => {
        const update = updatesById.get(card.id);
        if (!update) return card;
        const { id: _id, ...geometry } = update;
        return { ...card, ...geometry };
      }),
    };
  }

  if (canvasView) {
    nextState = {
      ...nextState,
      canvasView,
    };
  }

  stateRef.current = nextState;
  return nextState;
}

export function updateCardVersionInStateRef(stateRef, cardId, versionNum, updatedVersion) {
  const nextCards = (stateRef.current.cards ?? []).map((card) => {
    if (card.id !== cardId) return card;
    return {
      ...card,
      versions: (card.versions ?? []).map((version) =>
        version.version === versionNum ? { ...version, ...updatedVersion } : version,
      ),
    };
  });
  const nextState = {
    ...stateRef.current,
    cards: nextCards,
  };
  stateRef.current = nextState;
  return nextState;
}

/**
 * Card CRUD, canvas view, dock/staging, and sync-confirm workflow extracted from App.jsx.
 *
 * @param {object} params
 * @param {object} params.refs
 * @param {import('react').MutableRefObject<string|null>} params.refs.activeProjectIdRef
 * @param {import('react').MutableRefObject<object>} params.refs.stateRef
 * @param {import('react').MutableRefObject<object[]>} params.refs.stagedSyncCardsRef
 * @param {import('react').MutableRefObject<boolean>} params.refs.switchingProjectRef
 * @param {import('react').MutableRefObject<boolean>} params.refs.initialHydratedRef
 * @param {import('react').MutableRefObject<object>} params.refs.agentChatThreadIndexRef
 * @param {import('react').MutableRefObject<string|null>} params.refs.activeThreadIdRef
 * @param {import('react').MutableRefObject<object>} params.refs.agentChatArtifactMetaRef
 * @param {import('react').MutableRefObject<boolean>} params.refs.userAdjustedViewRef
 * @param {import('react').MutableRefObject<boolean>} params.refs.pendingFitToExtentRef
 * @param {import('react').MutableRefObject<object[]|null>} params.refs.pendingFitCardsRef
 * @param {import('react').MutableRefObject<{width:number,height:number}>} params.refs.canvasViewportSizeRef
 * @param {import('react').MutableRefObject<string|null>} [params.refs.clusterContextProjectIdRef]
 * @param {object} params.deps
 */
export function useCanvasDocument({ refs, deps }) {
  const {
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
  } = refs;
  const {
    state,
    setState,
    loaded: _loaded,
    folderHandle,
    folderKeySet,
    clusterId,
    searchQuery,
    setSyncStatus,
    setAgentChatThreadIndex,
    commitPlacementState,
    requestStructuralSync,
    requestPlacementTransferSync,
    invalidateFolderScan,
    refreshGraph,
    removeCardFromSelection,
    fitCanvasViewToCards: _fitCanvasViewToCardsDep,
    setFolderPresentKeys,
    setClusterId,
    setNewNoteOpen,
    setAddLinkOpen,
  } = deps;
  const isMobile = useIsMobile();

  const [activeCardId, setActiveCardId] = useState(null);
  const [openCardId, setOpenCardId] = useState(null);
  const [confirmChanges, setConfirmChanges] = useState(null);
  const [stagedSyncCards, setStagedSyncCards] = useState([]);
  const [stagingDragActive, setStagingDragActive] = useState(false);
  const stagingDragActiveRef = useRef(false);
  const [canvasElement, setCanvasElement] = useState(null);
  const [trayRevealActive, setTrayRevealActive] = useState(false);
  const [cardDockHover, setCardDockHover] = useState(false);
  const trayDropRectRef = useRef(null);
  const [versionStackOpen, setVersionStackOpen] = useState(null);
  const [canvasViewportSize, setCanvasViewportSize] = useState({ width: 0, height: 0 });
  const [savingNote, setSavingNote] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [savingCardId, setSavingCardId] = useState(null);

  useEffect(() => {
    stagedSyncCardsRef.current = stagedSyncCards;
  }, [stagedSyncCards, stagedSyncCardsRef]);

  useEffect(() => {
    stagingDragActiveRef.current = stagingDragActive;
  }, [stagingDragActive]);

  const handleStagingDragActiveChange = useCallback((active) => {
    setStagingDragActive(active);
    if (active) beginCanvasInteraction('dock');
    else endCanvasInteraction('dock');
  }, []);

  const setCanvasView = useCallback((updater) => {
    userAdjustedViewRef.current = true;
    setState((prev) => ({
      ...prev,
      canvasView: typeof updater === 'function' ? updater(prev.canvasView) : updater,
    }));
  }, [setState, userAdjustedViewRef]);

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
    canvasViewportSizeRef,
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
  }, [
    setCanvasView,
    resolveCanvasFitOptions,
    isMobile,
    stagedSyncCards.length,
    trayRevealActive,
    stagingDragActive,
    canvasViewportSizeRef,
    pendingFitToExtentRef,
    pendingFitCardsRef,
  ]);

  const fitCanvasViewToCardsRef = useRef(fitCanvasViewToCards);
  useEffect(() => {
    fitCanvasViewToCardsRef.current = fitCanvasViewToCards;
  }, [fitCanvasViewToCards]);

  const handleInteractionCommit = useCallback(({ kind, cardUpdates, canvasView } = {}) => {
    if (kind === 'layoutCommit' || kind === 'viewCommit') {
      userAdjustedViewRef.current = true;
      const projectId = activeProjectIdRef.current;
      if (projectId) {
        applyLayoutCommitPayloadToStateRef(stateRef, { cardUpdates, canvasView });
        if (canvasView) {
          setState((prev) => ({ ...prev, canvasView }));
        }
        void requestActionSync(kind === 'viewCommit' ? 'viewCommit' : 'layoutCommit', {
          projectId,
        });
      }
    }
  }, [activeProjectIdRef, stateRef, userAdjustedViewRef, setState]);

  const handleCommitCanvasView = useCallback((view) => {
    userAdjustedViewRef.current = true;
    commitCanvasViewToStateRef(stateRef, view);
    setCanvasView(view);
  }, [setCanvasView, stateRef, userAdjustedViewRef]);

  useEffect(() => {
    canvasViewportSizeRef.current = canvasViewportSize;
    if (!pendingFitToExtentRef.current) return;
    if (canvasViewportSize.width <= 0 || canvasViewportSize.height <= 0) return;
    const cards = pendingFitCardsRef.current ?? stateRef.current.cards;
    fitCanvasViewToCards(cards);
  }, [
    canvasViewportSize,
    fitCanvasViewToCards,
    canvasViewportSizeRef,
    pendingFitToExtentRef,
    pendingFitCardsRef,
    stateRef,
  ]);

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

  const resetCanvasUi = useCallback(() => {
    setActiveCardId(null);
    setOpenCardId(null);
    setVersionStackOpen(null);
    setConfirmChanges(null);
    setStagedSyncCards([]);
    stagedSyncCardsRef.current = [];
    setStagingDragActive(false);
    setTrayRevealActive(false);
    setCardDockHover(false);
    trayDropRectRef.current = null;
  }, [stagedSyncCardsRef]);

  const handleRestoreDockToCanvas = useCallback(() => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    const { payload, restored } = buildPayloadAfterDockRestore(
      stateRef.current,
      stagedSyncCardsRef.current ?? [],
    );
    if (!restored) return;

    stateRef.current = { ...stateRef.current, cards: payload.cards };
    setState((prev) => ({ ...prev, cards: payload.cards }));
    setStagedSyncCards(payload.stagedSyncCards);
    stagedSyncCardsRef.current = payload.stagedSyncCards;
    recordGoodLocalCardCount(projectId, payload.cards.length);
    userAdjustedViewRef.current = false;
    fitCanvasViewToCards(payload.cards);

    void saveProjectById(
      projectId,
      { ...stateRef.current, cards: payload.cards },
      payload.stagedSyncCards,
      { pushRemote: true },
    );
    void requestPlacementTransferSync();

    setSyncStatus((prev) => {
      const { dockRestore: _removed, ...rest } = prev ?? {};
      return {
        ...rest,
        toast: strings.projects.dockRestoredToast(restored),
      };
    });
    setTimeout(() => {
      setSyncStatus((prev) =>
        prev?.toast === strings.projects.dockRestoredToast(restored) ? null : prev,
      );
    }, 4000);
  }, [
    activeProjectIdRef,
    stateRef,
    stagedSyncCardsRef,
    setState,
    userAdjustedViewRef,
    fitCanvasViewToCards,
    requestPlacementTransferSync,
    setSyncStatus,
  ]);

  const applySyncChangesFromList = useCallback(
    ({ changes, applyMode = 'merge' } = {}) => {
      if (!changes?.length) return { applied: false, stagedCount: 0 };
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
        stateRef.current = { ...stateRef.current, cards: cardsCopy };
        return { ...prev, cards: cardsCopy };
      });

      let stagedCount = stagedSyncCardsRef.current?.length ?? 0;
      if (newlyStaged.length > 0 || stagedVersionUpdates.size > 0) {
        let next = stagedSyncCardsRef.current ?? [];
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
        stagedCount = exclusive.stagedSyncCards.length;
        if (exclusive.changed) {
          stateRef.current = { ...stateRef.current, cards: exclusive.cards };
          setState((s) => ({ ...s, cards: exclusive.cards }));
        }
        setStagedSyncCards(exclusive.stagedSyncCards);
      }
      invalidateFolderScan();
      requestStructuralSync({ awaitLocal: true });
      void refreshGraph();
      return { applied: true, stagedCount, newlyStagedCount: newlyStaged.length };
    },
    [
      refreshGraph,
      requestStructuralSync,
      invalidateFolderScan,
      setState,
      stateRef,
      stagedSyncCardsRef,
      agentChatThreadIndexRef,
    ],
  );

  const applySyncChanges = useCallback(() => {
    if (!confirmChanges) return;
    applySyncChangesFromList(confirmChanges);
    setConfirmChanges(null);
  }, [confirmChanges, applySyncChangesFromList]);

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

      const projectId = activeProjectIdRef.current;
      const result = transferCardToDock(
        stateRef.current.cards,
        stagedSyncCardsRef.current,
        cardId,
        getCommittedPayload(projectId)?.artifactPlacements ?? null,
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
      void (async () => {
        const traceId = createSyncTraceId();
        syncTraceLog(traceId, 'ui:placement-dock', { projectId, cardId });
        if (projectId) {
          await commitPlacementState(projectId, {
            artifactPlacements: result.artifactPlacements,
            reason: 'placementTransfer:dock',
            traceId,
          });
        }
        await requestPlacementTransferSync({ traceId });
        void refreshGraph();
      })();
      return true;
    },
    [
      activeProjectIdRef,
      stateRef,
      stagedSyncCardsRef,
      commitPlacementState,
      getTrayDropRect,
      refreshGraph,
      removeCardFromSelection,
      requestPlacementTransferSync,
      invalidateFolderScan,
      setState,
    ],
  );

  const placeStagedSyncCard = useCallback(
    async (stagingId, worldX, worldY) => {
      const staged = stagedSyncCardsRef.current.find(
        (s) => s.stagingId === stagingId,
      );
      if (!staged) return;

      const projectId = activeProjectIdRef.current;
      if (!projectId) return;
      const result = transferStagedToCanvas(
        stateRef.current.cards,
        stagedSyncCardsRef.current,
        stagingId,
        worldX,
        worldY,
        getCommittedPayload(projectId)?.artifactPlacements ?? null,
      );
      if (!result.placed) return;

      const traceId = createSyncTraceId();
      if (isPlacementCommitBlocked(canMutateCanvasRef)) {
        syncTraceLog(traceId, 'placement:ui-before-ready', {
          projectId,
          stagingId,
        });
      }
      syncTraceLog(traceId, 'ui:placement-canvas', {
        projectId,
        stagingId,
        key: result.artifactPlacements
          ? Object.keys(result.artifactPlacements)[0]
          : null,
      });

      const prevIds = new Set((stateRef.current.cards ?? []).map((c) => c.id));
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
        && singleConnectorIdRef.current
        && projectId
      ) {
        const placed = result.cards.find((c) => !prevIds.has(c.id));
        if (placed) {
          const thread = resolveThreadForCard(
            agentChatThreadIndexRef.current,
            placed,
            singleConnectorIdRef.current,
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
            saveThreadIndexLocal(projectId, singleConnectorIdRef.current, index);
            if (threadId === activeThreadIdRef.current) {
              agentChatArtifactMetaRef.current.cardId = placed.id;
            }
          }
        }
      }
      if (projectId) {
        const commitResult = await commitPlacementState(projectId, {
          artifactPlacements: result.artifactPlacements,
          reason: 'placementTransfer:canvas',
          traceId,
        });
        if (!commitResult?.deferred) {
          await requestPlacementTransferSync({ traceId });
        }
      }
      void refreshGraph();
    },
    [
      activeProjectIdRef,
      stateRef,
      stagedSyncCardsRef,
      commitPlacementState,
      refreshGraph,
      requestPlacementTransferSync,
      canMutateCanvasRef,
      singleConnectorIdRef,
      invalidateFolderScan,
      setState,
      setAgentChatThreadIndex,
      agentChatThreadIndexRef,
      activeThreadIdRef,
      agentChatArtifactMetaRef,
    ],
  );

  const commitCardsToStateRef = useCallback((nextCards) => {
    stateRef.current = { ...stateRef.current, cards: nextCards };
  }, [stateRef]);

  const updateCard = useCallback((id, updates) => {
    const prevCards = stateRef.current.cards ?? [];
    const nextCards = prevCards.map((c) =>
      c.id === id ? { ...c, ...updates } : c,
    );
    commitCardsToStateRef(nextCards);
    setState((prev) => ({ ...prev, cards: nextCards }));
  }, [commitCardsToStateRef, setState, stateRef]);

  const batchUpdateCardPositions = useCallback((updates) => {
    const byId = new Map(updates.map((u) => [u.id, u]));
    const prevCards = stateRef.current.cards ?? [];
    const nextCards = prevCards.map((c) => {
      const u = byId.get(c.id);
      return u ? { ...c, x: u.x, y: u.y } : c;
    });
    commitCardsToStateRef(nextCards);
    setState((prev) => ({ ...prev, cards: nextCards }));
  }, [commitCardsToStateRef, setState, stateRef]);

  const handleCommitCardPosition = useCallback((id, x, y) => {
    updateCard(id, { x, y });
  }, [updateCard]);

  const pinVersion = useCallback((cardId, version) => {
    updateCard(cardId, { pinnedVersion: version });
    const projectId = activeProjectIdRef.current;
    if (projectId) {
      void requestActionSync('structuralChange', { projectId });
    }
  }, [activeProjectIdRef, updateCard]);

  const handleUpdateVersion = useCallback((cardId, versionNum, updatedVersion) => {
    const nextState = updateCardVersionInStateRef(
      stateRef,
      cardId,
      versionNum,
      updatedVersion,
    );
    setState(nextState);
  }, [setState, stateRef]);

  const handleNoteSaveStatus = useCallback(({ toast, error }) => {
    if (toast) {
      setSyncStatus({ toast });
      setTimeout(() => setSyncStatus(null), 4000);
    }
    if (error) {
      setSyncStatus({ error });
      setTimeout(() => setSyncStatus(null), 4000);
    }
  }, [setSyncStatus]);

  const persistCardEdits = useCallback((cardId, cardUpdates) => {
    const oldCard = stateRef.current.cards.find((c) => c.id === cardId);
    if (!oldCard) return;
    updateCard(cardId, cardUpdates);
    const projectId = activeProjectIdRef.current;
    if (projectId) {
      void requestActionSync('structuralChange', { projectId });
    }
    if (cardUpdates.key && cardUpdates.key !== oldCard.key && folderKeySet && setFolderPresentKeys) {
      setFolderPresentKeys((keys) => {
        const next = new Set(keys || []);
        next.delete(oldCard.key);
        if (cardUpdates.key) next.add(cardUpdates.key);
        return [...next];
      });
    }
  }, [updateCard, folderKeySet, activeProjectIdRef, setFolderPresentKeys, stateRef]);

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
        void requestActionSync('structuralChange', { projectId });
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
    activeProjectIdRef,
    stateRef,
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
        linkId: card.id,
      });
      if (result.reason === 'invalid_url') {
        handleNoteSaveStatus({ error: strings.bookmark.invalidUrl });
        return;
      }
      if (!result.ok || !result.cardUpdates) {
        handleNoteSaveStatus({ error: strings.userNote.saveFailed });
        return;
      }
      let cardUpdates = result.cardUpdates;
      const currentVersion = card.versions?.[0];
      if (folderHandle && currentVersion?.filename) {
        const canWrite = await ensureWritePermission(folderHandle);
        if (!canWrite) {
          handleNoteSaveStatus({ error: strings.userNote.writeDenied });
          return;
        }
        const targetFilename = bookmarkFilenameForInlineSave(
          card,
          currentVersion,
          cardUpdates.versions?.[0]?.externalUrl ?? url,
        );
        const writtenFilename = await writeBookmarkFile(folderHandle, {
          filename: targetFilename,
          url: cardUpdates.versions?.[0]?.externalUrl ?? url,
          title: cardUpdates.name,
        });
        cardUpdates = {
          ...cardUpdates,
          versions: (cardUpdates.versions ?? []).map((version) => ({
            ...version,
            filename: version.filename === currentVersion.filename
              ? writtenFilename
              : version.filename,
          })),
        };
      }
      persistCardEdits(card.id, cardUpdates);
      await refreshGraph();
    } catch (e) {
      handleNoteSaveStatus({ error: e.message });
    } finally {
      setSavingCardId(null);
    }
  }, [
    activeProjectIdRef,
    folderHandle,
    persistCardEdits,
    handleNoteSaveStatus,
    refreshGraph,
  ]);

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
      } else if (!result.ingest.ok) {
        setSyncStatus({ toast: strings.sync.primitivesNotUpdated });
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
      await saveProjectById(projectId, stateRef.current, stagedSyncCardsRef.current, {
        pushRemote: false,
      });
      await requestStructuralSync({ awaitLocal: true });
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
  }, [
    activeProjectIdRef,
    stateRef,
    stagedSyncCardsRef,
    folderHandle,
    clusterId,
    refreshGraph,
    requestStructuralSync,
    setSyncStatus,
    setFolderPresentKeys,
    setClusterId,
    clusterContextProjectIdRef,
    setNewNoteOpen,
    setState,
  ]);

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
      if (folderHandle) {
        const canWrite = await ensureWritePermission(folderHandle);
        if (!canWrite) {
          setSyncStatus({ error: strings.userNote.writeDenied });
          setTimeout(() => setSyncStatus(null), 4000);
          return;
        }
      }
      const result = await createBookmarkArtifact({
        projectId,
        projectName: stateRef.current.projectName,
        url,
        preview,
        titleOverride,
        linkTargetRefs,
        clusterId,
        cards: stateRef.current.cards,
        folderHandle,
      });
      if (result.ingest.ok && result.ingest.clusterId) {
        clusterContextProjectIdRef.current = projectId;
        setClusterId(result.ingest.clusterId);
        void refreshGraph({
          clusterId: result.ingest.clusterId,
          projectId,
          force: true,
        });
      } else if (!result.ingest.ok) {
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
      if (projectId) {
        await saveProjectById(projectId, stateRef.current, stagedSyncCardsRef.current, {
          pushRemote: false,
        });
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
  }, [
    activeProjectIdRef,
    stateRef,
    folderHandle,
    clusterId,
    refreshGraph,
    requestStructuralSync,
    setSyncStatus,
    setClusterId,
    clusterContextProjectIdRef,
    setAddLinkOpen,
    setState,
  ]);

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

    if (card?.type === 'agent_chat' && projectId && singleConnectorIdRef.current) {
      const nextIndex = clearCardIdFromThreadIndex(
        agentChatThreadIndexRef.current,
        id,
      );
      if (nextIndex !== agentChatThreadIndexRef.current) {
        agentChatThreadIndexRef.current = nextIndex;
        setAgentChatThreadIndex(nextIndex);
        saveThreadIndexLocal(projectId, singleConnectorIdRef.current, nextIndex);
      }
      if (agentChatArtifactMetaRef.current.cardId === id) {
        agentChatArtifactMetaRef.current = {
          ...agentChatArtifactMetaRef.current,
          cardId: null,
        };
      }
      const threadId = activeThreadIdRef.current;
      if (threadId) {
        const session = await loadAgentChatSession(
          projectId,
          singleConnectorIdRef.current,
          threadId,
        );
        if (session?.cardId === id) {
          await saveAgentChatSession(
            projectId,
            singleConnectorIdRef.current,
            threadId,
            {
            ...session,
            cardId: null,
          });
        }
      }
    }

    if (projectId && !switchingProjectRef.current && initialHydratedRef.current) {
      requestStructuralSync();
    }
  }, [
    activeProjectIdRef,
    stateRef,
    stagedSyncCardsRef,
    switchingProjectRef,
    initialHydratedRef,
    singleConnectorIdRef,
    requestStructuralSync,
    setState,
    setAgentChatThreadIndex,
    agentChatThreadIndexRef,
    activeThreadIdRef,
    agentChatArtifactMetaRef,
  ]);

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
  }, [state.cards, setState]);

  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return state.cards;
    const q = searchQuery.toLowerCase();
    return state.cards.filter((c) =>
      c.name.toLowerCase().includes(q)
      || c.prefix.toLowerCase().includes(q),
    );
  }, [state.cards, searchQuery]);

  return {
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
    resolveCanvasFitOptions,
    fitCanvasViewToCards,
    fitCanvasViewToCardsRef,
    handleInteractionCommit,
    handleCommitCanvasView,
    handleStagingDragActiveChange,
    resetCanvasUi,
    handleRestoreDockToCanvas,
    applySyncChanges,
    applySyncChangesFromList,
    getTrayDropRect,
    handleCardDragMove,
    handleCardDragEnd,
    dockCardToTray,
    placeStagedSyncCard,
    commitCardsToStateRef,
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
  };
}
