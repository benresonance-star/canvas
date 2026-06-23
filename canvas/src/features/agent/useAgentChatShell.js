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
  connectorNeedsOllamaPull,
  defaultAgentTypeLabelForProvider,
  getConnectorById,
  getConnectorByProvider,
  getConnectorProvider,
  imagesUnsupportedForConnector,
  mergeConnectorMeta,
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
  formatAgentChatTranscript,
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
  applyAgentTypeToThread,
  clearAgentTypeFromThread,
  createAgentTypeChangeMessage,
} from '../../lib/agentChatThreads.js';
import { addSuppressedSyncKey, readSuppressedSyncKeys } from '../../lib/syncSuppressedKeys.js';
import { ensureAgentChatCardOnCanvas } from '../../lib/ensureAgentChatCardOnCanvas.js';
import { ensureCardArtifactRef } from '../../lib/ensureCardArtifactRef.js';
import { stageAgentChatCard } from '../../lib/stageAgentChatCard.js';
import { enqueueArtifactSyncRetry } from '../../lib/artifactSyncOutbox.js';
import {
  getAgentHealth,
  listAgentConnectors,
  listAgentTemplates,
  saveAgentTemplate,
  importMasterAgentTemplates,
  deleteAgentTemplate,
  saveAgentCredential,
  deleteAgentCredential,
  estimateAgentChat,
  sendAgentChat,
  pullOllamaModel,
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
  getPinnedVersion,
} from '../../lib/agentContextContent.js';
import {
  createContextRegistry,
  registerContextCard,
  unregisterContextCard,
  diffContextRegistry,
  computeContextDeliveryState,
  getContextDeliveryStatus,
  buildApiMessageHistoryAsync,
  apiMessagesIncludeImages,
} from '../../lib/agentContextSession.js';
import { isApiAvailable } from '../../lib/primitivesApi.js';
import { fetchLiveFeedContext, hydrateLiveContextCards } from '../../lib/liveAgentContext.js';
import {
  collapsedSectionsToFlowAgentPanelLayout,
  readAgentPanelUiState,
  writeAgentPanelUiState,
} from '../../lib/agentPanelUiPersistence.js';
import {
  buildAgentPanelUiFlushPayload,
  planAgentPanelUiRestore,
} from '../../lib/agentPanelUiRestore.js';
import { upsertAgentTemplateList } from '../../lib/agentTemplates.js';
import { usePageHideFlush } from '../sync/usePageHideFlush.js';
import { fetchFlow } from '../flow/api/flowApi.js';
import {
  flowGraphFromPreview,
  formatFlowDiagramForAgent,
} from '../flow/domain/flowDocument.js';

function resolveAgentChatSyncReason(reason) {
  if (reason === 'ingest_failed') return 'ingest_failed';
  if (reason === 'folder_write_denied' || reason === 'folder_write_failed') {
    return reason;
  }
  return 'api_unavailable';
}

function isFolderWriteSyncReason(reason) {
  return reason === 'folder_write_denied' || reason === 'folder_write_failed';
}

const AGENT_EXTENDED_CONTEXT_KEY = 'canvas:agent-extended-context';

function connectorIdFromAgentChatFilename(filename) {
  const base = String(filename || '').split(/[\\/]/).pop() || '';
  const match = base.match(/^notes__agent-chat-(.+?)(?:-[a-f0-9]{8})?-v\d+\.md$/i);
  if (!match) return null;
  const safe = match[1];
  const bySafeId = CONNECTORS.find(
    (connector) => String(connector.id).replace(/[^a-zA-Z0-9_-]/g, '-') === safe,
  );
  return bySafeId?.id ?? null;
}
const AGENT_TOKEN_CONFIRM_THRESHOLD = 25_000;

function connectorIdFromAgentChatCard(card) {
  const values = [
    card?.key,
    card?.filename,
    card?.versions?.[0]?.filename,
    card?.versions?.[0]?.relativePath,
  ].filter(Boolean);
  for (const connector of CONNECTORS) {
    const safeConnector = String(connector.id).replace(/[^a-zA-Z0-9_-]/g, '-');
    const storagePrefix = `notes__agent-chat-${safeConnector}`;
    const filenamePrefix = `agent-chat-${safeConnector}`;
    if (
      values.some((value) => {
        const text = String(value);
        return text.includes(storagePrefix) || text.includes(filenamePrefix);
      })
    ) {
      return connector.id;
    }
  }
  return null;
}

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
  const [agentTemplates, setAgentTemplates] = useState([]);
  const [activeAgentTemplateId, setActiveAgentTemplateId] = useState(null);
  const [agentSecretsConfigured, setAgentSecretsConfigured] = useState(true);
  const [agentConnectorsOffline, setAgentConnectorsOffline] = useState(false);
  const [ollamaPullState, setOllamaPullState] = useState(null);
  const [embeddedAgentPanelOpen, setEmbeddedAgentPanelOpen] = useState(false);
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
  const flowContextLoaderRef = useRef(null);
  const agentChatArtifactMetaRefLocal = useRef({
    artifactRef: null,
    filename: null,
    cardId: null,
  });
  const agentChatArtifactMetaRef = agentChatArtifactMetaRefProp ?? agentChatArtifactMetaRefLocal;
  const agentChatPersistSkipRef = useRef(false);
  const [agentChatArtifactRef, setAgentChatArtifactRef] = useState(null);
  /** @type {'api_unavailable' | 'ingest_failed' | 'folder_write_denied' | 'folder_write_failed' | null} */
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
  const [agentPanelCollapsedSections, setAgentPanelCollapsedSections] = useState({
    setup: false,
    context: false,
  });
  const [chatScrollResetKey, setChatScrollResetKey] = useState(0);
  const agentChatMessagesRef = useRef(agentChatMessages);
  const transcriptSyncInFlightRef = useRef(false);
  const transcriptSyncPendingRef = useRef(null);
  const persistAgentChatSessionRef = useRef(async () => ({ ok: false }));
  const prevAgentConnectorsOfflineRef = useRef(false);
  const agentPanelOpenSyncRetryRef = useRef(false);
  const agentPanelThreadSelectionSyncKeyRef = useRef(null);
  const prevAgentPanelOpenRef = useRef(false);
  const embeddedAgentPanelOpenRef = useRef(false);
  const pendingWorkspaceThreadRestoreRef = useRef(null);
  const restoredWorkspaceAgentUiRef = useRef(false);
  const activeAgentTemplateIdRef = useRef(activeAgentTemplateId);
  const agentPanelCollapsedSectionsRef = useRef(agentPanelCollapsedSections);
  const ollamaPullAbortRef = useRef(null);

  const persistAgentPanelUi = useCallback((partial) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    writeAgentPanelUiState(projectId, partial);
  }, [activeProjectIdRef]);

  const persistWorkspaceAgentUiThread = useCallback((threadId, connectorId) => {
    if (embeddedAgentPanelOpenRef.current) return;
    persistAgentPanelUi({
      activeThreadId: threadId,
      connectorId: connectorId ?? singleConnectorIdRef.current,
    });
  }, [persistAgentPanelUi, singleConnectorIdRef]);

  const flushAgentPanelUiSnapshot = useCallback(() => {
    const projectId = activeProjectIdRef.current;
    if (!projectId || embeddedAgentPanelOpenRef.current) return;
    writeAgentPanelUiState(
      projectId,
      buildAgentPanelUiFlushPayload({
        collapsedSections: agentPanelCollapsedSectionsRef.current,
        activeThreadId: activeThreadIdRef.current,
        connectorId: singleConnectorIdRef.current,
        activeAgentTemplateId: activeAgentTemplateIdRef.current,
      }),
    );
  }, [activeProjectIdRef, singleConnectorIdRef, activeThreadIdRef]);

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

  useEffect(() => {
    activeAgentTemplateIdRef.current = activeAgentTemplateId;
  }, [activeAgentTemplateId]);

  useEffect(() => {
    agentPanelCollapsedSectionsRef.current = agentPanelCollapsedSections;
  }, [agentPanelCollapsedSections]);

  useEffect(() => {
    embeddedAgentPanelOpenRef.current = embeddedAgentPanelOpen;
  }, [embeddedAgentPanelOpen]);

  useEffect(() => {
    if (!activeProjectId) return;
    const ui = readAgentPanelUiState(activeProjectId);
    const plan = planAgentPanelUiRestore(ui, null);
    if (plan.collapsedSections) {
      setAgentPanelCollapsedSections(plan.collapsedSections);
    }
    if (plan.connectorIdToSwitch && getConnectorById(plan.connectorIdToSwitch)) {
      setSingleConnectorId(plan.connectorIdToSwitch);
    } else if (ui.connectorId && getConnectorById(ui.connectorId)) {
      setSingleConnectorId(ui.connectorId);
    }
    if (ui.activeAgentTemplateId) {
      setActiveAgentTemplateId(ui.activeAgentTemplateId);
    }
    pendingWorkspaceThreadRestoreRef.current = plan.pendingThreadRestore;
    restoredWorkspaceAgentUiRef.current = plan.restoreComplete;
  }, [activeProjectId]);

  useEffect(() => {
    if (!prevAgentPanelOpenRef.current && agentPanelOpen) {
      setChatScrollResetKey((key) => key + 1);
    }
    prevAgentPanelOpenRef.current = agentPanelOpen;
  }, [agentPanelOpen]);

  useEffect(() => {
    const flush = () => flushAgentPanelUiSnapshot();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
    };
  }, [flushAgentPanelUiSnapshot]);

  useEffect(() => {
    if (!agentPanelOpen && !embeddedAgentPanelOpen) {
      restoredWorkspaceAgentUiRef.current = false;
      if (!activeProjectId) return;
      const ui = readAgentPanelUiState(activeProjectId);
      const plan = planAgentPanelUiRestore(ui, singleConnectorId);
      pendingWorkspaceThreadRestoreRef.current = plan.pendingThreadRestore;
    }
  }, [agentPanelOpen, embeddedAgentPanelOpen, activeProjectId, singleConnectorId]);

  const closeAgentPanel = useCallback(() => {
    flushAgentPanelUiSnapshot();
    setAgentPanelOpen(false);
  }, [flushAgentPanelUiSnapshot]);

  const toggleAgentPanel = useCallback(() => {
    setAgentPanelOpen((open) => {
      if (open) flushAgentPanelUiSnapshot();
      return !open;
    });
  }, [flushAgentPanelUiSnapshot]);

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
      const [data, templateData, health] = await Promise.all([
        listAgentConnectors(),
        listAgentTemplates().catch(() => ({ templates: null })),
        getAgentHealth().catch(() => ({ openaiReachable: null })),
      ]);
      setAgentConnectors(data.connectors || []);
      if (Array.isArray(templateData.templates)) {
        setAgentTemplates(templateData.templates);
        setActiveAgentTemplateId((current) => {
          if (current && templateData.templates.some((template) => template.id === current)) {
            return current;
          }
          return templateData.templates.find((template) => template.enabled)?.id ?? null;
        });
      }
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
      setAgentTemplates([]);
      setActiveAgentTemplateId(null);
      setAgentConnectorsOffline(true);
      setAgentOpenaiReachable(null);
      setAgentOpenaiReachabilityError(null);
    }
  }, []);

  const registerEmbeddedAgentPanelOpen = useCallback((open) => {
    setEmbeddedAgentPanelOpen(Boolean(open));
  }, []);

  useEffect(() => {
    if (!agentPanelOpen && !embeddedAgentPanelOpen) return undefined;
    void refreshAgentConnectors();
    const intervalId = setInterval(() => {
      void refreshAgentConnectors();
    }, 20000);
    return () => clearInterval(intervalId);
  }, [agentPanelOpen, embeddedAgentPanelOpen, refreshAgentConnectors]);

  const activeAgentTemplate = useMemo(
    () => agentTemplates.find((template) => template.id === activeAgentTemplateId) ?? null,
    [agentTemplates, activeAgentTemplateId],
  );

  const selectedConnectorProvider = useMemo(
    () => getConnectorProvider(singleConnectorId),
    [singleConnectorId],
  );

  const activeAgentTemplateCompatible = Boolean(
    activeAgentTemplate
    && selectedConnectorProvider
    && activeAgentTemplate.provider === selectedConnectorProvider,
  );

  const compatibleActiveAgentTemplate = activeAgentTemplateCompatible
    ? activeAgentTemplate
    : null;

  const maybePullOllamaModel = useCallback(async (connectorId, { force = false } = {}) => {
    const connector = getConnectorById(connectorId);
    if (!connector || connector.provider !== 'ollama') return;

    const meta = agentConnectors.find((entry) => entry.id === connectorId);
    if (!force && !connectorNeedsOllamaPull(meta, connectorId)) return;

    ollamaPullAbortRef.current?.abort();
    const controller = new AbortController();
    ollamaPullAbortRef.current = controller;

    setOllamaPullState({
      connectorId,
      status: 'pulling',
      progress: null,
      error: null,
    });

    try {
      await pullOllamaModel(connectorId, {
        signal: controller.signal,
        onProgress: (event) => {
          setOllamaPullState({
            connectorId,
            status: 'pulling',
            progress: event,
            error: null,
          });
        },
      });
      await refreshAgentConnectors();
      setOllamaPullState(null);
    } catch (e) {
      if (e?.name === 'AbortError') {
        setOllamaPullState(null);
        return;
      }
      setOllamaPullState({
        connectorId,
        status: 'error',
        progress: null,
        error: e?.message || 'Ollama pull failed',
      });
    } finally {
      if (ollamaPullAbortRef.current === controller) {
        ollamaPullAbortRef.current = null;
      }
    }
  }, [agentConnectors, refreshAgentConnectors]);

  const retryOllamaPull = useCallback(() => {
    const connectorId = ollamaPullState?.connectorId ?? singleConnectorId;
    void maybePullOllamaModel(connectorId, { force: true });
  }, [maybePullOllamaModel, ollamaPullState?.connectorId, singleConnectorId]);

  const handleSingleConnectorIdChange = useCallback((connectorId) => {
    const nextProvider = getConnectorProvider(connectorId);
    setSingleConnectorId(connectorId);
    persistAgentPanelUi({ connectorId });
    setActiveAgentTemplateId((current) => {
      const template = agentTemplates.find((entry) => entry.id === current);
      if (template && nextProvider && template.provider !== nextProvider) return null;
      return current;
    });
    void maybePullOllamaModel(connectorId);
  }, [agentTemplates, maybePullOllamaModel, persistAgentPanelUi]);

  const resolveThreadConnectorId = useCallback(
    (thread) => {
      if (!thread) return null;
      if (thread.connectorId && getConnectorById(thread.connectorId)) {
        return thread.connectorId;
      }
      const template = thread.agentTemplateId
        ? agentTemplates.find((entry) => entry.id === thread.agentTemplateId)
        : null;
      const provider = thread.provider || template?.provider || null;
      return provider ? getConnectorByProvider(provider)?.id ?? null : null;
    },
    [agentTemplates],
  );

  const syncPanelSelectionToThread = useCallback(
    (thread) => {
      if (!thread) return;
      const connectorId = resolveThreadConnectorId(thread);
      const provider = getConnectorProvider(connectorId || singleConnectorId);
      const templateId = thread.agentTemplateId ?? null;
      const template = templateId
        ? agentTemplates.find((entry) => entry.id === templateId) ?? null
        : null;

      if (connectorId && connectorId !== singleConnectorId) {
        setSingleConnectorId(connectorId);
      }

      if (templateId) {
        if (!template || !provider || template.provider === provider) {
          setActiveAgentTemplateId(templateId);
        }
        return;
      }

      setActiveAgentTemplateId(null);
    },
    [agentTemplates, resolveThreadConnectorId, singleConnectorId],
  );

  const activeAgentThread = useMemo(
    () => agentChatThreadIndex.threads.find((thread) => thread.threadId === activeThreadId) ?? null,
    [agentChatThreadIndex.threads, activeThreadId],
  );

  const threadAgentTemplate = useMemo(
    () =>
      activeAgentThread?.agentTemplateId
        ? agentTemplates.find((template) => template.id === activeAgentThread.agentTemplateId) ?? null
        : null,
    [activeAgentThread, agentTemplates],
  );

  const activeThreadAgentProvider =
    activeAgentThread?.provider
    || threadAgentTemplate?.provider
    || null;

  const activeThreadAgentTypeCompatible = Boolean(
    !activeThreadAgentProvider
    || !selectedConnectorProvider
    || activeThreadAgentProvider === selectedConnectorProvider,
  );

  const selectedAgentTypeDiffersFromThread = Boolean(
    activeAgentThread?.threadId
    && compatibleActiveAgentTemplate?.id
    && activeAgentThread.agentTemplateId !== compatibleActiveAgentTemplate.id,
  );

  const selectedThreadNeedsDefaultAgentType = Boolean(
    activeAgentThread?.threadId
    && !activeThreadAgentTypeCompatible
    && !compatibleActiveAgentTemplate,
  );

  useEffect(() => {
    if (!agentPanelOpen || agentPanelMode !== 'single') {
      agentPanelThreadSelectionSyncKeyRef.current = null;
      return;
    }
    if (!activeAgentThread?.threadId) return;

    const syncKey = [
      activeAgentThread.threadId,
      activeAgentThread.connectorId ?? '',
      activeAgentThread.agentTemplateId ?? '',
      activeAgentThread.provider ?? '',
      activeAgentThread.model ?? '',
      agentTemplates.map((template) => `${template.id}:${template.provider}`).join('|'),
    ].join('::');
    if (agentPanelThreadSelectionSyncKeyRef.current === syncKey) return;
    agentPanelThreadSelectionSyncKeyRef.current = syncKey;
    syncPanelSelectionToThread(activeAgentThread);
  }, [
    agentPanelOpen,
    agentPanelMode,
    activeAgentThread,
    agentTemplates,
    syncPanelSelectionToThread,
  ]);

  const handleSelectAgentTemplate = useCallback((templateId) => {
    const template = agentTemplates.find((entry) => entry.id === templateId);
    if (template?.provider && selectedConnectorProvider && template.provider !== selectedConnectorProvider) {
      setActiveAgentTemplateId(null);
      persistAgentPanelUi({ activeAgentTemplateId: null });
      return;
    }
    const nextId = templateId || null;
    setActiveAgentTemplateId(nextId);
    persistAgentPanelUi({ activeAgentTemplateId: nextId });
  }, [agentTemplates, persistAgentPanelUi, selectedConnectorProvider]);

  const handleAgentPanelCollapsedSectionsChange = useCallback((sections) => {
    setAgentPanelCollapsedSections(sections);
    persistAgentPanelUi({
      panelLayout: collapsedSectionsToFlowAgentPanelLayout(sections),
    });
  }, [persistAgentPanelUi]);

  const handleSaveAgentTemplate = useCallback(
    async (template, expectedRevision = 0) => {
      const data = await saveAgentTemplate(template, expectedRevision);
      const saved = data.template;
      if (saved?.id) {
        setAgentTemplates((current) => upsertAgentTemplateList(current, saved));
        setActiveAgentTemplateId(
          saved.provider === selectedConnectorProvider ? saved.id : null,
        );
      }
      await refreshAgentConnectors();
      return saved;
    },
    [refreshAgentConnectors, selectedConnectorProvider],
  );

  const handleDeleteAgentTemplate = useCallback(
    async (templateId) => {
      await deleteAgentTemplate(templateId);
      await refreshAgentConnectors();
      setActiveAgentTemplateId((current) => (current === templateId ? null : current));
    },
    [refreshAgentConnectors],
  );

  const handleImportMasterAgentTemplates = useCallback(async () => {
    const data = await importMasterAgentTemplates();
    await refreshAgentConnectors();
    const first = data.templates?.find((template) => template?.enabled) ?? data.templates?.[0];
    if (first?.id) setActiveAgentTemplateId(first.id);
    return data.templates ?? [];
  }, [refreshAgentConnectors]);

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
          agentTemplateId: threadMeta?.agentTemplateId ?? null,
          agentTypeLabel: threadMeta?.agentTypeLabel ?? null,
          model: threadMeta?.model ?? null,
          messages,
          artifactRef: meta.artifactRef,
          filename: meta.filename,
        });
        if (syncResult.ok) {
          setAgentChatArtifactSyncReason(null);
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
          }
          if (!syncResult.artifactRef) {
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
          setAgentChatArtifactSyncReason(resolveAgentChatSyncReason(syncResult.reason));
          if (isFolderWriteSyncReason(syncResult.reason)) {
            setSyncStatus({ error: strings.agent.agentChatTranscriptFolderWriteFailed });
            setTimeout(() => setSyncStatus(null), 5000);
          }
        }
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
        } else if (syncResult.ok) {
          const nextIndex = upsertThreadInIndex(agentChatThreadIndexRef.current, {
            ...threadMeta,
            threadId,
            updatedAt: Date.now(),
          });
          setAgentChatThreadIndex(nextIndex);
          saveThreadIndexLocal(projectId, connectorId, nextIndex);
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
      setSyncStatus,
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

    const meta = createThreadMeta({ connectorId, agentTemplate: compatibleActiveAgentTemplate });
    let index = upsertThreadInIndex(agentChatThreadIndexRef.current, meta);
    index = setActiveThreadInIndex(index, meta.threadId);
    saveThreadIndexLocal(projectId, connectorId, index);
    agentChatThreadIndexRef.current = index;
    setAgentChatThreadIndex(index);
    setActiveThreadId(meta.threadId);
    if (meta.agentTemplateId) setActiveAgentTemplateId(meta.agentTemplateId);
    persistWorkspaceAgentUiThread(meta.threadId, connectorId);
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
    compatibleActiveAgentTemplate,
    requestThreadTranscriptSync,
    ensureThreadChatCardOnCanvas,
    removeCardFromSelection,
    activeProjectIdRef,
    stagedSyncCardsRef,
    setActiveCardId,
    setTrayRevealActive,
    persistWorkspaceAgentUiThread,
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
      const thread = index.threads.find((entry) => entry.threadId === threadId);
      if (
        thread?.agentTemplateId
        && agentTemplates.some((template) => template.id === thread.agentTemplateId)
      ) {
        setActiveAgentTemplateId(thread.agentTemplateId);
      }
      saveThreadIndexLocal(projectId, connectorId, index);
      agentChatThreadIndexRef.current = index;
      setAgentChatThreadIndex(index);
      setActiveThreadId(threadId);
      setThreadPickerOpen(false);
      persistWorkspaceAgentUiThread(threadId, connectorId);
      await loadThreadSessionIntoState(projectId, connectorId, threadId);
    },
    [
      singleConnectorId,
      loadThreadSessionIntoState,
      requestThreadTranscriptSync,
      activeProjectIdRef,
      agentTemplates,
      persistWorkspaceAgentUiThread,
    ],
  );

  useEffect(() => {
    if (!activeProjectId) return undefined;
    if (!agentPanelOpen || embeddedAgentPanelOpen) return undefined;
    if (restoredWorkspaceAgentUiRef.current) return undefined;

    const pending = pendingWorkspaceThreadRestoreRef.current;
    if (!pending?.threadId) {
      restoredWorkspaceAgentUiRef.current = true;
      return undefined;
    }

    if (pending.connectorId && pending.connectorId !== singleConnectorId) {
      return undefined;
    }

    const threads = agentChatThreadIndex.threads;
    if (threads.length === 0) {
      if (threadPickerOpen) {
        restoredWorkspaceAgentUiRef.current = true;
        pendingWorkspaceThreadRestoreRef.current = null;
      }
      return undefined;
    }

    if (!threads.some((thread) => thread.threadId === pending.threadId)) {
      restoredWorkspaceAgentUiRef.current = true;
      pendingWorkspaceThreadRestoreRef.current = null;
      return undefined;
    }

    if (activeThreadId === pending.threadId) {
      restoredWorkspaceAgentUiRef.current = true;
      pendingWorkspaceThreadRestoreRef.current = null;
      return undefined;
    }

    restoredWorkspaceAgentUiRef.current = true;
    pendingWorkspaceThreadRestoreRef.current = null;
    void handleSelectAgentThread(pending.threadId);
    return undefined;
  }, [
    activeProjectId,
    agentPanelOpen,
    embeddedAgentPanelOpen,
    singleConnectorId,
    agentChatThreadIndex.threads,
    activeThreadId,
    threadPickerOpen,
    handleSelectAgentThread,
  ]);

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
    persistWorkspaceAgentUiThread(null, connectorId);
    setAgentChatMessages([]);
    setThreadPickerOpen(true);
    agentChatArtifactMetaRef.current = {
      artifactRef: null,
      filename: null,
      relativePath: null,
      cardId: null,
    };
    setAgentChatArtifactRef(null);
  }, [singleConnectorId, activeProjectIdRef, stateRef, setState, persistWorkspaceAgentUiThread]);

  const handleRetryChatSync = useCallback(async () => {
    if (!agentChatMessages.length || chatSyncRetrying) return;
    setChatSyncRetrying(true);
    try {
      const result = await requestThreadTranscriptSync(agentChatMessages);
      if (result?.ok) {
        setSyncStatus({ toast: strings.agent.agentChatRetrySuccess });
        setTimeout(() => setSyncStatus(null), 2500);
      } else if (result?.reason !== 'skipped') {
        const message = (
          result?.reason === 'folder_write_denied'
          || result?.reason === 'folder_write_failed'
        )
          ? strings.agent.agentChatRetryFolderFailed
          : strings.agent.agentChatRetryFailed;
        setSyncStatus({ error: message });
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

      const ui = readAgentPanelUiState(activeProjectId);
      let preferredThreadId = index?.activeThreadId ?? null;
      if (
        ui.activeThreadId
        && ui.connectorId === singleConnectorId
        && index?.threads?.some((thread) => thread.threadId === ui.activeThreadId)
      ) {
        preferredThreadId = ui.activeThreadId;
      }

      if (!preferredThreadId) {
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

      if (preferredThreadId !== index.activeThreadId) {
        const nextIndex = setActiveThreadInIndex(index, preferredThreadId);
        saveThreadIndexLocal(activeProjectId, singleConnectorId, nextIndex);
        agentChatThreadIndexRef.current = nextIndex;
        setAgentChatThreadIndex(nextIndex);
      }

      setActiveThreadId(preferredThreadId);
      setThreadPickerOpen(false);
      await loadThreadSessionIntoState(
        activeProjectId,
        singleConnectorId,
        preferredThreadId,
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

  const loadAgentChatContextText = useCallback(
    async (card) => {
      if (!card || card.type !== 'agent_chat') return null;
      const projectId = activeProjectIdRef.current;
      if (!projectId) return null;

      const filename = card.versions?.[0]?.filename;
      const inferredConnectorId = connectorIdFromAgentChatFilename(filename);
      const connectorIds = [
        inferredConnectorId,
        singleConnectorId,
        ...CONNECTORS.map((connector) => connector.id),
      ].filter(Boolean);
      const uniqueConnectorIds = [...new Set(connectorIds)];

      for (const connectorId of uniqueConnectorIds) {
        const index = connectorId === singleConnectorId
          ? agentChatThreadIndexRef.current
          : await loadThreadIndex(projectId, connectorId);
        const thread = resolveThreadForCard(index, card, connectorId);
        if (!thread?.threadId) continue;
        const session = await loadAgentChatSession(projectId, connectorId, thread.threadId);
        if (!session?.messages?.length) continue;
        const connector = getConnectorById(connectorId);
        return formatAgentChatTranscript(session.messages, {
          projectName: stateProjectName,
          connectorId,
          connectorLabel: connector?.label ?? connectorId,
          threadId: thread.threadId,
          title: thread.title ?? session.title ?? card.name,
          agentTemplateId: thread.agentTemplateId ?? null,
          agentTypeLabel: thread.agentTypeLabel ?? null,
          provider: thread.provider ?? connector?.provider ?? null,
          model: thread.model ?? null,
        });
      }

      return null;
    },
    [activeProjectIdRef, singleConnectorId, stateProjectName],
  );

  const defaultLoadFlowContextText = useCallback(async (card) => {
    if (!card || card.type !== 'flow') return null;
    const pinned = getPinnedVersion(card);
    if (!pinned) return null;
    const flowId = pinned.flowId ?? pinned.artifactRef?.id;
    if (flowId) {
      try {
        const flow = await fetchFlow(flowId);
        return formatFlowDiagramForAgent(
          { title: flow.title, description: flow.description },
          flow.nodes ?? [],
          flow.edges ?? [],
        );
      } catch {
        /* fall through to embedded preview */
      }
    }
    if (pinned.flowPreview) {
      const graph = flowGraphFromPreview(pinned.flowPreview);
      return formatFlowDiagramForAgent(
        { title: card.name, description: pinned.flowPreview.description },
        graph.nodes,
        graph.edges,
      );
    }
    return null;
  }, []);

  const loadFlowContextText = useCallback(async (card) => {
    if (flowContextLoaderRef.current) {
      const custom = await flowContextLoaderRef.current(card);
      if (custom != null) return custom;
    }
    return defaultLoadFlowContextText(card);
  }, [defaultLoadFlowContextText]);

  const loadLiveContextText = useCallback(async (card) => {
    const { text } = await fetchLiveFeedContext(card);
    return text;
  }, []);

  const registerFlowContextLoader = useCallback((loader) => {
    flowContextLoaderRef.current = loader;
  }, []);

  const [hydratedAgentContextCards, setHydratedAgentContextCards] = useState([]);

  useEffect(() => {
    if (!agentPanelOpen || agentPanelMode !== 'single' || !agentContextCards.length) {
      setHydratedAgentContextCards(agentContextCards);
      return undefined;
    }
    setHydratedAgentContextCards(agentContextCards);
    let cancelled = false;
    void hydrateLiveContextCards(agentContextCards).then((hydrated) => {
      if (!cancelled) setHydratedAgentContextCards(hydrated);
    });
    return () => {
      cancelled = true;
    };
  }, [agentPanelOpen, agentPanelMode, agentContextCards]);

  const effectiveAgentContextCards = hydratedAgentContextCards;

  useEffect(() => {
    if (!agentPanelOpen || agentPanelMode !== 'single') {
      setAgentContextEstimates([]);
      return undefined;
    }
    const cards = effectiveAgentContextCards;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const profile = agentExtendedContext ? 'extended' : 'standard';
      try {
        const estimates = await estimateContextDocuments(cards, {
          folderHandle,
          loadAgentChatText: loadAgentChatContextText,
          loadFlowContextText,
          loadLiveContextText,
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
    effectiveAgentContextCards,
    folderHandle,
    loadAgentChatContextText,
    loadFlowContextText,
    loadLiveContextText,
  ]);

  const contextDeliveryState = useMemo(() => {
    if (!agentPanelOpen || agentPanelMode !== 'single') {
      return { sentKeys: new Set(), pendingAdd: [], pendingRemove: [], stable: [] };
    }
    return computeContextDeliveryState(agentContextRegistryRef.current, effectiveAgentContextCards);
  }, [agentPanelOpen, agentPanelMode, effectiveAgentContextCards, agentChatMessages.length]);

  const agentContextDeliveryByCardId = useMemo(() => {
    const folderLinked = Boolean(folderHandle);
    const registry = agentContextRegistryRef.current;
    return Object.fromEntries(
      effectiveAgentContextCards.map((c) => [
        c.id,
        getContextDeliveryStatus(c, registry, { folderLinked }),
      ]),
    );
  }, [effectiveAgentContextCards, folderHandle, contextDeliveryState]);

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

  const handleApplyAgentTypeToActiveThread = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    const connectorId = singleConnectorId;
    const thread = activeAgentThread;
    const template = compatibleActiveAgentTemplate;
    if (!projectId || !connectorId || !thread?.threadId || !template?.id) return;
    if (thread.agentTemplateId === template.id) return;

    const ok = window.confirm(
      `Change Agent Type for this thread from ${thread.agentTypeLabel || defaultAgentTypeLabelForProvider(selectedConnectorProvider)} to ${template.label}? Future replies in this thread will use the new Agent Type.`,
    );
    if (!ok) return;

    const at = Date.now();
    const changeMsg = createAgentTypeChangeMessage({
      fromThread: thread,
      toTemplate: template,
      at,
      fromDefaultLabel: defaultAgentTypeLabelForProvider(selectedConnectorProvider),
      toDefaultLabel: defaultAgentTypeLabelForProvider(selectedConnectorProvider),
    });
    const nextThread = applyAgentTypeToThread(thread, template);
    const nextIndex = upsertThreadInIndex(agentChatThreadIndexRef.current, nextThread);
    agentChatThreadIndexRef.current = nextIndex;
    setAgentChatThreadIndex(nextIndex);
    await saveThreadIndexLocal(projectId, connectorId, nextIndex, { awaitRemote: true });

    const nextMessages = [...agentChatMessagesRef.current, changeMsg];
    setAgentChatMessages(nextMessages);
    await requestThreadTranscriptSync(nextMessages, { reason: 'agentTypeChange' });
    setSyncStatus({ toast: `Agent Type changed to ${template.label} for this thread.` });
    setTimeout(() => setSyncStatus(null), 3000);
  }, [
    compatibleActiveAgentTemplate,
    activeAgentThread,
    activeProjectIdRef,
    singleConnectorId,
    selectedConnectorProvider,
    requestThreadTranscriptSync,
    setSyncStatus,
  ]);

  const handleUseDefaultAgentTypeForActiveThread = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    const connectorId = singleConnectorId;
    const thread = activeAgentThread;
    const defaultLabel = defaultAgentTypeLabelForProvider(selectedConnectorProvider);
    if (!projectId || !connectorId || !thread?.threadId) return;
    if (!thread.agentTemplateId && !thread.provider && !thread.model) return;

    const ok = window.confirm(
      `Change Agent Type for this thread from ${thread.agentTypeLabel || defaultLabel} to ${defaultLabel}? Future replies in this thread will use the selected agent.`,
    );
    if (!ok) return;

    const at = Date.now();
    const changeMsg = createAgentTypeChangeMessage({
      fromThread: thread,
      toTemplate: null,
      at,
      fromDefaultLabel: defaultLabel,
      toDefaultLabel: defaultLabel,
    });
    const nextThread = clearAgentTypeFromThread(thread);
    const nextIndex = upsertThreadInIndex(agentChatThreadIndexRef.current, nextThread);
    agentChatThreadIndexRef.current = nextIndex;
    setAgentChatThreadIndex(nextIndex);
    await saveThreadIndexLocal(projectId, connectorId, nextIndex, { awaitRemote: true });

    const nextMessages = [...agentChatMessagesRef.current, changeMsg];
    setAgentChatMessages(nextMessages);
    await requestThreadTranscriptSync(nextMessages, { reason: 'agentTypeDefault' });
    setActiveAgentTemplateId(null);
    setSyncStatus({ toast: `Agent Type changed to ${defaultLabel} for this thread.` });
    setTimeout(() => setSyncStatus(null), 3000);
  }, [
    activeAgentThread,
    activeProjectIdRef,
    singleConnectorId,
    selectedConnectorProvider,
    requestThreadTranscriptSync,
    setSyncStatus,
  ]);

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

      if (!activeThreadAgentTypeCompatible) {
        setAgentChatError(
          strings.agent.threadAgentTypeIncompatible(
            defaultAgentTypeLabelForProvider(selectedConnectorProvider),
          ),
        );
        return;
      }

      const threadTemplate = threadAgentTemplate;
      const hasThreadTemplate = Boolean(
        threadTemplate?.id
        && threadTemplate.provider === selectedConnectorProvider,
      );
      const selectedTemplate = compatibleActiveAgentTemplate;
      const resolvedTemplateId =
        threadTemplate?.id
        ?? (!activeAgentThread?.agentTemplateId ? selectedTemplate?.id : null)
        ?? selectedTemplate?.id
        ?? null;
      const resolvedAgentTypeLabel =
        (hasThreadTemplate ? activeAgentThread?.agentTypeLabel : null)
        || threadTemplate?.label
        || selectedTemplate?.label
        || null;
      const resolvedProvider =
        (hasThreadTemplate ? activeAgentThread?.provider : null)
        || threadTemplate?.provider
        || selectedTemplate?.provider
        || selectedConnectorProvider;
      const resolvedModel =
        (hasThreadTemplate ? activeAgentThread?.model : null)
        || threadTemplate?.model
        || selectedTemplate?.model
        || null;
      const provider = resolvedProvider;
      const connectorId = singleConnectorId;
      if (!provider) return;

      const registry = agentContextRegistryRef.current;
      const hydratedContextCards = await hydrateLiveContextCards(contextCards);
      const diff = diffContextRegistry(registry, hydratedContextCards);
      const profile = agentExtendedContext ? 'extended' : 'standard';
      const systemContext = MINIMAL_AGENT_SYSTEM_CONTEXT;

      setAgentChatLoading(true);
      setAgentChatError(null);
      setAgentLastTokenEstimate(null);

      let userMsg = null;
      let optimisticIds = null;
      const rollbackOptimisticMessages = () => {
        if (!optimisticIds?.size) return;
        const next = agentChatMessagesRef.current.filter((m) => !optimisticIds.has(m.id));
        setAgentChatMessages(next);
        agentChatMessagesRef.current = next;
      };
      try {
        let addDocuments = [];
        if (diff.added.length) {
          const cardsForContextLoad = await (async () => {
            const projectId = activeProjectIdRef.current;
            if (!folderHandle || !projectId) return diff.added;
            const cardById = new Map(
              stateRef.current.cards.map((canvasCard) => [canvasCard.id, canvasCard]),
            );
            const prepared = [];
            const patchedCards = [];
            for (const ctxCard of diff.added) {
              let card = cardById.get(ctxCard.id) ?? ctxCard;
              const pinned = getPinnedVersion(card);
              if (pinned?.artifactRef?.id || !pinned?.filename) {
                prepared.push(card);
                continue;
              }
              const ensured = await ensureCardArtifactRef({
                projectId,
                projectName: stateRef.current.projectName ?? stateProjectName,
                folderHandle,
                card,
              });
              if (!ensured.ok) {
                prepared.push(card);
                continue;
              }
              const nextCard = {
                ...card,
                versions: card.versions.map((version) =>
                  version.version === ensured.version.version
                    ? { ...version, ...ensured.version }
                    : version,
                ),
              };
              prepared.push(nextCard);
              patchedCards.push(nextCard);
            }
            if (patchedCards.length) {
              const patchById = new Map(patchedCards.map((canvasCard) => [canvasCard.id, canvasCard]));
              const nextCards = stateRef.current.cards.map(
                (canvasCard) => patchById.get(canvasCard.id) ?? canvasCard,
              );
              stateRef.current = { ...stateRef.current, cards: nextCards };
              setState((prev) => ({
                ...prev,
                cards: prev.cards.map(
                  (canvasCard) => patchById.get(canvasCard.id) ?? canvasCard,
                ),
              }));
            }
            return prepared;
          })();
          const rawDocuments = await buildContextDocuments(cardsForContextLoad, {
            folderHandle,
            loadAgentChatText: loadAgentChatContextText,
            loadFlowContextText,
            loadLiveContextText,
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
        const optimisticMessages = [...agentChatMessages, ...outgoingMessages];
        optimisticIds = new Set(outgoingMessages.map((m) => m.id));
        setAgentChatMessages(optimisticMessages);
        agentChatMessagesRef.current = optimisticMessages;
        const hydrateOpts = {
          cards: stateRef.current.cards,
          folderHandle,
          contextMode: mode,
          profile,
          loadAgentChatText: loadAgentChatContextText,
          loadFlowContextText,
          loadLiveContextText,
        };
        const historyForApi = await buildApiMessageHistoryAsync(
          optimisticMessages,
          hydrateOpts,
        );

        const activeConnector = mergeConnectorMeta(
          getConnectorById(connectorId),
          agentConnectors.find((entry) => entry.id === connectorId),
        );
        if (
          imagesUnsupportedForConnector(
            connectorId,
            apiMessagesIncludeImages(historyForApi),
            activeConnector,
          )
        ) {
          setAgentChatError(
            strings.agent.contextImagesUnsupported(activeConnector?.label || 'This agent'),
          );
          rollbackOptimisticMessages();
          return;
        }

        try {
          const estimate = await estimateAgentChat({
            provider,
            connectorId,
            messages: historyForApi,
            systemContext,
            templateId: resolvedTemplateId,
          });
          setAgentLastTokenEstimate(estimate);
          if (estimate.inputTokens > AGENT_TOKEN_CONFIRM_THRESHOLD) {
            const ok = window.confirm(
              strings.agent.contextLargeTokenConfirm(
                estimate.inputTokens,
                estimate.estimatedInputUsd ?? 0,
              ),
            );
            if (!ok) {
              rollbackOptimisticMessages();
              return;
            }
          }
        } catch {
          /* estimate is optional */
        }

        const { reply } = await sendAgentChat({
          provider,
          connectorId,
          messages: historyForApi,
          systemContext,
          templateId: resolvedTemplateId,
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
          agentTemplateId: resolvedTemplateId,
          agentTypeLabel: resolvedAgentTypeLabel,
          provider,
          model: resolvedModel,
        };
        const finalMessages = [...optimisticMessages, assistantMsg];
        setAgentChatMessages(finalMessages);
        agentChatMessagesRef.current = finalMessages;
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
        rollbackOptimisticMessages();
        if (optimisticIds?.size) {
          void requestThreadTranscriptSync(agentChatMessagesRef.current, {
            reason: 'chatTurnFailed',
          });
        }
        setAgentChatError(e.message || strings.agent.chatError);
      } finally {
        setAgentChatLoading(false);
      }
    },
    [
      compatibleActiveAgentTemplate,
      activeAgentThread,
      activeThreadAgentTypeCompatible,
      threadAgentTemplate,
      agentPanelMode,
      singleConnectorId,
      agentConnectors,
      selectedConnectorProvider,
      agentChatMessages,
      folderHandle,
      loadAgentChatContextText,
      loadFlowContextText,
      loadLiveContextText,
      agentExtendedContext,
      requestThreadTranscriptSync,
      stateRef,
      stateProjectName,
      setState,
      setSyncStatus,
    ],
  );

  const handleAgentChatCardActivate = useCallback(
    async (card) => {
      if (!card || card.type !== 'agent_chat') return;
      const projectId = activeProjectIdRef.current;
      if (!projectId) return;

      let connectorId = singleConnectorId;
      let index = agentChatThreadIndexRef.current;
      let thread = connectorId
        ? resolveThreadForCard(index, card, connectorId)
        : null;

      const inferredConnectorId = connectorIdFromAgentChatCard(card);
      if (
        (!thread?.threadId || inferredConnectorId !== connectorId)
        && inferredConnectorId
      ) {
        connectorId = inferredConnectorId;
        index = await loadThreadIndex(projectId, connectorId);
        thread = resolveThreadForCard(index, card, connectorId);
        if (thread?.threadId) {
          setSingleConnectorId(connectorId);
          singleConnectorIdRef.current = connectorId;
          agentChatThreadIndexRef.current = index;
          setAgentChatThreadIndex(index);
        }
      }

      if (!thread?.threadId || !connectorId) return;
      setAgentPanelOpen(true);
      if (connectorId === singleConnectorId) {
        await handleSelectAgentThread(thread.threadId);
        return;
      }

      const nextIndex = setActiveThreadInIndex(index, thread.threadId);
      saveThreadIndexLocal(projectId, connectorId, nextIndex);
      agentChatThreadIndexRef.current = nextIndex;
      setAgentChatThreadIndex(nextIndex);
      setActiveThreadId(thread.threadId);
      setThreadPickerOpen(false);
      await loadThreadSessionIntoState(projectId, connectorId, thread.threadId);
    },
    [
      singleConnectorId,
      singleConnectorIdRef,
      activeProjectIdRef,
      handleSelectAgentThread,
      loadThreadSessionIntoState,
    ],
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
    setSingleConnectorId: handleSingleConnectorIdChange,
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
    handleRefreshContextSession,
    handleRemoveContextCard,
    handleAgentSendMessage,
    handleAgentChatCardActivate,
    showAgentComingSoon,
    agentContextCards: effectiveAgentContextCards,
    contextDeliveryState,
    agentContextDeliveryByCardId,
    agentChatLiveCardId,
    clusterMemberOptions,
    agentChatArtifactMetaRef,
    getContextLimits,
    registerFlowContextLoader,
    loadFlowContextText,
    agentPanelCollapsedSections,
    handleAgentPanelCollapsedSectionsChange,
    chatScrollResetKey,
  };
}
