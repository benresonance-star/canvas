import React, { useMemo } from 'react';
import { Slice } from 'lucide-react';
import { ClaySliderControl } from './bimStyleHudControls.jsx';
import {
  WIREFRAME_LINE_WEIGHT_MIN,
  WIREFRAME_LINE_WEIGHT_MAX,
} from '../bim-core/types.js';
import {
  estimateStoreyPlaneHeights,
  getPrimaryPlaneHeight,
  sectionHeightRangeFromBounds,
} from '../bim-core/bimSectioning.js';

export function BimSectionHud({
  section,
  bounds,
  preparedModel = null,
  catalogStoreys = [],
  onPatchSection,
  onSetPlaneHeight,
  onFlipPlane,
  onApplyStoreyPreset,
}) {
  const heightRange = useMemo(
    () => sectionHeightRangeFromBounds(bounds),
    [bounds?.min?.y, bounds?.max?.y, bounds?.center?.y, bounds?.radius],
  );
  const planeHeight = Math.min(
    heightRange.max,
    Math.max(heightRange.min, getPrimaryPlaneHeight(section)),
  );
  const storeyPresets = useMemo(
    () => estimateStoreyPlaneHeights(preparedModel, bounds, catalogStoreys),
    [preparedModel, bounds?.min?.y, bounds?.max?.y, bounds?.center?.y, bounds?.radius, catalogStoreys],
  );

  return (
    <div
      className="pointer-events-auto w-full rounded-md border border-border bg-surface/95 p-2.5 shadow-lg backdrop-blur-sm"
      aria-label="Section cut"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
          <Slice size={12} strokeWidth={1.8} aria-hidden />
          <span className="text-secondary">Section cut</span>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-secondary">
          <input
            type="checkbox"
            checked={section.enabled === true}
            onChange={(event) => onPatchSection({ enabled: event.target.checked })}
            className="accent-accent"
            aria-label={section.enabled ? 'Disable section cut' : 'Enable section cut'}
          />
          <span>{section.enabled ? 'On' : 'Off'}</span>
        </label>
      </div>

      <div className={`space-y-3 ${section.enabled ? '' : 'opacity-60'}`}>
        <ClaySliderControl
          label="Plane height"
          value={planeHeight}
          min={heightRange.min}
          max={heightRange.max}
          step={0.05}
          formatKind="lineWeight"
          title="Move the horizontal section plane"
          ariaLabel="Section plane height"
          onChange={(event) => onSetPlaneHeight(Number(event.target.value))}
          disabled={!section.enabled}
          stacked
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onFlipPlane}
            disabled={!section.enabled}
            className="rounded border border-border px-2 py-0.5 text-[10px] text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Flip direction
          </button>
        </div>

        {storeyPresets.length > 0 && (
          <section className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted">Storey presets</div>
            <div className="flex flex-wrap gap-1">
              {storeyPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!section.enabled}
                  onClick={() => onApplyStoreyPreset(preset.y)}
                  className="rounded border border-border px-1.5 py-0.5 text-[10px] text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    preset.elevation != null
                      ? `Set section plane to 1 m above ${preset.label} (${preset.elevation} m)`
                      : `Set section plane to ${preset.label}`
                  }
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-2 border-t border-border pt-2">
          <div className="text-[10px] uppercase tracking-wider text-muted">Section style</div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-secondary">
              <input
                type="checkbox"
                checked={section.showFills !== false}
                onChange={(event) => onPatchSection({ showFills: event.target.checked })}
                className="accent-accent"
                aria-label="Show section fills"
              />
              Fills
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-secondary">
              <input
                type="checkbox"
                checked={section.showEdges !== false}
                onChange={(event) => onPatchSection({ showEdges: event.target.checked })}
                className="accent-accent"
                aria-label="Show section edges"
              />
              Edges
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-secondary">
              <span>Fill</span>
              <input
                type="color"
                value={section.fillColor}
                onChange={(event) => onPatchSection({ fillColor: event.target.value })}
                title="Section fill colour"
                aria-label="Section fill colour"
                className="h-6 w-6 cursor-pointer rounded border border-border bg-surface p-0.5"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-secondary">
              <span>Edge</span>
              <input
                type="color"
                value={section.edgeColor}
                onChange={(event) => onPatchSection({ edgeColor: event.target.value })}
                title="Section edge colour"
                aria-label="Section edge colour"
                className="h-6 w-6 cursor-pointer rounded border border-border bg-surface p-0.5"
              />
            </label>
          </div>
          <ClaySliderControl
            label="Edge weight"
            value={section.edgeLineWeight}
            min={WIREFRAME_LINE_WEIGHT_MIN}
            max={WIREFRAME_LINE_WEIGHT_MAX}
            step={0.25}
            formatKind="lineWeight"
            title="Section edge line weight"
            ariaLabel="Section edge line weight"
            onChange={(event) => onPatchSection({ edgeLineWeight: Number(event.target.value) })}
            stacked
          />
        </section>
      </div>
    </div>
  );
}
