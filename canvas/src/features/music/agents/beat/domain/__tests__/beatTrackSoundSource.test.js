import { describe, expect, it } from 'vitest';
import { hashSonicSourceState } from '../../../../../../../packages/sonic-core/src/index.js';
import {
  assignEmbeddedSonicToTrack,
  assignSonicVoiceToTrack,
  buildLinkedSonicCardSyncPatch,
  createEmbeddedSonicVoiceForTrack,
  getSonicStudioCardVoices,
  isTrackSonicVoiceStale,
  updateTrackSonicVoice,
} from '../beatTrackSoundSource.js';

describe('createEmbeddedSonicVoiceForTrack', () => {
  it('seeds a percussion voice from the track role', () => {
    const voice = createEmbeddedSonicVoiceForTrack({ id: 'kick', role: 'kick', name: 'Kick' });
    expect(voice.archetype).toBe('kick');
    expect(voice.id).toBe('kick-embedded-sonic');
    expect(voice.name).toBe('Kick Sonic');
  });

  it('maps hat-closed to the hat kit preset', () => {
    const voice = createEmbeddedSonicVoiceForTrack({ id: 'hat', role: 'hat-closed' });
    expect(voice.archetype).toBe('hat');
  });
});

describe('assignEmbeddedSonicToTrack', () => {
  it('assigns embedded sonic provenance without a canvas card', () => {
    const track = assignEmbeddedSonicToTrack({ id: 'snare', role: 'snare', name: 'Snare' });
    expect(track.soundSource).toBe('sonic_voice');
    expect(track.sonicVoice?.archetype).toBe('snare');
    expect(track.sonicProvenance.cardId).toBeNull();
    expect(track.sonicProvenance.source).toBe('embedded');
    expect(track.sonicProvenance.syncToCard).toBe(false);
  });
});

describe('updateTrackSonicVoice', () => {
  it('merges voice patches and recomputes state hash', () => {
    const assigned = assignEmbeddedSonicToTrack({ id: 'kick', role: 'kick', name: 'Kick' });
    const previousHash = assigned.sonicProvenance.stateHash;
    const updated = updateTrackSonicVoice(assigned, {
      material: { brightness: 0.88 },
    });
    expect(updated.sonicVoice.material.brightness).toBe(0.88);
    expect(updated.sonicProvenance.stateHash).not.toBe(previousHash);
    expect(updated.sonicProvenance.renderedAssetId).toBeNull();
    expect(updated.sonicProvenance.stateHash).toBe(
      hashSonicSourceState({ voices: [updated.sonicVoice] }),
    );
  });

  it('preserves card baseline when editing linked voices locally', () => {
    const track = {
      id: 'kick',
      role: 'kick',
      soundSource: 'sonic_voice',
      sonicVoice: { id: 'kick-voice', archetype: 'kick', material: { brightness: 0.2 } },
      sonicProvenance: {
        cardId: 'sonic-card-1',
        voiceId: 'kick-voice',
        stateHash: 'old-hash',
        cardVoiceHashAtAssign: 'card-baseline',
        source: 'card',
        syncToCard: false,
      },
    };
    const updated = updateTrackSonicVoice(track, { material: { brightness: 0.75 } });
    expect(updated.sonicProvenance.cardVoiceHashAtAssign).toBe('card-baseline');
  });

  it('advances card baseline when sync-to-card is enabled', () => {
    const track = {
      id: 'kick',
      role: 'kick',
      soundSource: 'sonic_voice',
      sonicVoice: { id: 'kick-voice', archetype: 'kick', material: { brightness: 0.2 } },
      sonicProvenance: {
        cardId: 'sonic-card-1',
        voiceId: 'kick-voice',
        stateHash: 'old-hash',
        cardVoiceHashAtAssign: 'card-baseline',
        source: 'card',
        syncToCard: true,
      },
    };
    const updated = updateTrackSonicVoice(track, { material: { brightness: 0.75 } });
    expect(updated.sonicProvenance.cardVoiceHashAtAssign).toBe(updated.sonicProvenance.stateHash);
  });

  it('does not mark linked tracks stale after local inline edits', () => {
    const card = {
      id: 'sonic-card-1',
      type: 'sonic_studio',
      sonicStudioState: {
        voices: [{ id: 'kick-voice', archetype: 'kick', material: { brightness: 0.4 } }],
      },
    };
    const liveVoice = getSonicStudioCardVoices(card)[0];
    const stateHash = hashSonicSourceState({ voices: [liveVoice] });
    const assigned = assignSonicVoiceToTrack(
      { id: 'kick', role: 'kick', name: 'Kick' },
      {
        voice: structuredClone(liveVoice),
        cardId: card.id,
        voiceId: liveVoice.id,
        stateHash,
        source: 'card',
      },
    );
    const edited = updateTrackSonicVoice(assigned, { material: { brightness: 0.95 } });
    expect(isTrackSonicVoiceStale(edited, card)).toBe(false);
  });
});

describe('buildLinkedSonicCardSyncPatch', () => {
  it('builds a sonic card patch when sync is enabled', () => {
    const track = {
      id: 'kick',
      role: 'kick',
      soundSource: 'sonic_voice',
      sonicVoice: {
        id: 'kick-voice',
        archetype: 'kick',
        material: { brightness: 0.91 },
        output: { gain: 1 },
      },
      sonicProvenance: {
        cardId: 'sonic-card-1',
        voiceId: 'kick-voice',
        syncToCard: true,
        stateHash: 'track-hash',
      },
    };
    const sonicCard = {
      id: 'sonic-card-1',
      type: 'sonic_studio',
      sonicStudioState: {
        voices: [{ id: 'kick-voice', archetype: 'kick', material: { brightness: 0.2 }, output: { gain: 1 } }],
      },
      sonicRenderedAssets: [],
    };
    const sync = buildLinkedSonicCardSyncPatch(track, sonicCard);
    expect(sync?.cardId).toBe('sonic-card-1');
    expect(sync?.patch.sonicStudioState.voices[0].material.brightness).toBe(0.91);
    expect(sync?.patch.sonicSourceStateHash).toBeTruthy();
  });

  it('returns null when sync is disabled', () => {
    const track = {
      sonicVoice: { id: 'kick-voice' },
      sonicProvenance: { cardId: 'sonic-card-1', syncToCard: false },
    };
    expect(buildLinkedSonicCardSyncPatch(track, { id: 'sonic-card-1' })).toBeNull();
  });
});
