import React from 'react';
import { Layers } from 'lucide-react';

function VisibilitySection({
  title,
  entries,
  hiddenIds,
  onToggle,
  onShowAll,
  onHideAll,
}) {
  if (entries.length === 0) {
    return (
      <section className="space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-muted">{title}</div>
        <div className="text-[11px] text-muted">None found in model</div>
      </section>
    );
  }

  const hiddenSet = new Set(hiddenIds);
  const visibleCount = entries.length - hiddenSet.size;

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted">
          {title}
          <span className="ml-1 normal-case text-secondary">
            ({visibleCount}/{entries.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onShowAll}
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-secondary hover:bg-surface-muted"
          >
            All
          </button>
          <button
            type="button"
            onClick={onHideAll}
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-secondary hover:bg-surface-muted"
          >
            None
          </button>
        </div>
      </div>
      <ul className="max-h-40 space-y-0.5 overflow-y-auto pr-1">
        {entries.map((entry) => {
          const visible = !hiddenSet.has(entry.id);
          return (
            <li key={entry.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[11px] hover:bg-surface-muted">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={() => onToggle(entry.id)}
                  className="accent-accent"
                  aria-label={`${visible ? 'Hide' : 'Show'} ${entry.label}`}
                />
                <span className={`min-w-0 flex-1 truncate ${visible ? 'text-secondary' : 'text-muted line-through'}`}>
                  {entry.label}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted">{entry.count}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function BimLayersHud({
  catalog,
  hiddenStoreys,
  hiddenLayers,
  onToggleStorey,
  onToggleLayer,
  onShowAllStoreys,
  onHideAllStoreys,
  onShowAllLayers,
  onHideAllLayers,
}) {
  return (
    <div
      className="pointer-events-auto w-full rounded-md border border-border bg-surface/95 p-2.5 shadow-lg backdrop-blur-sm"
      aria-label="IFC layers and storeys"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
        <Layers size={12} strokeWidth={1.8} aria-hidden />
        <span className="text-secondary">Layers &amp; storeys</span>
      </div>
      <div className="space-y-3">
        <VisibilitySection
          title="Storeys"
          entries={catalog.storeys}
          hiddenIds={hiddenStoreys}
          onToggle={onToggleStorey}
          onShowAll={onShowAllStoreys}
          onHideAll={onHideAllStoreys}
        />
        <VisibilitySection
          title="Layers"
          entries={catalog.layers}
          hiddenIds={hiddenLayers}
          onToggle={onToggleLayer}
          onShowAll={onShowAllLayers}
          onHideAll={onHideAllLayers}
        />
      </div>
    </div>
  );
}
