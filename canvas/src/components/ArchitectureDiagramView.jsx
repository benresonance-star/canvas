import React from 'react';
import { ARCHITECTURE_LAYERS } from '../lib/systemArchitectureSpec.js';

/**
 * @param {{ highlightedLayerIds?: Set<string> }} props
 */
export function ArchitectureDiagramView({ highlightedLayerIds = new Set() }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="img" aria-hidden="true">
      {ARCHITECTURE_LAYERS.map((layer) => {
        const active = highlightedLayerIds.has(layer.id);
        return (
          <div
            key={layer.id}
            className={`rounded-lg border px-3 py-3 transition-colors ${
              active
                ? 'border-accent bg-accent/10 shadow-sm'
                : 'border-border bg-surface/60'
            }`}
          >
            <p className="sans text-[10px] uppercase tracking-wider text-primary font-medium">
              {layer.label}
            </p>
            <p className="sans text-[10px] text-muted mt-1 leading-snug">{layer.description}</p>
          </div>
        );
      })}
      <div className="col-span-2 sm:col-span-4 flex justify-center gap-2 py-1 text-muted">
        <span className="sans text-[9px] uppercase tracking-widest">→ sync flow →</span>
      </div>
    </div>
  );
}
