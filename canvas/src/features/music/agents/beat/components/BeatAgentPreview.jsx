import React, { useMemo, useState } from 'react';
import { Clock, Focus, Play, Square } from 'lucide-react';
import { SonicVoiceControls } from '../../../../sonicStudio/components/SonicVoiceControls.jsx';
import { summarizeSonicVoice } from '../../../../sonicStudio/domain/sonicStudioCard.js';
import { useBeatAgentRuntime } from '../hooks/useBeatAgentRuntime.js';
import { updateTrackSonicVoice } from '../domain/beatTrackSoundSource.js';
import { BeatTrackSynthControls } from './BeatTrackSynthControls.jsx';

function stopCardInteraction(event) {
  event.stopPropagation();
}

const cardPointerGuard = {
  onPointerDown: stopCardInteraction,
  onMouseDown: stopCardInteraction,
  onDoubleClick: stopCardInteraction,
};

function isSonicTrack(track) {
  return track?.soundSource === 'sonic_voice' && Boolean(track?.sonicVoice);
}

export function BeatAgentPreview({
  card,
  cards = [],
  projectId = null,
  folderHandle = null,
  onUpdateCard = null,
  compact = false,
}) {
  const {
    state,
    transportState,
    play,
    prepareBeatAudio,
    enableBeatAudio,
    audioContextState,
    stop,
    playhead,
    toggleStep,
    updateTrackSynth,
    updateTrackSound,
    clockSync,
    toggleClockSync,
    isolatedTrackId,
    toggleTrackIsolate,
    saving,
    error,
    status,
  } = useBeatAgentRuntime({
    card,
    cards,
    projectId,
    folderHandle,
    onUpdateCard,
    debounceMs: 550,
  });

  const pattern = state?.pattern;
  const tracks = pattern?.tracks ?? [];
  const visibleTracks = tracks.slice(0, compact ? 3 : 4);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const selectedTrack = useMemo(() => (
    visibleTracks.find((track) => track.id === selectedTrackId) ?? visibleTracks[0] ?? null
  ), [selectedTrackId, visibleTracks]);
  const selectedTrackIsSonic = isSonicTrack(selectedTrack);
  const linkedSonicCard = useMemo(() => {
    const cardId = selectedTrack?.sonicProvenance?.cardId;
    if (!cardId) return null;
    return cards.find((item) => item.id === cardId) ?? null;
  }, [cards, selectedTrack?.sonicProvenance?.cardId]);
  const label = error || (saving ? 'Saving...' : status || state?.status || 'draft');

  return (
    <div className="h-full w-full min-h-0 flex flex-col justify-center gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="sans text-[10px] uppercase tracking-wider text-muted">Beat Agent</div>
          <div className="sans text-xs text-primary truncate">{pattern?.name ?? card.name}</div>
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {audioContextState !== 'running' && (
            <button
              type="button"
              className="inline-flex items-center gap-1 h-8 px-2 rounded border border-warning/50 bg-warning/10 text-warning sans text-[10px] pointer-events-auto"
              title="Browser blocked audio — click to enable"
              onPointerDown={stopCardInteraction}
              onMouseDown={stopCardInteraction}
              onClick={(event) => {
                event.stopPropagation();
                void enableBeatAudio();
              }}
            >
              Enable audio
            </button>
          )}
          <button
            type="button"
            className={`inline-flex h-8 w-8 items-center justify-center rounded border transition pointer-events-auto ${
              clockSync
                ? 'border-accent text-accent bg-accent/20 ring-2 ring-accent/40 shadow-[0_0_10px_rgba(var(--accent-rgb,255,140,0),0.25)]'
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
              void toggleClockSync();
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
            onPointerDown={(event) => {
              stopCardInteraction(event);
              if (!transportState.isPlaying) prepareBeatAudio();
            }}
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
          className="border-t border-border-subtle pt-1.5 min-h-0 overflow-y-auto"
          onPointerDown={stopCardInteraction}
          onMouseDown={stopCardInteraction}
          onDoubleClick={stopCardInteraction}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="sans text-[10px] text-muted truncate min-w-0">
              <span>{selectedTrack.name} sound</span>
              {selectedTrackIsSonic && (
                <span className="text-secondary">
                  {' · '}
                  {summarizeSonicVoice(selectedTrack.sonicVoice)?.archetype ?? selectedTrack.sonicVoice.archetype}
                  {linkedSonicCard
                    ? ` · ${linkedSonicCard.name ?? 'Sonic Studio'}`
                    : ' · embedded'}
                </span>
              )}
            </div>
            <button
              type="button"
              aria-pressed={isolatedTrackId === selectedTrack.id}
              title={isolatedTrackId === selectedTrack.id ? 'Exit isolate' : 'Isolate this instrument'}
              className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 sans text-[9px] pointer-events-auto transition ${
                isolatedTrackId === selectedTrack.id
                  ? 'border-accent text-accent bg-accent/15'
                  : 'border-border text-muted hover:border-accent/60 hover:text-secondary'
              }`}
              onPointerDown={stopCardInteraction}
              onMouseDown={stopCardInteraction}
              onDoubleClick={stopCardInteraction}
              onClick={(event) => {
                event.stopPropagation();
                toggleTrackIsolate(selectedTrack.id);
              }}
            >
              <Focus size={10} aria-hidden="true" />
              Isolate
            </button>
          </div>
          {selectedTrackIsSonic ? (
            <div className="grid gap-1.5">
              <SonicVoiceControls
                voice={selectedTrack.sonicVoice}
                compact
                showPreview={false}
                onPointerGuard={cardPointerGuard}
                onChange={(patch) => {
                  updateTrackSound(
                    selectedTrack.id,
                    updateTrackSonicVoice(selectedTrack, patch),
                    { debounce: true },
                  );
                }}
              />
              <div className="border-t border-border-subtle pt-1.5">
                <div className="sans text-[9px] uppercase tracking-wider text-muted mb-1.5">Synth</div>
                <BeatTrackSynthControls
                  track={selectedTrack}
                  variant="dials"
                  controls={['gain', 'attackMs', 'decayMs', 'tone', 'distortion', 'pitch']}
                  compact
                  pointerGuard={cardPointerGuard}
                  onChange={(trackId, patch) => updateTrackSynth(trackId, patch, { debounce: true })}
                />
              </div>
            </div>
          ) : (
            <BeatTrackSynthControls
              track={selectedTrack}
              variant="dials"
              controls={['gain', 'attackMs', 'decayMs', 'tone', 'distortion', 'pitch']}
              compact
              pointerGuard={cardPointerGuard}
              onChange={(trackId, patch) => updateTrackSynth(trackId, patch, { debounce: true })}
            />
          )}
        </div>
      )}

      <div className={`sans text-[10px] truncate ${error ? 'text-danger' : saving ? 'text-warning' : 'text-muted'}`}>
        {clockSync && !error ? `Clock sync / ${label}` : label}
      </div>
    </div>
  );
}
