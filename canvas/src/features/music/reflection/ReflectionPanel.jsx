import React from 'react';
import { Activity } from 'lucide-react';
import { analyzeMusicClutter } from '../../../../packages/music-core/src/index.js';

export function ReflectionPanel({ descriptorGraph, spaceState, temporalState, performerStates = [] }) {
  const analysis = analyzeMusicClutter({
    descriptorGraph,
    spaceState,
    temporalState,
    performerStates,
  });

  return (
    <section className="border border-border bg-surface rounded p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="sans text-[10px] uppercase tracking-wider text-muted">Reflection</div>
        <Activity size={14} className="text-muted" />
      </div>
      <div className="sans text-xs text-secondary mb-2">
        Clutter risk: {analysis.risk} ({Math.round(analysis.clutter * 100)}%)
      </div>
      <div className="h-2 rounded-sm bg-surface-muted border border-border overflow-hidden mb-2">
        <div className="h-full bg-warning" style={{ width: `${analysis.clutter * 100}%` }} />
      </div>
      <div className="grid gap-1">
        {analysis.suggestions.length === 0 ? (
          <div className="sans text-xs text-muted">No clutter warnings.</div>
        ) : analysis.suggestions.map((suggestion) => (
          <div key={suggestion} className="sans text-xs text-muted">{suggestion}</div>
        ))}
      </div>
    </section>
  );
}
