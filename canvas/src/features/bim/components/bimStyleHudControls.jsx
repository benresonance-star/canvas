/* eslint-disable react-refresh/only-export-components */
import React from 'react';

export function formatClaySliderValue(kind, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  switch (kind) {
    case 'aoIntensity':
      return String(Math.round(numeric));
    case 'aoRadius':
      return numeric < 0.01 ? numeric.toFixed(4) : numeric.toFixed(2);
    case 'aoBias':
      return numeric >= 0.01 ? numeric.toFixed(2) : numeric.toFixed(5);
    case 'aoDistance':
      return numeric.toFixed(3);
    case 'aoSamples':
      return String(Math.round(numeric));
    case 'aoResolution':
      return `${Math.round(numeric * 100)}%`;
    case 'lightIntensity':
      return numeric.toFixed(2);
    case 'glassOpacity':
      return numeric.toFixed(2);
    case 'originalColorBlend':
      return `${Math.round(numeric * 100)}%`;
    case 'wireframeTransparency':
      return `${Math.round(numeric * 100)}%`;
    case 'lineWeight':
      return numeric.toFixed(2);
    default:
      return String(numeric);
  }
}

export function claySliderAtLimit(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric <= min) return 'min';
  if (numeric >= max) return 'max';
  return null;
}

export function ClaySliderControl({
  label,
  value,
  min,
  max,
  step,
  title,
  ariaLabel,
  sliderClassName = 'w-full flex-1 min-w-0',
  valueClassName = 'min-w-[2.25rem]',
  formatKind,
  onChange,
  disabled = false,
  stacked = false,
}) {
  const numericValue = Number(value);
  const sliderValue = Number.isFinite(numericValue) ? numericValue : min;
  const formatted = formatClaySliderValue(formatKind, sliderValue);
  const atLimit = claySliderAtLimit(sliderValue, min, max);
  const limitTitle = atLimit === 'max'
    ? `At slider maximum (${formatted}) — range may need extending`
    : atLimit === 'min'
      ? `At slider minimum (${formatted})`
      : `${formatted} (range ${formatClaySliderValue(formatKind, min)}–${formatClaySliderValue(formatKind, max)})`;

  const valueNode = (
    <span
      className={`${valueClassName} shrink-0 text-right font-mono tabular-nums text-[9px] leading-none ${atLimit ? 'text-accent' : 'text-muted'}`}
      title={limitTitle}
    >
      {formatted}
    </span>
  );

  const sliderNode = (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={sliderValue}
      onChange={onChange}
      disabled={disabled}
      className={`${stacked ? 'w-full' : sliderClassName} accent-accent disabled:cursor-not-allowed disabled:opacity-50`}
      aria-label={ariaLabel}
      aria-valuetext={formatted}
    />
  );

  if (stacked) {
    return (
      <label className="flex w-full flex-col gap-1 text-[10px] text-secondary" title={title}>
        <div className="flex items-center justify-between gap-2">
          <span className="whitespace-nowrap uppercase tracking-wider text-muted">{label}</span>
          {valueNode}
        </div>
        {sliderNode}
      </label>
    );
  }

  return (
    <label className="flex w-full items-center gap-1.5 text-[10px] text-secondary" title={title}>
      <span className="w-7 shrink-0 text-muted uppercase tracking-wider">{label}</span>
      {sliderNode}
      {valueNode}
    </label>
  );
}

export function WireframeHiddenLinesToggle({ hiddenLines, onChange }) {
  return (
    <button
      type="button"
      title={hiddenLines
        ? 'Hidden edges — visible outlines only. Click for full wireframe (all edges).'
        : 'Full wireframe — all edges visible. Click for hidden edges (visible outlines only).'}
      onClick={() => onChange({ wireframeHiddenLines: !hiddenLines })}
      className={`rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
        hiddenLines ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'
      }`}
      aria-pressed={hiddenLines}
      aria-label={hiddenLines ? 'Hidden wireframe edges enabled' : 'Full wireframe enabled'}
    >
      {hiddenLines ? 'Hdn' : 'All'}
    </button>
  );
}
