import { describe, it, expect } from 'vitest';
import {
  canonicalKeyForEntry,
  enforceExclusivePlacement,
  isAgentChatAutoSpawnCanvasCard,
  moveToCanvas,
  resolvePlacement,
} from '../artifactPlacement.js';

describe('artifactPlacement', () => {
  it('canonicalKeyForEntry prefers filename', () => {
    expect(
      canonicalKeyForEntry({
        key: 'legacy-v1',
        versions: [{ filename: 'notes__foo-v1.md' }],
      }),
    ).toBe('notes__foo');
  });

  it('resolvePlacement returns canvas or dock', () => {
    const cards = [{ key: 'notes__a', versions: [{ filename: 'notes__a-v1.md' }] }];
    const staged = [{ key: 'notes__b', versions: [{ filename: 'notes__b-v1.md' }] }];
    expect(resolvePlacement(cards, staged, 'notes__a')).toBe('canvas');
    expect(resolvePlacement(cards, staged, 'notes__b')).toBe('dock');
    expect(resolvePlacement(cards, staged, 'notes__c')).toBeNull();
  });

  it('enforceExclusivePlacement canvas wins for generic duplicate', () => {
    const cards = [
      {
        id: 'c1',
        key: 'notes__doc',
        type: 'markdown',
        x: 200,
        y: 200,
        versions: [{ filename: 'notes__doc-v1.md' }],
      },
    ];
    const staged = [
      {
        stagingId: 's1',
        key: 'notes__doc',
        type: 'markdown',
        versions: [{ filename: 'notes__doc-v1.md' }],
      },
    ];
    const { cards: outC, stagedSyncCards: outS, changed } = enforceExclusivePlacement(
      cards,
      staged,
    );
    expect(changed).toBe(true);
    expect(outC).toHaveLength(1);
    expect(outS).toHaveLength(0);
  });

  it('enforceExclusivePlacement agent_chat auto-spawn prefers dock', () => {
    const cards = [
      {
        id: 'c1',
        key: 'notes__agent-chat-openai-abc',
        type: 'agent_chat',
        x: 400,
        y: 80,
        versions: [{ filename: 'notes__agent-chat-openai-abc-v1.md' }],
      },
    ];
    const staged = [
      {
        stagingId: 's1',
        key: 'notes__agent-chat-openai-abc',
        type: 'agent_chat',
        versions: [{ filename: 'notes__agent-chat-openai-abc-v1.md' }],
      },
    ];
    const { cards: outC, stagedSyncCards: outS } = enforceExclusivePlacement(cards, staged, {
      threads: [],
    });
    expect(outC).toHaveLength(0);
    expect(outS).toHaveLength(1);
    expect(isAgentChatAutoSpawnCanvasCard(cards[0], null)).toBe(true);
    expect(cards[0].x).toBe(400);
  });

  it('enforceExclusivePlacement keeps thread-linked agent_chat on canvas at spawn coords', () => {
    const cards = [
      {
        id: 'c1',
        key: 'notes__agent-chat-openai-abc',
        type: 'agent_chat',
        agentThreadId: 'thread-1',
        x: 80,
        y: 80,
        versions: [{ filename: 'notes__agent-chat-openai-abc-v1.md' }],
      },
    ];
    const staged = [
      {
        stagingId: 's1',
        key: 'notes__agent-chat-openai-abc',
        type: 'agent_chat',
        versions: [{ filename: 'notes__agent-chat-openai-abc-v1.md' }],
      },
    ];
    const { cards: outC, stagedSyncCards: outS } = enforceExclusivePlacement(cards, staged, {
      threads: [{
        threadId: 'thread-1',
        filename: 'notes__agent-chat-openai-abc-v1.md',
        cardId: 'c1',
      }],
    });
    expect(outC).toHaveLength(1);
    expect(outC[0].id).toBe('c1');
    expect(outS).toHaveLength(0);
  });

  it('moveToCanvas removes staged row', () => {
    const staged = [
      {
        stagingId: 'sid',
        key: 'notes__x',
        type: 'markdown',
        prefix: 'notes',
        name: 'x',
        versions: [{ version: 1, filename: 'notes__x-v1.md' }],
        pinnedVersion: 1,
      },
    ];
    const { cards, stagedSyncCards, placed } = moveToCanvas([], staged, 'sid', 100, 100);
    expect(placed).toBe(true);
    expect(cards).toHaveLength(1);
    expect(stagedSyncCards).toHaveLength(0);
  });
});
