import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { strings } from '../../content/strings.js';
import { DEFAULT_ENABLED_AGENT_IDS } from '../../lib/agentProfiles.js';
import {
  CONNECTORS,
  DEFAULT_SINGLE_CONNECTOR_ID,
  getConnectorById,
  getConnectorProvider,
} from '../../lib/agentConnectors.js';
import {
  loadAgentChatSession,
  saveAgentChatSession,
  clearAgentChatSession,
  clearAgentChatSessionsForProject,
  serializeRegistry,
  deserializeRegistry,
  maxAgentChatMessageId,
} from '../../lib/agentChatPersistence.js';
import {
  syncAgentChatArtifact,
  parseAgentChatTranscript,
  loadThreadTranscript,
} from '../../lib/agentChatArtifact.js';
import {
  loadThreadIndex,
  saveThreadIndexLocal,
  createThreadMeta,
  upsertThreadInIndex,
  setActiveThreadInIndex,
  renameThreadInIndex,
  removeThreadFromIndex,
  discoverThreadsFromCanvas,
  discoverThreadsFromStaged,
  mergeDiscoveredThreads,
  migrateLegacyAgentChatToThreads,
  deleteThreadSession,
  linkCardToThreadInIndex,
  resolveThreadForCard,
  emptyThreadIndex,
} from '../../lib/agentChatThreads.js';
import { addSuppressedSyncKey, readSuppressedSyncKeys } from '../../lib/syncSuppressedKeys.js';
import { ensureAgentChatCardOnCanvas } from '../../lib/ensureAgentChatCardOnCanvas.js';
import { stageAgentChatCard } from '../../lib/stageAgentChatCard.js';
import { enqueueArtifactSyncRetry } from '../../lib/artifactSyncOutbox.js';
import {
  getAgentHealth,
  listAgentConnectors,
  saveAgentCredential,
  deleteAgentCredential,
  estimateAgentChat,
  sendAgentChat,
} from '../../lib/agentApi.js';
import {
  resolveEffectiveAgentContextCards,
  cardLabel,
} from '../../lib/agentContext.js';
import {
  buildContextDocuments,
  applyContextAddBudget,
  formatTruncationSummary,
  formatContextRemoveMessage,
  contextAddMessageFields,
  MINIMAL_AGENT_SYSTEM_CONTEXT,
  estimateContextDocuments,
  getContextLimits,
} from '../../lib/agentContextContent.js';
import {
  createContextRegistry,
  registerContextCard,
  unregisterContextCard,
  diffContextRegistry,
  computeContextDeliveryState,
  getContextDeliveryStatus,
  buildApiMessageHistoryAsync,
} from '../../lib/agentContextSession.js';
import { isApiAvailable } from '../../lib/primitivesApi.js';
import { usePageHideFlush } from '../sync/usePageHideFlush.js';

const AGENT_EXTENDED_CONTEXT_KEY = 'canvas:agent-extended-context';
const AGENT_TOKEN_CONFIRM_THRESHOLD = 25_000;

export function readAgentExtendedContext() {
  try {
    return sessionStorage.getItem(AGENT_EXTENDED_CONTEXT_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeAgentExtendedContext(value) {
  try {
    sessionStorage.setItem(AGENT_EXTENDED_CONTEXT_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * Agent chat shell: panel state, threads, persistence, context delivery, and handlers.
 */
export function useAgentChatShell({
  refs: {
    activeProjectIdRef,
    stateRef,
    stagedSyncCardsRef,
    switchingProjectRef,
    activeThreadIdRef,
    agentChatThreadIndexRef,
    loadAgentChatThreadIndexEarlyRef,
    singleConnectorIdRef,
    agentChatArtifactMetaRef: agentChatArtifactMetaRefProp,
  },
  deps: {
    activeProjectId,
    projectSwitchLoading,
    folderHandle,
    state,
    stateProjectName,
    selectedCardIds,
    canvasViewportSize,
    canvasView,
    requestStructuralSync,
    removeCardFromSelection,
    setActiveCardId,
    setSyncStatus,
    setState,
    setStagedSyncCards,
    setTrayRevealActive,
    initialHydratedRef,
  },
}) {
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
  const [agentContextRevision, setAgentContextRevision] = useState(0);
  const [agentChatMessages, setAgentChatMessages] = useState([]);
  const [agentChatLoading, setAgentChatLoading] = useState(false);
  const [agentChatError, setAgentChatError] = useState(null);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const agentChatIdRef = useRef(0);
  const agentContextRegistryRef = useRef(createContextRegistry());
  const agentChatArtifactMetaRefLocal = useRef({
    artifactRef: null,
    filename: null,
    cardId: null,
  });
  const agentChatArtifactMetaRef = agentChatArtifactMetaRefProp ?? agentChatArtifactMetaRefLocal;
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
  const agentChatMessagesRef = useRef(agentChatMessages);
  const transcriptSyncInFlightRef = useRef(false);
  const transcriptSyncPendingRef = useRef(null);
  const persistAgentChatSessionRef = useRef(async () => ({ ok: false }));
  const prevAgentConnectorsOfflineRef = useRef(false);
  const agentPanelOpenSyncRetryRef = useRef(false);

  useEffect(() => {
    agentChatMessagesRef.current = agentChatMessages;
  }, [agentChatMessages]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    agentChatThreadIndexRef.current = agentChatThreadIndex;
  }, [agentChatThreadIndex]);

  useEffect(() => {
    singleConnectorIdRef.current = singleConnectorId;
  }, [singleConnectorId]);

  const closeAgentPanel = useCallback(() => {
    setAgentPanelOpen(false);
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
    [refreshAgentConnectors, setSyncStatus],
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
            relativePath: threadMeta?.relativePath ?? null,
            cardId: threadMeta?.cardId ?? null,
          };

      const savePayload = {
        messages,
        registry: serializeRegistry(registry),
        artifactRef: meta.artifactRef,
        filename: meta.filename,
        relativePath: meta.relativePath ?? null,
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
          projectName: stateProjectName,
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
              relativePath: meta.relativePath ?? null,
              cardId: meta.cardId,
            };
            setAgentChatArtifactRef(syncResult.artifactRef);

            let nextIndex = upsertThreadInIndex(agentChatThreadIndexRef.current, {
              ...threadMeta,
              threadId,
              filename: syncResult.filename ?? meta.filename,
              relativePath: meta.relativePath ?? null,
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
              relativePath: meta.relativePath ?? null,
              artifactRef: syncResult.artifactRef,
              updatedAt: Date.now(),
            });

            stateRef.current = { ...stateRef.current, cards: nextCards };
            setState((prev) => ({ ...prev, cards: nextCards }));
            setStagedSyncCards(nextStaged);
            stagedSyncCardsRef.current = nextStaged;

            setAgentChatThreadIndex(nextIndex);
            saveThreadIndexLocal(projectId, connectorId, nextIndex);

            saveAgentChatSession(projectId, connectorId, threadId, {
              ...savePayload,
              artifactRef: syncResult.artifactRef,
              filename: syncResult.filename ?? meta.filename,
              relativePath: meta.relativePath ?? null,
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
          if (syncResult.filename) {
            enqueueArtifactSyncRetry({
              kind: 'agent_chat',
              projectId,
              projectName: stateProjectName,
              connectorId,
              connectorLabel: connector?.label ?? connectorId,
              threadId,
              filename: syncResult.filename,
              cardKey: syncResult.filename.replace(/-v\d+\.[^.]+$/, ''),
              title: title ?? undefined,
              markdown: syncResult.markdown ?? null,
              contentHash: syncResult.content_hash ?? null,
              lastError: syncResult.reason ?? 'ingest_failed',
            });
            const stagedResult = stageAgentChatCard(
              stagedSyncCardsRef.current,
              stateRef.current.cards,
              {
                filename: syncResult.filename,
                title,
                threadId,
                syncResult: {
                  content_hash: syncResult.content_hash,
                  artifactRef: null,
                  artifactSyncState: 'pending',
                },
              },
            );
            if (stagedResult.stagedCards !== stagedSyncCardsRef.current) {
              setStagedSyncCards(stagedResult.stagedCards);
              stagedSyncCardsRef.current = stagedResult.stagedCards;
              requestStructuralSync();
            }
          }
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
    [
      singleConnectorId,
      folderHandle,
      stateProjectName,
      requestStructuralSync,
      activeProjectIdRef,
      stateRef,
      stagedSyncCardsRef,
      setState,
      setStagedSyncCards,
    ],
  );

  persistAgentChatSessionRef.current = persistAgentChatSession;

  usePageHideFlush({
    activeProjectIdRef,
    initialHydratedRef,
    activeThreadIdRef,
    agentChatMessagesRef,
    persistAgentChatSessionRef,
    agentContextRegistryRef,
    serializeRegistry,
    singleConnectorId,
  });

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
    [
      requestStructuralSync,
      activeProjectIdRef,
      stateRef,
      stagedSyncCardsRef,
      setState,
      setStagedSyncCards,
    ],
  );

  const reconcileAllThreadChatCards = useCallback(() => {
    const projectId = activeProjectIdRef.current;
    const connectorId = singleConnectorId;
    if (!projectId || !connectorId) return false;

    let index = agentChatThreadIndexRef.current;
    let anyChanged = false;
    let indexDirty = false;
    const currentActiveThreadId = activeThreadIdRef.current;

    for (const thread of index.threads) {
      if (!thread.filename) continue;
      if (currentActiveThreadId && thread.threadId !== currentActiveThreadId) continue;
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
  }, [singleConnectorId, ensureThreadChatCardOnCanvas, activeProjectIdRef, stateRef, stagedSyncCardsRef]);

  const loadThreadSessionIntoState = useCallback(async (projectId, connectorId, threadId) => {
    agentChatPersistSkipRef.current = true;
    const session = await loadAgentChatSession(projectId, connectorId, threadId);
    const threadMeta = agentChatThreadIndexRef.current.threads.find(
      (t) => t.threadId === threadId,
    );
    const artifactRef =
      session?.artifactRef ?? threadMeta?.artifactRef ?? null;
    const filename = session?.filename ?? threadMeta?.filename ?? null;
    const relativePath = session?.relativePath ?? threadMeta?.relativePath ?? null;
    const cardId = session?.cardId ?? threadMeta?.cardId ?? null;

    let messages = [];
    const markdown = await loadThreadTranscript({
      folderHandle,
      artifactRef,
      filename,
      relativePath,
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
      relativePath,
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
          relativePath,
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
    setActiveCardId,
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
  }, [singleConnectorId, activeProjectIdRef, stateRef, stagedSyncCardsRef]);

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
      relativePath: null,
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
    const prevStagedLen = stagedSyncCardsRef.current.length;
    const cardId = ensureThreadChatCardOnCanvas(meta.threadId);
    if (cardId) {
      index = linkCardToThreadInIndex(index, meta.threadId, { cardId });
      agentChatThreadIndexRef.current = index;
      setAgentChatThreadIndex(index);
      saveThreadIndexLocal(projectId, connectorId, index);
      agentChatArtifactMetaRef.current.cardId = cardId;
      setActiveCardId(cardId);
      removeCardFromSelection(cardId);
    } else if (stagedSyncCardsRef.current.length > prevStagedLen) {
      setTrayRevealActive(true);
    }
  }, [
    singleConnectorId,
    requestThreadTranscriptSync,
    ensureThreadChatCardOnCanvas,
    removeCardFromSelection,
    activeProjectIdRef,
    stagedSyncCardsRef,
    setActiveCardId,
    setTrayRevealActive,
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
    [singleConnectorId, loadThreadSessionIntoState, requestThreadTranscriptSync, activeProjectIdRef],
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
    [
      singleConnectorId,
      requestThreadTranscriptSync,
      requestStructuralSync,
      activeProjectIdRef,
      stateRef,
      stagedSyncCardsRef,
      setState,
      setStagedSyncCards,
    ],
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
    agentChatArtifactMetaRef.current = {
      artifactRef: null,
      filename: null,
      relativePath: null,
      cardId: null,
    };
    setAgentChatArtifactRef(null);
  }, [singleConnectorId, activeProjectIdRef, stateRef, setState]);

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
  }, [agentChatMessages, chatSyncRetrying, requestThreadTranscriptSync, setSyncStatus]);

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
          relativePath: null,
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
    switchingProjectRef,
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
        relativePath: threadMeta?.relativePath ?? null,
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
      relativePath: threadMeta?.relativePath ?? null,
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
  }, [singleConnectorId, requestThreadTranscriptSync, activeProjectIdRef, setSyncStatus]);

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
        agentChatArtifactMetaRef.current = { artifactRef: null, filename: null, relativePath: null };
        setAgentChatArtifactRef(null);
        await refreshAgentConnectors();
      } catch (e) {
        setSyncStatus({ error: e.message });
        setTimeout(() => setSyncStatus(null), 4000);
      }
    },
    [refreshAgentConnectors, singleConnectorId, activeProjectIdRef, setSyncStatus],
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
      canvasView,
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
    canvasView,
    activeThreadId,
    agentChatThreadIndex,
    singleConnectorId,
    agentChatMessages.length,
    agentContextRevision,
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
    setAgentContextRevision((r) => r + 1);
    const nextMessages = agentChatMessagesRef.current.filter(
      (m) => m.kind !== 'context_add' && m.kind !== 'context_remove',
    );
    setAgentChatMessages(nextMessages);
    void requestThreadTranscriptSync(nextMessages, { reason: 'contextRefresh' });
    setSyncStatus({ toast: strings.agent.contextRefresh });
    setTimeout(() => setSyncStatus(null), 3000);
  }, [requestThreadTranscriptSync, setSyncStatus]);

  const handleRemoveContextCard = useCallback(
    (cardId) => {
      removeCardFromSelection(cardId);

      const registry = agentContextRegistryRef.current;
      const entry = registry.byCardId.get(cardId);
      if (!entry) return;

      unregisterContextCard(registry, cardId);
      setAgentContextRevision((r) => r + 1);
      setAgentContextStatusByCardId((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, cardId)) return prev;
        const next = { ...prev };
        delete next[cardId];
        return next;
      });

      const now = Date.now();
      const removeMsg = {
        id: `ctx-rm-${++agentChatIdRef.current}`,
        role: 'user',
        kind: 'context_remove',
        content: formatContextRemoveMessage([{ label: entry.label }]),
        labels: [entry.label],
        at: now,
      };
      const nextMessages = [...agentChatMessagesRef.current, removeMsg];
      setAgentChatMessages(nextMessages);
      void requestThreadTranscriptSync(nextMessages, { reason: 'contextRemove' });
      setSyncStatus({ toast: strings.agent.contextFilesRemovedToast(1) });
      setTimeout(() => setSyncStatus(null), 3000);
    },
    [removeCardFromSelection, requestThreadTranscriptSync, setSyncStatus],
  );

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
        if (diff.added.length || diff.removed.length) {
          setAgentContextRevision((r) => r + 1);
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
      stateRef,
      setSyncStatus,
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
  }, [setSyncStatus]);

  const clusterMemberOptions = useMemo(
    () => ({
      threads: agentChatThreadIndex.threads,
      connectorId: singleConnectorId,
    }),
    [agentChatThreadIndex.threads, singleConnectorId],
  );

  return {
    agentPanelOpen,
    setAgentPanelOpen,
    closeAgentPanel,
    toggleAgentPanel,
    agentContextMode,
    setAgentContextMode,
    enabledAgentIds,
    setEnabledAgentIds,
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
    activeThreadIdRef,
    agentChatThreadIndexRef,
    agentChatMessagesRef,
    loadAgentChatThreadIndexEarly,
    loadAgentChatThreadIndexEarlyRef,
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
    refreshAgentConnectors,
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
    agentChatArtifactMetaRef,
    getContextLimits,
  };
}
