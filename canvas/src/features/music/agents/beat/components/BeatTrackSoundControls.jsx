import React, { useEffect, useState } from 'react';
import { Focus } from 'lucide-react';
import { SonicVoiceControls } from '../../../../sonicStudio/components/SonicVoiceControls.jsx';
import { summarizeSonicVoice } from '../../../../sonicStudio/domain/sonicStudioCard.js';
import { findSonicRenderedAsset } from '../../../../sonicStudio/domain/sonicRenderedAssets.js';
import {
  assignEmbeddedSonicToTrack,
  assignSonicVoiceToTrack,
  clearTrackSonicVoice,
  findSonicStudioCards,
  getSonicStudioCardVoices,
  isTrackSonicVoiceStale,
  refreshTrackFromSonicCard,
  resolveSonicStudioCardState,
  updateTrackSonicVoice,
} from '../domain/beatTrackSoundSource.js';
import { hashSonicSourceState } from '../../../../../../packages/sonic-core/src/index.js';
import { updateTrackSynth } from '../domain/beatTrackSynth.js';
import { BeatTrackSynthControls } from './BeatTrackSynthControls.jsx';

function resolveSourceSelectValue({ isSonic, pickingSonic, track }) {
  if (pickingSonic) return 'import';
  if (!isSonic) return 'generated';
  if (track?.sonicProvenance?.cardId) return 'import';
  return 'embedded';
}

export function BeatTrackSoundControls({
  track,
  cards = [],
  isolatedTrackId = null,
  onToggleIsolate,
  onChange,
  copyTemporalOnAssign = false,
  onCopyTemporal,
  onWireSonicLink,
  onSyncToCard,
}) {
  const sonicCards = findSonicStudioCards(cards);
  const [pickingSonic, setPickingSonic] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [selectedVoiceId, setSelectedVoiceId] = useState('');

  const isSonic = track?.soundSource === 'sonic_voice' && track?.sonicVoice;
  const linkedCardId = track?.sonicProvenance?.cardId;
  const selectedCard = sonicCards.find((card) => card.id === (linkedCardId ?? selectedCardId));
  const stale = selectedCard ? isTrackSonicVoiceStale(track, selectedCard) : false;
  const sourceSelectValue = resolveSourceSelectValue({ isSonic, pickingSonic, track });
  const pickedCard = sonicCards.find((card) => card.id === selectedCardId);
  const voicesForCard = pickedCard ? getSonicStudioCardVoices(pickedCard) : [];
  const canSyncToCard = Boolean(linkedCardId);
  const isIsolated = isolatedTrackId === track?.id;

  useEffect(() => {
    if (isSonic && linkedCardId) {
      setPickingSonic(false);
    }
  }, [isSonic, linkedCardId, track?.id]);

  useEffect(() => {
    setSelectedCardId('');
    setSelectedVoiceId('');
    setPickingSonic(false);
  }, [track?.id]);

  const commitTrack = (nextTrack) => {
    onChange?.(nextTrack);
    if (nextTrack?.sonicProvenance?.syncToCard && nextTrack?.sonicProvenance?.cardId) {
      onSyncToCard?.(nextTrack);
    }
  };

  const assignVoice = () => {
    const card = sonicCards.find((item) => item.id === selectedCardId);
    if (!card) return;
    const cardState = resolveSonicStudioCardState(card);
    const voice = structuredClone(
      cardState.voices.find((item) => item.id === selectedVoiceId) ?? cardState.voices[0],
    );
    if (!voice) return;
    const stateHash = hashSonicSourceState({ voices: [voice] });
    const renderedAsset = findSonicRenderedAsset(card.sonicRenderedAssets ?? [], {
      voiceId: voice.id,
      sourceStateHash: stateHash,
    });
    const nextTrack = assignSonicVoiceToTrack(track, {
      voice,
      cardId: card.id,
      voiceId: voice.id,
      stateHash,
      renderedAssetId: renderedAsset?.id ?? null,
      source: 'card',
      syncToCard: false,
    });
    setPickingSonic(false);
    commitTrack(nextTrack);
    onWireSonicLink?.({ sonicCard: card, track: nextTrack, voiceId: voice.id });
    if (copyTemporalOnAssign && cardState.temporal) {
      onCopyTemporal?.(cardState.temporal);
    }
  };

  const switchToGenerated = () => {
    setPickingSonic(false);
    setSelectedCardId('');
    setSelectedVoiceId('');
    if (isSonic) {
      onChange?.(clearTrackSonicVoice(track));
    }
  };

  const handleSourceChange = (value) => {
    if (value === 'generated') {
      switchToGenerated();
      return;
    }
    if (value === 'embedded') {
      setPickingSonic(false);
      commitTrack(assignEmbeddedSonicToTrack(track));
      return;
    }
    if (value === 'import') {
      if (sonicCards.length === 0) return;
      setPickingSonic(true);
    }
  };

  return (
    <div className="min-w-0 border border-border bg-surface-muted rounded p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="sans text-xs text-primary truncate">{track.name}</div>
        <div className="flex items-center gap-2 shrink-0">
          {stale && <span className="sans text-[10px] text-warning">stale</span>}
          <button
            type="button"
            aria-pressed={isIsolated}
            title={isIsolated ? 'Exit isolate — hear full mix' : 'Isolate — hear only this instrument'}
            onClick={() => onToggleIsolate?.(track.id)}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 sans text-[10px] transition ${
              isIsolated
                ? 'border-accent text-accent bg-accent/15'
                : 'border-border text-muted hover:border-accent/60 hover:text-secondary'
            }`}
          >
            <Focus size={11} aria-hidden="true" />
            Isolate
          </button>
        </div>
      </div>
      <label className="sans text-[10px] text-muted grid gap-1 mb-2">
        Source
        <select
          value={sourceSelectValue}
          onChange={(event) => handleSourceChange(event.target.value)}
          className="bg-surface border border-border rounded-sm px-2 py-1 text-xs text-primary"
        >
          <option value="generated">Generated</option>
          <option value="embedded">Embedded Sonic</option>
          <option value="import" disabled={sonicCards.length === 0}>From Sonic card</option>
        </select>
      </label>

      {isSonic ? (
        <div className="grid gap-2">
          <div className="sans text-[10px] text-secondary">
            {summarizeSonicVoice(track.sonicVoice)?.archetype ?? track.sonicVoice.archetype}
            {linkedCardId && selectedCard && (
              <span className="text-muted"> · {selectedCard.name ?? 'Sonic Studio'}</span>
            )}
            {!linkedCardId && (
              <span className="text-muted"> · embedded</span>
            )}
          </div>
          <SonicVoiceControls
            voice={track.sonicVoice}
            onChange={(patch) => commitTrack(updateTrackSonicVoice(track, patch))}
          />
          <div className="border-t border-border-subtle pt-2">
            <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">Synth</div>
            <BeatTrackSynthControls
              track={track}
              variant="dials"
              controls={['gain', 'attackMs', 'decayMs', 'tone', 'distortion', 'pitch']}
              onChange={(_trackId, patch) => {
                const synth = updateTrackSynth(track, patch);
                commitTrack({ ...track, synth, gain: synth.gain });
              }}
            />
          </div>
          {canSyncToCard && (
            <label className="sans text-[10px] text-secondary flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(track.sonicProvenance?.syncToCard)}
                onChange={(event) => commitTrack({
                  ...track,
                  sonicProvenance: {
                    ...track.sonicProvenance,
                    syncToCard: event.target.checked,
                  },
                })}
              />
              Sync to linked Sonic card
            </label>
          )}
          {stale && selectedCard && (
            <button
              type="button"
              className="sans text-xs border border-border rounded px-2 py-1"
              onClick={() => commitTrack(refreshTrackFromSonicCard(track, selectedCard))}
            >
              Refresh from Sonic
            </button>
          )}
          <button
            type="button"
            className="sans text-xs border border-border rounded px-2 py-1"
            onClick={switchToGenerated}
          >
            Switch to generated
          </button>
        </div>
      ) : pickingSonic ? (
        <div className="grid gap-2">
          <label className="sans text-[10px] text-muted grid gap-1">
            Sonic card
            <select
              value={selectedCardId}
              onChange={(event) => {
                const cardId = event.target.value;
                setSelectedCardId(cardId);
                const card = sonicCards.find((item) => item.id === cardId);
                const voices = card ? getSonicStudioCardVoices(card) : [];
                const roleMatch = voices.find((voice) => voice.archetype === track?.role);
                setSelectedVoiceId(roleMatch?.id ?? voices[0]?.id ?? '');
              }}
              className="bg-surface border border-border rounded-sm px-2 py-1 text-xs text-primary"
            >
              <option value="">Select card…</option>
              {sonicCards.map((card) => (
                <option key={card.id} value={card.id}>{card.name ?? card.id}</option>
              ))}
            </select>
          </label>
          {selectedCardId && (
            <label className="sans text-[10px] text-muted grid gap-1">
              Voice
              <select
                value={selectedVoiceId}
                onChange={(event) => setSelectedVoiceId(event.target.value)}
                className="bg-surface border border-border rounded-sm px-2 py-1 text-xs text-primary"
              >
                <option value="">Select voice…</option>
                {voicesForCard.map((voice) => (
                  <option key={voice.id} value={voice.id}>{voice.name ?? voice.id}</option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="sans text-xs border border-border rounded px-2 py-1 flex-1"
              onClick={assignVoice}
              disabled={!selectedCardId}
            >
              Assign voice
            </button>
            <button
              type="button"
              className="sans text-xs border border-border rounded px-2 py-1"
              onClick={switchToGenerated}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <BeatTrackSynthControls
          track={track}
          variant="dials"
          onChange={(trackId, patch) => {
            const synth = updateTrackSynth(track, patch);
            commitTrack({ ...track, synth, gain: synth.gain });
          }}
        />
      )}
    </div>
  );
}
