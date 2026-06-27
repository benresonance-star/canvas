import React from 'react';
import { normalizeBeatTrackSynth } from '../domain/beatTrackSynth.js';

const CONTROL_LABELS = {
  gain: 'Gain',
  attackMs: 'Attack',
  decayMs: 'Decay',
  pitch: 'Pitch',
  tone: 'Tone',
  distortion: 'Drive',
};

const CONTROL_RANGES = {
  gain: { min: 0, max: 1.5, step: 0.01 },
  attackMs: { min: 0, max: 80, step: 1 },
  decayMs: { min: 20, max: 800, step: 5 },
  pitch: { min: -24, max: 24, step: 1 },
  tone: { min: 0, max: 1, step: 0.01 },
  distortion: { min: 0, max: 1, step: 0.01 },
};

function formatValue(key, value) {
  if (key === 'attackMs' || key === 'decayMs') return `${Math.round(value)}ms`;
  if (key === 'pitch') return `${value > 0 ? '+' : ''}${Math.round(value)}`;
  return value.toFixed(2);
}

function SynthSlider({ trackId, controlKey, value, onChange, compact = false }) {
  const range = CONTROL_RANGES[controlKey];
  return (
    <label className={`min-w-0 grid gap-1 ${compact ? '' : 'grid-cols-[3.5rem_1fr_3rem] items-center'}`}>
      <span className="sans text-[10px] uppercase tracking-wider text-muted truncate">
        {CONTROL_LABELS[controlKey]}
      </span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          onChange(trackId, { [controlKey]: Number(event.target.value) });
        }}
        className="w-full accent-accent pointer-events-auto"
        aria-label={`${CONTROL_LABELS[controlKey]} ${trackId}`}
      />
      <span className="sans text-[10px] text-muted tabular-nums">
        {formatValue(controlKey, value)}
      </span>
    </label>
  );
}

export function BeatTrackSynthControls({
  track,
  controls = ['gain', 'attackMs', 'decayMs', 'pitch', 'tone', 'distortion'],
  onChange,
  compact = false,
}) {
  if (!track) return null;
  const synth = normalizeBeatTrackSynth(track);
  return (
    <div className={`min-w-0 ${compact ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}`}>
      {controls.map((controlKey) => (
        <SynthSlider
          key={controlKey}
          trackId={track.id}
          controlKey={controlKey}
          value={synth[controlKey]}
          onChange={onChange}
          compact={compact}
        />
      ))}
    </div>
  );
}
