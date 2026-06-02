import { describe, it, expect } from 'vitest';
import { ensureAgentChatCardOnCanvas } from '../ensureAgentChatCardOnCanvas.js';

describe('ensureAgentChatCardOnCanvas', () => {
  it('stages to dock when thread.cardId points at a deleted card', () => {
    const result = ensureAgentChatCardOnCanvas([], {
      filename: 'notes__agent-chat-openai-abc12345-v1.md',
      cardId: 'deleted-card-id',
      title: 'Previous chat',
    });
    expect(result.created).toBe(true);
    expect(result.onDock).toBe(true);
    expect(result.cardId).toBeNull();
    expect(result.cards).toEqual([]);
    expect(result.stagedSyncCards).toHaveLength(1);
    expect(result.stagedSyncCards[0].key).toBe('notes__agent-chat-openai-abc12345');
  });

  it('stages new thread to dock with canonical sync key (fullBase)', () => {
    const result = ensureAgentChatCardOnCanvas([], {
      filename: 'notes__agent-chat-openai-abc12345-v1.md',
      cardId: null,
      title: 'New chat',
      threadId: 'thread-uuid',
    });
    expect(result.created).toBe(true);
    expect(result.onDock).toBe(true);
    expect(result.cards).toEqual([]);
    expect(result.stagedSyncCards[0].key).toBe('notes__agent-chat-openai-abc12345');
    expect(result.stagedSyncCards[0].agentThreadId).toBe('thread-uuid');
  });

  it('does not create when card key is suppressed', () => {
    const suppressed = new Set(['notes__agent-chat-openai-abc12345']);
    const result = ensureAgentChatCardOnCanvas(
      [],
      {
        filename: 'notes__agent-chat-openai-abc12345-v1.md',
        cardId: null,
        title: 'Previous chat',
      },
      { suppressedKeys: suppressed },
    );
    expect(result.suppressed).toBe(true);
    expect(result.cards).toEqual([]);
    expect(result.stagedSyncCards).toEqual([]);
  });

  it('stages to dock when none exists and no stale cardId', () => {
    const result = ensureAgentChatCardOnCanvas([], {
      filename: 'notes__agent-chat-openai-abc12345-v1.md',
      cardId: null,
      title: 'New chat',
    });
    expect(result.created).toBe(true);
    expect(result.onDock).toBe(true);
    expect(result.stagedSyncCards).toHaveLength(1);
    expect(result.cards).toHaveLength(0);
  });

  it('merges syncResult into existing card matched by key', () => {
    const existing = {
      id: 'card-existing',
      key: 'notes__agent-chat-openai-abc12345',
      type: 'agent_chat',
      prefix: 'notes',
      name: 'Old title',
      versions: [
        {
          version: 1,
          filename: 'notes__agent-chat-openai-abc12345-v1.md',
          content_hash: '',
          artifactRef: null,
        },
      ],
      pinnedVersion: 1,
      x: 0,
      y: 0,
      width: 360,
      height: 280,
    };
    const artifactRef = { id: 'art-1', kind: 'note' };
    const result = ensureAgentChatCardOnCanvas([existing], {
      filename: 'notes__agent-chat-openai-abc12345-v1.md',
      cardId: null,
      threadId: 'thread-uuid',
      title: 'Updated chat',
      syncResult: {
        content_hash: 'abc123',
        artifactRef,
      },
    });
    expect(result.created).toBe(false);
    expect(result.onDock).toBe(false);
    expect(result.cardId).toBe('card-existing');
    const updated = result.cards.find((c) => c.id === 'card-existing');
    expect(updated.agentThreadId).toBe('thread-uuid');
    expect(updated.name).toBe('Updated chat');
    expect(updated.versions[0].artifactRef).toEqual(artifactRef);
    expect(updated.versions[0].content_hash).toBe('abc123');
  });

  it('updates staged row when already on dock', () => {
    const staged = [
      {
        stagingId: 's1',
        key: 'notes__agent-chat-openai-abc12345',
        type: 'agent_chat',
        prefix: 'notes',
        name: 'Dock chat',
        versions: [
          {
            version: 1,
            filename: 'notes__agent-chat-openai-abc12345-v1.md',
            content_hash: '',
            artifactRef: null,
          },
        ],
        pinnedVersion: 1,
      },
    ];
    const result = ensureAgentChatCardOnCanvas([], {
      filename: 'notes__agent-chat-openai-abc12345-v1.md',
      cardId: null,
      threadId: 'thread-uuid',
      title: 'Renamed',
    }, { stagedSyncCards: staged });
    expect(result.onDock).toBe(true);
    expect(result.cardId).toBeNull();
    expect(result.stagedSyncCards[0].name).toBe('Renamed');
    expect(result.stagedSyncCards[0].agentThreadId).toBe('thread-uuid');
  });

  it('updates name on existing card matched by thread.cardId', () => {
    const existing = {
      id: 'card-linked',
      key: 'notes__agent-chat-openai-abc12345',
      type: 'agent_chat',
      prefix: 'notes',
      name: 'agent-chat-openai-abc12345',
      versions: [
        {
          version: 1,
          filename: 'notes__agent-chat-openai-abc12345-v1.md',
          content_hash: '',
          artifactRef: null,
        },
      ],
      pinnedVersion: 1,
      x: 100,
      y: 100,
      width: 360,
      height: 280,
    };
    const result = ensureAgentChatCardOnCanvas([existing], {
      filename: 'notes__agent-chat-openai-abc12345-v1.md',
      cardId: 'card-linked',
      threadId: 'thread-uuid',
      title: 'Why, What If Thread',
    });
    expect(result.cardId).toBe('card-linked');
    expect(result.onDock).toBe(false);
    expect(result.cards[0].name).toBe('Why, What If Thread');
  });
});
