import { describe, it, expect } from 'vitest';
import {
  artifactMembersFromCards,
  artifactRefIdForClusterCard,
  clusterSelectionStatsFromCards,
} from '../clusterMembers.js';

describe('clusterMembers agent chat', () => {
  const threads = [
    {
      threadId: 'a09d3b38-72b3-4f73-a094-67aba021f388',
      title: 'Why, What If Thread',
      filename: 'notes__agent-chat-openai-37ffdd53-v1.md',
      artifactRef: { id: 'art-thread-1', type: 'artifact' },
      cardId: 'card-chat-1',
    },
  ];

  const agentChatCard = {
    id: 'card-chat-1',
    key: 'notes__agent-chat-openai-37ffdd53',
    type: 'agent_chat',
    name: 'Why, What If Thread',
    agentThreadId: 'a09d3b38-72b3-4f73-a094-67aba021f388',
    pinnedVersion: 1,
    versions: [
      {
        version: 1,
        filename: 'notes__agent-chat-openai-37ffdd53-v1.md',
        content_hash: '',
        artifactRef: null,
      },
    ],
  };

  it('resolves artifact ref from thread index when card version lacks ref', () => {
    const id = artifactRefIdForClusterCard(agentChatCard, {
      threads,
      connectorId: 'openai',
    });
    expect(id).toBe('art-thread-1');
  });

  it('includes agent chat thread in cluster members', () => {
    const members = artifactMembersFromCards([agentChatCard], {
      threads,
      connectorId: 'openai',
    });
    expect(members).toEqual([{ id: 'art-thread-1', type: 'artifact' }]);
  });

  it('counts agent chat thread as syncable for cluster selection', () => {
    const stats = clusterSelectionStatsFromCards([agentChatCard], {
      threads,
      connectorId: 'openai',
    });
    expect(stats).toEqual({ selected: 1, syncable: 1 });
  });
});
