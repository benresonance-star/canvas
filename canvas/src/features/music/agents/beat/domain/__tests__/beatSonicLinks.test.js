import { describe, expect, it } from 'vitest';
import { createDefaultBeatAgentState } from '../beatAgentState.js';
import {
  applyBeatSonicLinksToState,
  extractBeatSonicLinksFromState,
} from '../beatSonicLinks.js';
import { assignSonicVoiceToTrack } from '../beatTrackSoundSource.js';

describe('beatSonicLinks', () => {
  it('extracts sonic links from agent state', () => {
    const state = createDefaultBeatAgentState({ updatedAt: '2026-07-04T01:00:00.000Z' });
    state.pattern.tracks[0] = assignSonicVoiceToTrack(state.pattern.tracks[0], {
      voice: { id: 'kick-voice', archetype: 'kick', name: 'Kick' },
      cardId: 'sonic-card-1',
      voiceId: 'kick-voice',
      stateHash: 'hash-1',
      renderedAssetId: 'asset-1',
    });
    const links = extractBeatSonicLinksFromState(state, {
      agentId: 'agent-1',
      projectId: 'project-1',
    });
    expect(links).toHaveLength(1);
    expect(links[0].trackId).toBe('kick');
    expect(links[0].sonicCardId).toBe('sonic-card-1');
  });

  it('restores sonic track fields from persisted links', () => {
    const state = createDefaultBeatAgentState({ updatedAt: '2026-07-04T01:00:00.000Z' });
    const restored = applyBeatSonicLinksToState(state, [{
      trackId: 'kick',
      sonicCardId: 'sonic-card-1',
      voiceId: 'kick-voice',
      stateHash: 'hash-1',
      renderedAssetId: 'asset-1',
      soundSource: 'sonic_voice',
      sonicVoice: { id: 'kick-voice', archetype: 'kick', name: 'Kick' },
    }]);
    const kick = restored.pattern.tracks.find((track) => track.id === 'kick');
    expect(kick.soundSource).toBe('sonic_voice');
    expect(kick.sonicProvenance.cardId).toBe('sonic-card-1');
    expect(kick.sonicVoice.id).toBe('kick-voice');
  });
});

describe('createDefaultBeatAgentState', () => {
  it('preserves provided updatedAt instead of replacing it', () => {
    const state = createDefaultBeatAgentState({
      updatedAt: '2026-01-01T00:00:00.000Z',
      name: 'Saved Beat',
    });
    expect(state.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(state.name).toBe('Saved Beat');
  });
});
