import { describe, expect, it, vi } from 'vitest';
import {
  collectMissingSonicBeatEdges,
  findBeatCardForAgent,
  restoreBeatSonicCanvasEdges,
  sonicBeatEdgeExists,
} from '../restoreBeatSonicCanvasEdges.js';

const cards = [
  {
    id: 'sonic-card',
    type: 'sonic_studio',
    musicAgentId: null,
    versions: [{ version: 1, artifactRef: { id: 'art-sonic', type: 'artifact' } }],
  },
  {
    id: 'beat-card',
    type: 'music-agent',
    musicAgentId: 'agent-1',
    versions: [{ version: 1, artifactRef: { id: 'art-beat', type: 'artifact' }, musicAgentId: 'agent-1' }],
  },
];

describe('restoreBeatSonicCanvasEdges', () => {
  it('finds beat cards by music agent id', () => {
    expect(findBeatCardForAgent(cards, 'agent-1')?.id).toBe('beat-card');
  });

  it('detects existing sonic → beat edges', () => {
    expect(sonicBeatEdgeExists([
      { fromCardId: 'sonic-card', toCardId: 'beat-card', type: 'input_to' },
    ], 'sonic-card', 'beat-card')).toBe(true);
  });

  it('collects missing edges from persisted links', () => {
    const missing = collectMissingSonicBeatEdges({
      links: [{ agentId: 'agent-1', sonicCardId: 'sonic-card', trackId: 'kick', voiceId: 'kick-voice' }],
      cards,
      canvasEdges: [],
    });
    expect(missing).toHaveLength(1);
    expect(missing[0].beatCard.id).toBe('beat-card');
  });

  it('wires only missing edges', async () => {
    const wireFn = vi.fn(async () => ({ created: true }));
    const result = await restoreBeatSonicCanvasEdges({
      clusterId: 'cluster-1',
      links: [{ agentId: 'agent-1', sonicCardId: 'sonic-card', trackId: 'kick', voiceId: 'kick-voice' }],
      cards,
      canvasEdges: [],
      wireFn,
    });
    expect(result.attempted).toBe(1);
    expect(result.restored).toBe(1);
    expect(wireFn).toHaveBeenCalledOnce();
  });
});
