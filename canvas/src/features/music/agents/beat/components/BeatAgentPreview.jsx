import React, { useMemo, useState } from 'react';
import { Clock, Play, Square } from 'lucide-react';
import { useBeatAgentRuntime } from '../hooks/useBeatAgentRuntime.js';
import { BeatTrackSynthControls } from './BeatTrackSynthControls.jsx';

function stopCardInteraction(event) {
  event.stopPropagation();
}

export function BeatAgentPreview({
  card,
  projectId = null,
  folderHandle = null,
  onUpdateCard = null,
  compact = false,
}) {
  const {
    state,
    transportState,
    play,
    stop,
    playhead,
    toggleStep,
    updateTrackSynth,
    clockSync,
    toggleClockSync,
    saving,
    error,
    status,
  } = useBeatAgentRuntime({
    card,
    projectId,
    folderHandle,
    onUpdateCard,
    debounceMs: 550,
  });

  const pattern = state?.pattern ?? card?.musicState?.pattern;
  const tracks = pattern?.tracks ?? [];
  const visibleTracks = tracks.slice(0, compact ? 3 : 4);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const selectedTrack = useMemo(() => (
    visibleTracks.find((track) => track.id === selectedTrackId) ?? visibleTracks[0] ?? null
  ), [selectedTrackId, visibleTracks]);
  const label = error || (saving ? 'Saving...' : status || state?.status || 'draft');

  return (
    <div className="h-full w-full min-h-0 flex flex-col justify-center gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="sans text-[10px] uppercase tracking-wider text-muted">Beat Agent</div>
          <div className="sans text-xs text-primary truncate">{pattern?.name ?? card.name}</div>
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <button
            type="button"
            className={`inline-flex h-8 w-8 items-center justify-center rounded border transition pointer-events-auto ${
              clockSync
                ? 'border-accent text-accent bg-accent/10'
                : 'border-border text-secondary bg-surface-muted hover:border-accent hover:text-accent'
            }`}
            title={clockSync ? 'Clock sync on' : 'Clock sync off'}
            aria-label={clockSync ? 'Clock sync on' : 'Clock sync off'}
            aria-pressed={clockSync}
            onPointerDown={stopCardInteraction}
            onMouseDown={stopCardInteraction}
            onDoubleClick={stopCardInteraction}
            onClick={(event) => {
              event.stopPropagation();
              toggleClockSync({ debounce: true });
            }}
          >
            <Clock size={14} />
          </button>
          <button
            type="button"
            className={`inline-flex h-8 w-8 items-center justify-center rounded border transition pointer-events-auto ${
              transportState.isPlaying
                ? 'border-warning text-warning bg-warning/10'
                : 'border-border text-secondary bg-surface-muted hover:border-accent hover:text-accent'
            }`}
            title={transportState.isPlaying ? 'Stop preview' : 'Play preview'}
            aria-label={transportState.isPlaying ? 'Stop preview' : 'Play preview'}
            onPointerDown={stopCardInteraction}
            onMouseDown={stopCardInteraction}
            onDoubleClick={stopCardInteraction}
            onClick={(event) => {
              event.stopPropagation();
              if (transportState.isPlaying) {
                stop();
              } else {
                void play();
              }
            }}
          >
            {transportState.isPlaying ? <Square size={14} /> : <Play size={14} />}
          </button>
        </div>
      </div>

      <div className="grid gap-1.5">
        {visibleTracks.map((track) => (
          <div key={track.id} className="grid grid-cols-[3.5rem_1fr] gap-1.5 items-center">
            <button
              type="button"
              className={`sans text-[10px] truncate text-left pointer-events-auto ${
                selectedTrack?.id === track.id ? 'text-accent' : 'text-muted hover:text-secondary'
              }`}
              title={`Edit ${track.name}`}
              onPointerDown={stopCardInteraction}
              onMouseDown={stopCardInteraction}
              onDoubleClick={stopCardInteraction}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedTrackId(track.id);
              }}
            >
              {track.name}
            </button>
            <div
              className="grid gap-0.5"
              style={{ gridTemplateColumns: `repeat(${pattern.stepCount}, minmax(0, 1fr))` }}
            >
              {track.steps.slice(0, pattern.stepCount).map((step, index) => {
                const isPlayhead = transportState.isPlaying && index === playhead;
                return (
                  <button
                    key={`${track.id}-${index}`}
                    type="button"
                    className={`h-4 min-w-0 rounded-sm border transition pointer-events-auto ${
                      step.active
                        ? 'bg-accent border-accent'
                        : 'bg-surface-muted border-border hover:border-accent/60'
                    } ${isPlayhead ? 'ring-2 ring-warning ring-offset-1 ring-offset-surface' : ''}`}
                    title={`${track.name} step ${index + 1}`}
                    aria-label={`${track.name} step ${index + 1}${step.active ? ' on' : ' off'}`}
                    aria-pressed={Boolean(step.active)}
                    onPointerDown={stopCardInteraction}
                    onMouseDown={stopCardInteraction}
                    onDoubleClick={stopCardInteraction}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleStep(track.id, index, { debounce: true });
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedTrack && !compact && (
        <div
          className="border-t border-border-subtle pt-2"
          onPointerDown={stopCardInteraction}
          onMouseDown={stopCardInteraction}
          onDoubleClick={stopCardInteraction}
        >
          <div className="sans text-[10px] text-muted truncate mb-1">
            {selectedTrack.name} sound
          </div>
          <BeatTrackSynthControls
            track={selectedTrack}
            controls={['gain', 'decayMs', 'tone', 'distortion']}
            compact
            onChange={(trackId, patch) => updateTrackSynth(trackId, patch, { debounce: true })}
          />
        </div>
      )}

      <div className={`sans text-[10px] truncate ${error ? 'text-danger' : saving ? 'text-warning' : 'text-muted'}`}>
        {clockSync && !error ? `Clock sync / ${label}` : label}
      </div>
    </div>
  );
}
