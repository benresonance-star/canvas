import React from 'react';
import { VintageSlider } from './VintageSlider.jsx';
import {
  formatPitchDisplay,
  getPitchSliderConfig,
  normalizePitchValue,
} from '../features/sonicStudio/domain/sonicVoiceParams.js';

export function PitchSliderControl({
  label = 'Pitch',
  value = 0,
  onChange,
  semitoneMode = false,
  onSemitoneModeChange,
  disabled = false,
  variant = 'compact',
  onPointerGuard,
}) {
  const config = getPitchSliderConfig(semitoneMode);
  const normalizedValue = normalizePitchValue(value, semitoneMode);

  const toggleSemitoneMode = (nextMode) => {
    onSemitoneModeChange?.(nextMode);
    if (nextMode) {
      onChange?.(normalizePitchValue(value, true));
    }
  };

  if (variant === 'editor') {
    return (
      <div className="block">
        <div className="flex items-center justify-between gap-3 mb-1">
          <span className="sans text-xs text-secondary">{label}</span>
          <span className="sans text-[10px] text-muted tabular-nums">
            {formatPitchDisplay(normalizedValue, semitoneMode)}
          </span>
        </div>
        <VintageSlider
          min={config.min}
          max={config.max}
          step={config.step}
          value={normalizedValue}
          disabled={disabled}
          onChange={(event) => onChange?.(normalizePitchValue(event.target.value, semitoneMode))}
        />
        <label className="mt-1 sans text-[10px] text-muted flex items-center gap-2">
          <input
            type="checkbox"
            checked={semitoneMode}
            disabled={disabled}
            onChange={(event) => toggleSemitoneMode(event.target.checked)}
          />
          Semitone steps
        </label>
      </div>
    );
  }

  const labelColClass = variant === 'card' ? 'grid-cols-[3.75rem_1fr]' : 'grid-cols-[5rem_1fr]';
  const checkboxPadClass = variant === 'card' ? 'pl-[3.75rem]' : 'pl-[5rem]';
  const rowGapClass = variant === 'card' ? 'gap-1' : 'gap-2';
  const guard = onPointerGuard ?? {};

  return (
    <div className={`grid ${variant === 'card' ? 'gap-0.5' : 'gap-1'}`}>
      <label className={`sans text-[10px] text-muted grid ${labelColClass} ${rowGapClass} items-center`}>
        <span className="truncate">{label}</span>
        <VintageSlider
          min={config.min}
          max={config.max}
          step={config.step}
          value={normalizedValue}
          disabled={disabled}
          onPointerDown={guard.onPointerDown}
          onMouseDown={guard.onMouseDown}
          onDoubleClick={guard.onDoubleClick}
          onChange={(event) => onChange?.(normalizePitchValue(event.target.value, semitoneMode))}
        />
      </label>
      <label className={`sans text-[10px] text-muted flex items-center gap-1.5 ${checkboxPadClass}`}>
        <input
          type="checkbox"
          checked={semitoneMode}
          disabled={disabled}
          onPointerDown={guard.onPointerDown}
          onMouseDown={guard.onMouseDown}
          onChange={(event) => toggleSemitoneMode(event.target.checked)}
        />
        Semitone steps
      </label>
    </div>
  );
}
