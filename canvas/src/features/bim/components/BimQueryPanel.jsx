import React, { useMemo, useState } from 'react';
import { Bot, Play, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { CONNECTORS, DEFAULT_SINGLE_CONNECTOR_ID, getConnectorById } from '../../../lib/agentConnectors.js';
import { draftBqlFromNaturalLanguage } from '../bim-core/bimAgent.js';
import { buildBimAgentResponse } from '../bim-core/bimAgentResponse.js';

const PRESET_QUERIES = {
  allBeams: {
    label: 'All beams',
    query: {
      version: '0.1',
      select: 'elements',
      from: 'physicalElements',
      where: { ifcClass: 'IfcBeam' },
      view: { mode: 'ghostOthers', focus: true },
    },
  },
  groundFloor: {
    label: 'Ground floor',
    query: {
      version: '0.1',
      select: 'elements',
      from: 'physicalElements',
      where: { storey: 'GROUND FLOOR' },
      view: { mode: 'isolate', focus: true },
    },
  },
  windows: {
    label: 'Windows',
    query: {
      version: '0.1',
      select: 'elements',
      from: 'allBimObjects',
      where: {
        or: [
          { ifcClass: 'IfcWindow' },
          { semanticType: 'WindowAssembly' },
        ],
      },
      view: { mode: 'highlight', focus: true },
    },
  },
  colorByStorey: {
    label: 'Color by storey',
    query: {
      version: '0.1',
      select: 'elements',
      from: 'physicalElements',
      view: { mode: 'colorBy', colorByProperty: 'storey', focus: true },
    },
  },
};

const BIM_AGENT_INFO = {
  name: 'BIM Evidence Agent',
  model: 'local/bim-bql-rules-v0.1',
  source: 'prepared IFC index',
};

const LOCAL_BIM_RULES_RESPONDER_ID = 'local-bim-rules';
const API_OFFLINE_PROVIDER_MESSAGE =
  'Canvas API offline. Start with npm run dev:stack or npm run server.';

function friendlyProviderStatusMessage({ connector, connectorStatus, providerState }) {
  if (!connector) {
    return { status: 'ready', label: 'ready', message: 'Local BIM Rules ready.' };
  }
  if (providerState?.status === 'checking') {
    return { status: 'checking', label: 'checking', message: 'Checking Canvas API.' };
  }
  if (providerState?.status === 'offline') {
    return { status: 'apiOffline', label: 'API offline', message: API_OFFLINE_PROVIDER_MESSAGE };
  }
  if (!connectorStatus) {
    return {
      status: 'unavailable',
      label: 'unavailable',
      message: `${connector.label} status is unavailable. Refresh agent status.`,
    };
  }
  if (connectorStatus.usable) {
    return {
      status: 'ready',
      label: 'ready',
      message: `${connector.label} ready (${connectorStatus.model ?? connector.model}).`,
    };
  }
  const healthError = connectorStatus.healthError || '';
  if (connector.provider === 'ollama') {
    if (connectorStatus.needsPull || /not pulled/i.test(healthError)) {
      return {
        status: 'modelMissing',
        label: 'model not pulled',
        message: `${connector.model} not pulled. Pull the model before asking ${connector.label}.`,
      };
    }
    if (/cannot reach ollama|ollama.*not reachable/i.test(healthError)) {
      return {
        status: 'ollamaOffline',
        label: 'Ollama offline',
        message: 'Ollama offline. Start Ollama on localhost:11434.',
      };
    }
    return {
      status: 'ollamaUnavailable',
      label: 'Ollama unavailable',
      message: healthError || `Ollama is not ready for ${connector.label}.`,
    };
  }
  if (connector.requiresCredential !== false && !connectorStatus.configured) {
    return {
      status: 'credentialRequired',
      label: 'credential required',
      message: `${connector.label} needs an API key before it can answer.`,
    };
  }
  return {
    status: 'unavailable',
    label: 'unavailable',
    message: healthError || `${connector.label} is not ready.`,
  };
}

function RunningBadge({ compact = false }) {
  return (
    <span
      className={`bim-agent-running-badge shrink-0 rounded border border-border text-secondary uppercase tracking-wider ${
        compact ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
      }`}
    >
      Running
    </span>
  );
}

function prettyQuery(query) {
  return JSON.stringify(query, null, 2);
}

function resolutionLabel(resolution) {
  if (!resolution?.terms?.length) return '';
  const aliases = [...new Set(resolution.aliases ?? [])].slice(0, 5);
  const source = resolution.source === 'session'
    ? 'session aliases'
    : (resolution.source === 'vocabulary' ? 'BIM vocabulary' : 'semantic search');
  return `Resolution: ${source} matched "${resolution.terms.join(', ')}"${aliases.length ? ` as ${aliases.join(', ')}` : ''}.`;
}

export function BimAgentResponsePanel({ response, compact = false }) {
  if (!response) return null;
  const isFallback = response.status === 'fallback' || response.fallbackUsed;
  const isError = response.status === 'error';
  const queryText = response.query ? prettyQuery(response.query) : '';
  const groups = Array.isArray(response.result?.groups) ? response.result.groups : [];
  const groupRows = groups.slice(0, compact ? 3 : 6);
  const groupOverflow = groups.length - groupRows.length;
  const semanticResolutionText = resolutionLabel(response.semanticResolution);
  if (compact) {
    return (
      <div className={`rounded border px-2 py-1 text-xs ${isError ? 'border-warning/50 bg-warning/10' : 'border-border bg-preview-bg'}`}>
        <div className="flex items-start gap-2">
          {isFallback && <span className="shrink-0 rounded border border-warning/40 px-1 py-0.5 text-[9px] uppercase tracking-wider text-warning">Fallback</span>}
          {response.status === 'running' && <RunningBadge compact />}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-primary">{response.answer || response.resultSummary || 'No answer yet.'}</div>
            {(response.workSummary || response.evidenceSummary) && (
              <div className="truncate text-[10px] text-secondary">{response.workSummary || response.evidenceSummary}</div>
            )}
            {response.providerStatusMessage && (
              <div className="truncate text-[10px] text-muted">Provider: {response.providerStatusMessage}</div>
            )}
            {semanticResolutionText && (
              <div className="truncate text-[10px] text-muted">{semanticResolutionText}</div>
            )}
            {groupRows.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {groupRows.map((group) => (
                  <span key={group.value} className="rounded border border-border px-1 py-0.5 text-[9px] text-secondary">
                    {group.value}: {group.count}
                  </span>
                ))}
                {groupOverflow > 0 && <span className="text-[9px] text-muted">+{groupOverflow} more</span>}
              </div>
            )}
          </div>
        </div>
        {response.warnings?.length > 0 && (
          <div className="mt-0.5 truncate text-[10px] text-warning">{response.warnings.join(' ')}</div>
        )}
        {queryText && (
          <details className="mt-0.5">
            <summary className="cursor-pointer text-[9px] uppercase tracking-wider text-muted">Generated BQL</summary>
            <pre className="mt-0.5 max-h-16 overflow-auto rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[9px] text-secondary">{queryText}</pre>
          </details>
        )}
      </div>
    );
  }
  return (
    <div className={`rounded border ${isError ? 'border-warning/50 bg-warning/10' : 'border-border bg-preview-bg'} px-3 py-2`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-muted">
        <span className="text-secondary">Agent Response</span>
        {isFallback && <span className="rounded border border-warning/40 px-1.5 py-0.5 text-warning">Fallback used</span>}
        {response.status === 'running' && <RunningBadge />}
      </div>
      <div className="grid gap-2 text-xs md:grid-cols-[minmax(0,1.5fr)_minmax(12rem,0.9fr)]">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">Answer</div>
          <div className="mt-1 text-sm font-medium text-primary">{response.answer || response.resultSummary || 'No answer yet.'}</div>
          {groupRows.length > 0 && (
            <div className="mt-2 grid gap-1 text-[11px] text-secondary sm:grid-cols-2">
              {groupRows.map((group) => (
                <div key={group.value} className="flex justify-between gap-3 rounded border border-border bg-surface px-2 py-1">
                  <span className="truncate">{group.value}</span>
                  <span className="font-medium text-primary">{group.count}</span>
                </div>
              ))}
              {groupOverflow > 0 && <div className="text-muted">+{groupOverflow} more groups</div>}
            </div>
          )}
        </div>
        <div className="grid gap-1 text-[11px] text-secondary">
          <div><span className="text-muted">Selected mode:</span> {response.selectedResponder || '-'}</div>
          <div><span className="text-muted">Responder:</span> {response.actualResponder || '-'}</div>
          <div><span className="text-muted">Provider status:</span> {response.providerStatusMessage || response.providerStatus || '-'}</div>
          <div><span className="text-muted">Work:</span> {response.workSummary || '-'}</div>
          {semanticResolutionText && <div><span className="text-muted">Resolution:</span> {semanticResolutionText.replace(/^Resolution:\s*/, '')}</div>}
          <div><span className="text-muted">Evidence:</span> {response.evidenceSummary || '-'}</div>
        </div>
      </div>
      {response.warnings?.length > 0 && (
        <div className="mt-2 text-[11px] text-warning">{response.warnings.join(' ')}</div>
      )}
      {queryText && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-muted">Generated BQL</summary>
          <pre className="mt-2 max-h-28 overflow-auto rounded border border-border bg-surface px-2 py-1 font-mono text-[10px] text-secondary">{queryText}</pre>
        </details>
      )}
    </div>
  );
}

export function BimQueryPanel({
  queryResult,
  onRunQuery,
  onRunLocalAgent,
  onRunLlmAgent,
  agentRunState = { status: 'idle', message: null, model: null },
  agentProviderState = { status: 'checking', message: 'Checking Canvas API.', connectors: [] },
  onRefreshAgentProviderState = () => {},
  onClearQuery,
  onRebuildCache,
  savedQueries = [],
  onSaveQuery = () => {},
  onDeleteSavedQuery = () => {},
  rebuildDisabled = false,
  initialResponderId = LOCAL_BIM_RULES_RESPONDER_ID,
}) {
  const [agentText, setAgentText] = useState('');
  const [agentFeedback, setAgentFeedback] = useState(null);
  const [agentResponse, setAgentResponse] = useState(null);
  const [queryText, setQueryText] = useState(() => prettyQuery(PRESET_QUERIES.allBeams.query));
  const [parseError, setParseError] = useState(null);
  const [selectedSavedQueryId, setSelectedSavedQueryId] = useState('');
  const [responderId, setResponderId] = useState(initialResponderId);
  const summary = useMemo(() => queryResult?.summary ?? 'Raw element mode', [queryResult]);
  const selectedConnector = responderId === LOCAL_BIM_RULES_RESPONDER_ID
    ? null
    : getConnectorById(responderId) ?? getConnectorById(DEFAULT_SINGLE_CONNECTOR_ID);
  const selectedConnectorStatus = selectedConnector
    ? agentProviderState.connectors?.find((entry) => entry.id === selectedConnector.id)
    : null;
  const providerStatus = friendlyProviderStatusMessage({
    connector: selectedConnector,
    connectorStatus: selectedConnectorStatus,
    providerState: agentProviderState,
  });
  const selectedResponderLabel = selectedConnector
    ? `${selectedConnector.label}/${selectedConnector.model ?? 'not configured'}`
    : `Local BIM Rules/${BIM_AGENT_INFO.model}`;
  const responderLabel = agentRunState.responderLabel && agentRunState.model
    ? `${agentRunState.responderLabel}/${agentRunState.model}`
    : selectedResponderLabel;

  const run = () => {
    try {
      const query = JSON.parse(queryText);
      setParseError(null);
      onRunQuery(query);
    } catch (error) {
      setParseError(error?.message || 'Invalid JSON');
    }
  };

  const parseCurrentQuery = () => {
    try {
      const query = JSON.parse(queryText);
      setParseError(null);
      return query;
    } catch (error) {
      setParseError(error?.message || 'Invalid JSON');
      return null;
    }
  };

  const askAgent = () => {
    setParseError(null);
    const selectedResponder = `Local BIM Rules/${BIM_AGENT_INFO.model}`;
    if (onRunLocalAgent) {
      const draft = onRunLocalAgent(agentText);
      if (!draft.ok) {
        setAgentFeedback(draft.warnings.join(' '));
        setAgentResponse(buildBimAgentResponse({
          question: agentText,
          selectedResponder,
          actualResponder: selectedResponder,
          status: 'error',
          workSummary: 'Local rules could not map the request',
          warnings: draft.warnings,
          providerStatus: 'ready',
          providerStatusMessage: 'Local BIM Rules ready.',
          semanticResolution: draft.semanticResolution,
        }));
        return;
      }
      setQueryText(prettyQuery(draft.query));
      setAgentFeedback(draft.intentSummary);
      setAgentResponse(buildBimAgentResponse({
        question: agentText,
        selectedResponder,
        actualResponder: selectedResponder,
        status: draft.result?.status === 'error' ? 'error' : 'ready',
        workSummary: draft.workSummary ?? 'Local rules drafted BQL',
        warnings: draft.result?.warnings ?? draft.warnings ?? [],
        query: draft.query,
        result: draft.result,
        providerStatus: 'ready',
        providerStatusMessage: 'Local BIM Rules ready.',
        semanticResolution: draft.semanticResolution,
      }));
      return;
    }
    const draft = draftBqlFromNaturalLanguage(agentText);
    if (!draft.ok) {
      setAgentFeedback(draft.warnings.join(' '));
      setAgentResponse(buildBimAgentResponse({
        question: agentText,
        selectedResponder,
        actualResponder: selectedResponder,
        status: 'error',
        workSummary: 'Local rules could not map the request',
        warnings: draft.warnings,
        providerStatus: 'ready',
        providerStatusMessage: 'Local BIM Rules ready.',
        semanticResolution: draft.semanticResolution,
      }));
      return;
    }
    setQueryText(prettyQuery(draft.query));
    setAgentFeedback(draft.intentSummary);
    const result = onRunQuery(draft.query);
    setAgentResponse(buildBimAgentResponse({
      question: agentText,
      selectedResponder,
      actualResponder: selectedResponder,
      status: result?.status === 'error' ? 'error' : 'ready',
      workSummary: 'Local rules drafted BQL',
      warnings: result?.warnings ?? [],
      query: draft.query,
      result,
      providerStatus: 'ready',
      providerStatusMessage: 'Local BIM Rules ready.',
      semanticResolution: draft.semanticResolution,
    }));
  };

  const answerWithLocalFallback = ({
    selectedResponder,
    providerStatus: currentProviderStatus,
    workSummary = 'Provider did not run; local rules answered',
  }) => {
    const fallback = onRunLocalAgent ? onRunLocalAgent(agentText) : draftBqlFromNaturalLanguage(agentText);
    if (!fallback.ok) {
      setAgentFeedback(currentProviderStatus.message);
      setAgentResponse(buildBimAgentResponse({
        question: agentText,
        selectedResponder,
        actualResponder: selectedResponder,
        status: 'error',
        workSummary: 'Provider did not run; local rules could not map the request',
        warnings: [currentProviderStatus.message, ...(fallback.warnings ?? [])],
        providerStatus: currentProviderStatus.status,
        providerStatusMessage: currentProviderStatus.message,
        didProviderRun: false,
        semanticResolution: fallback.semanticResolution,
      }));
      return;
    }
    setQueryText(prettyQuery(fallback.query));
    const result = fallback.result ?? onRunQuery(fallback.query);
    setAgentFeedback(`${workSummary}. ${currentProviderStatus.message}`);
    setAgentResponse(buildBimAgentResponse({
      question: agentText,
      selectedResponder,
      actualResponder: `Local BIM Rules/${BIM_AGENT_INFO.model}`,
      status: 'fallback',
      workSummary,
      warnings: [currentProviderStatus.message, ...(fallback.warnings ?? []), ...(result?.warnings ?? [])],
      query: fallback.query,
      result,
      providerStatus: currentProviderStatus.status,
      providerStatusMessage: currentProviderStatus.message,
      didProviderRun: false,
      fallbackUsed: true,
      semanticResolution: fallback.semanticResolution,
    }));
  };

  const askLlmAgent = async (connectorId) => {
    if (!onRunLlmAgent) {
      setAgentFeedback('LLM BIM agent is not available.');
      return;
    }
    setParseError(null);
    const connector = getConnectorById(connectorId) ?? getConnectorById(DEFAULT_SINGLE_CONNECTOR_ID);
    const selectedResponder = `${connector?.label ?? connectorId}/${connector?.model ?? 'not configured'}`;
    const currentProviderStatus = friendlyProviderStatusMessage({
      connector,
      connectorStatus: agentProviderState.connectors?.find((entry) => entry.id === connector?.id),
      providerState: agentProviderState,
    });
    if (currentProviderStatus.status !== 'ready') {
      answerWithLocalFallback({
        selectedResponder,
        providerStatus: currentProviderStatus,
      });
      return;
    }
    setAgentResponse(buildBimAgentResponse({
      question: agentText,
      selectedResponder,
      actualResponder: selectedResponder,
      status: 'running',
      workSummary: `Asking ${connector?.label ?? connectorId}`,
      providerStatus: currentProviderStatus.status,
      providerStatusMessage: currentProviderStatus.message,
      didProviderRun: true,
    }));
    try {
      const draft = await onRunLlmAgent(agentText, connectorId);
      setQueryText(prettyQuery(draft.query));
      setAgentFeedback(
        [
          draft.intentSummary,
          draft.ambiguityWarning,
          draft.connectorLabel && draft.model ? `Model: ${draft.connectorLabel}/${draft.model}` : null,
        ].filter(Boolean).join(' '),
      );
      const actualResponder = draft.connectorLabel && draft.model ? `${draft.connectorLabel}/${draft.model}` : selectedResponder;
      const fallbackUsed = draft.connectorLabel === 'Local BIM rules';
      const didProviderRun = draft.didProviderRun ?? !fallbackUsed;
      const providerStatusValue = draft.providerStatus ?? currentProviderStatus.status;
      const providerStatusMessage = draft.providerStatusMessage
        ?? (fallbackUsed ? 'Provider failed after the request started.' : currentProviderStatus.message);
      setAgentResponse(buildBimAgentResponse({
        question: agentText,
        selectedResponder,
        actualResponder,
        status: fallbackUsed ? 'fallback' : (draft.result?.status === 'error' ? 'error' : 'ready'),
        workSummary: draft.workSummary ?? (fallbackUsed
          ? (didProviderRun ? 'Provider failed; local rules answered' : 'Provider did not run; local rules answered')
          : 'Provider drafted BQL'),
        warnings: draft.warnings ?? draft.result?.warnings ?? [],
        query: draft.query,
        result: draft.result,
        providerStatus: providerStatusValue,
        providerStatusMessage,
        didProviderRun,
        fallbackUsed,
        semanticResolution: draft.semanticResolution,
      }));
    } catch (error) {
      setAgentFeedback(error?.message || 'LLM BIM agent failed.');
      setAgentResponse(buildBimAgentResponse({
        question: agentText,
        selectedResponder,
        actualResponder: selectedResponder,
        status: 'error',
        workSummary: 'Provider request failed',
        warnings: [error?.message || 'LLM BIM agent failed.'],
        providerStatus: currentProviderStatus.status,
        providerStatusMessage: error?.message || currentProviderStatus.message,
        didProviderRun: true,
      }));
    }
  };

  const askSelectedResponder = () => {
    if (responderId === LOCAL_BIM_RULES_RESPONDER_ID) {
      askAgent();
      return;
    }
    void askLlmAgent(responderId);
  };

  const saveQuery = () => {
    const query = parseCurrentQuery();
    if (!query) return;
    onSaveQuery(agentText.trim() || queryResult?.summary || 'Saved BIM query', query);
  };

  return (
    <div className="shrink-0 border-b border-border bg-surface px-2 py-1">
      <div className="grid grid-cols-1 gap-1 lg:grid-cols-2 lg:gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-secondary">BQL</span>
            <select
              aria-label="BQL preset"
              className="min-w-0 flex-1 rounded border border-border bg-preview-bg px-1.5 py-0.5 text-[11px] text-secondary outline-none"
              onChange={(event) => {
                const preset = PRESET_QUERIES[event.target.value];
                if (preset) setQueryText(prettyQuery(preset.query));
              }}
              defaultValue="allBeams"
            >
              {Object.entries(PRESET_QUERIES).map(([key, preset]) => (
                <option key={key} value={key}>{preset.label}</option>
              ))}
            </select>
            <select
              aria-label="Saved BQL queries"
              className="min-w-0 flex-1 rounded border border-border bg-preview-bg px-1.5 py-0.5 text-[11px] text-secondary outline-none"
              value={selectedSavedQueryId}
              onChange={(event) => {
                const savedQueryId = event.target.value;
                setSelectedSavedQueryId(savedQueryId);
                const saved = savedQueries.find((entry) => entry.id === savedQueryId);
                if (!saved) return;
                setQueryText(prettyQuery(saved.query));
                setAgentFeedback(`Loaded saved query: ${saved.label}`);
                onRunQuery(saved.query, { savedQueryId: saved.id });
              }}
            >
              <option value="">Saved queries</option>
              {savedQueries.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </select>
            <div className="flex shrink-0 items-center gap-0.5">
              <button type="button" onClick={run} className="inline-flex items-center justify-center rounded border border-border bg-accent p-1 text-on-accent" title="Run BQL">
                <Play size={12} strokeWidth={1.8} />
              </button>
              <button type="button" onClick={saveQuery} className="inline-flex items-center justify-center rounded border border-border p-1 text-secondary hover:bg-surface-muted" title="Save BQL query">
                <Save size={12} strokeWidth={1.8} />
              </button>
              <button type="button" onClick={onClearQuery} className="inline-flex items-center justify-center rounded border border-border p-1 text-secondary hover:bg-surface-muted" title="Clear query result">
                <X size={12} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = selectedSavedQueryId || savedQueries[0]?.id;
                  if (id) {
                    onDeleteSavedQuery(id);
                    setSelectedSavedQueryId('');
                  }
                }}
                disabled={savedQueries.length === 0}
                className="inline-flex items-center justify-center rounded border border-border p-1 text-secondary hover:bg-surface-muted disabled:opacity-40"
                title="Delete oldest saved query"
              >
                <Trash2 size={12} strokeWidth={1.8} />
              </button>
              <button type="button" onClick={onRebuildCache} disabled={rebuildDisabled} className="inline-flex items-center justify-center rounded border border-border p-1 text-secondary hover:bg-surface-muted disabled:opacity-40" title="Rebuild BIM cache">
                <RotateCcw size={12} strokeWidth={1.8} />
              </button>
            </div>
          </div>
          <textarea
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
            rows={1}
            spellCheck={false}
            className="mt-1 min-h-[2rem] w-full resize-none overflow-y-auto rounded border border-border bg-preview-bg px-1.5 py-0.5 font-mono text-[10px] leading-tight text-primary outline-none"
            aria-label="BQL query JSON"
          />
        </div>

        <div className="min-w-0 border-t border-border/60 pt-1 lg:border-l lg:border-t-0 lg:pl-2 lg:pt-0">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted">
            <span className="shrink-0 uppercase tracking-wider text-secondary">AI</span>
            <span className="uppercase tracking-wider text-secondary">{BIM_AGENT_INFO.name}</span>
            <span className="truncate">Model: {BIM_AGENT_INFO.model}</span>
            <span className="truncate">Mode: {selectedResponderLabel}</span>
            <span className="truncate">Responder: {responderLabel}</span>
            <span className={providerStatus.status === 'ready' ? 'truncate text-secondary' : 'truncate text-warning'}>
              Provider status: {providerStatus.label}
            </span>
            <span className="truncate">Source: {BIM_AGENT_INFO.source}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              value={agentText}
              onChange={(event) => setAgentText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') askSelectedResponder();
              }}
              className="min-w-0 flex-1 rounded border border-border bg-preview-bg px-1.5 py-0.5 text-[11px] text-primary outline-none"
              aria-label="BIM agent request"
              placeholder="Ask BIM"
            />
            <select
              aria-label="BIM ask responder"
              value={responderId}
              onChange={(event) => setResponderId(event.target.value)}
              className="w-32 rounded border border-border bg-preview-bg px-1.5 py-0.5 text-[11px] text-secondary outline-none"
            >
              <option value={LOCAL_BIM_RULES_RESPONDER_ID}>Local BIM Rules</option>
              {CONNECTORS.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={askSelectedResponder}
              disabled={agentRunState.status === 'running'}
              className="inline-flex shrink-0 items-center justify-center rounded border border-border bg-accent p-1 text-on-accent disabled:opacity-40"
              title="Ask selected BIM responder"
            >
              <Bot size={12} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={onRefreshAgentProviderState}
              className="inline-flex shrink-0 items-center justify-center rounded border border-border px-1.5 py-0.5 text-[10px] text-secondary hover:bg-surface-muted"
              title="Refresh BIM responder status"
            >
              Status
            </button>
          </div>
          {selectedConnector && providerStatus.status !== 'ready' && (
            <div className="mt-1 text-[10px] text-warning">{providerStatus.message}</div>
          )}
          {agentResponse && <div className="mt-1"><BimAgentResponsePanel response={agentResponse} compact /></div>}
        </div>
      </div>
      <div className="mt-0.5 truncate text-[10px]">
        <span className={parseError || queryResult?.status === 'error' || agentRunState.status === 'error' ? 'text-warning' : 'text-muted'}>
          {parseError || queryResult?.warnings?.join(' ') || agentFeedback || agentRunState.message || summary}
        </span>
      </div>
    </div>
  );
}
