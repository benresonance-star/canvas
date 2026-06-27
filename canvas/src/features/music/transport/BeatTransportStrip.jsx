import React from 'react';
import { Clock, Pause, Play, Square } from 'lucide-react';

export function BeatTransportStrip({
  state,
  onPlay,
  onStop,
  onBpmChange,
  clockSync = false,
  onClockSyncToggle,
}) {
  return (
    <div className="flex items-center gap-2 border border-border bg-surface-muted px-2 py-1.5 rounded-md">
      {onClockSyncToggle && (
        <button
          type="button"
          onClick={onClockSyncToggle}
          className={`h-8 w-8 grid place-items-center rounded border transition ${
            clockSync
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-border text-secondary hover:border-accent/60 hover:text-accent'
          }`}
          title={clockSync ? 'Clock sync on' : 'Clock sync off'}
          aria-label={clockSync ? 'Clock sync on' : 'Clock sync off'}
          aria-pressed={clockSync}
        >
          <Clock size={14} />
        </button>
      )}
      <button
        type="button"
        onClick={state.isPlaying ? onStop : onPlay}
        className="h-8 w-8 grid place-items-center rounded bg-accent text-on-accent"
        title={state.isPlaying ? 'Stop' : 'Play'}
      >
        {state.isPlaying ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <button
        type="button"
        onClick={onStop}
        className="h-8 w-8 grid place-items-center rounded border border-border text-secondary"
        title="Stop"
      >
        <Square size={13} />
      </button>
      <label className="sans text-[10px] uppercase tracking-wider text-muted flex items-center gap-1">
        BPM
        <input
          type="number"
          min="30"
          max="300"
          value={state.bpm}
          onChange={(event) => onBpmChange(Number(event.target.value))}
          className="w-16 bg-surface border border-border rounded px-2 py-1 text-primary text-xs"
        />
      </label>
      <span className="sans text-[10px] text-muted tabular-nums">
        {state.currentBar}.{state.currentBeat}.{state.currentTick}
      </span>
    </div>
  );
}
