import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('artifactSyncOutbox', () => {
  let storage;

  beforeEach(() => {
    vi.resetModules();
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => storage.get(key) ?? null),
      setItem: vi.fn((key, value) => storage.set(key, value)),
      removeItem: vi.fn((key) => storage.delete(key)),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dedupes queued retries by record identity', async () => {
    const {
      enqueueArtifactSyncRetry,
      listArtifactSyncOutbox,
    } = await import('../artifactSyncOutbox.js');

    enqueueArtifactSyncRetry({
      kind: 'bookmark',
      projectId: 'p1',
      cardKey: 'links__example',
      filename: 'links__example-v1.url',
      url: 'https://example.com/',
    });
    enqueueArtifactSyncRetry({
      kind: 'bookmark',
      projectId: 'p1',
      cardKey: 'links__example',
      filename: 'links__example-v1.url',
      url: 'https://example.com/',
      lastError: 'api unavailable',
    });

    const entries = listArtifactSyncOutbox();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'bookmark',
      projectId: 'p1',
      lastError: 'api unavailable',
    });
  });

  it('flushes successful entries and retains failed entries', async () => {
    const {
      enqueueArtifactSyncRetry,
      flushArtifactSyncOutbox,
      listArtifactSyncOutbox,
    } = await import('../artifactSyncOutbox.js');

    enqueueArtifactSyncRetry({ kind: 'bookmark', projectId: 'p1', cardKey: 'a' });
    enqueueArtifactSyncRetry({ kind: 'note', projectId: 'p1', cardKey: 'b' });

    const result = await flushArtifactSyncOutbox(async (entry) =>
      (entry.kind === 'bookmark' ? { ok: true } : { ok: false, lastError: 'down' }),
    );

    expect(result).toEqual({ flushed: 1, remaining: 1 });
    expect(listArtifactSyncOutbox()).toMatchObject([
      { kind: 'note', attempts: 1, lastError: 'down' },
    ]);
  });
});
