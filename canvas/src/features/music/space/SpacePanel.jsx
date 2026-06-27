import React from 'react';
import { Box } from 'lucide-react';
import {
  SPACE_ROOM_IDENTITIES,
  createDefaultSpaceState,
  deriveSpaceFromDescriptors,
} from '../../../../packages/music-core/src/index.js';

export function SpacePanel({ spaceState, descriptorGraph, onChange }) {
  const state = createDefaultSpaceState(spaceState);
  const update = (patch) => onChange?.(createDefaultSpaceState({ ...state, ...patch }));

  return (
    <section className="border border-border bg-surface rounded p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="sans text-[10px] uppercase tracking-wider text-muted">Acoustic Space</div>
        <Box size={14} className="text-muted" />
      </div>
      <div className="grid gap-2">
        <label className="sans text-[10px] text-muted grid gap-1">
          Room
          <select
            value={state.roomIdentity}
            onChange={(event) => update({ roomIdentity: event.target.value })}
            className="bg-surface-muted border border-border rounded-sm px-2 py-1 text-xs text-primary"
          >
            {SPACE_ROOM_IDENTITIES.map((room) => <option key={room} value={room}>{room}</option>)}
          </select>
        </label>
        {['roomSize', 'width', 'diffusion', 'damping'].map((key) => (
          <label key={key} className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
            {key}
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={state[key]}
              onChange={(event) => update({ [key]: Number(event.target.value) })}
            />
          </label>
        ))}
        <button
          type="button"
          className="sans text-xs border border-border rounded-sm px-3 py-2 hover:border-accent"
          onClick={() => onChange?.(deriveSpaceFromDescriptors(state, descriptorGraph))}
        >
          Map From Descriptors
        </button>
      </div>
    </section>
  );
}
