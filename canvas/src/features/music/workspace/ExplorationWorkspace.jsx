import React from 'react';
import { GitBranch, Sparkles } from 'lucide-react';

export function ExplorationWorkspace({ sketches = [], clusters = [], activeSketchId = null, onSelectSketch }) {
  return (
    <section className="border border-border bg-surface rounded p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="sans text-[10px] uppercase tracking-wider text-muted">Exploration Workspace</div>
        <GitBranch size={14} className="text-muted" />
      </div>
      <div className="grid gap-3">
        <div>
          <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">Sketch Clusters</div>
          <div className="flex flex-wrap gap-1">
            {clusters.length === 0 && <span className="sans text-xs text-muted">No clusters yet.</span>}
            {clusters.map((cluster) => (
              <span key={cluster.id} className="sans text-[10px] border border-border rounded-sm px-2 py-1 text-secondary">
                {cluster.name}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">Sketches</div>
          <div className="grid gap-1 max-h-48 overflow-auto">
            {sketches.length === 0 && <div className="sans text-xs text-muted">This beat is ready to become the first sketch.</div>}
            {sketches.map((sketch) => (
              <button
                type="button"
                key={sketch.id}
                onClick={() => onSelectSketch?.(sketch)}
                className={`text-left border rounded-sm px-2 py-2 ${
                  sketch.id === activeSketchId
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-surface-muted hover:border-accent/60'
                }`}
              >
                <div className="sans text-xs text-secondary truncate">{sketch.name}</div>
                <div className="sans text-[10px] text-muted">{sketch.sketchType} / {sketch.variations?.length ?? 0} variations</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">Instrument DNA</div>
          <div className="sans text-xs text-muted flex items-center gap-2">
            <Sparkles size={13} /> Beat performer DNA is mapped from pattern roles, synth tone, and descriptor pressure.
          </div>
        </div>
      </div>
    </section>
  );
}
