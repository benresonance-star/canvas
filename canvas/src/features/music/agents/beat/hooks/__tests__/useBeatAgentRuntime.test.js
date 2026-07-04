import { describe, expect, it } from 'vitest';
import {
  buildBeatSonicCardsSignature,
  resolveEffectiveAudioContext,
} from '../useBeatAgentRuntime.js';

describe('resolveEffectiveAudioContext', () => {
  it('falls back to persisted agent and card audio context when props are omitted', () => {
    const card = {
      id: 'beat-1',
      descriptorGraph: { updatedAt: '2026-01-02T00:00:00.000Z', nodes: [] },
      spaceState: { roomIdentity: 'chamber', updatedAt: '2026-01-02T00:00:00.000Z' },
      musicState: {
        descriptorGraph: { updatedAt: '2026-01-01T00:00:00.000Z', nodes: [] },
        spaceState: { roomIdentity: 'void', updatedAt: '2026-01-01T00:00:00.000Z' },
        sonicTemporal: { delay: { wet: 0.4 } },
      },
    };
    const state = {
      descriptorGraph: { updatedAt: '2026-01-03T00:00:00.000Z', nodes: [] },
      spaceState: { roomIdentity: 'hall', updatedAt: '2026-01-03T00:00:00.000Z' },
      sonicTemporal: { delay: { wet: 0.6 } },
      audioRouting: { descriptorGraphBypass: false },
      mixSettings: { masterGain: 0.9 },
    };

    const resolved = resolveEffectiveAudioContext({ state, card });

    expect(resolved.descriptorGraph.updatedAt).toBe('2026-01-03T00:00:00.000Z');
    expect(resolved.spaceState.roomIdentity).toBe('hall');
    expect(resolved.sonicTemporal.delay.wet).toBe(0.6);
    expect(resolved.audioRouting.descriptorGraphBypass).toBe(false);
    expect(resolved.mixSettings.masterGain).toBe(0.9);
  });

  it('prefers explicit props over persisted state', () => {
    const resolved = resolveEffectiveAudioContext({
      state: {
        descriptorGraph: { updatedAt: '2026-01-01T00:00:00.000Z', nodes: [] },
        spaceState: { roomIdentity: 'void' },
      },
      descriptorGraph: { updatedAt: '2026-01-05T00:00:00.000Z', nodes: [] },
      spaceState: { roomIdentity: 'cathedral' },
    });

    expect(resolved.descriptorGraph.updatedAt).toBe('2026-01-05T00:00:00.000Z');
    expect(resolved.spaceState.roomIdentity).toBe('cathedral');
  });
});

describe('buildBeatSonicCardsSignature', () => {
  it('returns a stable empty signature for no cards', () => {
    expect(buildBeatSonicCardsSignature([])).toBe('');
    expect(buildBeatSonicCardsSignature()).toBe('');
  });

  it('changes when sonic rendered asset hashes change', () => {
    const cards = [{
      id: 'sonic-1',
      sonicSourceStateHash: 'hash-a',
      sonicRenderedAssets: [{ sourceStateHash: 'asset-a' }],
    }];
    const signature = buildBeatSonicCardsSignature(cards);
    expect(signature).toContain('sonic-1');
    expect(signature).not.toBe(buildBeatSonicCardsSignature([{
      ...cards[0],
      sonicRenderedAssets: [{ sourceStateHash: 'asset-b' }],
    }]));
  });
});
