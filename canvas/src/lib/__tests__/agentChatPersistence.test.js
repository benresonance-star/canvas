import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  serializeRegistry,
  deserializeRegistry,
  saveAgentChatSession,
  loadAgentChatSession,
  clearAgentChatSession,
  clearAgentChatSessionsForProject,
  maxAgentChatMessageId,
} from '../agentChatPersistence.js';
import { createContextRegistry, registerContextCard } from '../agentContextSession.js';
import { agentChatStorageKey } from '../constants.js';
import { resetAgentChatSyncState } from '../agentChatSync.js';

function card(id, hash) {
  return {
    id,
    name: `Card ${id}`,
    type: 'markdown',
    pinnedVersion: 1,
    versions: [{ version: 1, content_hash: hash, filename: 'a.md' }],
  };
}

describe('agentChatPersistence', () => {
  beforeEach(() => {
    resetAgentChatSyncState();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })));
    vi.stubGlobal('localStorage', {
      store: new Map(),
      getItem(key) {
        return this.store.get(key) ?? null;
      },
      setItem(key, value) {
        this.store.set(key, value);
      },
      removeItem(key) {
        this.store.delete(key);
      },
      key(i) {
        return [...this.store.keys()][i] ?? null;
      },
      get length() {
        return this.store.size;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses project connector and thread in storage key', () => {
    expect(agentChatStorageKey('proj1', 'openai', 'thread-1')).toBe(
      'canvas:agent-chat:proj1:openai:thread-1',
    );
  });

  it('round-trips messages and registry per thread', async () => {
    const registry = createContextRegistry();
    registerContextCard(registry, card('a', 'h1'));
    const messages = [
      { id: 'u-1', role: 'user', content: 'Hi', at: 1 },
      { id: 'a-2', role: 'assistant', content: 'Hello', at: 2 },
    ];
    saveAgentChatSession('p1', 'openai', 'thread-a', {
      messages,
      registry: serializeRegistry(registry),
      artifactRef: { id: 'art1', type: 'artifact' },
      filename: 'notes__agent-chat-openai-abc12345-v1.md',
      title: 'My thread',
    });
    const loaded = await loadAgentChatSession('p1', 'openai', 'thread-a');
    expect(loaded.messages).toHaveLength(2);
    expect(loaded.artifactRef.id).toBe('art1');
    expect(loaded.registry.keys.has('a:h1')).toBe(true);
    expect(loaded.title).toBe('My thread');
  });

  it('isolates sessions by thread id', async () => {
    saveAgentChatSession('p1', 'openai', 't1', {
      messages: [{ id: 'u-1', role: 'user', content: 'One', at: 1 }],
      registry: serializeRegistry(createContextRegistry()),
    });
    saveAgentChatSession('p1', 'openai', 't2', {
      messages: [{ id: 'u-1', role: 'user', content: 'Two', at: 1 }],
      registry: serializeRegistry(createContextRegistry()),
    });
    const a = await loadAgentChatSession('p1', 'openai', 't1');
    const b = await loadAgentChatSession('p1', 'openai', 't2');
    expect(a.messages[0].content).toBe('One');
    expect(b.messages[0].content).toBe('Two');
  });

  it('clears session and all sessions for project', async () => {
    await saveAgentChatSession('p1', 'openai', 't1', {
      messages: [],
      registry: serializeRegistry(createContextRegistry()),
    });
    await saveAgentChatSession('p1', 'other', 't1', {
      messages: [],
      registry: serializeRegistry(createContextRegistry()),
    });
    clearAgentChatSession('p1', 'openai', 't1');
    expect(await loadAgentChatSession('p1', 'openai', 't1')).toBeNull();
    expect(await loadAgentChatSession('p1', 'other', 't1')).not.toBeNull();
    clearAgentChatSessionsForProject('p1');
    expect(await loadAgentChatSession('p1', 'other', 't1')).toBeNull();
  });

  it('prefers server session when API returns data', async () => {
    const serverSession = {
      version: 2,
      threadId: 't1',
      updatedAt: Date.now(),
      messages: [{ id: 'u-1', role: 'user', content: 'From server', at: 1 }],
      registry: { keys: [], entries: [] },
      artifactRef: null,
      filename: null,
    };
    localStorage.setItem(
      agentChatStorageKey('p1', 'openai', 't1'),
      JSON.stringify({
        version: 2,
        threadId: 't1',
        messages: [{ id: 'u-1', role: 'user', content: 'Local only', at: 1 }],
        registry: { keys: [], entries: [] },
      }),
    );
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes('/health')) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (String(url).includes('/canvas/agent-chat/p1/openai/t1')) {
        return { ok: true, json: async () => ({ session: serverSession }) };
      }
      return { ok: false, json: async () => ({}) };
    });
    const loaded = await loadAgentChatSession('p1', 'openai', 't1');
    expect(loaded.messages[0].content).toBe('From server');
  });

  it('maxAgentChatMessageId finds highest numeric suffix', () => {
    expect(
      maxAgentChatMessageId([
        { id: 'u-3' },
        { id: 'a-12' },
        { id: 'ctx-add-5' },
      ]),
    ).toBe(12);
  });

  it('deserializeRegistry restores entries', () => {
    const data = serializeRegistry(createContextRegistry());
    const reg = deserializeRegistry(data);
    expect(reg.keys.size).toBe(0);
  });
});
