import React, { useState } from 'react';
import { ControlDial } from '../../../../../components/ControlDial.jsx';
import { VintageSlider } from '../../../../../components/VintageSlider.jsx';
import { PitchSliderControl } from '../../../../../components/PitchSliderControl.jsx';
import { formatPitchDisplay, normalizePitchValue } from '../../../../sonicStudio/domain/sonicVoiceParams.js';
import { BEAT_TRACK_SYNTH_RANGES, normalizeBeatTrackSynth } from '../domain/beatTrackSynth.js';

const CONTROL_LABELS = {
  gain: 'Gain',
  attackMs: 'Attack',
  decayMs: 'Decay',
  pitch: 'Pitch',
  tone: 'Tone',
  distortion: 'Drive',
};

const CONTROL_RANGES = {
  gain: { ...BEAT_TRACK_SYNTH_RANGES.gain, step: 0.01 },
  attackMs: { ...BEAT_TRACK_SYNTH_RANGES.attackMs, step: 1 },
  decayMs: { ...BEAT_TRACK_SYNTH_RANGES.decayMs, step: 5 },
  pitch: { ...BEAT_TRACK_SYNTH_RANGES.pitch, step: 0.01 },
  tone: { ...BEAT_TRACK_SYNTH_RANGES.tone, step: 0.01 },
  distortion: { ...BEAT_TRACK_SYNTH_RANGES.distortion, step: 0.01 },
};

function formatValue(key, value, { pitchSemitoneMode = false } = {}) {
  if (key === 'attackMs' || key === 'decayMs') return `${Math.round(value)}ms`;
  if (key === 'pitch') return formatPitchDisplay(value, pitchSemitoneMode);
  return value.toFixed(2);
}

function SynthSlider({ trackId, controlKey, value, onChange, compact = false, pointerGuard = {} }) {
  const range = CONTROL_RANGES[controlKey];
  return (
    <label className={`min-w-0 grid gap-1 ${compact ? '' : 'grid-cols-[3.5rem_1fr_3rem] items-center'}`}>
      <span className="sans text-[10px] uppercase tracking-wider text-muted truncate">
        {CONTROL_LABELS[controlKey]}
      </span>
      <VintageSlider
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onPointerDown={pointerGuard.onPointerDown}
        onMouseDown={pointerGuard.onMouseDown}
        onDoubleClick={pointerGuard.onDoubleClick}
        onChange={(event) => {
          onChange(trackId, { [controlKey]: Number(event.target.value) });
        }}
        className="pointer-events-auto"
        aria-label={`${CONTROL_LABELS[controlKey]} ${trackId}`}
      />
      <span className="sans text-[10px] text-muted tabular-nums">
        {formatValue(controlKey, value)}
      </span>
    </label>
  );
}

function SynthDial({
  controlKey,
  value,
  onChange,
  pitchSemitoneMode = false,
  pointerGuard = {},
  size = 'md',
}) {
  const range = CONTROL_RANGES[controlKey];
  return (
    <ControlDial
      label={CONTROL_LABELS[controlKey]}
      min={range.min}
      max={range.max}
      step={range.step}
      value={value}
      size={size}
      formatDisplay={(nextValue) => formatValue(controlKey, nextValue, { pitchSemitoneMode })}
      onChange={(nextValue) => onChange({ [controlKey]: nextValue })}
      onPointerDown={pointerGuard.onPointerDown}
      onMouseDown={pointerGuard.onMouseDown}
      onDoubleClick={pointerGuard.onDoubleClick}
    />
  );
}

export function BeatTrackSynthControls({
  track,
  controls = ['gain', 'attackMs', 'decayMs', 'pitch', 'tone', 'distortion'],
  onChange,
  compact = false,
  variant = 'sliders',
  pointerGuard = {},
  dialSize = compact ? 'sm' : 'md',
}) {
  const [pitchSemitoneMode, setPitchSemitoneMode] = useState(false);

  if (!track) return null;
  const synth = normalizeBeatTrackSynth(track);
  const showPitch = controls.includes('pitch');
  const dialControls = controls.filter((key) => key !== 'pitch');

  if (variant === 'dials') {
    return (
      <div className="min-w-0 grid gap-2">
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(4.25rem,1fr))]">
          {dialControls.map((controlKey) => (
            <SynthDial
              key={controlKey}
              controlKey={controlKey}
              value={synth[controlKey]}
              size={dialSize}
              pointerGuard={pointerGuard}
              onChange={(patch) => onChange(track.id, patch)}
            />
          ))}
        </div>
        {showPitch && (
          <div className="border border-border-subtle rounded-sm bg-surface-muted/40 px-2 py-1.5">
            <PitchSliderControl
              label={CONTROL_LABELS.pitch}
              variant="card"
              value={synth.pitch}
              semitoneMode={pitchSemitoneMode}
              onSemitoneModeChange={setPitchSemitoneMode}
              onPointerGuard={pointerGuard}
              onChange={(nextValue) => onChange(track.id, {
                pitch: normalizePitchValue(nextValue, pitchSemitoneMode),
              })}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`min-w-0 ${compact ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}`}>
      {controls.map((controlKey) => {
        if (controlKey === 'pitch') {
          return (
            <PitchSliderControl
              key={controlKey}
              label={CONTROL_LABELS.pitch}
              value={synth.pitch}
              semitoneMode={pitchSemitoneMode}
              onSemitoneModeChange={setPitchSemitoneMode}
              onPointerGuard={pointerGuard}
              onChange={(nextValue) => onChange(track.id, { pitch: nextValue })}
            />
          );
        }
        return (
          <SynthSlider
            key={controlKey}
            trackId={track.id}
            controlKey={controlKey}
            value={synth[controlKey]}
            onChange={onChange}
            compact={compact}
            pointerGuard={pointerGuard}
          />
        );
      })}
    </div>
  );
}
