import React from 'react';
import { useBimBqlPanel } from '../hooks/useBimBqlPanel.js';
import { BimBqlHud } from './BimBqlHud.jsx';

export { BQL_PRESET_QUERIES } from './bimBqlPanelShared.js';

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
  const queryText = response.query ? JSON.stringify(response.query, null, 2) : '';
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

export function BimQueryPanel(props) {
  const bql = useBimBqlPanel(props);
  return (
    <BimBqlHud
      queryText={bql.queryText}
      onQueryTextChange={bql.setQueryText}
      selectedSavedQueryId={bql.selectedSavedQueryId}
      savedQueries={bql.savedQueries}
      rebuildDisabled={bql.rebuildDisabled}
      statusLine={bql.statusLine}
      statusIsError={bql.statusIsError}
      onRunQuery={bql.run}
      onSaveQuery={bql.saveQuery}
      onClearQuery={bql.onClearQuery}
      onDeleteSelectedQuery={bql.deleteSelectedQuery}
      onRebuildCache={bql.onRebuildCache}
      onApplyPreset={bql.applyPreset}
      onLoadSavedQuery={bql.loadSavedQuery}
    />
  );
}
