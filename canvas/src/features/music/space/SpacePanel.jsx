import React from 'react';
import { Box } from 'lucide-react';
import { VintageSlider } from '../../../components/VintageSlider.jsx';
import {
  SPACE_ROOM_IDENTITIES,
  ROOM_SLIDER_ANCHORS,
  createDefaultBeatAudioRouting,
  createDefaultSpaceState,
  deriveSpaceFromDescriptors,
  mapSpaceStateToFdnParams,
} from '../../../../packages/music-core/src/index.js';

const ROOM_CHARACTER = {
  studio: 'Tight, controlled room',
  chamber: 'Warm mid-size space, slower build',
  hall: 'Large, airy tail with movement',
  plate: 'Bright, dense metallic bloom',
  void: 'Dry — no reverb',
};

export function SpacePanel({
  spaceState,
  descriptorGraph,
  audioRouting,
  onChange,
  onChangeAudioRouting,
}) {
  const state = createDefaultSpaceState(spaceState);
  const routing = createDefaultBeatAudioRouting(audioRouting);
  const isVoid = state.roomIdentity === 'void';
  const isActive = !routing.acousticSpaceBypass && !isVoid;
  const fdnPreview = isVoid ? null : mapSpaceStateToFdnParams(state);
  const update = (patch) => onChange?.(createDefaultSpaceState({ ...state, ...patch }));
  const updateRoom = (roomIdentity) => {
    const anchors = ROOM_SLIDER_ANCHORS[roomIdentity] ?? {};
    update({ roomIdentity, ...anchors });
  };
  const updateRouting = (patch) => onChangeAudioRouting?.(
    createDefaultBeatAudioRouting({ ...routing, ...patch }),
  );

  return (
    <section className="border border-border bg-surface rounded p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="sans text-[10px] uppercase tracking-wider text-muted">Acoustic Space</div>
        <Box size={14} className="text-muted" />
      </div>
      <div className="grid gap-2">
        <label className="sans text-xs text-secondary flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            disabled={isVoid}
            onChange={(event) => updateRouting({ acousticSpaceBypass: !event.target.checked })}
          />
          FDN reverb active (post-temporal)
        </label>
        {isVoid && (
          <div className="sans text-xs text-warning">
            Room is void — no reverb. Pick studio, chamber, hall, or plate to hear space.
          </div>
        )}
        {!isVoid && routing.acousticSpaceBypass && (
          <div className="sans text-xs text-muted">Bypassed — dry output after temporal FX.</div>
        )}
        <label className="sans text-[10px] text-muted grid gap-1">
          Room
          <select
            value={state.roomIdentity}
            onChange={(event) => updateRoom(event.target.value)}
            className="bg-surface-muted border border-border rounded-sm px-2 py-1 text-xs text-primary"
          >
            {SPACE_ROOM_IDENTITIES.map((room) => <option key={room} value={room}>{room}</option>)}
          </select>
        </label>
        {!isVoid && (
          <div className="sans text-xs text-muted">
            {ROOM_CHARACTER[state.roomIdentity]}
            {fdnPreview && (
              <span className="block mt-1 text-[10px]">
                tail {Math.round(fdnPreview.feedback * 100)}%
                {' · '}
                delay ×{fdnPreview.delayScale.toFixed(2)}
                {' · '}
                pre {Math.round(fdnPreview.predelayMs)}ms
              </span>
            )}
          </div>
        )}
        {['roomSize', 'width', 'diffusion', 'damping'].map((key) => (
          <label key={key} className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
            {key}
            <VintageSlider
              min="0"
              max="1"
              step="0.01"
              value={state[key]}
              disabled={isVoid}
              onChange={(event) => update({ [key]: Number(event.target.value) })}
            />
          </label>
        ))}
        <button
          type="button"
          className="sans text-xs border border-border rounded-sm px-3 py-2 hover:border-accent disabled:opacity-50"
          disabled={isVoid}
          onClick={() => onChange?.(deriveSpaceFromDescriptors(state, descriptorGraph))}
        >
          Map From Descriptors
        </button>
      </div>
    </section>
  );
}
