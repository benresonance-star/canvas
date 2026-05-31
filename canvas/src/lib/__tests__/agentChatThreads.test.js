import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createThreadMeta,
  buildAgentChatFilename,
  upsertThreadInIndex,
  renameThreadInIndex,
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
    expect(meta.filename).toContain('agent-chat-openai');
  });

  it('buildAgentChatFilename includes thread slug', () => {
    const name = buildAgentChatFilename('openai', '11111111-2222-4333-8444-555555555555');
    expect(name).toBe('notes__agent-chat-openai-11111111-v1.md');
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
