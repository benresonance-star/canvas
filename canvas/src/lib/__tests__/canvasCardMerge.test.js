import { describe, it, expect } from 'vitest';
import {
  mergePersistedCardsIntoCanvas,
  dedupeAgentChatCardsForConnector,
  removeStagedCardsByKey,
  filterSuppressedStagedCards,
  dedupeAgentChatStagedForConnector,
  sanitizeAgentChatProjectState,
  migrateAgentChatCardKeys,
  migrateFolderBackedCardKeys,
} from '../canvasCardMerge.js';

describe('mergePersistedCardsIntoCanvas', () => {
  it('returns persisted when live is empty on first load', () => {
    const persisted = [{ id: 'a', key: 'k1' }];
    expect(mergePersistedCardsIntoCanvas([], persisted)).toEqual(persisted);
  });

  it('respects empty live canvas when preferLiveMembership is set', () => {
    const persisted = [{ id: 'a', key: 'k1' }];
    expect(
      mergePersistedCardsIntoCanvas([], persisted, { preferLiveMembership: true }),
    ).toEqual([]);
  });

  it('keeps in-memory-only cards not yet persisted', () => {
    const live = [{ id: 'new', key: 'k-new' }];
    const persisted = [{ id: 'old', key: 'k-old' }];
    const merged = mergePersistedCardsIntoCanvas(live, persisted, {
      preferLiveMembership: true,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('new');
  });

  it('hydrates matching ids from persisted', () => {
    const live = [{ id: 'a', key: 'k1', name: 'live' }];
    const persisted = [{ id: 'a', key: 'k1', name: 'saved' }];
    expect(
      mergePersistedCardsIntoCanvas(live, persisted, { preferLiveMembership: true })[0]
        .name,
    ).toBe('saved');
  });

  it('applies in-memory deletions not yet saved', () => {
    const live = [{ id: 'a', key: 'k1' }];
    const persisted = [
      { id: 'a', key: 'k1' },
      { id: 'b', key: 'k2' },
    ];
    expect(
      mergePersistedCardsIntoCanvas(live, persisted, { preferLiveMembership: true }),
    ).toHaveLength(1);
  });

  it('authoritativePersisted replaces live with server cards', () => {
    const live = [
      { id: 'ghost', key: 'notes__agent-chat', type: 'agent_chat', name: 'Previous chat' },
    ];
    const persisted = [
      { id: 'server', key: 'audio__track', type: 'audio', name: 'track' },
    ];
    expect(
      mergePersistedCardsIntoCanvas(live, persisted, { authoritativePersisted: true }),
    ).toEqual(persisted);
  });
});

describe('migrateAgentChatCardKeys', () => {
  it('rewrites legacy -v1 keys to fullBase', () => {
    const { cards, changed } = migrateAgentChatCardKeys([
      {
        id: '1',
        type: 'agent_chat',
        key: 'notes__agent-chat-openai-abc-v1',
        versions: [{ version: 1, filename: 'notes__agent-chat-openai-abc-v1.md' }],
      },
    ]);
    expect(changed).toBe(true);
    expect(cards[0].key).toBe('notes__agent-chat-openai-abc');
  });
});

describe('dock staged agent chat cleanup', () => {
  it('removeStagedCardsByKey removes matching dock chip', () => {
    const staged = [
      { stagingId: 's1', key: 'notes__agent-chat-openai', type: 'agent_chat' },
      { stagingId: 's2', key: 'img__x', type: 'image' },
    ];
    expect(removeStagedCardsByKey(staged, 'notes__agent-chat-openai')).toHaveLength(1);
  });

  it('filterSuppressedStagedCards drops suppressed keys', () => {
    const staged = [
      { stagingId: 's1', key: 'k1', type: 'agent_chat' },
      { stagingId: 's2', key: 'k2', type: 'image' },
    ];
    const out = filterSuppressedStagedCards(staged, new Set(['k1']));
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('k2');
  });

  it('sanitizeAgentChatProjectState removes cross-surface duplicate keys', () => {
    const cards = [
      { id: '1', key: 'markdown__readme', type: 'markdown', name: 'On canvas', x: 100, y: 100 },
    ];
    const staged = [
      { stagingId: 's1', key: 'markdown__readme', type: 'markdown', name: 'On dock' },
    ];
    const { cards: c, stagedSyncCards: s } = sanitizeAgentChatProjectState(cards, staged, {
      connectorId: 'openai',
      suppressedKeys: new Set(),
    });
    expect(c).toHaveLength(1);
    expect(s).toHaveLength(0);
  });

  it('sanitizeAgentChatProjectState keeps thread-linked agent_chat on canvas', () => {
    const cards = [
      {
        id: 'c1',
        key: 'notes__agent-chat-openai-abc12345',
        type: 'agent_chat',
        agentThreadId: 'thread-1',
        x: 80,
        y: 80,
        versions: [{ filename: 'notes__agent-chat-openai-abc12345-v1.md' }],
      },
    ];
    const staged = [
      {
        stagingId: 's1',
        key: 'notes__agent-chat-openai-abc12345',
        type: 'agent_chat',
        versions: [{ filename: 'notes__agent-chat-openai-abc12345-v1.md' }],
      },
    ];
    const { cards: c, stagedSyncCards: s } = sanitizeAgentChatProjectState(cards, staged, {
      connectorId: 'openai',
      preferredCardId: 'c1',
      suppressedKeys: new Set(),
      threads: [{
        threadId: 'thread-1',
        filename: 'notes__agent-chat-openai-abc12345-v1.md',
        cardId: 'c1',
      }],
    });
    expect(c).toHaveLength(1);
    expect(c[0].id).toBe('c1');
    expect(s).toHaveLength(0);
  });

  it('sanitizeAgentChatProjectState removes agent_chat canvas cards outside thread index', () => {
    const cards = [
      {
        id: 'owned-card',
        key: 'notes__agent-chat-openai-owned',
        type: 'agent_chat',
        versions: [{ filename: 'notes__agent-chat-openai-owned-v1.md' }],
      },
      {
        id: 'stale-card',
        key: 'notes__agent-chat-openai-stale',
        type: 'agent_chat',
        versions: [{ filename: 'notes__agent-chat-openai-stale-v1.md' }],
      },
      { id: 'note-1', key: 'notes__regular', type: 'markdown', versions: [] },
    ];

    const { cards: c, keysMigrated } = sanitizeAgentChatProjectState(cards, [], {
      connectorId: 'openai',
      suppressedKeys: new Set(),
      threads: [{
        threadId: 'thread-owned',
        filename: 'notes__agent-chat-openai-owned-v1.md',
        cardId: 'owned-card',
      }],
    });

    expect(keysMigrated).toBe(true);
    expect(c.map((card) => card.id).sort()).toEqual(['note-1', 'owned-card']);
  });

  it('sanitizeAgentChatProjectState ignores stale historical thread cardIds', () => {
    const cards = [
      {
        id: 'active-card',
        key: 'notes__agent-chat-openai-active',
        type: 'agent_chat',
        versions: [{ filename: 'notes__agent-chat-openai-active-v1.md' }],
      },
      {
        id: 'stale-card',
        key: 'notes__agent-chat-openai-stale',
        type: 'agent_chat',
        name: 'agent-chat-openai-stale',
        versions: [{ filename: 'notes__agent-chat-openai-stale-v1.md' }],
      },
      { id: 'note-1', key: 'notes__regular', type: 'markdown', versions: [] },
    ];

    const { cards: c, keysMigrated } = sanitizeAgentChatProjectState(cards, [], {
      connectorId: 'openai',
      preferredCardId: 'active-card',
      suppressedKeys: new Set(),
      activeThreadId: 'active-thread',
      threads: [
        {
          threadId: 'active-thread',
          filename: 'notes__agent-chat-openai-active-v1.md',
          cardId: 'active-card',
          updatedAt: 40,
        },
        {
          threadId: 'stale-latest',
          filename: 'notes__agent-chat-openai-stale-v1.md',
          cardId: null,
          updatedAt: 30,
        },
        {
          threadId: 'stale-old',
          filename: 'notes__agent-chat-openai-stale-v1.md',
          cardId: 'stale-card',
          updatedAt: 10,
        },
      ],
    });

    expect(keysMigrated).toBe(true);
    expect(c.map((card) => card.id).sort()).toEqual(['active-card', 'note-1']);
  });

  it('sanitizeAgentChatProjectState removes agent_chat dock rows outside thread index', () => {
    const staged = [
      {
        stagingId: 'owned-staged',
        key: 'notes__agent-chat-openai-owned',
        type: 'agent_chat',
        versions: [{ filename: 'notes__agent-chat-openai-owned-v1.md' }],
      },
      {
        stagingId: 'stale-staged',
        key: 'notes__agent-chat-openai-stale',
        type: 'agent_chat',
        versions: [{ filename: 'notes__agent-chat-openai-stale-v1.md' }],
      },
    ];

    const { stagedSyncCards: s, keysMigrated } = sanitizeAgentChatProjectState([], staged, {
      connectorId: 'openai',
      suppressedKeys: new Set(),
      threads: [{
        threadId: 'thread-owned',
        filename: 'notes__agent-chat-openai-owned-v1.md',
      }],
    });

    expect(keysMigrated).toBe(true);
    expect(s.map((row) => row.stagingId)).toEqual(['owned-staged']);
  });

  it('sanitizeAgentChatProjectState removes cards whose keys are suppressed on document', () => {
    const cards = [
      { id: '1', key: 'notes__agent-chat-openai', type: 'agent_chat', name: 'Previous chat' },
      { id: '2', key: 'audio__x', type: 'audio', name: 'song' },
    ];
    const { cards: c, stagedSyncCards: s } = sanitizeAgentChatProjectState(cards, [], {
      connectorId: 'openai',
      suppressedKeys: new Set(['notes__agent-chat-openai']),
    });
    expect(c).toHaveLength(1);
    expect(c[0].type).toBe('audio');
    expect(s).toHaveLength(0);
  });
});

describe('migrateFolderBackedCardKeys', () => {
  it('rewrites legacy -v1 key from filename', () => {
    const { cards, changed } = migrateFolderBackedCardKeys([{
      key: 'general__playbook-v1',
      type: 'html',
      versions: [{ version: 1, filename: 'general__playbook-v1.html' }],
    }]);
    expect(changed).toBe(true);
    expect(cards[0].key).toBe('general__playbook');
  });

  it('does not change bookmark cards', () => {
    const { cards, changed } = migrateFolderBackedCardKeys([{
      key: 'links__example',
      type: 'bookmark',
      prefix: 'links',
      versions: [{ version: 1, filename: 'links__example-v1.url' }],
    }]);
    expect(changed).toBe(false);
    expect(cards[0].key).toBe('links__example');
  });
});

describe('dedupeAgentChatCardsForConnector', () => {
  it('keeps distinct per-thread agent_chat cards for the same connector', () => {
    const cards = [
      {
        id: '1',
        key: 'notes__agent-chat-openai-abc12345',
        type: 'agent_chat',
        agentThreadId: 'thread-a',
        name: 'Chat A',
      },
      {
        id: '2',
        key: 'notes__agent-chat-openai-def67890',
        type: 'agent_chat',
        agentThreadId: 'thread-b',
        name: 'Chat B',
      },
      { id: '3', key: 'img__x', type: 'image' },
    ];
    const next = dedupeAgentChatCardsForConnector(cards, 'openai', '1', {
      threads: [
        { threadId: 'thread-a', cardId: '1' },
        { threadId: 'thread-b', cardId: '2' },
      ],
    });
    expect(next).toHaveLength(3);
    expect(next.filter((c) => c.type === 'agent_chat').map((c) => c.id).sort()).toEqual(['1', '2']);
  });

  it('removes duplicate agent_chat cards with the same canonical bucket', () => {
    const cards = [
      {
        id: '1',
        key: 'notes__agent-chat-openai',
        type: 'agent_chat',
        name: 'Previous chat',
        versions: [{ filename: 'notes__agent-chat-openai-v1.md' }],
      },
      {
        id: '2',
        key: 'notes__agent-chat-openai',
        type: 'agent_chat',
        name: 'agent-chat-openai',
        versions: [{ filename: 'notes__agent-chat-openai-v1.md' }],
      },
      { id: '3', key: 'img__x', type: 'image' },
    ];
    const next = dedupeAgentChatCardsForConnector(cards, 'openai', '1');
    expect(next).toHaveLength(2);
    expect(next.find((c) => c.type === 'agent_chat')?.id).toBe('1');
  });

  it('sanitizeAgentChatProjectState keeps two thread agent_chat cards on canvas', () => {
    const cards = [
      {
        id: 'c1',
        key: 'notes__agent-chat-openai-abc12345',
        type: 'agent_chat',
        agentThreadId: 'thread-1',
        x: 400,
        y: 80,
        versions: [{ filename: 'notes__agent-chat-openai-abc12345-v1.md' }],
      },
      {
        id: 'c2',
        key: 'notes__agent-chat-openai-def67890',
        type: 'agent_chat',
        agentThreadId: 'thread-2',
        x: 440,
        y: 120,
        versions: [{ filename: 'notes__agent-chat-openai-def67890-v1.md' }],
      },
    ];
    const { cards: c } = sanitizeAgentChatProjectState(cards, [], {
      connectorId: 'openai',
      preferredCardId: 'c1',
      suppressedKeys: new Set(),
      threads: [
        {
          threadId: 'thread-1',
          filename: 'notes__agent-chat-openai-abc12345-v1.md',
          cardId: 'c1',
        },
        {
          threadId: 'thread-2',
          filename: 'notes__agent-chat-openai-def67890-v1.md',
          cardId: 'c2',
        },
      ],
    });
    expect(c).toHaveLength(2);
    expect(c.map((card) => card.id).sort()).toEqual(['c1', 'c2']);
  });
});
