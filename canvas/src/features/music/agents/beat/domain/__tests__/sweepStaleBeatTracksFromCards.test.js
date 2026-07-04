import { describe, expect, it } from 'vitest';
import { hashSonicSourceState } from '../../../../../../../packages/sonic-core/src/index.js';
import { createDefaultBeatAgentState } from '../beatAgentState.js';
import {
  assignSonicVoiceToTrack,
  getSonicStudioCardVoices,
  updateTrackSonicVoice,
} from '../beatTrackSoundSource.js';
import { sweepStaleBeatTracksInState } from '../sweepStaleBeatTracksFromCards.js';

describe('sweepStaleBeatTracksInState', () => {
  it('refreshes tracks when linked sonic card hash changes', () => {
    const state = createDefaultBeatAgentState({ updatedAt: '2026-07-04T01:00:00.000Z' });
    state.pattern.tracks[0] = assignSonicVoiceToTrack(state.pattern.tracks[0], {
      voice: { id: 'kick-voice', archetype: 'kick', name: 'Kick', material: { brightness: 0.4 } },
      cardId: 'sonic-1',
      voiceId: 'kick-voice',
      stateHash: 'stale-hash',
    });

    const cards = [{
      id: 'sonic-1',
      type: 'sonic_studio',
      sonicStudioState: {
        voices: [{ id: 'kick-voice', archetype: 'kick', name: 'Kick', material: { brightness: 0.9 } }],
      },
    }];

    const result = sweepStaleBeatTracksInState(state, cards);
    expect(result.changed).toBe(true);
    expect(result.refreshedTrackIds).toContain('kick');
    expect(result.state.pattern.tracks[0].sonicProvenance.stateHash).not.toBe('stale-hash');
  });

  it('no-ops when sonic cards are unchanged', () => {
    const voice = { id: 'kick-voice', archetype: 'kick', name: 'Kick', material: { brightness: 0.4 } };
    const cards = [{
      id: 'sonic-1',
      type: 'sonic_studio',
      sonicStudioState: { voices: [voice] },
    }];
    const liveVoice = getSonicStudioCardVoices(cards[0])[0];
    const stateHash = hashSonicSourceState({ voices: [liveVoice] });
    const state = createDefaultBeatAgentState({ updatedAt: '2026-07-04T01:00:00.000Z' });
    state.pattern.tracks[0] = assignSonicVoiceToTrack(state.pattern.tracks[0], {
      voice: liveVoice,
      cardId: 'sonic-1',
      voiceId: 'kick-voice',
      stateHash,
    });

    const result = sweepStaleBeatTracksInState(state, cards);
    expect(result.changed).toBe(false);
    expect(result.state).toBe(state);
  });

  it('does not refresh tracks after local inline sonic edits', () => {
    const voice = { id: 'kick-voice', archetype: 'kick', name: 'Kick', material: { brightness: 0.4 } };
    const cards = [{
      id: 'sonic-1',
      type: 'sonic_studio',
      sonicStudioState: { voices: [voice] },
    }];
    const liveVoice = getSonicStudioCardVoices(cards[0])[0];
    const stateHash = hashSonicSourceState({ voices: [liveVoice] });
    const state = createDefaultBeatAgentState({ updatedAt: '2026-07-04T01:00:00.000Z' });
    const assigned = assignSonicVoiceToTrack(state.pattern.tracks[0], {
      voice: liveVoice,
      cardId: 'sonic-1',
      voiceId: 'kick-voice',
      stateHash,
    });
    state.pattern.tracks[0] = updateTrackSonicVoice(assigned, { material: { brightness: 0.95 } });

    const result = sweepStaleBeatTracksInState(state, cards);
    expect(result.changed).toBe(false);
    expect(result.state.pattern.tracks[0].sonicVoice.material.brightness).toBe(0.95);
  });
});
