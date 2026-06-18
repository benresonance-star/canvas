import { describe, it, expect } from 'vitest';
import {
  cardsFromSelection,
  cardLabel,
  resolveAgentContextCards,
  cardsInViewport,
  isThreadChatContextCard,
  excludeThreadChatCardsFromContext,
  cardsFromContextRegistry,
  mergeContextCardsById,
  resolveEffectiveAgentContextCards,
} from '../agentContext.js';
import {
  createContextRegistry,
  registerContextCard,
  unregisterContextCard,
} from '../agentContextSession.js';

describe('cardsFromSelection', () => {
  const cards = [
    { id: 'a', name: 'Alpha', x: 0, y: 0, width: 100, height: 80 },
    { id: 'b', name: 'Beta', x: 200, y: 0, width: 100, height: 80 },
    { id: 'c', key: 'c-key', x: 400, y: 0, width: 100, height: 80 },
  ];

  it('returns cards matching selected ids', () => {
    const selected = new Set(['a', 'c']);
    const result = cardsFromSelection(cards, selected);
    expect(result.map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('returns empty array when selection is empty', () => {
    expect(cardsFromSelection(cards, new Set())).toEqual([]);
    expect(cardsFromSelection(cards, null)).toEqual([]);
  });
});

describe('cardLabel', () => {
  it('prefers name then key then Untitled', () => {
    expect(cardLabel({ name: 'Doc' })).toBe('Doc');
    expect(cardLabel({ key: 'k1' })).toBe('k1');
    expect(cardLabel({})).toBe('Untitled');
  });
});

describe('resolveAgentContextCards', () => {
  const cards = [
    { id: 'in', name: 'Inside', x: 10, y: 10, width: 100, height: 80 },
    { id: 'out', name: 'Outside', x: 5000, y: 5000, width: 100, height: 80 },
  ];

  it('selected mode uses cardsFromSelection', () => {
    const selected = new Set(['in']);
    const result = resolveAgentContextCards(
      'selected',
      cards,
      selected,
      { width: 800, height: 600 },
      { x: 0, y: 0, zoom: 1 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('in');
  });

  it('selected mode includes image cards', () => {
    const withImage = [
      ...cards,
      {
        id: 'img',
        name: 'Photo',
        type: 'image',
        x: 20,
        y: 20,
        width: 120,
        height: 90,
      },
    ];
    const result = resolveAgentContextCards(
      'selected',
      withImage,
      new Set(['img']),
      { width: 800, height: 600 },
      { x: 0, y: 0, zoom: 1 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('image');
  });

  it('visible mode uses viewport intersection', () => {
    const result = resolveAgentContextCards(
      'visible',
      cards,
      new Set(),
      { width: 800, height: 600 },
      { x: 0, y: 0, zoom: 1 },
    );
    expect(result.map((c) => c.id)).toEqual(['in']);
  });
});

describe('cardsInViewport', () => {
  it('returns cards overlapping viewport rect', () => {
    const cards = [
      { id: 'v', x: 50, y: 50, width: 100, height: 80 },
    ];
    const visible = cardsInViewport(cards, { width: 400, height: 300 }, { x: 0, y: 0, zoom: 1 });
    expect(visible).toHaveLength(1);
  });
});

describe('thread chat context cards', () => {
  const threadIndex = {
    version: 1,
    activeThreadId: 'thread-1',
    threads: [
      {
        threadId: 'thread-1',
        cardId: 'chat-1',
        filename: 'notes__agent-chat-openai-abc12345-v1.md',
      },
      {
        threadId: 'thread-2',
        cardId: 'chat-2',
        filename: 'notes__agent-chat-openai-def67890-v1.md',
      },
    ],
  };

  const chatCard = {
    id: 'chat-1',
    type: 'agent_chat',
    agentThreadId: 'thread-1',
    key: 'notes__agent-chat-openai-abc12345',
    versions: [{ filename: 'notes__agent-chat-openai-abc12345-v1.md' }],
  };

  const noteCard = { id: 'note-1', type: 'markdown', name: 'PROMPT FOR LIGHTING' };

  it('isThreadChatContextCard is true for active thread chat card', () => {
    expect(
      isThreadChatContextCard(chatCard, {
        activeThreadId: 'thread-1',
        threadIndex,
        connectorId: 'openai',
      }),
    ).toBe(true);
  });

  it('excludeThreadChatCardsFromContext removes thread chat cards', () => {
    const out = excludeThreadChatCardsFromContext([chatCard, noteCard], {
      activeThreadId: 'thread-1',
      threadIndex,
      connectorId: 'openai',
    });
    expect(out.map((c) => c.id)).toEqual(['note-1']);
  });
});

describe('resolveEffectiveAgentContextCards', () => {
  const threadIndex = {
    version: 1,
    activeThreadId: 'thread-1',
    threads: [
      {
        threadId: 'thread-1',
        cardId: 'chat-1',
        filename: 'notes__agent-chat-openai-abc-v1.md',
      },
    ],
  };

  const cards = [
    {
      id: 'chat-1',
      type: 'agent_chat',
      agentThreadId: 'thread-1',
      key: 'notes__agent-chat-openai-abc',
      x: 400,
      y: 80,
      width: 200,
      height: 120,
      versions: [{ filename: 'notes__agent-chat-openai-abc-v1.md' }],
    },
    {
      id: 'a',
      name: 'PROMPT FOR LIGHTING',
      type: 'markdown',
      x: 10,
      y: 10,
      width: 100,
      height: 80,
    },
    {
      id: 'b',
      name: 'Other',
      type: 'markdown',
      x: 200,
      y: 10,
      width: 100,
      height: 80,
    },
  ];

  it('includes registry-backed cards when nothing is selected', () => {
    const registry = createContextRegistry();
    registerContextCard(registry, cards[1]);

    const effective = resolveEffectiveAgentContextCards({
      mode: 'selected',
      cards,
      selectedCardIds: new Set(),
      viewportSize: { width: 800, height: 600 },
      canvasView: { x: 0, y: 0, zoom: 1 },
      registry,
      activeThreadId: 'thread-1',
      threadIndex,
      connectorId: 'openai',
    });

    expect(effective.map((c) => c.id)).toEqual(['a']);
  });

  it('excludes active thread chat card even when selected', () => {
    const effective = resolveEffectiveAgentContextCards({
      mode: 'selected',
      cards,
      selectedCardIds: new Set(['chat-1', 'a']),
      viewportSize: { width: 800, height: 600 },
      canvasView: { x: 0, y: 0, zoom: 1 },
      registry: createContextRegistry(),
      activeThreadId: 'thread-1',
      threadIndex,
      connectorId: 'openai',
    });

    expect(effective.map((c) => c.id)).toEqual(['a']);
  });

  it('mergeContextCardsById dedupes by id', () => {
    const merged = mergeContextCardsById(
      [cards[1]],
      [cards[1], cards[2]],
    );
    expect(merged.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('cardsFromContextRegistry resolves live cards', () => {
    const registry = createContextRegistry();
    registerContextCard(registry, cards[2]);
    expect(cardsFromContextRegistry(registry, cards).map((c) => c.id)).toEqual(['b']);
  });

  it('does not reintroduce an unregistered selected card from registry', () => {
    const registry = createContextRegistry();
    registerContextCard(registry, cards[1]);
    unregisterContextCard(registry, cards[1].id);

    const selected = new Set(['b']);
    const effective = resolveEffectiveAgentContextCards({
      mode: 'selected',
      cards,
      selectedCardIds: selected,
      viewportSize: { width: 800, height: 600 },
      canvasView: { x: 0, y: 0, zoom: 1 },
      registry,
      activeThreadId: 'thread-1',
      threadIndex,
      connectorId: 'openai',
    });

    expect(effective.map((c) => c.id)).toEqual(['b']);
  });
});
