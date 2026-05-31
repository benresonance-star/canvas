import { describe, it, expect } from 'vitest';
import { stageAgentChatCard } from '../stageAgentChatCard.js';

describe('stageAgentChatCard', () => {
  it('stages new agent chat to dock', () => {
    const { stagedCards, created, onCanvas } = stageAgentChatCard([], [], {
      filename: 'notes__agent-chat-openai-abc12345-v1.md',
      title: 'Chat',
      syncResult: { content_hash: 'h1' },
    });
    expect(created).toBe(true);
    expect(onCanvas).toBe(false);
    expect(stagedCards).toHaveLength(1);
    expect(stagedCards[0].key).toBe('notes__agent-chat-openai-abc12345');
  });

  it('skips when already on canvas', () => {
    const canvas = [
      {
        id: 'c1',
        key: 'notes__agent-chat-openai-abc12345',
        type: 'agent_chat',
        versions: [{ filename: 'notes__agent-chat-openai-abc12345-v1.md' }],
      },
    ];
    const { stagedCards, created, onCanvas } = stageAgentChatCard([], canvas, {
      filename: 'notes__agent-chat-openai-abc12345-v1.md',
      title: 'Chat',
    });
    expect(onCanvas).toBe(true);
    expect(created).toBe(false);
    expect(stagedCards).toEqual([]);
  });
});
