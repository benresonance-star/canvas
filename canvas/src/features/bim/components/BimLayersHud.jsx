import React, { useCallback, useEffect, useRef } from 'react';
import { Layers } from 'lucide-react';
import {
  MIN_LAYERS_HUD_SECTION_HEIGHT_PX,
  normalizeLayersHudStoreysHeight,
} from '../bim-core/types.js';

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
      <section className="flex h-full min-h-0 flex-col space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-muted">{title}</div>
        <div className="text-[11px] text-muted">None found in model</div>
      </section>
    );
  }

  const hiddenSet = new Set(hiddenIds);
  const visibleCount = entries.length - hiddenSet.size;

  return (
    <section className="flex h-full min-h-0 flex-col space-y-1.5">
      <div className="flex shrink-0 items-center justify-between gap-2">
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
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
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
  height,
  maxHeight,
  storeysHeight,
  onStoreysHeightChange,
  onResizePointerDown,
  onToggleStorey,
  onToggleLayer,
  onShowAllStoreys,
  onHideAllStoreys,
  onShowAllLayers,
  onHideAllLayers,
}) {
  const bodyRef = useRef(null);
  const splitResizeRef = useRef(null);
  const resolvedStoreysHeight = normalizeLayersHudStoreysHeight(storeysHeight);

  const handleSplitResizePointerDown = useCallback((event) => {
    event.preventDefault();
    const body = bodyRef.current;
    if (!body) return;
    const bodyRect = body.getBoundingClientRect();
    splitResizeRef.current = {
      startY: event.clientY,
      startHeight: resolvedStoreysHeight,
      bodyTop: bodyRect.top,
      bodyHeight: bodyRect.height,
    };
  }, [resolvedStoreysHeight]);

  useEffect(() => {
    const onPointerMove = (event) => {
      const state = splitResizeRef.current;
      if (!state || state.bodyHeight <= 0) return;
      const nextHeight = state.startHeight + (event.clientY - state.startY);
      onStoreysHeightChange(normalizeLayersHudStoreysHeight(nextHeight, state.bodyHeight));
    };
    const onPointerUp = () => {
      splitResizeRef.current = null;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [onStoreysHeightChange]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const bodyHeight = body.getBoundingClientRect().height;
    const clamped = normalizeLayersHudStoreysHeight(storeysHeight, bodyHeight);
    if (clamped !== resolvedStoreysHeight) {
      onStoreysHeightChange(clamped);
    }
  }, [height, onStoreysHeightChange, resolvedStoreysHeight, storeysHeight]);

  return (
    <div
      className="pointer-events-auto flex w-full flex-col overflow-hidden rounded-md border border-border bg-surface/95 shadow-lg backdrop-blur-sm"
      style={{ height, maxHeight }}
      aria-label="IFC layers and storeys"
    >
      <div className="shrink-0 p-2.5 pb-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
          <Layers size={12} strokeWidth={1.8} aria-hidden />
          <span className="text-secondary">Layers &amp; storeys</span>
        </div>
      </div>
      <div
        ref={bodyRef}
        className="flex min-h-0 flex-1 flex-col overflow-hidden px-2.5 pb-2"
      >
        <div
          className="flex min-h-0 shrink-0 flex-col overflow-hidden"
          style={{
            height: resolvedStoreysHeight,
            minHeight: MIN_LAYERS_HUD_SECTION_HEIGHT_PX,
          }}
        >
          <VisibilitySection
            title="Storeys"
            entries={catalog.storeys}
            hiddenIds={hiddenStoreys}
            onToggle={onToggleStorey}
            onShowAll={onShowAllStoreys}
            onHideAll={onHideAllStoreys}
          />
        </div>
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize storeys and layers sections"
          onPointerDown={handleSplitResizePointerDown}
          className="pointer-events-auto my-1 flex h-1.5 shrink-0 cursor-row-resize touch-none items-center justify-center rounded-sm hover:bg-accent/20"
        />
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          style={{ minHeight: MIN_LAYERS_HUD_SECTION_HEIGHT_PX }}
        >
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
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize layers panel"
        onPointerDown={onResizePointerDown}
        className="pointer-events-auto flex h-1.5 shrink-0 cursor-row-resize touch-none items-center justify-center rounded-sm hover:bg-accent/20"
      />
    </div>
  );
}
