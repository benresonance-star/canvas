import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createThreadMeta,
  agentTypeSnapshotFromTemplate,
  applyAgentTypeToThread,
  clearAgentTypeFromThread,
  createAgentTypeChangeMessage,
  normalizeThreadConnectorIds,
  buildAgentChatFilename,
  connectorIdFromAgentChatFilename,
  upsertThreadInIndex,
  renameThreadInIndex,
  setActiveThreadInIndex,
  collectCanonicalAgentChatOwnership,
  collectKnownAgentChatKeys,
  discoverThreadsFromCanvas,
  discoverThreadsFromStaged,
  mergeDiscoveredThreads,
  mergeThreadIndexes,
  pickThreadTitleForMerge,
  emptyThreadIndex,
  clearCardIdFromThreadIndex,
  findThreadIdByFilenameSlug,
  linkCardToThreadInIndex,
  resolveThreadForCard,
} from '../agentChatThreads.js';

describe('agentChatThreads', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '11111111-2222-4333-8444-555555555555',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createThreadMeta assigns title and filename', () => {
    const meta = createThreadMeta({ connectorId: 'openai', title: 'Test' });
    expect(meta.title).toBe('Test');
    expect(meta.threadId).toBeTruthy();
    expect(meta.connectorId).toBe('openai');
    expect(meta.filename).toContain('agent-chat-openai');
  });

  it('createThreadMeta keeps default local threads tied to their connector', () => {
    const meta = createThreadMeta({ connectorId: 'ollama-gemma-12b', title: 'Gemma' });
    expect(meta.connectorId).toBe('ollama-gemma-12b');
    expect(meta).not.toHaveProperty('agentTemplateId');
    expect(meta).not.toHaveProperty('provider');
    expect(meta).not.toHaveProperty('model');
    expect(meta.filename).toContain('agent-chat-ollama-gemma-12b');
  });

  it('normalizeThreadConnectorIds backfills legacy thread metadata', () => {
    const normalized = normalizeThreadConnectorIds(
      {
        version: 1,
        activeThreadId: 'legacy',
        threads: [
          { threadId: 'legacy', title: 'Legacy thread' },
          { threadId: 'kept', connectorId: 'ollama-gemma-12b' },
        ],
      },
      'openai',
    );

    expect(normalized.threads[0].connectorId).toBe('openai');
    expect(normalized.threads[1].connectorId).toBe('ollama-gemma-12b');
  });

  it('createThreadMeta snapshots Agent Type metadata', () => {
    const meta = createThreadMeta({
      connectorId: 'openai',
      title: 'Test',
      agentTemplate: {
        id: 'brainstorming',
        label: 'Brainstorming Agent',
        provider: 'openai',
        model: 'gpt-5.5',
      },
    });
    expect(meta).toMatchObject({
      agentTemplateId: 'brainstorming',
      agentTypeLabel: 'Brainstorming Agent',
      provider: 'openai',
      model: 'gpt-5.5',
    });
  });

  it('applyAgentTypeToThread updates thread-bound Agent Type', () => {
    const thread = createThreadMeta({
      connectorId: 'openai',
      agentTemplate: { id: 'old', label: 'Old Agent', provider: 'openai', model: 'gpt-4' },
    });
    const next = applyAgentTypeToThread(thread, {
      id: 'new',
      label: 'New Agent',
      provider: 'openai',
      model: 'gpt-5.5',
    });
    expect(next.agentTemplateId).toBe('new');
    expect(next.agentTypeLabel).toBe('New Agent');
    expect(next.model).toBe('gpt-5.5');
  });

  it('createAgentTypeChangeMessage records from and to Agent Types', () => {
    const fromThread = {
      agentTemplateId: 'old',
      agentTypeLabel: 'Old Agent',
    };
    const message = createAgentTypeChangeMessage({
      fromThread,
      toTemplate: { id: 'new', label: 'New Agent', provider: 'openai', model: 'gpt-5.5' },
      at: 123,
    });
    expect(message).toMatchObject({
      kind: 'agent_type_change',
      fromAgentTemplateId: 'old',
      fromAgentTypeLabel: 'Old Agent',
      toAgentTemplateId: 'new',
      toAgentTypeLabel: 'New Agent',
      model: 'gpt-5.5',
      at: 123,
    });
  });

  it('clearAgentTypeFromThread removes provider-specific template snapshot', () => {
    const cleared = clearAgentTypeFromThread({
      threadId: 't1',
      agentTemplateId: 'brainstorming',
      agentTypeLabel: 'Brainstorming Agent',
      provider: 'openai',
      model: 'openai/gpt-5.5',
      updatedAt: 1,
    });

    expect(cleared.agentTemplateId).toBe(null);
    expect(cleared.agentTypeLabel).toBe(null);
    expect(cleared.provider).toBe(null);
    expect(cleared.model).toBe(null);
    expect(cleared.updatedAt).toBeGreaterThan(1);
  });

  it('agentTypeSnapshotFromTemplate tolerates missing template for legacy fallback', () => {
    expect(agentTypeSnapshotFromTemplate(null)).toEqual({});
  });

  it('buildAgentChatFilename includes thread slug', () => {
    const name = buildAgentChatFilename('openai', '11111111-2222-4333-8444-555555555555');
    expect(name).toBe('notes__agent-chat-openai-11111111-v1.md');
  });

  it('connectorIdFromAgentChatFilename resolves connector-specific prefixes', () => {
    expect(
      connectorIdFromAgentChatFilename('notes__agent-chat-ollama-gemma-12b-abcd1234-v1.md'),
    ).toBe('ollama-gemma-12b');
    expect(
      connectorIdFromAgentChatFilename('notes__agent-chat-ollama-gemma-26b-abcd1234-v1.md'),
    ).toBe('ollama-gemma-26b');
    expect(connectorIdFromAgentChatFilename('notes__agent-chat-openai-abcd1234-v1.md')).toBe('openai');
  });

  it('upsertThreadInIndex replaces same threadId', () => {
    const index = emptyThreadIndex();
    const t = createThreadMeta({ connectorId: 'openai' });
    let next = upsertThreadInIndex(index, t);
    next = upsertThreadInIndex(next, { ...t, title: 'Updated' });
    expect(next.threads).toHaveLength(1);
    expect(next.threads[0].title).toBe('Updated');
  });

  it('renameThreadInIndex updates title', () => {
    const t = createThreadMeta({ connectorId: 'openai' });
    let index = upsertThreadInIndex(emptyThreadIndex(), t);
    index = renameThreadInIndex(index, t.threadId, 'Renamed');
    expect(index.threads[0].title).toBe('Renamed');
  });

  it('collectKnownAgentChatKeys gathers filenames from index', () => {
    const t = createThreadMeta({ connectorId: 'openai' });
    const index = upsertThreadInIndex(emptyThreadIndex(), t);
    const keys = collectKnownAgentChatKeys(index);
    expect(keys.has('notes__agent-chat-openai-11111111')).toBe(true);
  });

  it('collectKnownAgentChatKeys ignores unplaced duplicate threads when scoped', () => {
    let index = emptyThreadIndex();
    index = upsertThreadInIndex(index, {
      threadId: 'owned-thread',
      filename: 'notes__agent-chat-openai-owned-v1.md',
      cardId: 'owned-card',
    });
    index = upsertThreadInIndex(index, {
      threadId: 'stale-thread',
      filename: 'notes__agent-chat-openai-stale-v1.md',
      cardId: 'missing-card',
    });
    index = upsertThreadInIndex(index, {
      threadId: 'active-thread',
      filename: 'notes__agent-chat-openai-active-v1.md',
      cardId: null,
    });
    index = setActiveThreadInIndex(index, 'active-thread');

    const keys = collectKnownAgentChatKeys(index, {
      cards: [{ id: 'owned-card', key: 'notes__agent-chat-openai-owned' }],
      stagedSyncCards: [],
    });

    expect(keys.has('notes__agent-chat-openai-owned')).toBe(true);
    expect(keys.has('notes__agent-chat-openai-active')).toBe(true);
    expect(keys.has('notes__agent-chat-openai-stale')).toBe(false);
  });

  it('collectKnownAgentChatKeys includes dock-only agent chat when stagedSyncCards scoped', () => {
    let index = emptyThreadIndex();
    index = upsertThreadInIndex(index, {
      threadId: 'active-thread',
      filename: 'notes__agent-chat-openai-active-v1.md',
      cardId: null,
    });
    index = upsertThreadInIndex(index, {
      threadId: 'docked-thread',
      filename: 'notes__agent-chat-openai-docked-v1.md',
      cardId: null,
    });
    index = setActiveThreadInIndex(index, 'active-thread');

    const dockOnlyStaged = [{
      stagingId: 'dock-staging-1',
      key: 'notes__agent-chat-openai-docked',
      type: 'agent_chat',
    }];

    const canvasOnlyKeys = collectKnownAgentChatKeys(index, {
      cards: [],
      stagedSyncCards: [],
    });
    expect(canvasOnlyKeys.has('notes__agent-chat-openai-docked')).toBe(false);
    expect(canvasOnlyKeys.has('notes__agent-chat-openai-active')).toBe(true);

    const dockScopedKeys = collectKnownAgentChatKeys(index, {
      cards: [],
      stagedSyncCards: dockOnlyStaged,
    });
    expect(dockScopedKeys.has('notes__agent-chat-openai-docked')).toBe(true);
    expect(dockScopedKeys.has('notes__agent-chat-openai-active')).toBe(true);
  });

  it('collectCanonicalAgentChatOwnership keeps only latest cardId per filename', () => {
    const ownership = collectCanonicalAgentChatOwnership({
      activeThreadId: 'active-thread',
      threads: [
        {
          threadId: 'old-thread',
          filename: 'notes__agent-chat-openai-stale-v1.md',
          cardId: 'stale-card',
          updatedAt: 10,
        },
        {
          threadId: 'new-thread',
          filename: 'notes__agent-chat-openai-stale-v1.md',
          cardId: null,
          updatedAt: 20,
        },
        {
          threadId: 'active-thread',
          filename: 'notes__agent-chat-openai-active-v1.md',
          cardId: null,
          updatedAt: 5,
        },
      ],
    });

    expect(ownership.keys.has('notes__agent-chat-openai-stale')).toBe(true);
    expect(ownership.cardIds.has('stale-card')).toBe(false);
    expect(ownership.activeKeys.has('notes__agent-chat-openai-active')).toBe(true);
  });

  it('collectCanonicalAgentChatOwnership orders ISO timestamps correctly', () => {
    const ownership = collectCanonicalAgentChatOwnership({
      threads: [
        {
          threadId: 'old-thread',
          filename: 'notes__agent-chat-openai-stale-v1.md',
          cardId: 'stale-card',
          updatedAt: '2026-06-18T01:00:00.000Z',
        },
        {
          threadId: 'new-thread',
          filename: 'notes__agent-chat-openai-stale-v1.md',
          cardId: null,
          updatedAt: '2026-06-18T02:00:00.000Z',
        },
      ],
    });

    expect(ownership.keys.has('notes__agent-chat-openai-stale')).toBe(true);
    expect(ownership.cardIds.has('stale-card')).toBe(false);
  });

  it('discoverThreadsFromStaged finds dock-only chats', () => {
    const staged = [
      {
        stagingId: 's1',
        key: 'notes__agent-chat-openai-abc12345',
        name: 'Dock chat',
        type: 'agent_chat',
        versions: [{ filename: 'notes__agent-chat-openai-abc12345-v1.md' }],
      },
    ];
    const found = discoverThreadsFromStaged(staged, 'openai');
    expect(found).toHaveLength(1);
    expect(found[0].cardId).toBeNull();
  });

  it('discovers agent_chat cards for connector', () => {
    const cards = [
      {
        id: 'c1',
        key: 'notes__agent-chat-openai-abc12345',
        name: 'Chat A',
        type: 'agent_chat',
        versions: [{ version: 1, filename: 'notes__agent-chat-openai-abc12345-v1.md' }],
      },
      { id: 'c2', key: 'img__photo', type: 'image', versions: [] },
    ];
    const found = discoverThreadsFromCanvas(cards, 'openai');
    expect(found).toHaveLength(1);
    expect(found[0].cardId).toBe('c1');
  });

  it('clearCardIdFromThreadIndex clears cardId on matching threads', () => {
    const t = createThreadMeta({ connectorId: 'openai' });
    const withCard = { ...t, cardId: 'card-1' };
    const index = upsertThreadInIndex(emptyThreadIndex(), withCard);
    const next = clearCardIdFromThreadIndex(index, 'card-1');
    expect(next.threads[0].cardId).toBeNull();
  });

  it('mergeDiscoveredThreads does not duplicate by filename', () => {
    const t = createThreadMeta({ connectorId: 'openai' });
    const index = upsertThreadInIndex(emptyThreadIndex(), t);
    const discovered = [
      {
        title: 'Dup',
        filename: t.filename,
        cardId: 'other-card',
      },
    ];
    const next = mergeDiscoveredThreads(index, discovered, 'openai');
    expect(next.threads).toHaveLength(1);
  });

  it('findThreadIdByFilenameSlug matches thread from filename', () => {
    const t = createThreadMeta({ connectorId: 'openai' });
    const id = findThreadIdByFilenameSlug(
      [t],
      'notes__agent-chat-openai-11111111-v1.md',
    );
    expect(id).toBe(t.threadId);
  });

  it('mergeDiscoveredThreads reuses threadId from filename slug', () => {
    const t = createThreadMeta({ connectorId: 'openai' });
    const index = upsertThreadInIndex(emptyThreadIndex(), t);
    const discovered = [
      {
        title: 'Rediscovered',
        filename: t.filename,
        cardId: 'card-new',
      },
    ];
    const next = mergeDiscoveredThreads(index, discovered, 'openai');
    expect(next.threads[0].threadId).toBe(t.threadId);
    expect(next.threads[0].cardId).toBe('card-new');
  });

  it('linkCardToThreadInIndex sets cardId', () => {
    const t = createThreadMeta({ connectorId: 'openai' });
    let index = upsertThreadInIndex(emptyThreadIndex(), t);
    index = linkCardToThreadInIndex(index, t.threadId, { cardId: 'c99' });
    expect(index.threads[0].cardId).toBe('c99');
  });

  it('mergeThreadIndexes keeps newer per-thread title from local', () => {
    const t = createThreadMeta({ connectorId: 'openai', title: 'Old' });
    const remote = upsertThreadInIndex(emptyThreadIndex(), {
      ...t,
      title: 'Old',
      updatedAt: 1000,
    });
    const local = upsertThreadInIndex(emptyThreadIndex(), {
      ...t,
      title: 'Renamed',
      updatedAt: 5000,
    });
    const merged = mergeThreadIndexes(local, remote);
    expect(merged.threads[0].title).toBe('Renamed');
  });

  it('pickThreadTitleForMerge keeps index title when discover is generic card name', () => {
    const indexThread = {
      title: 'My custom name',
      updatedAt: 5000,
      createdAt: 1000,
    };
    const discovered = { title: 'Chat transcript', updatedAt: 0 };
    expect(pickThreadTitleForMerge(indexThread, discovered)).toBe('My custom name');
  });

  it('mergeDiscoveredThreads keeps renamed index title over stale card name', () => {
    const t = createThreadMeta({ connectorId: 'openai', title: 'Renamed title' });
    const index = upsertThreadInIndex(emptyThreadIndex(), {
      ...t,
      updatedAt: Date.now(),
    });
    const discovered = [
      {
        title: 'Chat transcript',
        filename: t.filename,
        cardId: t.cardId,
        updatedAt: 0,
      },
    ];
    const next = mergeDiscoveredThreads(index, discovered, 'openai');
    expect(next.threads[0].title).toBe('Renamed title');
  });

  it('resolveThreadForCard finds thread by agentThreadId', () => {
    const t = createThreadMeta({ connectorId: 'openai' });
    const index = upsertThreadInIndex(emptyThreadIndex(), { ...t, cardId: 'c1' });
    const card = {
      id: 'c1',
      type: 'agent_chat',
      agentThreadId: t.threadId,
      versions: [{ filename: t.filename }],
    };
    const resolved = resolveThreadForCard(index, card, 'openai');
    expect(resolved?.threadId).toBe(t.threadId);
  });
});
