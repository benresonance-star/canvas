import React from 'react';
import { TimerReset } from 'lucide-react';
import {
  TEMPORAL_TOPOLOGIES,
  createDefaultTemporalState,
  createTemporalTopologyPreset,
  deriveTemporalFromDescriptors,
} from '../../../../packages/music-core/src/index.js';

export function TemporalPanel({ temporalState, descriptorGraph, onChange }) {
  const state = createDefaultTemporalState(temporalState);
  const update = (patch) => onChange?.(createDefaultTemporalState({ ...state, ...patch }));
  const updateCharacter = (patch) => update({ character: { ...state.character, ...patch } });
  const updateModulation = (patch) => update({ modulation: { ...state.modulation, ...patch } });
  const updateSpatial = (patch) => update({ spatialRouting: { ...state.spatialRouting, ...patch } });
  const updateFreeze = (patch) => update({ freeze: { ...state.freeze, ...patch } });

  return (
    <section className="border border-border bg-surface rounded p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="sans text-[10px] uppercase tracking-wider text-muted">Temporal Engine</div>
        <TimerReset size={14} className="text-muted" />
      </div>
      <div className="grid gap-2">
        <label className="sans text-[10px] text-muted grid gap-1">
          Topology
          <select
            value={state.topology}
            onChange={(event) => onChange?.(createTemporalTopologyPreset(event.target.value))}
            className="bg-surface-muted border border-border rounded-sm px-2 py-1 text-xs text-primary"
          >
            {TEMPORAL_TOPOLOGIES.map((topology) => (
              <option key={topology} value={topology}>{topology}</option>
            ))}
          </select>
        </label>
        {[
          ['delayMs', 20, 1200, 1],
          ['feedback', 0, 0.92, 0.01],
          ['wet', 0, 1, 0.01],
          ['diffusion', 0, 1, 0.01],
        ].map(([key, min, max, step]) => (
          <label key={key} className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
            {key}
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={state[key]}
              onChange={(event) => update({ [key]: Number(event.target.value) })}
            />
          </label>
        ))}
        <div className="grid gap-2 border-t border-border pt-2">
          <label className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
            drive
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={state.character.drive}
              onChange={(event) => updateCharacter({ drive: Number(event.target.value) })}
            />
          </label>
          <label className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
            age
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={state.character.age}
              onChange={(event) => updateCharacter({ age: Number(event.target.value) })}
            />
          </label>
          <label className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
            mod
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={state.modulation.depth}
              onChange={(event) => updateModulation({ depth: Number(event.target.value) })}
            />
          </label>
          <label className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
            width
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={state.spatialRouting.width}
              onChange={(event) => updateSpatial({ width: Number(event.target.value) })}
            />
          </label>
        </div>
        {state.topology === 'freeze' && (
          <label className="sans text-xs text-secondary flex items-center gap-2 border border-border bg-surface-muted rounded-sm px-2 py-2">
            <input
              type="checkbox"
              checked={state.freeze.armed}
              onChange={(event) => updateFreeze({ armed: event.target.checked })}
            />
            Freeze buffer
          </label>
        )}
        {state.topology === 'pitch-delay' && (
          <label className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
            pitch
            <input
              type="range"
              min="-24"
              max="24"
              step="1"
              value={state.pitchSemitones}
              onChange={(event) => update({ pitchSemitones: Number(event.target.value) })}
            />
          </label>
        )}
        {state.topology === 'granular' && (
          <label className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
            grain
            <input
              type="range"
              min="12"
              max="240"
              step="1"
              value={state.grainMs}
              onChange={(event) => update({ grainMs: Number(event.target.value) })}
            />
          </label>
        )}
        {state.topology === 'swarm' && (
          <label className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
            voices
            <input
              type="range"
              min="1"
              max="12"
              step="1"
              value={state.voices}
              onChange={(event) => update({ voices: Number(event.target.value) })}
            />
          </label>
        )}
        <button
          type="button"
          className="sans text-xs border border-border rounded-sm px-3 py-2 hover:border-accent"
          onClick={() => onChange?.(deriveTemporalFromDescriptors(state, descriptorGraph))}
        >
          Map From Descriptors
        </button>
      </div>
    </section>
  );
}
