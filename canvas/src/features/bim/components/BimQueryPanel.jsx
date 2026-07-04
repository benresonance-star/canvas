import React, { useMemo, useState } from 'react';
import { Play, RotateCcw, X } from 'lucide-react';

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
};

function prettyQuery(query) {
  return JSON.stringify(query, null, 2);
}

export function BimQueryPanel({
  queryResult,
  onRunQuery,
  onClearQuery,
  onRebuildCache,
  rebuildDisabled = false,
}) {
  const [queryText, setQueryText] = useState(() => prettyQuery(PRESET_QUERIES.allBeams.query));
  const [parseError, setParseError] = useState(null);
  const summary = useMemo(() => queryResult?.summary ?? 'Raw element mode', [queryResult]);

  const run = () => {
    try {
      const query = JSON.parse(queryText);
      setParseError(null);
      onRunQuery(query);
    } catch (error) {
      setParseError(error?.message || 'Invalid JSON');
    }
  };

  return (
    <div className="shrink-0 border-b border-border bg-surface px-3 py-2">
      <div className="flex items-start gap-2">
        <select
          aria-label="BQL preset"
          className="w-36 rounded border border-border bg-preview-bg px-2 py-1 text-xs text-secondary outline-none"
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
        <textarea
          value={queryText}
          onChange={(event) => setQueryText(event.target.value)}
          rows={3}
          spellCheck={false}
          className="min-w-0 flex-1 resize-none rounded border border-border bg-preview-bg px-2 py-1 font-mono text-[10px] text-primary outline-none"
          aria-label="BQL query JSON"
        />
        <div className="flex flex-col gap-1">
          <button type="button" onClick={run} className="inline-flex items-center justify-center rounded border border-border bg-accent p-1.5 text-on-accent" title="Run BQL">
            <Play size={14} strokeWidth={1.8} />
          </button>
          <button type="button" onClick={onClearQuery} className="inline-flex items-center justify-center rounded border border-border p-1.5 text-secondary hover:bg-surface-muted" title="Clear query result">
            <X size={14} strokeWidth={1.8} />
          </button>
          <button type="button" onClick={onRebuildCache} disabled={rebuildDisabled} className="inline-flex items-center justify-center rounded border border-border p-1.5 text-secondary hover:bg-surface-muted disabled:opacity-40" title="Rebuild BIM cache">
            <RotateCcw size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      <div className={`mt-1 text-[10px] ${parseError || queryResult?.status === 'error' ? 'text-warning' : 'text-muted'}`}>
        {parseError || queryResult?.warnings?.join(' ') || summary}
      </div>
    </div>
  );
}
