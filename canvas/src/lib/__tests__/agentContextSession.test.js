import { describe, it, expect } from 'vitest';
import {
  buildCardContextKey,
  createContextRegistry,
  registerContextCard,
  unregisterContextCard,
  diffContextRegistry,
  computeContextDeliveryState,
  getContextDeliveryStatus,
  getCardContentHash,
  buildApiMessageHistory,
  buildApiMessageHistoryAsync,
  apiMessagesIncludeImages,
  stripApiContentForStorage,
  hydrateContextAddMessage,
} from '../agentContextSession.js';
import { CONTEXT_ADD_PREFIX } from '../agentContextContent.js';

function card(id, hash, overrides = {}) {
  return {
    id,
    name: `Card ${id}`,
    type: 'markdown',
    pinnedVersion: 1,
    versions: [{ version: 1, content_hash: hash, filename: 'a.md' }],
    ...overrides,
  };
}

describe('agentContextSession', () => {
  it('buildCardContextKey uses card id and content hash', () => {
    const key = buildCardContextKey(card('c1', 'abc'));
    expect(key).toBe('c1:abc');
  });

  it('diffContextRegistry detects added, stable, and removed', () => {
    const registry = createContextRegistry();
    const a = card('a', 'h1');
    const b = card('b', 'h2');
    registerContextCard(registry, a);

    const diff1 = diffContextRegistry(registry, [a, b]);
    expect(diff1.stable.map((c) => c.id)).toEqual(['a']);
    expect(diff1.added.map((c) => c.id)).toEqual(['b']);
    expect(diff1.removed).toHaveLength(0);

    const diff2 = diffContextRegistry(registry, [b]);
    expect(diff2.removed).toEqual([{ cardId: 'a', label: 'Card a', key: 'a:h1' }]);
    expect(diff2.added.map((c) => c.id)).toEqual(['b']);
  });

  it('diffContextRegistry treats content hash change as remove + add', () => {
    const registry = createContextRegistry();
    const v1 = card('a', 'old');
    registerContextCard(registry, v1);

    const v2 = card('a', 'new');
    const diff = diffContextRegistry(registry, [v2]);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].cardId).toBe('a');
    expect(diff.added.map((c) => c.id)).toEqual(['a']);
    expect(diff.stable).toHaveLength(0);
  });

  it('computeContextDeliveryState exposes pending add/remove', () => {
    const registry = createContextRegistry();
    const a = card('a', 'h1');
    registerContextCard(registry, a);
    const state = computeContextDeliveryState(registry, [a, card('b', 'h2')]);
    expect(state.pendingAdd.map((c) => c.id)).toEqual(['b']);
    expect(state.sentKeys.has('a:h1')).toBe(true);
  });

  it('getContextDeliveryStatus reflects registry', () => {
    const registry = createContextRegistry();
    const c = card('a', 'h1');
    expect(getContextDeliveryStatus(c, registry, { folderLinked: true })).toBe(
      'sends_on_next',
    );
    registerContextCard(registry, c);
    expect(getContextDeliveryStatus(c, registry, { folderLinked: true })).toBe(
      'sent_to_ai',
    );
  });

  it('buildApiMessageHistory maps roles and content', () => {
    const api = buildApiMessageHistory([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
    expect(api).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('buildApiMessageHistory passes through apiContent parts', () => {
    const parts = [
      { type: 'text', text: 'context' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,ab', detail: 'low' } },
    ];
    const api = buildApiMessageHistory([
      { role: 'user', apiContent: parts, content: 'display only' },
    ]);
    expect(api[0].content).toEqual(parts);
    expect(apiMessagesIncludeImages(api)).toBe(true);
  });

  it('apiMessagesIncludeImages is false for text-only API history', () => {
    expect(apiMessagesIncludeImages([
      { role: 'user', content: 'hello' },
    ])).toBe(false);
  });

  it('stripApiContentForStorage removes apiContent', () => {
    const stripped = stripApiContentForStorage([
      { role: 'user', content: 'x', apiContent: [{ type: 'text', text: 'y' }] },
    ]);
    expect(stripped[0].apiContent).toBeUndefined();
    expect(stripped[0].content).toBe('x');
  });

  it('getContextDeliveryStatus needs folder for image without preview', () => {
    const registry = createContextRegistry();
    const c = card('img', 'h1', { type: 'image', versions: [{ version: 1, content_hash: 'h1' }] });
    expect(getContextDeliveryStatus(c, registry, { folderLinked: false })).toBe(
      'needs_folder',
    );
  });

  it('getContextDeliveryStatus allows image with preview cache key', () => {
    const registry = createContextRegistry();
    const c = card('img', 'h1', {
      type: 'image',
      versions: [{ version: 1, content_hash: 'h1', previewCacheKey: 'pk1' }],
    });
    expect(getContextDeliveryStatus(c, registry, { folderLinked: false })).toBe(
      'sends_on_next',
    );
  });

  it('getContextDeliveryStatus needs folder for code card without artifact', () => {
    const registry = createContextRegistry();
    const c = card('ts', 'h1', {
      type: 'code',
      versions: [{ version: 1, content_hash: 'h1', filename: 'models__agent-v1.ts' }],
    });
    expect(getContextDeliveryStatus(c, registry, { folderLinked: false })).toBe(
      'needs_folder',
    );
  });

  it('hydrateContextAddMessage falls back to stored content when reload is empty', async () => {
    const storedContent = `${CONTEXT_ADD_PREFIX}\n\n## agent (code)\nmodel: "openai/gpt-5.5"`;
    const hydrated = await hydrateContextAddMessage(
      {
        kind: 'context_add',
        role: 'user',
        cardIds: ['ts-card'],
        content: storedContent,
      },
      {
        cards: [{
          id: 'ts-card',
          name: 'agent',
          type: 'code',
          pinnedVersion: 1,
          versions: [{ version: 1, filename: 'models__agent-v1.ts' }],
        }],
        folderHandle: null,
      },
    );
    expect(hydrated.apiContent).toEqual([{ type: 'text', text: storedContent }]);
  });

  it('rehydrates context_add even when apiContent is already cached', async () => {
    const folderHandle = {
      getFileHandle: async () => ({
        async getFile() {
          return new File(['Updated on disk'], 'readme-v1.md', { type: 'text/markdown' });
        },
      }),
    };

    const hydrated = await hydrateContextAddMessage(
      {
        kind: 'context_add',
        role: 'user',
        cardIds: ['md-1'],
        content: 'old display',
        apiContent: [{
          type: 'text',
          text: `${CONTEXT_ADD_PREFIX}\n\n## readme (markdown)\nStale cached body`,
        }],
      },
      {
        cards: [{
          id: 'md-1',
          name: 'readme',
          type: 'markdown',
          pinnedVersion: 1,
          versions: [{ version: 1, filename: 'readme-v1.md' }],
        }],
        folderHandle,
        fetchArtifact: async () => ({
          artifact: { payload_text: 'Stale cached body' },
        }),
      },
    );

    const textPart = hydrated.apiContent.find((part) => part.type === 'text');
    expect(textPart.text).toContain('Updated on disk');
    expect(textPart.text).not.toContain('Stale cached body');
  });

  it('unregisterContextCard removes entry', () => {
    const registry = createContextRegistry();
    const c = card('a', 'h1');
    registerContextCard(registry, c);
    unregisterContextCard(registry, 'a');
    expect(registry.byCardId.size).toBe(0);
    expect(registry.keys.size).toBe(0);
  });

  it('getCardContentHash uses liveCurrentVersionId for live cards', () => {
    const liveCard = {
      id: 'live-1',
      name: 'Feed',
      type: 'live',
      liveCurrentVersionId: 'version-42',
      pinnedVersion: 1,
      versions: [{ version: 1, artifactRef: { id: 'live-artifact-1' } }],
    };
    expect(getCardContentHash(liveCard)).toBe('version-42');
    expect(buildCardContextKey(liveCard)).toBe('live-1:version-42');
  });

  it('diffContextRegistry re-adds live card when liveCurrentVersionId changes', () => {
    const registry = createContextRegistry();
    const v1 = {
      id: 'live-1',
      name: 'Feed',
      type: 'live',
      liveCurrentVersionId: 'version-1',
      pinnedVersion: 1,
      versions: [{ version: 1, artifactRef: { id: 'live-artifact-1' } }],
    };
    registerContextCard(registry, v1);

    const v2 = { ...v1, liveCurrentVersionId: 'version-2' };
    const diff = diffContextRegistry(registry, [v2]);
    expect(diff.removed).toHaveLength(1);
    expect(diff.added.map((c) => c.id)).toEqual(['live-1']);
    expect(diff.stable).toHaveLength(0);
  });
});
