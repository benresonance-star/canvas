import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAgentHealth, listAgentConnectors, sendAgentChat } from '../../../lib/agentApi.js';
import { DEFAULT_SINGLE_CONNECTOR_ID, getConnectorById } from '../../../lib/agentConnectors.js';
import { getFileHandleAtPath } from '../../../lib/folderWrite.js';
import { createIndexedDbBimRepository } from '../bim-core/bimRepository.js';
import {
  draftBqlFromNaturalLanguage,
  maybeClarifyBimStoreyReference,
  resolveBimStoreyClarificationAnswer,
} from '../bim-core/bimAgent.js';
import {
  BIM_LLM_AGENT_SYSTEM_CONTEXT,
  buildBimLlmAgentRepairPrompt,
  buildBimLlmAgentUserPrompt,
  compactBimModelSummaryForAgent,
  parseBimLlmAgentReply,
  summarizeBimModelForAgent,
} from '../bim-core/bimLlmAgent.js';
import { executeBqlQuery } from '../bim-core/bql.js';
import {
  applySemanticResolutionToBql,
  buildSemanticModelVocabulary,
  resolveBimQuestionSemantics,
} from '../bim-core/bimSemanticResolver.js';
import { prepareBimModel } from '../bim-core/prepareBimModel.js';
import { logBimPickWarning } from '../bim-core/bimPickDebug.js';
import { findPreparedElementByGlobalId } from '../bim-core/fragmentsSelection.js';
import { applyBimSessionViewerDefaults, applyBimViewerDefaults, normalizeBimWorkspaceSession, normalizeBimWorkspaceState, normalizeLayersHudHeight, normalizeLayersHudStoreysHeight, normalizeLeftPanelWidth, normalizeRightPanelWidth } from '../bim-core/types.js';
import { applyBimStyleSettings, extractBimStyleSettings } from '../bim-core/bimStyleSettings.js';
import { getClayPresetWorkspacePatch } from '../bim-core/bimClayRender.js';
import { createBimResultSetFromElements } from '../bim-core/bimResultSets.js';
import {
  createBim4dSequence,
  createBim4dTask,
  resolveBim4dTaskElementIds,
} from '../bim-core/bim4d.js';
import { createBim5dCostPlan } from '../bim-core/bim5d.js';
import { requestActionSync } from '../../../lib/actionSync.js';
import { isEmptyBimViewerVersion, useBimModelSource } from '../hooks/useBimModelSource.js';
import { useBimAgentPanel } from '../hooks/useBimAgentPanel.js';
import { useBimBqlPanel } from '../hooks/useBimBqlPanel.js';
import { useBimViewSets } from '../hooks/useBimViewSets.js';
import { LOCAL_BIM_RULES_RESPONDER_ID } from './bimAgentPanelShared.js';
import { BimElementTable } from './BimElementTable.jsx';
import { BimInspector } from './BimInspector.jsx';
import { BimFloatingSidePanel } from './BimFloatingSidePanel.jsx';
import { BimViewport } from './BimViewport.jsx';
import BimFileToolbarControls from './BimFileToolbarControls.jsx';
import { BIM_VIEWPORT_TOOLBAR_SURFACE_CLASS } from '../bim-core/bimViewportLayout.js';

const PHASE_LABELS = {
  preparing: 'Preparing model',
  converting_ifc: 'Converting IFC',
  extracting_properties: 'Extracting properties and relationships',
  building_index: 'Building BIM index',
  ready: 'Ready',
};

const API_OFFLINE_PROVIDER_MESSAGE =
  'Canvas API offline. Start with npm run dev:stack or npm run server.';
const BIM_AGENT_CHAT_TIMEOUT_MS = 120_000;

function validationWarningsForResult(result) {
  return result?.warnings ?? [];
}

function classifyAgentProviderError(error) {
  const message = error?.message || 'Provider unavailable.';
  if (/cannot reach the canvas api/i.test(message)) {
    return {
      status: 'apiOffline',
      message: API_OFFLINE_PROVIDER_MESSAGE,
      didProviderRun: false,
    };
  }
  if (/timed out/i.test(message) || error?.kind === 'timeout') {
    return {
      status: 'timeout',
      message: `Provider timed out. Gemma 26B can take longer than ${Math.round(BIM_AGENT_CHAT_TIMEOUT_MS / 1000)} seconds for BIM questions.`,
      didProviderRun: true,
    };
  }
  if (/cannot reach ollama/i.test(message)) {
    return {
      status: 'ollamaOffline',
      message: 'Ollama offline. Start Ollama on localhost:11434.',
      didProviderRun: false,
    };
  }
  if (/not pulled/i.test(message)) {
    return {
      status: 'modelMissing',
      message,
      didProviderRun: false,
    };
  }
  if (/no reply from ollama/i.test(message)) {
    return {
      status: 'providerNoReply',
      message: 'Ollama returned no reply; local rules answered where possible.',
      didProviderRun: true,
    };
  }
  return {
    status: 'providerFailed',
    message,
    didProviderRun: true,
  };
}

function BimExtractionFeed({ events }) {
  const visibleEvents = events.slice(-8);
  if (visibleEvents.length === 0) return null;
  return (
    <div className="mt-4 w-[min(36rem,90vw)] rounded border border-border bg-surface/95 text-left shadow-sm">
      <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted">
        Live extraction feed
      </div>
      <div className="max-h-44 overflow-auto px-3 py-2 space-y-1">
        {visibleEvents.map((event) => (
          <div key={event.id} className="grid grid-cols-[4.5rem_1fr] gap-2 text-xs">
            <span className="text-[10px] uppercase tracking-wider text-muted">{event.kind}</span>
            <span className="text-secondary">
              {event.message}
              {Number.isFinite(event.current) && Number.isFinite(event.total) ? ` (${event.current}/${event.total})` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const BIM_STYLE_SYNC_DEBOUNCE_MS = 800;

async function sha256Hex(arrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function bimSourceStorageKey(sourceFileHash) {
  return `bim-source:${sourceFileHash}`;
}

async function arrayBufferFromStoredModelSource(source) {
  if (!source) return null;
  if (source.arrayBuffer instanceof ArrayBuffer) return source.arrayBuffer.slice(0);
  if (source.blob?.arrayBuffer) return source.blob.arrayBuffer();
  return null;
}

function chooseExistingModelForImportedFile(session, file, sourceFileHash) {
  const refs = session?.modelRefs ?? [];
  const sameHash = refs.find((ref) => ref.sourceFileHash === sourceFileHash);
  if (sameHash) return { action: 'activate', ref: sameHash };
  const sameName = refs.find((ref) => ref.sourceName === file.name || ref.label === file.name);
  if (!sameName) return { action: 'add', ref: null };
  const updateExisting = window.confirm(
    `A file named "${file.name}" is already loaded, but the selected file is different. Click OK to update the existing file, or Cancel to add it as a new file.`,
  );
  return updateExisting ? { action: 'update', ref: sameName } : { action: 'add', ref: sameName };
}

function applyCardUpdate(onUpdateCard, cardId, updates) {
  if (!onUpdateCard || !cardId) return;
  if (onUpdateCard.length >= 2) {
    onUpdateCard(cardId, updates);
  } else {
    onUpdateCard(updates);
  }
}

export function BimWorkspace({
  card,
  version,
  folderHandle = null,
  projectId = null,
  onUpdateCard = null,
}) {
  const resolvedProjectId = projectId ?? card?.projectId ?? null;
  const isSessionViewer = isEmptyBimViewerVersion(version);
  const source = useBimModelSource(version, { folderHandle });
  const versionRef = useRef(version);
  versionRef.current = version;
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) repositoryRef.current = createIndexedDbBimRepository();
  const [phase, setPhase] = useState('preparing');
  const [cacheStatus, setCacheStatus] = useState('preparing');
  const [error, setError] = useState(null);
  const [prepared, setPrepared] = useState(null);
  const [preparedByModelId, setPreparedByModelId] = useState({});
  const [fingerprint, setFingerprint] = useState(null);
  const loadedFingerprintRef = useRef(null);
  const [workspaceState, setWorkspaceState] = useState(() => (
    isSessionViewer
      ? applyBimSessionViewerDefaults({
        ...(version?.bim?.workspaceState ?? {}),
        session: version?.bim?.session,
        ...(version?.bim?.styleSettings ?? {}),
      })
      : applyBimViewerDefaults({
        ...(version?.bim?.workspaceState ?? {}),
        session: version?.bim?.session,
        ...(version?.bim?.styleSettings ?? {}),
      })
  ));
  const [importBusy, setImportBusy] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const sourceUpdatePromptedRef = useRef(new Set());
  const styleSyncTimerRef = useRef(null);
  const [extractionFeed, setExtractionFeed] = useState([]);
  const [queryResult, setQueryResult] = useState(null);
  const [semanticAliasMemory, setSemanticAliasMemory] = useState({});
  const [prepRunId, setPrepRunId] = useState(0);
  const [agentRunState, setAgentRunState] = useState({
    status: 'idle',
    message: null,
    model: null,
    responderLabel: null,
  });
  const [agentProviderState, setAgentProviderState] = useState({
    status: 'checking',
    message: 'Checking Canvas API.',
    health: null,
    connectors: [],
    secretsConfigured: false,
  });

  const styleSettings = useMemo(
    () => extractBimStyleSettings(workspaceState),
    [
      workspaceState.renderStyle,
      workspaceState.displayMode,
      workspaceState.isolateOnSelect,
      workspaceState.viewportBackgroundColor,
      workspaceState.wireframeMode,
      workspaceState.wireframeLineWeight,
      workspaceState.wireframeOpacity,
      workspaceState.wireframeColor,
      workspaceState.wireframeHiddenLines,
      workspaceState.clayAoIntensity,
      workspaceState.clayAoRadius,
      workspaceState.clayAoBias,
      workspaceState.clayAoDistance,
      workspaceState.clayAoSamples,
      workspaceState.clayAoResolution,
      workspaceState.clayLightIntensity,
      workspaceState.claySurfaceColor,
      workspaceState.clayGlassOpacity,
      workspaceState.clayOriginalColorBlend,
      workspaceState.showEnvironment,
      workspaceState.lightingMode,
      workspaceState.environmentPreset,
    ],
  );

  const patchVersionBim = useCallback((bimPatch) => {
    if (!card?.id || !version?.version || !onUpdateCard) return;
    const nextBim = {
      ...(version.bim ?? {}),
      ...bimPatch,
    };
    applyCardUpdate(onUpdateCard, card.id, {
      versions: (card.versions ?? []).map((candidate) => (
        candidate.version === version.version
          ? { ...candidate, bim: nextBim }
          : candidate
      )),
    });
  }, [card, onUpdateCard, version]);

  const scheduleStyleSync = useCallback(() => {
    if (!resolvedProjectId) return;
    if (styleSyncTimerRef.current) {
      clearTimeout(styleSyncTimerRef.current);
    }
    styleSyncTimerRef.current = setTimeout(() => {
      styleSyncTimerRef.current = null;
      void requestActionSync('structuralChange', { projectId: resolvedProjectId });
    }, BIM_STYLE_SYNC_DEBOUNCE_MS);
  }, [resolvedProjectId]);

  const persistSession = useCallback((nextSession) => {
    if (!isSessionViewer) return;
    patchVersionBim({ session: nextSession });
    scheduleStyleSync();
  }, [isSessionViewer, patchVersionBim, scheduleStyleSync]);

  useEffect(() => () => {
    if (styleSyncTimerRef.current) {
      clearTimeout(styleSyncTimerRef.current);
    }
  }, []);

  const lastPersistedStyleRef = useRef(JSON.stringify(styleSettings));

  useEffect(() => {
    if (!onUpdateCard || !card?.id) return undefined;
    const serialized = JSON.stringify(styleSettings);
    if (serialized === lastPersistedStyleRef.current) return undefined;
    const timer = window.setTimeout(() => {
      lastPersistedStyleRef.current = serialized;
      patchVersionBim({ styleSettings });
      scheduleStyleSync();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    card?.id,
    onUpdateCard,
    patchVersionBim,
    scheduleStyleSync,
    styleSettings,
  ]);

  const appendExtractionEvent = (event) => {
    setExtractionFeed((feed) => [
      ...feed.slice(-59),
      {
        id: `${Date.now()}:${feed.length}`,
        kind: event.kind ?? 'info',
        message: event.message ?? String(event),
        current: event.current ?? null,
        total: event.total ?? null,
      },
    ]);
  };

  useEffect(() => {
    const contentHash = version?.content_hash;
    if (isSessionViewer) return undefined;
    if (!source.arrayBuffer || !contentHash) return undefined;
    let cancelled = false;
    async function run() {
      setError(null);
      setExtractionFeed([]);
      try {
        const result = await prepareBimModel({
          arrayBuffer: source.arrayBuffer,
          version: versionRef.current,
          repository: repositoryRef.current,
          onPhase: (nextPhase) => {
            if (!cancelled) setPhase(nextPhase);
          },
          onProgress: (event) => {
            if (!cancelled) appendExtractionEvent(event);
          },
        });
        if (cancelled) return;
        if (loadedFingerprintRef.current === result.fingerprint) {
          return;
        }
        const savedState = await repositoryRef.current.getWorkspaceState(result.fingerprint);
        if (cancelled) return;
        loadedFingerprintRef.current = result.fingerprint;
        setPrepared(result.preparedModel);
        setSemanticAliasMemory({});
        setCacheStatus(result.reused ? 'loaded_cache' : 'prepared');
        setWorkspaceState(() => applyBimViewerDefaults({
          ...(savedState ?? {}),
          ...(versionRef.current?.bim?.styleSettings ?? {}),
          lastOpenedAt: new Date().toISOString(),
        }));
        setFingerprint(result.fingerprint);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Could not prepare BIM model');
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [isSessionViewer, prepRunId, source.arrayBuffer, version?.content_hash]);

  useEffect(() => {
    if (!isSessionViewer) return undefined;
    let cancelled = false;
    async function restoreSessionModels() {
      let session = normalizeBimWorkspaceSession(versionRef.current?.bim?.session ?? workspaceState.session);
      if (session.modelRefs.length === 0) return;
      const restoredModels = {};
      let activePrepared = null;
      let activeFingerprint = null;
      let changed = false;

      for (const ref of session.modelRefs) {
        if (cancelled) return;
        if (ref.status === 'removed') continue;
        let preparedModel = ref.fingerprint
          ? await repositoryRef.current.getPreparedModel(ref.fingerprint)
          : null;
        if (!preparedModel && ref.sourceStorageKey) {
          const sourceRecord = await repositoryRef.current.getModelSource?.(ref.sourceStorageKey);
          const arrayBuffer = await arrayBufferFromStoredModelSource(sourceRecord);
          if (arrayBuffer) {
            const preparingAt = new Date().toISOString();
            session = normalizeBimWorkspaceSession({
              ...session,
              modelRefs: session.modelRefs.map((entry) => (
                entry.modelId === ref.modelId
                  ? { ...entry, status: 'preparing', updatedAt: preparingAt }
                  : entry
              )),
              updatedAt: preparingAt,
            });
            if (!cancelled) {
              setWorkspaceState((state) => normalizeBimWorkspaceState({ ...state, session }));
              persistSession(session);
            }
            const result = await prepareBimModel({
              arrayBuffer,
              version: {
                ...(versionRef.current ?? {}),
                content_hash: ref.sourceFileHash,
                filename: ref.sourceName,
                size: ref.sourceSize ?? arrayBuffer.byteLength,
                relativePath: ref.sourcePath ?? null,
              },
              repository: repositoryRef.current,
              onPhase: (nextPhase) => {
                if (!cancelled) setPhase(nextPhase);
              },
              onProgress: (event) => {
                if (!cancelled) appendExtractionEvent(event);
              },
            });
            preparedModel = result.preparedModel;
            const readyAt = new Date().toISOString();
            session = normalizeBimWorkspaceSession({
              ...session,
              modelRefs: session.modelRefs.map((entry) => (
                entry.modelId === ref.modelId
                  ? {
                      ...entry,
                      fingerprint: result.fingerprint,
                      preparedModelKey: result.fingerprint,
                      status: 'ready',
                      sourceStatus: 'current',
                      updatedAt: readyAt,
                    }
                  : entry
              )),
              updatedAt: readyAt,
            });
            changed = true;
          }
        }
        if (preparedModel) {
          restoredModels[ref.modelId] = preparedModel;
          if (ref.modelId === session.activeModelId) {
            activePrepared = preparedModel;
            activeFingerprint = preparedModel.metadata?.fingerprint ?? ref.fingerprint;
          }
        } else if (ref.sourceStorageKey) {
          const failedAt = new Date().toISOString();
          session = normalizeBimWorkspaceSession({
            ...session,
            modelRefs: session.modelRefs.map((entry) => (
              entry.modelId === ref.modelId
                ? { ...entry, status: 'failed', errorMessage: 'Stored IFC source is unavailable.', updatedAt: failedAt }
                : entry
            )),
            updatedAt: failedAt,
          });
          changed = true;
        }
      }
      if (cancelled) return;
      if (!activePrepared) {
        const fallbackRef = session.modelRefs.find((ref) => restoredModels[ref.modelId]);
        if (fallbackRef) {
          activePrepared = restoredModels[fallbackRef.modelId];
          activeFingerprint = activePrepared.metadata?.fingerprint ?? fallbackRef.fingerprint;
          session = normalizeBimWorkspaceSession({ ...session, activeModelId: fallbackRef.modelId });
          changed = true;
        }
      }
      setPreparedByModelId(restoredModels);
      setPrepared(activePrepared);
      setFingerprint(activeFingerprint);
      setCacheStatus('loaded_cache');
      setPhase('ready');
      setWorkspaceState((state) => normalizeBimWorkspaceState({
        ...state,
        session,
      }));
      if (changed) persistSession(session);
    }
    void restoreSessionModels();
    return () => {
      cancelled = true;
    };
  }, [isSessionViewer, persistSession]);

  useEffect(() => {
    if (!fingerprint) return;
    void repositoryRef.current.putWorkspaceState(fingerprint, workspaceState);
  }, [fingerprint, workspaceState]);

  const refreshAgentProviderState = useCallback(async () => {
    setAgentProviderState((state) => ({
      ...state,
      status: 'checking',
      message: 'Checking Canvas API.',
    }));
    try {
      const [health, connectorData] = await Promise.all([
        getAgentHealth(),
        listAgentConnectors(),
      ]);
      setAgentProviderState({
        status: 'ready',
        message: 'Canvas API ready.',
        health,
        connectors: connectorData.connectors ?? [],
        secretsConfigured: Boolean(connectorData.secretsConfigured),
      });
    } catch (err) {
      setAgentProviderState({
        status: 'offline',
        message: API_OFFLINE_PROVIDER_MESSAGE,
        health: null,
        connectors: [],
        secretsConfigured: false,
        error: err?.message ?? API_OFFLINE_PROVIDER_MESSAGE,
      });
    }
  }, []);

  useEffect(() => {
    void refreshAgentProviderState();
  }, [refreshAgentProviderState]);

  const selectedElement = useMemo(
    () => prepared?.elements?.find((element) => element.id === workspaceState.selectedObjectId) ?? null,
    [prepared?.elements, workspaceState.selectedObjectId],
  );
  const selectedProperties = useMemo(
    () => prepared?.properties?.filter((property) => property.elementId === selectedElement?.id) ?? [],
    [prepared?.properties, selectedElement?.id],
  );
  const selectedProvenance = useMemo(
    () => prepared?.provenance?.filter((record) => record.recordId === selectedElement?.id) ?? [],
    [prepared?.provenance, selectedElement?.id],
  );
  const semanticVocabulary = useMemo(
    () => buildSemanticModelVocabulary(prepared),
    [prepared],
  );
  const queryElementIds = useMemo(
    () => queryResult?.objectRefs
      ?.filter((ref) => ref.kind === 'physicalElement')
      .map((ref) => ref.id) ?? [],
    [queryResult],
  );
  const active4dSequence = useMemo(
    () => (workspaceState.bim4dSequences ?? []).find((sequence) => sequence.id === workspaceState.active4dSequenceId)
      ?? workspaceState.bim4dSequences?.[0]
      ?? null,
    [workspaceState.active4dSequenceId, workspaceState.bim4dSequences],
  );
  const active4dTask = useMemo(
    () => active4dSequence?.tasks?.find((task) => task.id === workspaceState.active4dTaskId)
      ?? active4dSequence?.tasks?.[0]
      ?? null,
    [active4dSequence, workspaceState.active4dTaskId],
  );
  const active4dElementIds = useMemo(
    () => resolveBim4dTaskElementIds(
      active4dTask,
      workspaceState.savedResultSets ?? [],
      prepared?.assemblyMembers ?? [],
    ),
    [active4dTask, prepared?.assemblyMembers, workspaceState.savedResultSets],
  );
  const [takeoffHighlightElementIds, setTakeoffHighlightElementIds] = useState([]);
  const viewportHighlightElementIds = takeoffHighlightElementIds.length > 0
    ? takeoffHighlightElementIds
    : active4dElementIds.length > 0
      ? active4dElementIds
      : queryElementIds;
  const viewportQueryMode = takeoffHighlightElementIds.length > 0 || active4dElementIds.length > 0
    ? 'ghostOthers'
    : queryResult?.viewerState?.mode ?? null;
  const tableElements = useMemo(() => {
    if (!prepared) return [];
    if (!queryResult) return prepared.elements;
    const ids = new Set(queryElementIds);
    return prepared.elements.filter((element) => ids.has(element.id));
  }, [prepared, queryElementIds, queryResult]);

  const patchWorkspaceState = (patch) => {
    setWorkspaceState((state) => normalizeBimWorkspaceState(
      typeof patch === 'function'
        ? { ...state, ...patch(state) }
        : { ...state, ...patch },
    ));
  };

  const selectElementByGlobalId = (ifcGlobalId) => {
    const element = findPreparedElementByGlobalId(prepared?.elements ?? [], ifcGlobalId);
    if (!element) {
      logBimPickWarning('GUID not in prepared element index', { ifcGlobalId });
      return false;
    }
    setQueryResult(null);
    patchWorkspaceState({
      selectedObjectId: element.id,
      selectedObjectKind: 'physicalElement',
      tableSearch: '',
      ifcClassFilter: '',
    });
    return true;
  };

  const deselectElement = () => {
    patchWorkspaceState({
      selectedObjectId: null,
      selectedObjectKind: 'physicalElement',
    });
  };

  const applyBqlQueryResult = (query, result, options = {}) => {
    result.select = query.select;
    setQueryResult(result);
    const statePatch = {
      tableSearch: '',
      ifcClassFilter: '',
    };
    if (result.viewerState?.mode && result.viewerState.mode !== 'isolate') {
      statePatch.displayMode = result.viewerState.mode;
    }
    if (options.savedQueryId) {
      statePatch.savedQueries = (workspaceState.savedQueries ?? []).map((entry) => (
        entry.id === options.savedQueryId ? { ...entry, lastRunAt: new Date().toISOString() } : entry
      ));
    }
    const firstPhysicalRef = result.objectRefs.find((ref) => ref.kind === 'physicalElement');
    if (firstPhysicalRef) {
      statePatch.selectedObjectId = firstPhysicalRef.id;
      statePatch.selectedObjectKind = 'physicalElement';
    } else if (result.status === 'empty') {
      statePatch.selectedObjectId = null;
      statePatch.selectedObjectKind = 'physicalElement';
    }
    patchWorkspaceState(statePatch);
  };

  const runBqlQuery = (query, options = {}) => {
    if (!prepared) return null;
    const result = executeBqlQuery(prepared, query);
    applyBqlQueryResult(query, result, options);
    return result;
  };

  const resolveDraftSemantics = (utterance, draft, source = 'local') => {
    const resolution = resolveBimQuestionSemantics({
      utterance,
      draft,
      vocabulary: semanticVocabulary,
      aliasMemory: semanticAliasMemory,
    });
    const resolvedDraft = applySemanticResolutionToBql(draft, resolution);
    return {
      ...resolvedDraft,
      semanticResolution: resolution,
      workSummarySuffix: resolution.terms.length > 0
        ? `${source === 'provider' ? 'AI' : 'Local rules'} resolved aliases`
        : null,
    };
  };

  const rememberSemanticResolution = (resolution, result) => {
    if (!resolution?.memoryUpdates || result?.status !== 'success') return;
    setSemanticAliasMemory((memory) => ({
      ...memory,
      ...resolution.memoryUpdates,
    }));
  };

  const executeResolvedDraft = (utterance, draft, source = 'local') => {
    const resolvedDraft = resolveDraftSemantics(utterance, draft, source);
    const result = executeBqlQuery(prepared, resolvedDraft.query);
    rememberSemanticResolution(resolvedDraft.semanticResolution, result);
    applyBqlQueryResult(resolvedDraft.query, result);
    return { draft: resolvedDraft, result };
  };

  const runLocalBimAgent = (utterance, options = {}) => {
    if (!prepared) throw new Error('BIM model is not ready yet.');
    const pendingClarification = options.pendingClarification ?? null;
    let storeyOverride = options.storeyOverride ?? null;
    let originalUtterance = utterance;
    if (pendingClarification?.kind === 'storey') {
      const resolvedChoice = resolveBimStoreyClarificationAnswer(utterance, pendingClarification);
      if (!resolvedChoice) {
        return {
          ok: true,
          status: 'clarification',
          clarification: {
            ...pendingClarification,
            question: `${pendingClarification.question} Please answer with one of: ${pendingClarification.choices.map((choice) => choice.label).join(', ')}.`,
          },
          warnings: ['Clarification answer did not match a model storey.'],
          workSummary: 'Local rules need storey clarification',
        };
      }
      storeyOverride = resolvedChoice.value;
      originalUtterance = pendingClarification.originalUtterance ?? utterance;
    } else {
      const clarification = maybeClarifyBimStoreyReference(utterance, prepared);
      if (clarification) {
        return {
          ok: true,
          status: 'clarification',
          clarification,
          warnings: [],
          workSummary: 'Local rules need storey clarification',
        };
      }
    }
    const draft = draftBqlFromNaturalLanguage(originalUtterance, { storeyOverride });
    if (!draft.ok) return draft;
    const executed = executeResolvedDraft(originalUtterance, draft, 'local');
    return {
      ...executed.draft,
      result: executed.result,
      connectorLabel: 'Local BIM rules',
      model: 'local/bim-bql-rules-v0.1',
      providerStatus: 'ready',
      providerStatusMessage: 'Local BIM Rules ready.',
      workSummary: executed.draft.workSummarySuffix
        ? `Local rules drafted BQL; ${executed.draft.workSummarySuffix}`
        : 'Local rules drafted BQL',
      didProviderRun: false,
    };
  };

  const runLlmBimAgent = async (utterance, connectorId) => {
    if (!prepared) throw new Error('BIM model is not ready yet.');
    const clarification = maybeClarifyBimStoreyReference(utterance, prepared);
    if (clarification) {
      return {
        ok: true,
        status: 'clarification',
        clarification,
        warnings: [],
        connectorLabel: 'Local BIM rules',
        model: 'local/bim-bql-rules-v0.1',
        didProviderRun: false,
        providerStatus: 'ready',
        providerStatusMessage: 'Local BIM Rules ready.',
        workSummary: 'Local rules need storey clarification',
      };
    }
    const connector = getConnectorById(connectorId) ?? getConnectorById(DEFAULT_SINGLE_CONNECTOR_ID);
    if (!connector) throw new Error('No BIM agent connector is available.');
    setAgentRunState({
      status: 'running',
      message: `Asking ${connector.label}`,
      model: connector.model,
      responderLabel: connector.label,
    });
    const modelSummary = {
      ...summarizeBimModelForAgent(prepared, selectedElement),
      nameTypeVocabulary: semanticVocabulary.nameTypeVocabulary,
    };
    try {
      const { reply, model } = await sendAgentChat({
        provider: connector.provider,
        connectorId: connector.id,
        systemContext: BIM_LLM_AGENT_SYSTEM_CONTEXT,
        messages: [{
          role: 'user',
          content: buildBimLlmAgentUserPrompt({ utterance, modelSummary }),
        }],
        timeoutMs: BIM_AGENT_CHAT_TIMEOUT_MS,
        responseFormat: 'json',
      });
      let draft = resolveDraftSemantics(utterance, parseBimLlmAgentReply(reply), 'provider');
      let result = executeBqlQuery(prepared, draft.query);
      let repaired = false;
      let initialInvalidWarnings = [];
      if (result.status === 'error') {
        initialInvalidWarnings = validationWarningsForResult(result);
        const repair = await sendAgentChat({
          provider: connector.provider,
          connectorId: connector.id,
          systemContext: BIM_LLM_AGENT_SYSTEM_CONTEXT,
          messages: [{
            role: 'user',
            content: buildBimLlmAgentRepairPrompt({
              utterance,
              modelSummary,
              invalidQuery: draft.query,
              validationErrors: initialInvalidWarnings,
            }),
          }],
          timeoutMs: BIM_AGENT_CHAT_TIMEOUT_MS,
          responseFormat: 'json',
        });
        const repairedDraft = resolveDraftSemantics(utterance, parseBimLlmAgentReply(repair.reply), 'provider');
        const repairedResult = executeBqlQuery(prepared, repairedDraft.query);
        if (repairedResult.status !== 'error') {
          draft = {
            ...repairedDraft,
            warnings: [
              ...(draft.warnings ?? []),
              ...(repairedDraft.warnings ?? []),
              `Provider repaired invalid BQL: ${initialInvalidWarnings.join('; ')}`,
            ],
          };
          result = repairedResult;
          repaired = true;
        }
      }
      if (result.status === 'error') {
        const fallback = resolveDraftSemantics(utterance, draftBqlFromNaturalLanguage(utterance), 'local');
        if (fallback.ok) {
          const fallbackResult = executeBqlQuery(prepared, fallback.query);
          rememberSemanticResolution(fallback.semanticResolution, fallbackResult);
          applyBqlQueryResult(fallback.query, fallbackResult);
          const message = 'Provider drafted invalid BQL; answered with local BIM rules.';
          setAgentRunState({
            status: 'ready',
            message,
            model: 'local/bim-bql-rules-v0.1',
            responderLabel: 'Local BIM rules',
          });
          return {
            ...fallback,
            result: fallbackResult,
            connectorLabel: 'Local BIM rules',
            model: 'local/bim-bql-rules-v0.1',
            didProviderRun: true,
            providerStatus: 'invalidBql',
            providerStatusMessage: `${connector.label} drafted invalid BQL; local rules answered.`,
            workSummary: 'Provider drafted invalid BQL; local rules answered',
            warnings: [
              `${connector.label} drafted invalid BQL.`,
              ...initialInvalidWarnings,
              ...(result.warnings ?? []),
              ...(fallback.warnings ?? []),
            ],
          };
        }
        applyBqlQueryResult(draft.query, result);
        const resolvedModel = model ?? connector.model;
        setAgentRunState({
          status: 'error',
          message: result.warnings.join(' '),
          model: resolvedModel,
          responderLabel: connector.label,
        });
        return {
          ...draft,
          result,
          connectorLabel: connector.label,
          model: resolvedModel,
          didProviderRun: true,
          providerStatus: 'invalidBql',
          providerStatusMessage: `${connector.label} drafted invalid BQL.`,
          workSummary: 'Provider drafted invalid BQL',
          warnings: [...(draft.warnings ?? []), ...(result.warnings ?? [])],
        };
      }
      rememberSemanticResolution(draft.semanticResolution, result);
      applyBqlQueryResult(draft.query, result);
      const resolvedModel = model ?? connector.model;
      setAgentRunState({
        status: result.status === 'error' ? 'error' : 'ready',
        message: result.status === 'error' ? result.warnings.join(' ') : draft.intentSummary,
        model: resolvedModel,
        responderLabel: connector.label,
      });
      return {
        ...draft,
        result,
        connectorLabel: connector.label,
        model: resolvedModel,
        providerStatus: repaired ? 'repairedBql' : 'ready',
        providerStatusMessage: repaired
          ? `${connector.label} repaired invalid BQL before execution.`
          : `${connector.label} drafted valid BQL.`,
        workSummary: [
          repaired ? 'Provider repaired BQL and executed evidence query' : 'Provider drafted BQL',
          draft.workSummarySuffix,
        ].filter(Boolean).join('; '),
        didProviderRun: true,
      };
    } catch (err) {
      const providerFailure = classifyAgentProviderError(err);
      if (providerFailure.status === 'providerNoReply') {
        try {
          const compactSummary = compactBimModelSummaryForAgent(modelSummary);
          const retry = await sendAgentChat({
            provider: connector.provider,
            connectorId: connector.id,
            systemContext: BIM_LLM_AGENT_SYSTEM_CONTEXT,
            messages: [{
              role: 'user',
              content: buildBimLlmAgentUserPrompt({ utterance, modelSummary: compactSummary }),
            }],
            timeoutMs: BIM_AGENT_CHAT_TIMEOUT_MS,
            responseFormat: 'json',
          });
          const retryDraft = resolveDraftSemantics(utterance, parseBimLlmAgentReply(retry.reply), 'provider');
          const retryResult = executeBqlQuery(prepared, retryDraft.query);
          if (retryResult.status !== 'error') {
            rememberSemanticResolution(retryDraft.semanticResolution, retryResult);
            applyBqlQueryResult(retryDraft.query, retryResult);
            const resolvedModel = retry.model ?? connector.model;
            setAgentRunState({
              status: 'ready',
              message: 'Provider answered after compact retry.',
              model: resolvedModel,
              responderLabel: connector.label,
            });
            return {
              ...retryDraft,
              result: retryResult,
              connectorLabel: connector.label,
              model: resolvedModel,
              providerStatus: 'compactRetry',
              providerStatusMessage: `${connector.label} returned no reply first, then answered with compact context.`,
              workSummary: ['Provider answered with compact retry', retryDraft.workSummarySuffix].filter(Boolean).join('; '),
              didProviderRun: true,
              warnings: [
                'Ollama returned no reply on the first attempt; compact retry answered.',
                ...(retryDraft.warnings ?? []),
              ],
            };
          }
        } catch {
          // Fall through to deterministic local fallback below.
        }
      }
      if (providerFailure.status === 'apiOffline') {
        setAgentProviderState({
          status: 'offline',
          message: API_OFFLINE_PROVIDER_MESSAGE,
          health: null,
          connectors: [],
          secretsConfigured: false,
          error: err?.message ?? API_OFFLINE_PROVIDER_MESSAGE,
        });
      }
      const fallback = resolveDraftSemantics(utterance, draftBqlFromNaturalLanguage(utterance), 'local');
      if (fallback.ok) {
        const result = executeBqlQuery(prepared, fallback.query);
        rememberSemanticResolution(fallback.semanticResolution, result);
        applyBqlQueryResult(fallback.query, result);
        const message = providerFailure.didProviderRun
          ? 'Provider failed; answered with local BIM rules.'
          : 'Provider did not run; answered with local BIM rules.';
        setAgentRunState({
          status: 'ready',
          message,
          model: 'local/bim-bql-rules-v0.1',
          responderLabel: 'Local BIM rules',
        });
        return {
          ...fallback,
          result,
          connectorLabel: 'Local BIM rules',
          model: 'local/bim-bql-rules-v0.1',
          didProviderRun: providerFailure.didProviderRun,
          providerStatus: providerFailure.status,
          providerStatusMessage: providerFailure.message,
          warnings: [...(fallback.warnings ?? []), err?.message || 'Provider unavailable.'],
        };
      }
      const message = err?.message || 'BIM agent request failed.';
      setAgentRunState({ status: 'error', message, model: connector.model, responderLabel: connector.label });
      throw err;
    }
  };

  const queryDraftHandlerRef = useRef(null);
  const registerQueryDraftHandler = useCallback((handler) => {
    queryDraftHandlerRef.current = handler;
  }, []);

  const bimAgent = useBimAgentPanel({
    onRunQuery: runBqlQuery,
    onRunLocalAgent: runLocalBimAgent,
    onRunLlmAgent: runLlmBimAgent,
    agentRunState,
    agentProviderState,
    onApplyQueryDraft: (queryText, { query, run = true } = {}) => {
      queryDraftHandlerRef.current?.(queryText, { query, run });
    },
  });

  const selectedAgentConnector = bimAgent.responderId === LOCAL_BIM_RULES_RESPONDER_ID
    ? null
    : getConnectorById(bimAgent.responderId) ?? getConnectorById(DEFAULT_SINGLE_CONNECTOR_ID);

  const getCurrentLinkedElementIds = () => {
    if (queryElementIds.length > 0) return queryElementIds;
    if (workspaceState.selectedObjectId) return [workspaceState.selectedObjectId];
    return [];
  };

  const createResultSetFromCurrentContext = (name = 'Saved result set') => {
    const elementIds = getCurrentLinkedElementIds();
    if (elementIds.length === 0) return null;
    const resultSet = createBimResultSetFromElements({
      name,
      elementIds,
      sourceQuery: queryResult ? { objectCount: queryResult.objectRefs?.length ?? elementIds.length } : null,
    });
    patchWorkspaceState({
      savedResultSets: [resultSet, ...(workspaceState.savedResultSets ?? [])].slice(0, 40),
    });
    return resultSet;
  };

  const create4dSequence = () => {
    const sequence = createBim4dSequence({
      name: `Sequence ${(workspaceState.bim4dSequences?.length ?? 0) + 1}`,
    });
    patchWorkspaceState({
      bim4dSequences: [sequence, ...(workspaceState.bim4dSequences ?? [])],
      active4dSequenceId: sequence.id,
      active4dTaskId: null,
    });
  };

  const setActive4dSequence = (sequenceId) => {
    const sequence = (workspaceState.bim4dSequences ?? []).find((entry) => entry.id === sequenceId);
    patchWorkspaceState({
      active4dSequenceId: sequence?.id ?? null,
      active4dTaskId: sequence?.tasks?.[0]?.id ?? null,
    });
  };

  const setActive4dTask = (taskId) => {
    patchWorkspaceState({ active4dTaskId: taskId || null });
  };

  const create4dTask = (name = 'Linked task') => {
    const currentElementIds = getCurrentLinkedElementIds();
    const sequences = workspaceState.bim4dSequences ?? [];
    const sequence = active4dSequence ?? sequences[0] ?? createBim4dSequence({ name: 'Sequence 1' });
    const taskName = String(name || 'Linked task').slice(0, 72);
    const linkedResultSet = currentElementIds.length > 0 && queryElementIds.length > 0
      ? createBimResultSetFromElements({
          name: `${taskName} set`,
          elementIds: currentElementIds,
          sourceQuery: queryResult ? { objectCount: queryResult.objectRefs?.length ?? currentElementIds.length } : null,
        })
      : null;
    const task = createBim4dTask({
      name: taskName,
      order: sequence.tasks?.length ?? 0,
      elementIds: linkedResultSet ? [] : currentElementIds,
      resultSetIds: linkedResultSet ? [linkedResultSet.id] : [],
    });
    const nextSequence = {
      ...sequence,
      tasks: [...(sequence.tasks ?? []), task],
      updatedAt: new Date().toISOString(),
    };
    const nextSequences = sequences.some((entry) => entry.id === sequence.id)
      ? sequences.map((entry) => (entry.id === sequence.id ? nextSequence : entry))
      : [nextSequence, ...sequences];
    patchWorkspaceState({
      savedResultSets: linkedResultSet
        ? [linkedResultSet, ...(workspaceState.savedResultSets ?? [])].slice(0, 40)
        : workspaceState.savedResultSets,
      bim4dSequences: nextSequences,
      active4dSequenceId: nextSequence.id,
      active4dTaskId: task.id,
    });
  };

  const step4dTask = (delta) => {
    if (!active4dSequence?.tasks?.length) return;
    const currentIndex = Math.max(
      0,
      active4dSequence.tasks.findIndex((task) => task.id === (workspaceState.active4dTaskId ?? active4dTask?.id)),
    );
    const nextIndex = Math.min(active4dSequence.tasks.length - 1, Math.max(0, currentIndex + delta));
    patchWorkspaceState({ active4dTaskId: active4dSequence.tasks[nextIndex]?.id ?? null });
  };

  const create5dCostPlan = () => {
    const plan = createBim5dCostPlan({
      name: `Cost plan ${(workspaceState.bim5dCostPlans?.length ?? 0) + 1}`,
      currency: 'USD',
    });
    patchWorkspaceState({
      bim5dCostPlans: [plan, ...(workspaceState.bim5dCostPlans ?? [])],
      active5dCostPlanId: plan.id,
    });
  };

  const setActive5dCostPlan = (planId) => {
    patchWorkspaceState({ active5dCostPlanId: planId || null });
  };

  const patchActive5dCostPlan = (planPatch) => {
    const activePlanId = workspaceState.active5dCostPlanId ?? workspaceState.bim5dCostPlans?.[0]?.id;
    if (!activePlanId) return;
    patchWorkspaceState({
      bim5dCostPlans: (workspaceState.bim5dCostPlans ?? []).map((plan) => (
        plan.id === activePlanId
          ? { ...plan, ...planPatch, updatedAt: new Date().toISOString() }
          : plan
      )),
    });
  };

  const add5dRateRow = (ratePatch) => {
    const activePlanId = workspaceState.active5dCostPlanId ?? workspaceState.bim5dCostPlans?.[0]?.id;
    if (!activePlanId) return;
    const createdAt = Date.now();
    const rate = {
      id: `bim-5d-rate:${createdAt}:${Math.random().toString(36).slice(2, 8)}`,
      label: String(ratePatch?.label || 'Rate row').slice(0, 96),
      match: ratePatch?.match && typeof ratePatch.match === 'object' ? ratePatch.match : {},
      quantityName: String(ratePatch?.quantityName || '').slice(0, 96),
      unit: String(ratePatch?.unit || '').slice(0, 24),
      unitCost: Number.isFinite(Number(ratePatch?.unitCost)) ? Number(ratePatch.unitCost) : 0,
      costCategory: '',
      costType: '',
      classificationCode: '',
      classificationSystem: '',
      formula: '',
      notes: '',
    };
    patchWorkspaceState({
      bim5dCostPlans: (workspaceState.bim5dCostPlans ?? []).map((plan) => (
        plan.id === activePlanId
          ? { ...plan, rateRows: [...(plan.rateRows ?? []), rate], updatedAt: new Date().toISOString() }
          : plan
      )),
    });
  };

  const select5dTakeoffRow = (row) => {
    const elementIds = Array.isArray(row?.elementIds) ? row.elementIds : [];
    setTakeoffHighlightElementIds(elementIds);
    if (elementIds.length > 0) {
      patchWorkspaceState({
        selectedObjectId: elementIds[0],
        selectedObjectKind: 'physicalElement',
      });
    }
  };

  const clearBqlQuery = () => {
    setQueryResult(null);
    setTakeoffHighlightElementIds([]);
  };

  const saveBqlQuery = (label, query) => {
    const createdAt = new Date().toISOString();
    const savedQuery = {
      id: `bql-saved:${createdAt}:${Math.random().toString(36).slice(2, 8)}`,
      label: String(label || 'Saved BIM query').slice(0, 64),
      query,
      createdAt,
      lastRunAt: null,
    };
    patchWorkspaceState({
      savedQueries: [savedQuery, ...(workspaceState.savedQueries ?? [])].slice(0, 20),
    });
  };

  const deleteSavedBqlQuery = (id) => {
    patchWorkspaceState({
      savedQueries: (workspaceState.savedQueries ?? []).filter((entry) => entry.id !== id),
    });
  };

  const rebuildBimCache = async () => {
    if (!fingerprint) return;
    await repositoryRef.current.deletePreparedModel?.(fingerprint);
    setPrepared(null);
    setFingerprint(null);
    setQueryResult(null);
    setCacheStatus('preparing');
    setPhase('preparing');
    setPrepRunId((runId) => runId + 1);
  };

  const bimBql = useBimBqlPanel({
    queryResult,
    onRunQuery: runBqlQuery,
    onClearQuery: clearBqlQuery,
    onRebuildCache: rebuildBimCache,
    savedQueries: workspaceState.savedQueries,
    onSaveQuery: saveBqlQuery,
    onDeleteSavedQuery: deleteSavedBqlQuery,
    rebuildDisabled: !fingerprint,
    onRegisterQueryDraftHandler: registerQueryDraftHandler,
    onAgentFeedback: bimAgent.setAgentFeedback,
  });

  const viewportCaptureRef = useRef(null);
  const panelResizeRef = useRef(null);
  const bimViews = useBimViewSets({
    workspaceState,
    patchWorkspaceState,
    repository: repositoryRef.current,
    captureViewportThumbnail: async () => viewportCaptureRef.current?.captureThumbnail?.() ?? null,
    captureViewportState: () => viewportCaptureRef.current?.captureWorkspaceSnapshot?.() ?? null,
  });

  const leftPanelOpen = workspaceState.panels?.left !== false;
  const rightPanelOpen = workspaceState.panels?.right !== false;

  useEffect(() => {
    const onPointerMove = (event) => {
      const state = panelResizeRef.current;
      if (!state) return;
      const delta = event.clientX - state.startX;
      if (state.side === 'left') {
        patchWorkspaceState({
          leftPanelWidth: normalizeLeftPanelWidth(state.startWidth + delta),
        });
        return;
      }
      patchWorkspaceState({
        rightPanelWidth: normalizeRightPanelWidth(state.startWidth - delta),
      });
    };
    const onPointerUp = () => {
      panelResizeRef.current = null;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [patchWorkspaceState]);

  const togglePanel = (panel) => {
    patchWorkspaceState((state) => ({
      panels: {
        ...(state.panels ?? { left: true, right: true }),
        [panel]: state.panels?.[panel] === false,
      },
    }));
  };

  const activeSession = workspaceState.session;

  const commitBimSession = useCallback((nextSession) => {
    const normalized = normalizeBimWorkspaceSession(nextSession);
    patchWorkspaceState({ session: normalized });
    persistSession(normalized);
    return normalized;
  }, [patchWorkspaceState, persistSession]);

  const setActiveSessionModel = useCallback(async (modelId) => {
    const ref = activeSession.modelRefs.find((entry) => entry.modelId === modelId);
    if (!ref) return;
    const nextSession = commitBimSession({
      ...activeSession,
      activeModelId: modelId,
      updatedAt: new Date().toISOString(),
    });
    const preparedModel = preparedByModelId[modelId]
      ?? (ref.fingerprint ? await repositoryRef.current.getPreparedModel(ref.fingerprint) : null);
    if (!preparedModel) return;
    setPreparedByModelId((models) => ({ ...models, [modelId]: preparedModel }));
    setPrepared(preparedModel);
    setFingerprint(ref.fingerprint || preparedModel.metadata?.fingerprint || null);
    setQueryResult(null);
    setCacheStatus('loaded_cache');
    setPhase('ready');
    if (nextSession.visibilityByModelId[modelId] === false) {
      commitBimSession({
        ...nextSession,
        visibilityByModelId: {
          ...nextSession.visibilityByModelId,
          [modelId]: true,
        },
      });
    }
  }, [activeSession, commitBimSession, preparedByModelId]);

  const toggleSessionModelVisibility = useCallback((modelId) => {
    const currentlyVisible = activeSession.visibilityByModelId?.[modelId] !== false;
    let nextVisible = !currentlyVisible;
    const replacementActiveId = !nextVisible && activeSession.activeModelId === modelId
      ? activeSession.modelRefs.find((ref) =>
          ref.modelId !== modelId && activeSession.visibilityByModelId?.[ref.modelId] !== false && ref.status === 'ready')?.modelId ?? null
      : null;
    if (!nextVisible && activeSession.activeModelId === modelId && !replacementActiveId) {
      nextVisible = true;
      setImportStatus('At least one active IFC file must remain visible.');
    }
    const nextVisibilityByModelId = {
      ...activeSession.visibilityByModelId,
      [modelId]: nextVisible,
    };
    const nextActiveModelId = !nextVisible && activeSession.activeModelId === modelId && replacementActiveId
      ? replacementActiveId
      : activeSession.activeModelId;
    commitBimSession({
      ...activeSession,
      activeModelId: nextActiveModelId,
      visibilityByModelId: nextVisibilityByModelId,
      updatedAt: new Date().toISOString(),
    });
    if (nextActiveModelId !== activeSession.activeModelId) {
      void setActiveSessionModel(nextActiveModelId);
    }
  }, [activeSession, commitBimSession, setActiveSessionModel]);

  const removeSessionModel = useCallback((modelId) => {
    const remainingRefs = activeSession.modelRefs.filter((ref) => ref.modelId !== modelId);
    const visibilityByModelId = { ...activeSession.visibilityByModelId };
    delete visibilityByModelId[modelId];
    const nextActiveModelId = activeSession.activeModelId === modelId
      ? remainingRefs[0]?.modelId ?? null
      : activeSession.activeModelId;
    commitBimSession({
      ...activeSession,
      modelRefs: remainingRefs,
      activeModelId: nextActiveModelId,
      visibilityByModelId,
      updatedAt: new Date().toISOString(),
    });
    setPreparedByModelId((models) => {
      const next = { ...models };
      delete next[modelId];
      return next;
    });
    if (activeSession.activeModelId === modelId) {
      const nextPrepared = nextActiveModelId ? preparedByModelId[nextActiveModelId] ?? null : null;
      setPrepared(nextPrepared);
      setFingerprint(nextPrepared?.metadata?.fingerprint ?? null);
      setQueryResult(null);
    }
  }, [activeSession, commitBimSession, preparedByModelId]);

  const importIfcFiles = useCallback(async (files, options = {}) => {
    if (!isSessionViewer || importBusy) return;
    const ifcFiles = files.filter((file) => /\.ifc$/i.test(file.name));
    if (ifcFiles.length === 0) {
      setImportStatus('Choose one or more .ifc files.');
      return;
    }
    setImportBusy(true);
    setError(null);
    setExtractionFeed([]);
    let latestPrepared = null;
    let latestFingerprint = null;
    let nextSession = activeSession;
    let activeImportModelId = null;
    try {
      for (let index = 0; index < ifcFiles.length; index += 1) {
        const file = ifcFiles[index];
        setImportStatus(`Importing ${file.name} (${index + 1}/${ifcFiles.length})`);
        const arrayBuffer = await file.arrayBuffer();
        const sourceFileHash = await sha256Hex(arrayBuffer);
        const forcedRef = options.forceUpdateModelId
          ? nextSession.modelRefs.find((ref) => ref.modelId === options.forceUpdateModelId)
          : null;
        const sourceMetadataRef = forcedRef ?? options.sourceRef ?? null;
        const importChoice = options.forceAddAsNew
          ? { action: 'add', ref: null }
          : forcedRef
          ? { action: 'update', ref: forcedRef }
          : chooseExistingModelForImportedFile(nextSession, file, sourceFileHash);
        if (importChoice.action === 'activate' && importChoice.ref) {
          await setActiveSessionModel(importChoice.ref.modelId);
          setImportStatus(`${file.name} is already loaded.`);
          continue;
        }
        const modelId = importChoice.action === 'update' && importChoice.ref
          ? importChoice.ref.modelId
          : `bim-model:${sourceFileHash.slice(0, 16)}`;
        activeImportModelId = modelId;
        const importedAt = new Date().toISOString();
        const sourceStorageKey = bimSourceStorageKey(sourceFileHash);
        await repositoryRef.current.putModelSource?.(sourceStorageKey, {
          blob: new Blob([arrayBuffer], { type: file.type || 'application/x-step' }),
          metadata: {
            sourceName: file.name,
            sourceFileHash,
            sourceKind: sourceMetadataRef?.sourceKind ?? 'indexedDbUpload',
            sourcePath: sourceMetadataRef?.sourcePath ?? null,
            sourceLastModified: Number.isFinite(file.lastModified) ? file.lastModified : null,
            sourceSize: file.size,
            cachedAt: importedAt,
          },
        });
        const preparingRef = {
          modelId,
          sourceName: file.name,
          label: file.name,
          sourceFileHash,
          sourceStorageKey,
          sourceKind: sourceMetadataRef?.sourceKind ?? 'indexedDbUpload',
          sourcePath: sourceMetadataRef?.sourcePath ?? null,
          sourceLastModified: Number.isFinite(file.lastModified) ? file.lastModified : null,
          sourceSize: file.size,
          sourceStatus: 'current',
          fingerprint: '',
          preparedModelKey: '',
          status: 'preparing',
          role: '',
          importedAt,
          updatedAt: importedAt,
        };
        nextSession = normalizeBimWorkspaceSession({
          ...nextSession,
          modelRefs: [
            preparingRef,
            ...nextSession.modelRefs.filter((ref) => ref.modelId !== modelId),
          ],
          activeModelId: modelId,
          visibilityByModelId: {
            ...nextSession.visibilityByModelId,
            [modelId]: true,
          },
          updatedAt: importedAt,
        });
        commitBimSession(nextSession);
        const result = await prepareBimModel({
          arrayBuffer,
          version: {
            ...(versionRef.current ?? {}),
            content_hash: sourceFileHash,
            filename: file.name,
            size: file.size,
            relativePath: null,
          },
          repository: repositoryRef.current,
          onPhase: setPhase,
          onProgress: appendExtractionEvent,
        });
        latestPrepared = result.preparedModel;
        latestFingerprint = result.fingerprint;
        setPreparedByModelId((models) => ({ ...models, [modelId]: result.preparedModel }));
        const readyRef = {
          ...preparingRef,
          fingerprint: result.fingerprint,
          preparedModelKey: result.fingerprint,
          status: 'ready',
          sourceStatus: 'current',
          warnings: result.preparedModel?.warnings ?? [],
          updatedAt: new Date().toISOString(),
        };
        nextSession = normalizeBimWorkspaceSession({
          ...nextSession,
          modelRefs: nextSession.modelRefs.map((ref) => (ref.modelId === modelId ? readyRef : ref)),
          activeModelId: modelId,
          updatedAt: readyRef.updatedAt,
        });
        commitBimSession(nextSession);
      }
      if (latestPrepared) {
        setPrepared(latestPrepared);
        setFingerprint(latestFingerprint);
        setCacheStatus('prepared');
        setQueryResult(null);
      }
      setImportStatus(`Imported ${ifcFiles.length} IFC file${ifcFiles.length === 1 ? '' : 's'}.`);
    } catch (err) {
      const message = err?.message || 'IFC import failed.';
      setImportStatus(message);
      if (activeImportModelId) {
        commitBimSession({
          ...nextSession,
          modelRefs: nextSession.modelRefs.map((ref) => (
            ref.modelId === activeImportModelId
              ? { ...ref, status: 'failed', errorMessage: message, updatedAt: new Date().toISOString() }
              : ref
          )),
          updatedAt: new Date().toISOString(),
        });
      }
    } finally {
      setImportBusy(false);
    }
  }, [activeSession, commitBimSession, importBusy, isSessionViewer, setActiveSessionModel]);

  const sessionPreparedModels = useMemo(() => {
    if (!isSessionViewer) return [];
    return activeSession.modelRefs
      .map((ref) => ({
        modelId: ref.modelId,
        preparedModel: preparedByModelId[ref.modelId],
      }))
      .filter((entry) => entry.preparedModel);
  }, [activeSession.modelRefs, isSessionViewer, preparedByModelId]);

  useEffect(() => {
    if (!isSessionViewer || !folderHandle || activeSession.modelRefs.length === 0) return undefined;
    let cancelled = false;
    const checkLinkedFolderSources = async () => {
      for (const ref of activeSession.modelRefs) {
        if (cancelled || ref.sourceKind !== 'linkedFolder' || !ref.sourcePath || ref.status === 'removed') continue;
        try {
          const handle = await getFileHandleAtPath(folderHandle, ref.sourcePath);
          const file = await handle.getFile();
          const fileChanged =
            (Number.isFinite(ref.sourceLastModified) && file.lastModified > ref.sourceLastModified)
            || (Number.isFinite(ref.sourceSize) && file.size !== ref.sourceSize);
          if (!fileChanged) continue;
          const promptKey = `${ref.modelId}:${file.lastModified}:${file.size}`;
          if (sourceUpdatePromptedRef.current.has(promptKey)) continue;
          sourceUpdatePromptedRef.current.add(promptKey);
          const updateExisting = window.confirm(
            `A newer IFC appears to be available for "${ref.label || ref.sourceName}". Click OK to update the existing file, or Cancel to add it as a new file.`,
          );
          if (cancelled) return;
          await importIfcFiles([file], updateExisting
            ? { forceUpdateModelId: ref.modelId }
            : { forceAddAsNew: true, sourceRef: ref });
        } catch {
          const missingAt = new Date().toISOString();
          commitBimSession({
            ...activeSession,
            modelRefs: activeSession.modelRefs.map((entry) => (
              entry.modelId === ref.modelId
                ? { ...entry, sourceStatus: 'missing', updatedAt: missingAt }
                : entry
            )),
            updatedAt: missingAt,
          });
        }
      }
    };
    void checkLinkedFolderSources();
    const intervalId = window.setInterval(checkLinkedFolderSources, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeSession, commitBimSession, folderHandle, importIfcFiles, isSessionViewer]);

  if (!isSessionViewer && (source.loading || (!prepared && !error))) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-preview-bg text-center px-8">
        <div>
          <div className="serif text-lg text-primary mb-2">{PHASE_LABELS[phase] ?? 'Preparing model'}</div>
          <div className="sans text-xs text-muted">{version?.filename ?? card?.name}</div>
          <BimExtractionFeed events={extractionFeed} />
        </div>
      </div>
    );
  }

  if (!isSessionViewer && (source.error || error)) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-preview-bg text-center px-8">
        <div>
          <div className="serif text-lg text-primary mb-2">Could not prepare BIM model</div>
          <div className="sans text-xs text-warning">{source.error || error}</div>
        </div>
      </div>
    );
  }

  if (isSessionViewer && !prepared) {
    return (
      <div className="h-full w-full min-h-0 flex flex-col bg-preview-bg">
        <div className="shrink-0 border-b border-border bg-surface px-3 py-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted">IFC Viewer</div>
            <div className="serif text-sm text-primary truncate">{card?.name ?? 'IFC Viewer'}</div>
          </div>
          <div className="shrink-0 text-right text-[10px] text-muted">
            <div>{activeSession.modelRefs.length} files loaded</div>
            <div className="uppercase tracking-wider">Federated BIM session</div>
          </div>
        </div>
        <div className="relative flex-1 min-h-0 bg-preview-bg">
          <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-3">
            <div className={BIM_VIEWPORT_TOOLBAR_SURFACE_CLASS} aria-label="Viewport controls">
              <BimFileToolbarControls
                session={activeSession}
                prepared={prepared}
                importBusy={importBusy}
                importStatus={importStatus}
                onImportFiles={importIfcFiles}
                onSetActiveModel={setActiveSessionModel}
                onToggleModelVisibility={toggleSessionModelVisibility}
                onRemoveModel={removeSessionModel}
                compact
                buttonClassName={(active) => `rounded border border-border p-1 ${
                  active ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'
                }`}
                activeButtonClassName="rounded border border-border p-1 bg-accent text-on-accent"
              />
            </div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
            <div className="max-w-md">
              <div className="serif text-xl text-primary mb-2">Import IFC files</div>
              <div className="sans text-sm text-secondary">
                Use the file icon in the toolbar to import one or more IFC files, then switch the active file or toggle visibility.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 flex flex-col bg-preview-bg">
      <div className="shrink-0 border-b border-border bg-surface px-3 py-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted">BIM Workspace</div>
          <div className="serif text-sm text-primary truncate">{card?.name ?? version?.filename}</div>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <div>
            {prepared.elements.length} elements · {prepared.properties.length} properties
            {isSessionViewer ? ` · ${activeSession.modelRefs.length} files loaded` : ''}
          </div>
          <div className="uppercase tracking-wider">
            {cacheStatus === 'loaded_cache' ? 'Loaded prepared BIM cache' : 'Prepared BIM cache'} · {PHASE_LABELS[phase] ?? 'Ready'}
            {prepared.metadata?.fragmentsStatus === 'failed' ? ' · Fragments conversion failed; evidence view remains available' : ''}
          </div>
        </div>
      </div>
      {isSessionViewer ? (
        <div className="shrink-0 border-b border-border bg-surface px-3 py-1 text-[10px] text-muted">
          ACTIVE FILE: {activeSession.modelRefs.find((ref) => ref.modelId === activeSession.activeModelId)?.label ?? prepared.metadata?.filename ?? 'None'} · {activeSession.modelRefs.length} files loaded · {activeSession.modelRefs.filter((ref) => activeSession.visibilityByModelId?.[ref.modelId] !== false).length} visible
        </div>
      ) : null}
      {extractionFeed.length > 0 && cacheStatus !== 'loaded_cache' && (
        <div className="shrink-0 border-b border-border bg-surface px-3 py-1 text-[10px] text-muted">
          {extractionFeed.at(-1)?.message}
        </div>
      )}
      {prepared.warnings?.length > 0 && (
        <div className="shrink-0 border-b border-border bg-warning/10 px-3 py-1 text-[10px] text-warning">
          {prepared.warnings.join(' ')}
        </div>
      )}
      <div className="relative flex flex-1 min-h-0 min-w-0">
        <div className="absolute inset-0 min-h-0 min-w-0">
          <BimViewport
            preparedModel={prepared}
            preparedModels={sessionPreparedModels}
            activeModelId={activeSession.activeModelId}
            visibilityByModelId={activeSession.visibilityByModelId}
            selectedElement={selectedElement}
            selectedProperties={selectedProperties}
            highlightElementIds={viewportHighlightElementIds}
            queryViewerMode={viewportQueryMode}
            displayMode={workspaceState.displayMode}
            isolateOnSelect={workspaceState.isolateOnSelect}
            zoomToSelectionOnSelect={workspaceState.zoomToSelectionOnSelect}
            hiddenStoreys={workspaceState.hiddenStoreys}
            hiddenLayers={workspaceState.hiddenLayers}
            section={workspaceState.section}
            colorByProperty={
              queryResult?.viewerState?.colorByProperty
              ?? (workspaceState.displayMode === 'colorBy' ? (workspaceState.colorByProperty ?? 'ifcClass') : null)
            }
            ifcClassFilter={workspaceState.ifcClassFilter}
            leftPanelOpen={leftPanelOpen}
            rightPanelOpen={rightPanelOpen}
            layersHudHeight={workspaceState.layersHudHeight}
            onLayersHudHeightChange={(nextHeight) => patchWorkspaceState({
              layersHudHeight: normalizeLayersHudHeight(nextHeight),
            })}
            layersHudStoreysHeight={workspaceState.layersHudStoreysHeight}
            onLayersHudStoreysHeightChange={(nextHeight) => patchWorkspaceState({
              layersHudStoreysHeight: normalizeLayersHudStoreysHeight(nextHeight),
            })}
            initialCamera={workspaceState.camera}
            projectionMode={workspaceState.projectionMode}
            onToggleLeftPanel={() => togglePanel('left')}
            onToggleRightPanel={() => togglePanel('right')}
            onDisplayModeChange={(displayMode) => patchWorkspaceState({ displayMode })}
            onColorByPropertyChange={(colorByProperty) => patchWorkspaceState({ colorByProperty })}
            onIsolateOnSelectChange={(isolateOnSelect) => patchWorkspaceState({ isolateOnSelect })}
            onZoomToSelectionOnSelectChange={(zoomToSelectionOnSelect) => patchWorkspaceState({ zoomToSelectionOnSelect })}
            onHiddenStoreysChange={(hiddenStoreys) => patchWorkspaceState({ hiddenStoreys })}
            onHiddenLayersChange={(hiddenLayers) => patchWorkspaceState({ hiddenLayers })}
            onSectionChange={(section) => patchWorkspaceState({ section })}
            onSelectElementByGlobalId={selectElementByGlobalId}
            onDeselectElement={deselectElement}
            onCameraChange={(camera) => patchWorkspaceState({ camera })}
            onProjectionModeChange={(projectionMode) => patchWorkspaceState({ projectionMode })}
            measurements={workspaceState.measurements}
            measureUnits={workspaceState.measureUnits}
            measureSnapMode={workspaceState.measureSnapMode}
            measureKind={workspaceState.measureKind}
            measurementsVisible={workspaceState.measurementsVisible}
            rlDatum={workspaceState.rlDatum}
            wireframeMode={workspaceState.wireframeMode}
            wireframeLineWeight={workspaceState.wireframeLineWeight}
            wireframeOpacity={workspaceState.wireframeOpacity}
            wireframeColor={workspaceState.wireframeColor}
            wireframeHiddenLines={workspaceState.wireframeHiddenLines}
            renderStyle={workspaceState.renderStyle}
            clayAoIntensity={workspaceState.clayAoIntensity}
            clayAoRadius={workspaceState.clayAoRadius}
            clayAoBias={workspaceState.clayAoBias}
            clayAoDistance={workspaceState.clayAoDistance}
            clayAoSamples={workspaceState.clayAoSamples}
            clayAoResolution={workspaceState.clayAoResolution}
            clayLightIntensity={workspaceState.clayLightIntensity}
            claySurfaceColor={workspaceState.claySurfaceColor}
            clayGlassOpacity={workspaceState.clayGlassOpacity}
            clayOriginalColorBlend={workspaceState.clayOriginalColorBlend}
            viewportBackgroundColor={workspaceState.viewportBackgroundColor}
            showEnvironment={workspaceState.showEnvironment}
            lightingMode={workspaceState.lightingMode}
            environmentPreset={workspaceState.environmentPreset}
            environmentalAnalysis={workspaceState.environmentalAnalysis}
            onMeasurementsChange={(measurements) => patchWorkspaceState({ measurements })}
            onMeasureUnitsChange={(measureUnits) => patchWorkspaceState({ measureUnits })}
            onMeasureSnapModeChange={(measureSnapMode) => patchWorkspaceState({ measureSnapMode })}
            onMeasureKindChange={(measureKind) => patchWorkspaceState({ measureKind })}
            onMeasurementsVisibleChange={(measurementsVisible) => patchWorkspaceState({ measurementsVisible })}
            onRlDatumChange={(rlDatum) => patchWorkspaceState({ rlDatum })}
            onDeleteRlDatum={() => patchWorkspaceState({ rlDatum: null })}
            onWireframeModeChange={(wireframeMode) => patchWorkspaceState({ wireframeMode })}
            onWireframeStyleChange={(wireframeStylePatch) => patchWorkspaceState(wireframeStylePatch)}
            onRenderStyleChange={(nextRenderStyle) => {
              if (nextRenderStyle === 'clay') patchWorkspaceState(getClayPresetWorkspacePatch());
              else patchWorkspaceState({ renderStyle: 'standard' });
            }}
            onClayStyleChange={(clayStylePatch) => patchWorkspaceState(clayStylePatch)}
            onResetClayDefaults={() => patchWorkspaceState(getClayPresetWorkspacePatch())}
            onViewportBackgroundChange={(viewportBackgroundColor) => patchWorkspaceState({ viewportBackgroundColor })}
            onLightingChange={(lightingPatch) => patchWorkspaceState(lightingPatch)}
            onEnvironmentalAnalysisChange={(environmentalAnalysis) => patchWorkspaceState({ environmentalAnalysis })}
            projectId={resolvedProjectId}
            cardId={card?.id}
            artifactId={version?.artifactId ?? card?.artifactId ?? null}
            styleSettings={styleSettings}
            onApplyStyleSettings={(settings) => {
              setWorkspaceState((state) => normalizeBimWorkspaceState({
                ...state,
                ...applyBimStyleSettings(state, settings),
              }));
            }}
            agentText={bimAgent.agentText}
            onAgentTextChange={bimAgent.setAgentText}
            agentResponderId={bimAgent.responderId}
            onAgentResponderIdChange={bimAgent.setResponderId}
            agentSelectedResponderLabel={bimAgent.selectedResponderLabel}
            agentResponderLabel={bimAgent.responderLabel}
            agentProviderStatus={bimAgent.providerStatus}
            agentRunState={agentRunState}
            agentResponse={bimAgent.agentResponse}
            agentChatMessages={bimAgent.chatMessages}
            agentStatusLine={bimAgent.statusLine}
            onAskSelectedAgent={bimAgent.askSelectedResponder}
            onRefreshAgentProviderState={refreshAgentProviderState}
            selectedAgentConnector={selectedAgentConnector}
            bqlQueryText={bimBql.queryText}
            onBqlQueryTextChange={bimBql.setQueryText}
            bqlSelectedSavedQueryId={bimBql.selectedSavedQueryId}
            bqlSavedQueries={bimBql.savedQueries}
            bqlRebuildDisabled={bimBql.rebuildDisabled}
            bqlStatusLine={bimBql.statusLine}
            bqlStatusIsError={bimBql.statusIsError}
            onBqlRunQuery={bimBql.run}
            onBqlSaveQuery={bimBql.saveQuery}
            onBqlClearQuery={bimBql.onClearQuery}
            onBqlDeleteSelectedQuery={bimBql.deleteSelectedQuery}
            onBqlRebuildCache={bimBql.onRebuildCache}
            onBqlApplyPreset={bimBql.applyPreset}
            onBqlLoadSavedQuery={bimBql.loadSavedQuery}
            savedResultSets={workspaceState.savedResultSets}
            bim4dSequences={workspaceState.bim4dSequences}
            active4dSequenceId={workspaceState.active4dSequenceId}
            active4dTaskId={workspaceState.active4dTaskId}
            onCreateResultSet={createResultSetFromCurrentContext}
            onCreate4dSequence={create4dSequence}
            onCreate4dTask={create4dTask}
            onSetActive4dSequence={setActive4dSequence}
            onSetActive4dTask={setActive4dTask}
            onStep4dTask={step4dTask}
            bim5dCostPlans={workspaceState.bim5dCostPlans}
            active5dCostPlanId={workspaceState.active5dCostPlanId}
            onCreate5dCostPlan={create5dCostPlan}
            onSetActive5dCostPlan={setActive5dCostPlan}
            onPatch5dCostPlan={patchActive5dCostPlan}
            onAdd5dRateRow={add5dRateRow}
            onSelect5dTakeoffRow={select5dTakeoffRow}
            viewCarouselOpen={bimViews.viewCarouselOpen}
            onToggleViewCarousel={bimViews.toggleViewCarousel}
            viewApplyRequest={bimViews.viewApplyRequest}
            viewportCaptureRef={viewportCaptureRef}
            viewSets={bimViews.viewSets}
            activeViewSetId={bimViews.activeViewSetId}
            activeViewId={bimViews.activeViewId}
            viewSetsBusy={bimViews.busy}
            viewSetsStatus={bimViews.status}
            viewSetsError={bimViews.error}
            onSelectViewSet={bimViews.setActiveViewSetId}
            onCreateViewSet={bimViews.createViewSet}
            onRenameViewSet={bimViews.renameViewSet}
            onDeleteViewSet={bimViews.deleteViewSet}
            onSaveCurrentView={bimViews.saveCurrentView}
            onApplyView={bimViews.applyView}
            onRenameView={bimViews.renameView}
            onUpdateView={bimViews.updateViewFromCurrent}
            onDeleteView={bimViews.deleteView}
            loadViewThumbnail={bimViews.loadViewThumbnail}
            sessionViewerEnabled={isSessionViewer}
            session={activeSession}
            sessionImportBusy={importBusy}
            sessionImportStatus={importStatus}
            onSessionImportFiles={importIfcFiles}
            onSessionSetActiveModel={setActiveSessionModel}
            onSessionToggleModelVisibility={toggleSessionModelVisibility}
            onSessionRemoveModel={removeSessionModel}
          />
        </div>
        {leftPanelOpen ? (
          <BimFloatingSidePanel
            side="left"
            width={workspaceState.leftPanelWidth}
            ariaLabel="Resize element list panel"
            onResizePointerDown={(event) => {
              event.preventDefault();
              panelResizeRef.current = {
                side: 'left',
                startX: event.clientX,
                startWidth: workspaceState.leftPanelWidth,
              };
            }}
          >
            <BimElementTable
              elements={tableElements}
              properties={prepared?.properties ?? []}
              selectedElementId={workspaceState.selectedObjectId}
              search={workspaceState.tableSearch}
              ifcClassFilter={workspaceState.ifcClassFilter}
              columns={workspaceState.tableColumns}
              tableSort={workspaceState.tableSort}
              title={queryResult ? 'BQL result' : 'Elements'}
              colorByActive={workspaceState.displayMode === 'colorBy'}
              colorByProperty={
                queryResult?.viewerState?.colorByProperty
                ?? (workspaceState.displayMode === 'colorBy' ? (workspaceState.colorByProperty ?? 'ifcClass') : null)
              }
              onSearchChange={(tableSearch) => patchWorkspaceState({ tableSearch })}
              onIfcClassFilterChange={(ifcClassFilter) => patchWorkspaceState({ ifcClassFilter })}
              onColumnsChange={(tableColumns) => patchWorkspaceState({ tableColumns })}
              onTableSortChange={(tableSort) => patchWorkspaceState({ tableSort })}
              onSelectElement={(selectedObjectId) => {
                setQueryResult(null);
                patchWorkspaceState({ selectedObjectId, selectedObjectKind: 'physicalElement' });
              }}
            />
          </BimFloatingSidePanel>
        ) : null}
        {rightPanelOpen ? (
          <BimFloatingSidePanel
            side="right"
            width={workspaceState.rightPanelWidth}
            ariaLabel="Resize inspector panel"
            onResizePointerDown={(event) => {
              event.preventDefault();
              panelResizeRef.current = {
                side: 'right',
                startX: event.clientX,
                startWidth: workspaceState.rightPanelWidth,
              };
            }}
          >
            <BimInspector
              element={selectedElement}
              properties={selectedProperties}
              provenance={selectedProvenance}
              assemblies={prepared.semanticAssemblies ?? []}
              assemblyMembers={prepared.assemblyMembers ?? []}
              search={workspaceState.inspectorSearch}
              onSearchChange={(inspectorSearch) => patchWorkspaceState({ inspectorSearch })}
              floating
            />
          </BimFloatingSidePanel>
        ) : null}
      </div>
    </div>
  );
}
