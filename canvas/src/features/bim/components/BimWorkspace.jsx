import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAgentHealth, listAgentConnectors, sendAgentChat } from '../../../lib/agentApi.js';
import { DEFAULT_SINGLE_CONNECTOR_ID, getConnectorById } from '../../../lib/agentConnectors.js';
import { createIndexedDbBimRepository } from '../bim-core/bimRepository.js';
import { draftBqlFromNaturalLanguage } from '../bim-core/bimAgent.js';
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
import { applyBimViewerDefaults, normalizeBimWorkspaceState } from '../bim-core/types.js';
import { applyBimStyleSettings, extractBimStyleSettings } from '../bim-core/bimStyleSettings.js';
import { getClayPresetWorkspacePatch } from '../bim-core/bimClayRender.js';
import { requestActionSync } from '../../../lib/actionSync.js';
import { useBimModelSource } from '../hooks/useBimModelSource.js';
import { useBimAgentPanel } from '../hooks/useBimAgentPanel.js';
import { useBimBqlPanel } from '../hooks/useBimBqlPanel.js';
import { LOCAL_BIM_RULES_RESPONDER_ID } from './bimAgentPanelShared.js';
import { BimElementTable } from './BimElementTable.jsx';
import { BimInspector } from './BimInspector.jsx';
import { BimViewport } from './BimViewport.jsx';

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
  const source = useBimModelSource(version, { folderHandle });
  const versionRef = useRef(version);
  versionRef.current = version;
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) repositoryRef.current = createIndexedDbBimRepository();
  const [phase, setPhase] = useState('preparing');
  const [cacheStatus, setCacheStatus] = useState('preparing');
  const [error, setError] = useState(null);
  const [prepared, setPrepared] = useState(null);
  const [fingerprint, setFingerprint] = useState(null);
  const loadedFingerprintRef = useRef(null);
  const [workspaceState, setWorkspaceState] = useState(() => applyBimViewerDefaults({
    ...(version?.bim?.workspaceState ?? {}),
    ...(version?.bim?.styleSettings ?? {}),
  }));
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
  }, [prepRunId, source.arrayBuffer, version?.content_hash]);

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
  const tableElements = useMemo(() => {
    if (!prepared) return [];
    if (!queryResult) return prepared.elements;
    const ids = new Set(queryElementIds);
    return prepared.elements.filter((element) => ids.has(element.id));
  }, [prepared, queryElementIds, queryResult]);

  const patchWorkspaceState = (patch) => {
    setWorkspaceState((state) => normalizeBimWorkspaceState({ ...state, ...patch }));
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

  const runLocalBimAgent = (utterance) => {
    if (!prepared) throw new Error('BIM model is not ready yet.');
    const draft = draftBqlFromNaturalLanguage(utterance);
    if (!draft.ok) return draft;
    const executed = executeResolvedDraft(utterance, draft, 'local');
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

  const clearBqlQuery = () => {
    setQueryResult(null);
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

  const leftPanelOpen = workspaceState.panels?.left !== false;
  const rightPanelOpen = workspaceState.panels?.right !== false;
  const togglePanel = (panel) => {
    patchWorkspaceState({
      panels: {
        ...(workspaceState.panels ?? { left: true, right: true }),
        [panel]: !workspaceState.panels?.[panel],
      },
    });
  };

  if (source.loading || (!prepared && !error)) {
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

  if (source.error || error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-preview-bg text-center px-8">
        <div>
          <div className="serif text-lg text-primary mb-2">Could not prepare BIM model</div>
          <div className="sans text-xs text-warning">{source.error || error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 flex flex-col bg-preview-bg">
      <div className="shrink-0 border-b border-border bg-surface px-3 py-2 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">BIM Workspace</div>
          <div className="serif text-sm text-primary">{card?.name ?? version?.filename}</div>
        </div>
        <div className="text-[10px] text-muted">
          {prepared.elements.length} elements · {prepared.properties.length} properties
        </div>
      </div>
      <div className="shrink-0 border-b border-border bg-preview-bg px-3 py-1 text-[10px] uppercase tracking-wider text-muted">
        {cacheStatus === 'loaded_cache' ? 'Loaded prepared BIM cache' : 'Prepared BIM cache'} - {PHASE_LABELS[phase] ?? 'Ready'}
        {prepared.metadata?.fragmentsStatus === 'failed' ? ' - Fragments conversion failed; evidence view remains available' : ''}
      </div>
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
      <div
        className="flex-1 min-h-0 grid"
        style={{
          gridTemplateColumns: `${leftPanelOpen ? 'minmax(18rem,25%)' : '0'} minmax(0,1fr) ${rightPanelOpen ? 'minmax(18rem,25%)' : '0'}`,
        }}
      >
        <div className="h-full min-h-0 overflow-hidden" style={{ gridColumn: 1 }}>
          {leftPanelOpen ? (
            <BimElementTable
              elements={tableElements}
              selectedElementId={workspaceState.selectedObjectId}
              search={workspaceState.tableSearch}
              ifcClassFilter={workspaceState.ifcClassFilter}
              title={queryResult ? 'BQL result' : 'Elements'}
              onSearchChange={(tableSearch) => patchWorkspaceState({ tableSearch })}
              onIfcClassFilterChange={(ifcClassFilter) => patchWorkspaceState({ ifcClassFilter })}
              onSelectElement={(selectedObjectId) => {
                setQueryResult(null);
                patchWorkspaceState({ selectedObjectId, selectedObjectKind: 'physicalElement' });
              }}
            />
          ) : null}
        </div>
        <div className="h-full min-h-0" style={{ gridColumn: 2 }}>
          <BimViewport
            preparedModel={prepared}
            selectedElement={selectedElement}
            selectedProperties={selectedProperties}
            highlightElementIds={queryElementIds}
            queryViewerMode={queryResult?.viewerState?.mode ?? null}
            displayMode={workspaceState.displayMode}
            isolateOnSelect={workspaceState.isolateOnSelect}
            hiddenStoreys={workspaceState.hiddenStoreys}
            hiddenLayers={workspaceState.hiddenLayers}
            section={workspaceState.section}
            colorByProperty={queryResult?.viewerState?.colorByProperty}
            leftPanelOpen={leftPanelOpen}
            rightPanelOpen={rightPanelOpen}
            initialCamera={workspaceState.camera}
            projectionMode={workspaceState.projectionMode}
            onToggleLeftPanel={() => togglePanel('left')}
            onToggleRightPanel={() => togglePanel('right')}
            onDisplayModeChange={(displayMode) => patchWorkspaceState({ displayMode })}
            onIsolateOnSelectChange={(isolateOnSelect) => patchWorkspaceState({ isolateOnSelect })}
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
            viewportBackgroundColor={workspaceState.viewportBackgroundColor}
            showEnvironment={workspaceState.showEnvironment}
            lightingMode={workspaceState.lightingMode}
            environmentPreset={workspaceState.environmentPreset}
            onMeasurementsChange={(measurements) => patchWorkspaceState({ measurements })}
            onMeasureUnitsChange={(measureUnits) => patchWorkspaceState({ measureUnits })}
            onMeasureSnapModeChange={(measureSnapMode) => patchWorkspaceState({ measureSnapMode })}
            onMeasureKindChange={(measureKind) => patchWorkspaceState({ measureKind })}
            onMeasurementsVisibleChange={(measurementsVisible) => patchWorkspaceState({ measurementsVisible })}
            onWireframeModeChange={(wireframeMode) => patchWorkspaceState({ wireframeMode })}
            onWireframeStyleChange={(wireframeStylePatch) => patchWorkspaceState(wireframeStylePatch)}
            onRenderStyleChange={(nextRenderStyle) => {
              if (nextRenderStyle === 'clay') patchWorkspaceState(getClayPresetWorkspacePatch());
              else patchWorkspaceState({ renderStyle: 'standard' });
            }}
            onClayStyleChange={(clayStylePatch) => patchWorkspaceState(clayStylePatch)}
            onViewportBackgroundChange={(viewportBackgroundColor) => patchWorkspaceState({ viewportBackgroundColor })}
            onLightingChange={(lightingPatch) => patchWorkspaceState(lightingPatch)}
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
          />
        </div>
        <div className="h-full min-h-0 overflow-hidden" style={{ gridColumn: 3 }}>
          {rightPanelOpen ? (
            <BimInspector
              element={selectedElement}
              properties={selectedProperties}
              provenance={selectedProvenance}
              assemblies={prepared.semanticAssemblies ?? []}
              assemblyMembers={prepared.assemblyMembers ?? []}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
