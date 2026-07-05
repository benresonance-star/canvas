import React from 'react';
import { Braces, Play, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { BQL_PRESET_QUERIES } from './bimBqlPanelShared.js';

export function BimBqlHud({
  queryText,
  onQueryTextChange,
  selectedSavedQueryId,
  savedQueries = [],
  rebuildDisabled = false,
  statusLine,
  statusIsError = false,
  onRunQuery,
  onSaveQuery,
  onClearQuery,
  onDeleteSelectedQuery,
  onRebuildCache,
  onApplyPreset,
  onLoadSavedQuery,
}) {
  return (
    <div
      className="pointer-events-auto w-full rounded-md border border-border bg-surface/95 p-2.5 shadow-lg backdrop-blur-sm"
      aria-label="BQL query"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
        <Braces size={12} strokeWidth={1.8} aria-hidden />
        <span className="text-secondary">BQL</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <select
          aria-label="BQL preset"
          className="w-full rounded border border-border bg-preview-bg px-1.5 py-1 text-[11px] text-secondary outline-none"
          onChange={(event) => onApplyPreset(event.target.value)}
          defaultValue="allBeams"
        >
          {Object.entries(BQL_PRESET_QUERIES).map(([key, preset]) => (
            <option key={key} value={key}>{preset.label}</option>
          ))}
        </select>
        <select
          aria-label="Saved BQL queries"
          className="w-full rounded border border-border bg-preview-bg px-1.5 py-1 text-[11px] text-secondary outline-none"
          value={selectedSavedQueryId}
          onChange={(event) => onLoadSavedQuery(event.target.value)}
        >
          <option value="">Saved queries</option>
          {savedQueries.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.label}</option>
          ))}
        </select>
        <textarea
          value={queryText}
          onChange={(event) => onQueryTextChange(event.target.value)}
          rows={4}
          spellCheck={false}
          className="min-h-[5rem] w-full resize-y overflow-y-auto rounded border border-border bg-preview-bg px-1.5 py-1 font-mono text-[10px] leading-tight text-primary outline-none"
          aria-label="BQL query JSON"
        />
        <div className="flex flex-wrap items-center gap-0.5">
          <button
            type="button"
            onClick={onRunQuery}
            className="inline-flex items-center justify-center rounded border border-border bg-accent p-1.5 text-on-accent"
            title="Run BQL"
            aria-label="Run BQL"
          >
            <Play size={12} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={onSaveQuery}
            className="inline-flex items-center justify-center rounded border border-border p-1.5 text-secondary hover:bg-surface-muted"
            title="Save BQL query"
            aria-label="Save BQL query"
          >
            <Save size={12} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={onClearQuery}
            className="inline-flex items-center justify-center rounded border border-border p-1.5 text-secondary hover:bg-surface-muted"
            title="Clear query result"
            aria-label="Clear query result"
          >
            <X size={12} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={onDeleteSelectedQuery}
            disabled={savedQueries.length === 0}
            className="inline-flex items-center justify-center rounded border border-border p-1.5 text-secondary hover:bg-surface-muted disabled:opacity-40"
            title="Delete saved query"
            aria-label="Delete saved query"
          >
            <Trash2 size={12} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={onRebuildCache}
            disabled={rebuildDisabled}
            className="inline-flex items-center justify-center rounded border border-border p-1.5 text-secondary hover:bg-surface-muted disabled:opacity-40"
            title="Rebuild BIM cache"
            aria-label="Rebuild BIM cache"
          >
            <RotateCcw size={12} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {statusLine && (
        <div className={`mt-1.5 truncate text-[10px] ${statusIsError ? 'text-warning' : 'text-muted'}`}>
          {statusLine}
        </div>
      )}
    </div>
  );
}
