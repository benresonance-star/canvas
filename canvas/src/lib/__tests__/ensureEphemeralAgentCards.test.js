import { describe, it, expect } from 'vitest';
import {
  hasBeatAgentCard,
  hasImageAgentCard,
  restoreEphemeralAgentCardsFromRecords,
  ensureEphemeralAgentCards,
} from '../ensureEphemeralAgentCards.js';

describe('hasBeatAgentCard', () => {
  it('detects cards by musicAgentId', () => {
    const cards = [{ type: 'music-agent', musicAgentId: 'agent-1' }];
    expect(hasBeatAgentCard(cards, 'agent-1')).toBe(true);
    expect(hasBeatAgentCard(cards, 'agent-2')).toBe(false);
  });
});

describe('hasImageAgentCard', () => {
  it('detects cards by agentArtifactId', () => {
    const cards = [{ type: 'agent', agentArtifactId: 'img-agent-1' }];
    expect(hasImageAgentCard(cards, 'img-agent-1')).toBe(true);
    expect(hasImageAgentCard(cards, 'img-agent-2')).toBe(false);
  });
});

describe('restoreEphemeralAgentCardsFromRecords', () => {
  const beatAgent = {
    id: '01KVZAEQ91C746VFV5AH2H8NWE',
    artifactId: '01KVZAEQ91C746VFV5AH2H8NWE',
    agentType: 'beat',
    name: 'Beat Agent',
    status: 'draft',
    state: { name: 'Beat Agent' },
  };

  const imageAgent = {
    id: '01KVT8YC8T74QP6DFS411Y7HHC',
    agentTypeId: 'agent_type_image_generation',
    projectId: 'project-1',
    name: 'Image Generation Agent',
  };

  it('is a no-op when all ephemeral cards already exist', () => {
    const cards = [
      { type: 'music-agent', musicAgentId: beatAgent.id },
      { type: 'agent', agentArtifactId: imageAgent.id },
    ];
    const result = restoreEphemeralAgentCardsFromRecords(cards, {
      beatAgents: [beatAgent],
      imageAgents: [imageAgent],
    });
    expect(result.changed).toBe(false);
    expect(result.restored).toEqual({ beat: 0, agent: 0 });
    expect(result.cards).toHaveLength(2);
  });

  it('restores missing beat and image agent cards', () => {
    const result = restoreEphemeralAgentCardsFromRecords([], {
      beatAgents: [beatAgent],
      imageAgents: [imageAgent],
    });
    expect(result.changed).toBe(true);
    expect(result.restored).toEqual({ beat: 1, agent: 1 });
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0].type).toBe('music-agent');
    expect(result.cards[0].musicAgentId).toBe(beatAgent.id);
    expect(result.cards[1].type).toBe('agent');
    expect(result.cards[1].agentArtifactId).toBe(imageAgent.id);
  });

  it('restores only missing cards when partially present', () => {
    const cards = [{ type: 'music-agent', musicAgentId: beatAgent.id }];
    const result = restoreEphemeralAgentCardsFromRecords(cards, {
      beatAgents: [beatAgent],
      imageAgents: [imageAgent],
    });
    expect(result.changed).toBe(true);
    expect(result.restored).toEqual({ beat: 0, agent: 1 });
    expect(result.cards).toHaveLength(2);
  });
});

describe('ensureEphemeralAgentCards', () => {
  it('uses injected fetchers', async () => {
    const beatAgent = {
      id: 'beat-1',
      agentType: 'beat',
      name: 'Beat',
      state: {},
    };
    const result = await ensureEphemeralAgentCards({
      projectId: 'project-1',
      cards: [],
      fetchBeatAgents: async () => [beatAgent],
      fetchImageAgents: async () => [],
    });
    expect(result.changed).toBe(true);
    expect(result.restored.beat).toBe(1);
  });

  it('returns unchanged cards when projectId is missing', async () => {
    const cards = [{ id: 'c1' }];
    const result = await ensureEphemeralAgentCards({ cards });
    expect(result.changed).toBe(false);
    expect(result.cards).toBe(cards);
  });
});
