import { describe, expect, it } from 'vitest';
import {
  findSonicStudioCardsLinkedToBeat,
  listStaleSonicBeatTracks,
  summarizeBeatSonicLinks,
} from '../beatSonicCanvasLinks.js';
import { assignSonicVoiceToTrack } from '../beatTrackSoundSource.js';

describe('beatSonicCanvasLinks', () => {
  const sonicCard = {
    id: 'sonic-card-1',
    type: 'sonic_studio',
    name: 'Sonic Studio 1',
    sonicStudioState: {
      voices: [{ id: 'kick-voice', archetype: 'kick', name: 'Kick' }],
    },
  };
  const beatCardId = 'beat-card-1';

  it('finds linked sonic cards from canvas edges', () => {
    const linked = findSonicStudioCardsLinkedToBeat(
      beatCardId,
      [{ toCardId: beatCardId, fromCardId: sonicCard.id }],
      [sonicCard],
    );
    expect(linked).toHaveLength(1);
    expect(linked[0].id).toBe('sonic-card-1');
  });

  it('lists stale sonic tracks when source hash changes', () => {
    const track = assignSonicVoiceToTrack(
      { id: 'kick', role: 'kick', name: 'Kick' },
      {
        voice: sonicCard.sonicStudioState.voices[0],
        cardId: sonicCard.id,
        voiceId: 'kick-voice',
        stateHash: 'old-hash',
      },
    );
    const stale = listStaleSonicBeatTracks({ tracks: [track] }, [sonicCard]);
    expect(stale).toHaveLength(1);
  });

  it('summarizes link state for beat agent UI', () => {
    const summary = summarizeBeatSonicLinks({
      beatCardId,
      pattern: { tracks: [] },
      canvasEdges: [{ toCardId: beatCardId, fromCardId: sonicCard.id }],
      cards: [sonicCard],
    });
    expect(summary.linkedCards).toHaveLength(1);
    expect(summary.hasStale).toBe(false);
  });
});
