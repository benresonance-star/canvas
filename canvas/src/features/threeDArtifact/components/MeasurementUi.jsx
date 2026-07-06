import React from 'react';
import { Eye, EyeOff, Ruler, Trash2 } from 'lucide-react';
import { formatMeasurementDistance, formatMeasurementLabel, MEASUREMENT_UNIT_OPTIONS } from '../utils/measureSnap.js';

export function MeasurementToolbarControls({
  measureModeActive = false,
  measureSnapMode = 'vertex',
  measureKind = 'segment',
  measureUnits = 'cm',
  onToggleMeasureMode,
  onMeasureSnapModeChange,
  onMeasureKindChange,
  onMeasureUnitsChange,
  onCancelMeasure,
  compact = false,
  buttonClassName,
  activeButtonClassName,
}) {
  const buttonClass = (active = false) => {
    if (buttonClassName) {
      return active && activeButtonClassName
        ? activeButtonClassName
        : buttonClassName(active);
    }
    return `inline-flex items-center justify-center rounded border px-2 py-1 transition ${
      active
        ? 'border-accent bg-accent text-on-accent'
        : 'border-border bg-surface text-secondary hover:text-primary hover:bg-surface-muted'
    }`;
  };
  const snapButtonClass = (active = false) =>
    `px-2 py-1 rounded text-[10px] uppercase tracking-wide transition ${
      active
        ? 'bg-accent text-on-accent'
        : 'text-muted hover:text-primary hover:bg-surface-muted'
    }`;
  const iconSize = compact ? 12 : 14;

  return (
    <>
      <button type="button" title="Measure" className={buttonClass(measureModeActive)} onClick={onToggleMeasureMode}>
        <Ruler size={iconSize} strokeWidth={1.7} />
      </button>
      <label className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-secondary">
        <span className="uppercase tracking-wide text-muted">Unit</span>
        <select
          value={measureUnits}
          onChange={(event) => onMeasureUnitsChange?.(event.target.value)}
          className="three-d-measure-unit-select outline-none cursor-pointer"
          aria-label="Measurement unit"
        >
          {MEASUREMENT_UNIT_OPTIONS.map((unit) => (
            <option key={unit} value={unit}>{unit}</option>
          ))}
        </select>
      </label>
      {measureModeActive && (
        <>
          <div className="inline-flex items-center rounded border border-border overflow-hidden">
            <button
              type="button"
              title="Measure distance between two points"
              className={snapButtonClass(measureKind === 'segment')}
              onClick={() => onMeasureKindChange?.('segment')}
            >
              Distance
            </button>
            <button
              type="button"
              title="Measure polyline path or perimeter"
              className={snapButtonClass(measureKind === 'polyline')}
              onClick={() => onMeasureKindChange?.('polyline')}
              disabled={measureSnapMode === 'edge'}
            >
              Polyline
            </button>
          </div>
          <div className="inline-flex items-center rounded border border-border overflow-hidden">
            <button
              type="button"
              title="Snap to vertices"
              className={snapButtonClass(measureSnapMode === 'vertex')}
              onClick={() => onMeasureSnapModeChange?.('vertex')}
            >
              Vertex
            </button>
            <button
              type="button"
              title="Snap to edges"
              className={snapButtonClass(measureSnapMode === 'edge')}
              onClick={() => {
                onMeasureSnapModeChange?.('edge');
                onMeasureKindChange?.('segment');
              }}
            >
              Edge
            </button>
          </div>
          <button
            type="button"
            title="Cancel measurement"
            aria-label="Cancel measurement"
            className={buttonClass(false)}
            onClick={() => onCancelMeasure?.()}
          >
            <Trash2 size={iconSize} strokeWidth={1.7} />
          </button>
        </>
      )}
    </>
  );
}

export function MeasurementsListPanel({
  measurements,
  units = 'cm',
  modelUnits = 'cm',
  measurementsVisible = true,
  onMeasurementsVisibleChange,
  onRemoveMeasurement,
  className = 'sans absolute bottom-3 left-3 z-20 max-w-sm rounded border border-border bg-surface/95 px-3 py-2 shadow-lg backdrop-blur-sm',
}) {
  if (!measurements.length) return null;

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted">Measurements</div>
        <button
          type="button"
          title={measurementsVisible ? 'Hide measurements on model' : 'Show measurements on model'}
          aria-label={measurementsVisible ? 'Hide measurements on model' : 'Show measurements on model'}
          aria-pressed={measurementsVisible}
          className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 transition ${
            measurementsVisible
              ? 'border-accent/50 text-accent hover:bg-accent/10'
              : 'border-border text-muted hover:text-primary hover:bg-surface-muted'
          }`}
          onClick={() => onMeasurementsVisibleChange?.(!measurementsVisible)}
        >
          {measurementsVisible ? <Eye size={12} strokeWidth={1.7} /> : <EyeOff size={12} strokeWidth={1.7} />}
        </button>
      </div>
      <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
        {measurements.map((measurement, index) => (
          <div key={measurement.id} className="flex items-center justify-between gap-2 text-xs text-secondary">
            <span>
              {index + 1}. {formatMeasurementLabel(measurement, units, modelUnits)}
            </span>
            <button
              type="button"
              title="Delete measurement"
              className="inline-flex items-center justify-center rounded border border-border px-1.5 py-0.5 text-muted hover:text-warning hover:border-warning transition"
              onClick={() => onRemoveMeasurement?.(measurement.id)}
            >
              <Trash2 size={12} strokeWidth={1.7} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
