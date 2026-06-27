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
import { ensureWritePermission, writeBookmarkFile, fileExistsAtFolderPath, removeFileAtFolderPath, bookmarkMarkdownFilenameFromShortcut } from '../../lib/folderWrite.js';
import { createUserNoteArtifact } from '../../lib/ingest/createUserNote.js';
import { createUserTaskArtifact } from '../../lib/ingest/createUserTask.js';
import { createBookmarkArtifact } from '../../lib/ingest/createBookmarkArtifact.js';
import { saveUserNote } from '../../lib/ingest/saveUserNote.js';
import { saveUserTask } from '../../lib/ingest/saveUserTask.js';
import { saveMarkdownArtifact } from '../../lib/ingest/saveMarkdownArtifact.js';
import { saveUserNoteToProject, saveUserTaskToProject, saveBookmarkToProject, saveTextContentToProject } from '../../lib/projectCardEdits.js';
import { fetchBookmarkPreview } from '../../lib/bookmarkPreviewApi.js';
import { enrichBookmarkCardsInProject } from '../../lib/bookmarkPreviewEnrich.js';
import {
  bookmarkLinkIdFromCardId,
  domainFromUrl,
  normalizeBookmarkUrl,
  syntheticBookmarkFilename,
} from '../../lib/bookmarkUrl.js';
import { hydrateVersion } from '../../lib/previewHydrate.js';
import { strings } from '../../content/strings.js';
import {
  canvasFitInsets,
  canvasViewForCards,
} from '../../lib/canvasView.js';
import {
  artifactRefFromSyncEntry,
  bookmarkUrlForSyncEntry,
  buildStagedSyncCardFromChange,
  canonicalKeyForSyncEntry,
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
import {
  buildPlacementsFromArrays,
  patchPlacementsMapFromArrays,
} from '../../lib/artifactPlacementsMap.js';
import { syncKeysMatch, noteRequiresProjectOnlySave, cardKeyFromFilename, toCanonicalSyncKey } from '../../lib/filename.js';
import { addSuppressedSyncKey, addSuppressedBookmarkUrl } from '../../lib/syncSuppressedKeys.js';
import { getCachedFolderHandle } from '../../lib/folderSessionCache.js';
import { loadFolderHandle } from '../../lib/folderStore.js';
import { removeStagedCardsByKey } from '../../lib/canvasCardMerge.js';
import { requestActionSync } from '../../lib/actionSync.js';
import { deleteProjectArtifactPrimitive } from '../../lib/primitivesApi.js';
import { commitProjectDocument } from '../../lib/projectDocumentCommit.js';
import { createFlowArtifact } from '../flow/api/flowApi.js';
import { flowCardFromDocument } from '../flow/domain/flowDocument.js';
import { createLiveArtifact } from '../live/api/liveApi.js';
import { liveArtifactCardFromRecord } from '../live/domain/liveArtifact.js';
import { createAgent } from '../agents/api/agentsApi.js';
import { agentCardFromRecord } from '../agents/domain/agentArtifact.js';
import { createMusicAgent } from '../music/api/musicApi.js';
import { createDefaultBeatAgentState } from '../music/agents/beat/domain/beatAgentState.js';
import { beatAgentCardFromRecord } from '../music/agents/beat/domain/beatAgentCard.js';
import {
  createSonicStudioRecord,
  sonicStudioCardFromRecord,
} from '../sonicStudio/domain/sonicStudioCard.js';
import {
  loadAgentChatSession,
  saveAgentChatSession,
} from '../../lib/agentChatPersistence.js';
import {
  saveThreadIndexLocal,
  clearCardIdFromThreadIndex,
  collectKnownAgentChatKeys,
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

export function bookmarkFolderFilenamesToRemove(filename) {
  const name = String(filename ?? '').trim();
  if (!name) return [];
  const candidates = new Set([name]);
  if (/\.url$/i.test(name)) {
    candidates.add(bookmarkMarkdownFilenameFromShortcut(name));
  } else if (/\.bookmark\.md$/i.test(name)) {
    candidates.add(name.replace(/\.bookmark\.md$/i, '.url'));
  }
  return [...candidates];
}

export function bookmarkFolderPathsToRemove(card) {
  const versions = card?.versions ?? [];
  const pinned =
    versions.find((v) => v.version === card.pinnedVersion) ?? versions[0];
  const filename = pinned?.filename;
  const relativePath = String(pinned?.relativePath ?? pinned?.path ?? '')
    .replace(/\\/g, '/');
  const paths = new Set();
  const basenames = bookmarkFolderFilenamesToRemove(filename);
  for (const base of basenames) {
    paths.add(base);
    if (relativePath.includes('/')) {
      const dir = relativePath.slice(0, relativePath.lastIndexOf('/') + 1);
      paths.add(`${dir}${base}`);
    }
  }
  if (!basenames.length && relativePath) {
    paths.add(relativePath);
  }
  return [...paths].filter(Boolean);
}

export async function resolveBookmarkFolderHandle(projectId, folderHandle) {
  if (folderHandle) return folderHandle;
  if (!projectId) return null;
  const cached = getCachedFolderHandle(projectId);
  if (cached) return cached;
  return loadFolderHandle(projectId);
}

export async function cleanupBookmarkFolderFile({
  folderHandle,
  card,
  ensureWrite = ensureWritePermission,
  existsAtPath = fileExistsAtFolderPath,
  removeAtPath = removeFileAtFolderPath,
} = {}) {
  if (!folderHandle || card?.type !== 'bookmark') {
    return { attempted: false, removed: [], candidatesFound: false };
  }
  const paths = bookmarkFolderPathsToRemove(card);
  if (!paths.length) {
    return { attempted: false, removed: [], candidatesFound: false };
  }
  const writable = await ensureWrite(folderHandle);
  if (!writable) {
    return {
      attempted: true,
      removed: [],
      skipped: 'write_denied',
      candidatesFound: false,
    };
  }
  const removed = [];
  let candidatesFound = false;
  for (const path of paths) {
    try {
      if (await existsAtPath(folderHandle, path)) {
        candidatesFound = true;
        await removeAtPath(folderHandle, path);
        removed.push(path);
      }
    } catch (e) {
      if (e?.name !== 'NotFoundError') {
        console.warn('Bookmark folder file cleanup failed:', path, e);
      }
    }
  }
  return { attempted: true, removed, candidatesFound };
}

export async function cleanupProjectArtifactForSyncEntry({
  projectId,
  entry,
  deleteProjectArtifact = deleteProjectArtifactPrimitive,
  refreshGraph = null,
  traceLabel = 'canvas:card-delete-primitive-cleanup-skipped',
} = {}) {
  const artifactRef = artifactRefFromSyncEntry(entry);
  if (!projectId || !artifactRef?.id) return { attempted: false };
  try {
    const result = await deleteProjectArtifact(projectId, artifactRef.id);
    refreshGraph?.({ projectId, force: true });
    return { attempted: true, ok: true, result };
  } catch (e) {
    syncTraceLog(traceLabel, {
      projectId,
      artifactId: artifactRef.id,
      reason: e?.message ?? String(e),
    });
    console.warn('Canvas card primitive cleanup failed:', e);
    return { attempted: true, ok: false, error: e };
  }
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
 * @param {object} card
 * @param {number} existingCardCount
 */
export function buildNewBookmarkCanvasCard(card, existingCardCount, position = null) {
  const fallback = {
    x: 100 + (existingCardCount % 4) * 320,
    y: 100 + Math.floor(existingCardCount / 4) * 240,
  };
  return {
    ...card,
    x: Number.isFinite(position?.x) ? position.x : fallback.x,
    y: Number.isFinite(position?.y) ? position.y : fallback.y,
  };
}

/**
 * Persist a new bookmark card to canvas state, local cache, and structural sync.
 * @internal Exported for tests.
 */
export async function finalizeNewBookmarkCanvasSave({
  projectId,
  result,
  stateRef,
  stagedSyncCardsRef,
  setState,
  registerOptimisticCard: registerOptimistic,
  commitProjectDocument: commitDocument,
  setFolderPresentKeys,
  folderHandle = null,
  refreshGraph: refreshGraphFn = async () => {},
  position = null,
}) {
  const newCard = buildNewBookmarkCanvasCard(
    result.card,
    stateRef.current.cards?.length ?? 0,
    position,
  );
  const nextState = {
    ...stateRef.current,
    cards: [...(stateRef.current.cards ?? []), newCard],
  };
  stateRef.current = nextState;
  setState(nextState);
  if (projectId && newCard.id) {
    registerOptimistic(projectId, newCard.id);
  }
  const commitResult = await commitDocument(projectId, {
    state: stateRef.current,
    stagedSyncCards: stagedSyncCardsRef.current,
    reason: 'bookmark:create',
    pushRemote: false,
  });
  if (!commitResult?.ok) {
    throw commitResult?.error ?? new Error('Could not save link to project');
  }
  if (folderHandle && result.card?.key) {
    setFolderPresentKeys((keys) => {
      const next = new Set(keys || []);
      next.add(result.card.key);
      const filename = result.card.versions?.[0]?.filename;
      if (filename) {
        next.add(cardKeyFromFilename(filename));
        next.add(toCanonicalSyncKey(filename));
      }
      return [...next];
    });
  }
  void refreshGraphFn();
  return newCard;
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
    setNewTaskOpen,
    setAddLinkOpen,
  } = deps;
  const isMobile = useIsMobile();

  const [activeCardId, setActiveCardId] = useState(null);
  const [openCardId, setOpenCardId] = useState(null);
  const openCardIdRef = useRef(null);
  const flowFlushRef = useRef(null);
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
  const [savingTask, setSavingTask] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [savingFlow, setSavingFlow] = useState(false);
  const [savingLive, setSavingLive] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [savingSonicStudio, setSavingSonicStudio] = useState(false);
  const [savingCardId, setSavingCardId] = useState(null);

  useEffect(() => {
    stagedSyncCardsRef.current = stagedSyncCards;
  }, [stagedSyncCards, stagedSyncCardsRef]);

  useEffect(() => {
    openCardIdRef.current = openCardId;
  }, [openCardId]);

  const registerFlowFlush = useCallback((getter) => {
    flowFlushRef.current = getter;
  }, []);

  const closeOpenCard = useCallback(async ({ force = false } = {}) => {
    const openId = openCardIdRef.current;
    if (!openId) return true;
    const card = stateRef.current.cards.find((entry) => entry.id === openId);
    if (card?.type === 'flow') {
      const flushState = flowFlushRef.current?.();
      if (flushState?.isDirty?.()) {
        const result = await flushState.flushSave?.();
        if (!result?.ok) {
          if (!force && !window.confirm(strings.flow.discardUnsavedClose)) {
            return false;
          }
        }
      }
    }
    setOpenCardId(null);
    setActiveCardId((active) => (active === openId ? null : active));
    setVersionStackOpen((version) => (version === openId ? null : version));
    return true;
  }, [stateRef]);

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
    const trayVisible = !isMobile;
    return {
      ...canvasFitInsets(viewport.height, {
        trayVisible,
        trayDropRect: trayDropRectRef.current,
      }),
      clearDesktopChrome: !isMobile,
    };
  }, [
    isMobile,
    canvasViewportSizeRef,
  ]);

  const fitCanvasViewToCards = useCallback((cards, fitOverrides = {}) => {
    const viewport = canvasViewportSizeRef.current;
    if (viewport.width <= 0 || viewport.height <= 0) {
      pendingFitToExtentRef.current = true;
      pendingFitCardsRef.current = cards;
      return;
    }
    pendingFitToExtentRef.current = false;
    pendingFitCardsRef.current = null;
    const applyFit = () => {
      setCanvasView(canvasViewForCards(cards, viewport, {
        ...resolveCanvasFitOptions(),
        ...fitOverrides,
      }));
    };
    applyFit();
    if (!isMobile) {
      requestAnimationFrame(applyFit);
    }
  }, [
    setCanvasView,
    resolveCanvasFitOptions,
    isMobile,
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

  const resetCanvasUi = useCallback(async () => {
    const flushState = flowFlushRef.current?.();
    if (flushState?.isDirty?.()) {
      await flushState.flushSave?.();
    }
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
      void (async () => {
        const projectId = activeProjectIdRef.current;
        if (!projectId) return;
        const enriched = await enrichBookmarkCardsInProject(
          projectId,
          stateRef.current.cards ?? [],
          stagedSyncCardsRef.current ?? [],
        );
        if (!enriched.changed || projectId !== activeProjectIdRef.current) return;
        stateRef.current = { ...stateRef.current, cards: enriched.cards };
        stagedSyncCardsRef.current = enriched.stagedSyncCards;
        setState((prev) => ({ ...prev, cards: enriched.cards }));
        setStagedSyncCards(enriched.stagedSyncCards);
        await requestStructuralSync({ awaitLocal: true });
      })();
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
      activeProjectIdRef,
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
      if (staged.type === 'agent_chat') {
        const key = canonicalKeyForSyncEntry(staged);
        const knownAgentChatKeys = collectKnownAgentChatKeys(
          agentChatThreadIndexRef.current,
          {
            cards: stateRef.current.cards ?? [],
            stagedSyncCards: stagedSyncCardsRef.current ?? [],
          },
        );
        if (key && !knownAgentChatKeys.has(key)) {
          const traceId = createSyncTraceId();
          const nextStaged = stagedSyncCardsRef.current.filter(
            (row) => row.stagingId !== stagingId,
          );
          setStagedSyncCards(nextStaged);
          stagedSyncCardsRef.current = nextStaged;
          setSyncStatus({ toast: strings.projects.agentChatPlacementPruned });
          setTimeout(() => setSyncStatus(null), 5000);
          syncTraceLog(traceId, 'placement:unknown-agent-chat-pruned', {
            projectId,
            stagingId,
            key,
          });
          const patchedMap = patchPlacementsMapFromArrays(
            getCommittedPayload(projectId)?.artifactPlacements
            ?? buildPlacementsFromArrays(stateRef.current.cards ?? [], nextStaged),
            stateRef.current.cards ?? [],
            nextStaged,
          );
          await commitPlacementState(projectId, {
            artifactPlacements: patchedMap,
            reason: 'placementTransfer:unknownAgentChatPrune',
            traceId,
          });
          await requestPlacementTransferSync({ traceId });
          return;
        }
      }
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
      setSyncStatus,
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
    if (!projectId) return false;

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
          return false;
        }
        if (result.reason === 'name_invalid') {
          handleNoteSaveStatus({ error: strings.userNote.nameInvalid });
          return false;
        }
        if (!result.ok || !result.cardUpdates) {
          handleNoteSaveStatus({ error: strings.userNote.saveFailed });
          return false;
        }
        persistCardEdits(card.id, result.cardUpdates);
        handleNoteSaveStatus({
          toast: folderHandle && folderKeySet?.size
            ? strings.userNote.savedProjectOnlyMissingFromFolder
            : strings.userNote.savedProjectOnly,
        });
        return true;
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
        return false;
      }
      if (result.reason === 'write_denied') {
        handleNoteSaveStatus({ error: strings.userNote.writeDenied });
        return false;
      }
      if (result.reason === 'name_required') {
        handleNoteSaveStatus({ error: strings.userNote.nameRequired });
        return false;
      }
      if (result.reason === 'name_invalid') {
        handleNoteSaveStatus({ error: strings.userNote.nameInvalid });
        return false;
      }
      if (result.reason === 'name_collision') {
        handleNoteSaveStatus({ error: strings.userNote.nameCollision });
        return false;
      }
      if (!result.ok) {
        handleNoteSaveStatus({ error: strings.userNote.saveFailed });
        return false;
      }
      if (result.cardUpdates) {
        persistCardEdits(card.id, result.cardUpdates);
      } else {
        handleUpdateVersion(card.id, result.versionNum, result.version);
        void requestActionSync('structuralChange', { projectId });
      }
      if (result.apiUnavailable) {
        handleNoteSaveStatus({ toast: strings.sync.primitivesNotUpdated });
      } else {
        handleNoteSaveStatus({ toast: strings.userNote.savedToFolder });
      }
      await refreshGraph();
      return true;
    } catch (e) {
      handleNoteSaveStatus({ error: e.message });
      return false;
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

  const handleInlineSaveUserTask = useCallback(async (card, { body, name, taskStatus }) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return false;

    const projectOnly = noteRequiresProjectOnlySave({
      folderHandle,
      folderConnected: Boolean(folderHandle),
      folderKeySet,
      card,
    });

    setSavingCardId(card.id);
    try {
      if (projectOnly || !folderHandle) {
        const result = saveUserTaskToProject(card, {
          body,
          name,
          taskStatus,
          versionNum: card.pinnedVersion,
        });
        if (result.reason === 'name_required') {
          handleNoteSaveStatus({ error: strings.userTask.nameRequired });
          return false;
        }
        if (result.reason === 'name_invalid') {
          handleNoteSaveStatus({ error: strings.userTask.nameInvalid });
          return false;
        }
        if (!result.ok || !result.cardUpdates) {
          handleNoteSaveStatus({ error: strings.userTask.saveFailed });
          return false;
        }
        persistCardEdits(card.id, result.cardUpdates);
        handleNoteSaveStatus({
          toast: folderHandle && folderKeySet?.size
            ? strings.userTask.savedProjectOnlyMissingFromFolder
            : strings.userTask.savedProjectOnly,
        });
        return true;
      }

      const result = await saveUserTask({
        projectId,
        projectName: stateRef.current.projectName,
        folderHandle,
        clusterId,
        card,
        versionNum: card.pinnedVersion,
        body,
        name,
        taskStatus,
        cards: stateRef.current.cards,
      });
      if (result.reason === 'no_folder') {
        handleNoteSaveStatus({ error: strings.userTask.needFolder });
        return false;
      }
      if (result.reason === 'write_denied') {
        handleNoteSaveStatus({ error: strings.userTask.writeDenied });
        return false;
      }
      if (result.reason === 'name_required') {
        handleNoteSaveStatus({ error: strings.userTask.nameRequired });
        return false;
      }
      if (result.reason === 'name_invalid') {
        handleNoteSaveStatus({ error: strings.userTask.nameInvalid });
        return false;
      }
      if (result.reason === 'name_collision') {
        handleNoteSaveStatus({ error: strings.userTask.nameCollision });
        return false;
      }
      if (!result.ok) {
        handleNoteSaveStatus({ error: strings.userTask.saveFailed });
        return false;
      }
      if (result.cardUpdates) {
        persistCardEdits(card.id, result.cardUpdates);
      } else {
        handleUpdateVersion(card.id, result.versionNum, result.version);
        void requestActionSync('structuralChange', { projectId });
      }
      if (result.apiUnavailable) {
        handleNoteSaveStatus({ toast: strings.sync.primitivesNotUpdated });
      } else {
        handleNoteSaveStatus({ toast: strings.userTask.savedToFolder });
      }
      await refreshGraph();
      return true;
    } catch (e) {
      handleNoteSaveStatus({ error: e.message });
      return false;
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

  const handleInlineSaveMarkdown = useCallback(async (card, { body }) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return false;

    const projectOnly = noteRequiresProjectOnlySave({
      folderHandle,
      folderConnected: Boolean(folderHandle),
      folderKeySet,
      card,
    });

    setSavingCardId(card.id);
    try {
      if (projectOnly || !folderHandle) {
        const result = saveTextContentToProject(card, {
          body,
          versionNum: card.pinnedVersion,
        });
        if (!result.ok || !result.cardUpdates) {
          handleNoteSaveStatus({ error: strings.userNote.saveFailed });
          return false;
        }
        persistCardEdits(card.id, result.cardUpdates);
        handleNoteSaveStatus({
          toast: folderHandle && folderKeySet?.size
            ? strings.userNote.savedProjectOnlyMissingFromFolder
            : strings.userNote.savedProjectOnly,
        });
        return true;
      }

      const result = await saveMarkdownArtifact({
        projectId,
        projectName: stateRef.current.projectName,
        folderHandle,
        clusterId,
        card,
        versionNum: card.pinnedVersion,
        body,
        cards: stateRef.current.cards,
      });
      if (result.reason === 'no_folder') {
        handleNoteSaveStatus({ error: strings.userNote.needFolder });
        return false;
      }
      if (result.reason === 'write_denied') {
        handleNoteSaveStatus({ error: strings.userNote.writeDenied });
        return false;
      }
      if (!result.ok) {
        handleNoteSaveStatus({ error: strings.userNote.saveFailed });
        return false;
      }
      if (result.cardUpdates) {
        persistCardEdits(card.id, result.cardUpdates);
      } else {
        handleUpdateVersion(card.id, result.versionNum, result.version);
        void requestActionSync('structuralChange', { projectId });
      }
      if (result.apiUnavailable) {
        handleNoteSaveStatus({ toast: strings.sync.primitivesNotUpdated });
      } else {
        handleNoteSaveStatus({ toast: strings.userNote.savedToFolder });
      }
      await refreshGraph();
      return true;
    } catch (e) {
      handleNoteSaveStatus({ error: e.message });
      return false;
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
        const nextUrl = cardUpdates.versions?.[0]?.externalUrl ?? url;
        const urlChanged =
          normalizeBookmarkUrl(currentVersion?.externalUrl)
          !== normalizeBookmarkUrl(nextUrl);
        const targetFilename = bookmarkFilenameForInlineSave(
          card,
          currentVersion,
          nextUrl,
        );
        const filenameChanged = targetFilename !== currentVersion.filename;
        if (urlChanged || filenameChanged) {
          await cleanupBookmarkFolderFile({ folderHandle, card });
        }
        const writtenFilename = await writeBookmarkFile(folderHandle, {
          filename: targetFilename,
          url: nextUrl,
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
    handleNoteSaveStatus({
      toast: folderHandle && folderKeySet?.size
        ? strings.userNote.savedProjectOnlyMissingFromFolder
        : strings.userNote.savedProjectOnly,
    });
    return { ok: true };
  }, [persistCardEdits, handleNoteSaveStatus, folderHandle, folderKeySet]);

  const handleSaveNewNote = useCallback(async ({
    prefix,
    name,
    body,
    linkTargetRefs = [],
    position = null,
  }) => {
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
      const fallback = {
        x: 100 + (stateRef.current.cards.length % 4) * 320,
        y: 100 + Math.floor(stateRef.current.cards.length / 4) * 240,
      };
      const newCard = {
        ...result.card,
        x: Number.isFinite(position?.x) ? position.x : fallback.x,
        y: Number.isFinite(position?.y) ? position.y : fallback.y,
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

  const handleSaveTaskToProject = useCallback(async (card, {
    body,
    name,
    taskStatus,
    versionNum,
  }) => {
    const result = saveUserTaskToProject(card, { body, name, taskStatus, versionNum });
    if (!result.ok) {
      return result;
    }
    persistCardEdits(card.id, result.cardUpdates);
    handleNoteSaveStatus({
      toast: folderHandle && folderKeySet?.size
        ? strings.userTask.savedProjectOnlyMissingFromFolder
        : strings.userTask.savedProjectOnly,
    });
    return { ok: true };
  }, [persistCardEdits, handleNoteSaveStatus, folderHandle, folderKeySet]);

  const handleSaveNewTask = useCallback(async ({
    prefix,
    name,
    body,
    taskStatus = 'general',
    linkTargetRefs = [],
    position = null,
  }) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    if (!folderHandle) {
      setSyncStatus({ error: strings.userTask.needFolder });
      setTimeout(() => setSyncStatus(null), 4000);
      return;
    }
    const canWrite = await ensureWritePermission(folderHandle);
    if (!canWrite) {
      setSyncStatus({ error: strings.userTask.writeDenied });
      setTimeout(() => setSyncStatus(null), 4000);
      return;
    }
    setSavingTask(true);
    try {
      const result = await createUserTaskArtifact({
        projectId,
        projectName: stateRef.current.projectName,
        folderHandle,
        prefix,
        name,
        body,
        taskStatus,
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
      const fallback = {
        x: 100 + (stateRef.current.cards.length % 4) * 320,
        y: 100 + Math.floor(stateRef.current.cards.length / 4) * 240,
      };
      const newCard = {
        ...result.card,
        x: Number.isFinite(position?.x) ? position.x : fallback.x,
        y: Number.isFinite(position?.y) ? position.y : fallback.y,
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
      setNewTaskOpen(false);
      await refreshGraph();
    } catch (e) {
      setSyncStatus({ error: e.message });
      setTimeout(() => setSyncStatus(null), 4000);
    } finally {
      setSavingTask(false);
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
    setNewTaskOpen,
    setState,
  ]);

  const handleSaveNewLink = useCallback(async ({
    url,
    preview,
    titleOverride,
    linkTargetRefs = [],
    position = null,
  }) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) {
      setSyncStatus({ error: strings.bookmark.needProject });
      setTimeout(() => setSyncStatus(null), 4000);
      return;
    }
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
      } else if (!result.ingest.ok) {
        setSyncStatus({ toast: strings.bookmark.primitivesNotUpdated });
        setTimeout(() => setSyncStatus(null), 4000);
      }
      await finalizeNewBookmarkCanvasSave({
        projectId,
        result,
        stateRef,
        stagedSyncCardsRef,
        setState,
        registerOptimisticCard,
        commitProjectDocument,
        setFolderPresentKeys,
        folderHandle,
        refreshGraph,
        position,
      });
      await requestStructuralSync({ awaitLocal: true });
      setAddLinkOpen(false);
      setSyncStatus({ toast: strings.bookmark.savedToCanvas });
      setTimeout(() => setSyncStatus(null), 4000);
    } catch (e) {
      setSyncStatus({ error: e.message });
      setTimeout(() => setSyncStatus(null), 4000);
    } finally {
      setSavingLink(false);
    }
  }, [
    activeProjectIdRef,
    stateRef,
    stagedSyncCardsRef,
    folderHandle,
    clusterId,
    refreshGraph,
    setSyncStatus,
    setClusterId,
    clusterContextProjectIdRef,
    setAddLinkOpen,
    setFolderPresentKeys,
    setState,
    requestStructuralSync,
  ]);

  const handleSaveNewFlow = useCallback(async ({ title, description = '', position }) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) {
      setSyncStatus({ error: 'Select a project before creating a Beat Agent.' });
      setTimeout(() => setSyncStatus(null), 5000);
      return null;
    }
    setSavingFlow(true);
    try {
      const flow = await createFlowArtifact(projectId, { title, description });
      const fallbackPosition = {
        x: 100 + (stateRef.current.cards.length % 4) * 320,
        y: 100 + Math.floor(stateRef.current.cards.length / 4) * 240,
      };
      const newCard = flowCardFromDocument(flow, position ?? fallbackPosition);
      const nextState = {
        ...stateRef.current,
        cards: [...stateRef.current.cards, newCard],
      };
      stateRef.current = nextState;
      setState(nextState);
      registerOptimisticCard(projectId, newCard.id);
      await commitProjectDocument(projectId, {
        state: nextState,
        stagedSyncCards: stagedSyncCardsRef.current,
        reason: 'flow:create',
        pushRemote: true,
      });
      setOpenCardId(newCard.id);
      return newCard;
    } catch (error) {
      setSyncStatus({ error: error.message });
      setTimeout(() => setSyncStatus(null), 5000);
      return null;
    } finally {
      setSavingFlow(false);
    }
  }, [
    activeProjectIdRef,
    setState,
    setSyncStatus,
    stagedSyncCardsRef,
    stateRef,
  ]);

  const handleSaveNewLive = useCallback(async ({ position, ...input }) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return null;
    setSavingLive(true);
    try {
      const live = await createLiveArtifact(projectId, input);
      const fallbackPosition = {
        x: 100 + (stateRef.current.cards.length % 4) * 360,
        y: 100 + Math.floor(stateRef.current.cards.length / 4) * 280,
      };
      const newCard = liveArtifactCardFromRecord(live, position ?? fallbackPosition);
      const nextState = { ...stateRef.current, cards: [...stateRef.current.cards, newCard] };
      stateRef.current = nextState;
      setState(nextState);
      registerOptimisticCard(projectId, newCard.id);
      await commitProjectDocument(projectId, {
        state: nextState,
        stagedSyncCards: stagedSyncCardsRef.current,
        reason: 'live:create',
        pushRemote: true,
      });
      setOpenCardId(newCard.id);
      return newCard;
    } catch (error) {
      setSyncStatus({ error: error.message });
      setTimeout(() => setSyncStatus(null), 5000);
      return null;
    } finally {
      setSavingLive(false);
    }
  }, [activeProjectIdRef, setState, setSyncStatus, stagedSyncCardsRef, stateRef]);

  const handleSaveNewAgent = useCallback(async ({ position, ...input }) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return null;
    setSavingAgent(true);
    try {
      const agent = await createAgent(projectId, input);
      const fallbackPosition = {
        x: 100 + (stateRef.current.cards.length % 4) * 300,
        y: 100 + Math.floor(stateRef.current.cards.length / 4) * 260,
      };
      const newCard = agentCardFromRecord(agent, position ?? fallbackPosition);
      const nextState = { ...stateRef.current, cards: [...stateRef.current.cards, newCard] };
      stateRef.current = nextState;
      setState(nextState);
      registerOptimisticCard(projectId, newCard.id);
      await commitProjectDocument(projectId, {
        state: nextState,
        stagedSyncCards: stagedSyncCardsRef.current,
        reason: 'agent:create',
        pushRemote: true,
      });
      setOpenCardId(newCard.id);
      return newCard;
    } catch (error) {
      setSyncStatus({ error: error.message });
      setTimeout(() => setSyncStatus(null), 5000);
      return null;
    } finally {
      setSavingAgent(false);
    }
  }, [activeProjectIdRef, setState, setSyncStatus, stagedSyncCardsRef, stateRef]);

  const handleSaveNewBeatAgent = useCallback(async ({ position, name = 'Beat Agent' }) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return null;
    setSavingAgent(true);
    try {
      const state = createDefaultBeatAgentState({ name });
      const agent = await createMusicAgent(projectId, {
        agentType: 'beat',
        name,
        status: 'draft',
        state,
      });
      const fallbackPosition = {
        x: 100 + (stateRef.current.cards.length % 4) * 380,
        y: 100 + Math.floor(stateRef.current.cards.length / 4) * 280,
      };
      const newCard = beatAgentCardFromRecord(agent, position ?? fallbackPosition);
      const nextState = { ...stateRef.current, cards: [...stateRef.current.cards, newCard] };
      stateRef.current = nextState;
      setState(nextState);
      registerOptimisticCard(projectId, newCard.id);
      await commitProjectDocument(projectId, {
        state: nextState,
        stagedSyncCards: stagedSyncCardsRef.current,
        reason: 'music-agent:create',
        pushRemote: true,
      });
      setOpenCardId(newCard.id);
      return newCard;
    } catch (error) {
      setSyncStatus({ error: error.message });
      setTimeout(() => setSyncStatus(null), 5000);
      return null;
    } finally {
      setSavingAgent(false);
    }
  }, [activeProjectIdRef, setState, setSyncStatus, stagedSyncCardsRef, stateRef]);

  const handleSaveNewSonicStudio = useCallback(async ({ position, name = 'Sonic Studio' }) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return null;
    setSavingSonicStudio(true);
    try {
      const sonic = createSonicStudioRecord({ projectId, name });
      const fallbackPosition = {
        x: 100 + (stateRef.current.cards.length % 4) * 400,
        y: 100 + Math.floor(stateRef.current.cards.length / 4) * 300,
      };
      const newCard = sonicStudioCardFromRecord(sonic, position ?? fallbackPosition);
      const nextState = { ...stateRef.current, cards: [...stateRef.current.cards, newCard] };
      stateRef.current = nextState;
      setState(nextState);
      registerOptimisticCard(projectId, newCard.id);
      await commitProjectDocument(projectId, {
        state: nextState,
        stagedSyncCards: stagedSyncCardsRef.current,
        reason: 'sonic-studio:create',
        pushRemote: true,
      });
      setOpenCardId(newCard.id);
      return newCard;
    } catch (error) {
      setSyncStatus({ error: error.message });
      setTimeout(() => setSyncStatus(null), 5000);
      return null;
    } finally {
      setSavingSonicStudio(false);
    }
  }, [activeProjectIdRef, setState, setSyncStatus, stagedSyncCardsRef, stateRef]);

  const handleUpdateSonicStudioCard = useCallback(async (cardId, updates) => {
    updateCard(cardId, updates);
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    const nextState = stateRef.current;
    const result = await commitProjectDocument(projectId, {
      state: nextState,
      stagedSyncCards: stagedSyncCardsRef.current,
      reason: 'sonic-studio:update',
      pushRemote: true,
    });
    if (!result?.ok && !result?.localCacheWritten) {
      setSyncStatus({ error: 'Sonic Studio state could not be saved.' });
      setTimeout(() => setSyncStatus(null), 5000);
    }
  }, [activeProjectIdRef, setSyncStatus, stagedSyncCardsRef, stateRef, updateCard]);

  const appendGeneratedCards = useCallback(async (cardsToAdd = []) => {
    const projectId = activeProjectIdRef.current;
    const cleanCards = cardsToAdd.filter(Boolean);
    if (!projectId || !cleanCards.length) return [];
    const nextState = {
      ...stateRef.current,
      cards: [...stateRef.current.cards, ...cleanCards],
    };
    stateRef.current = nextState;
    setState(nextState);
    for (const newCard of cleanCards) {
      registerOptimisticCard(projectId, newCard.id);
    }
    await commitProjectDocument(projectId, {
      state: nextState,
      stagedSyncCards: stagedSyncCardsRef.current,
      reason: 'agent:outputs',
      pushRemote: true,
    });
    return cleanCards;
  }, [activeProjectIdRef, setState, stagedSyncCardsRef, stateRef]);

  const flowCardRefreshQueueRef = useRef(Promise.resolve());

  const handleFlowCardRefresh = useCallback(async (cardId, updates) => {
    const run = async () => {
      updateCard(cardId, updates);
      const projectId = activeProjectIdRef.current;
      if (!projectId) return;
      const result = await commitProjectDocument(projectId, {
        state: stateRef.current,
        stagedSyncCards: stagedSyncCardsRef.current,
        reason: 'flow:card-refresh',
        pushRemote: true,
      });
      if (!result?.ok && !result?.localCacheWritten) {
        setSyncStatus({ error: strings.flow.previewSaveFailed });
        setTimeout(() => setSyncStatus(null), 4000);
      }
    };
    flowCardRefreshQueueRef.current = flowCardRefreshQueueRef.current.then(run, run);
    await flowCardRefreshQueueRef.current;
  }, [activeProjectIdRef, setSyncStatus, stagedSyncCardsRef, stateRef, updateCard]);

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
    if (card?.type === 'bookmark' && projectId) {
      const bookmarkUrl = bookmarkUrlForSyncEntry(card);
      if (bookmarkUrl) addSuppressedBookmarkUrl(projectId, bookmarkUrl);
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
      await requestStructuralSync({
        awaitLocal: true,
        allowCleanupOverwrite: true,
      });
    }
    const effectiveFolderHandle = await resolveBookmarkFolderHandle(
      projectId,
      folderHandle,
    );
    const folderCleanup = await cleanupBookmarkFolderFile({
      folderHandle: effectiveFolderHandle,
      card,
    });
    if (folderCleanup.removed?.length) {
      invalidateFolderScan();
      setFolderPresentKeys((keys) => {
        const keysToRemove = new Set();
        for (const path of folderCleanup.removed) {
          keysToRemove.add(toCanonicalSyncKey(cardKeyFromFilename(path)));
        }
        if (card?.key) keysToRemove.add(toCanonicalSyncKey(card.key));
        return (keys || []).filter((k) => !keysToRemove.has(toCanonicalSyncKey(k)));
      });
    }
    if (card?.type === 'bookmark' && folderCleanup.attempted) {
      if (folderCleanup.skipped === 'write_denied') {
        setSyncStatus({ toast: strings.bookmark.deleteFolderWriteDenied });
        setTimeout(() => setSyncStatus(null), 6000);
      } else if (
        folderCleanup.removed.length === 0
        && folderCleanup.candidatesFound
      ) {
        setSyncStatus({ toast: strings.bookmark.deleteFolderFileFailed });
        setTimeout(() => setSyncStatus(null), 6000);
      }
    }
    await cleanupProjectArtifactForSyncEntry({
      projectId,
      entry: card,
      refreshGraph,
    });
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
    refreshGraph,
    folderHandle,
    invalidateFolderScan,
    setFolderPresentKeys,
    setSyncStatus,
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
  };
}
