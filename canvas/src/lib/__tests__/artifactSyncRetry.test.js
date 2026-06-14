import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('artifact sync retry', () => {
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
    vi.doUnmock('../primitivesApi.js');
  });

  it('flushes recovered bookmark artifact sync and returns patch metadata', async () => {
    const ingestArtifacts = vi.fn(async () => ({
      clusterId: 'cluster-1',
      artifacts: [{
        artifactRef: { id: 'artifact-1', type: 'artifact' },
        content_hash: 'hash-1',
      }],
    }));
    vi.doMock('../primitivesApi.js', () => ({
      isApiAvailable: vi.fn(async () => true),
      ensureClusterForProject: vi.fn(async () => ({ id: 'cluster-1' })),
      ingestArtifacts,
      createRelationship: vi.fn(async () => ({ created: true })),
    }));

    const {
      enqueueArtifactSyncRetry,
      flushArtifactSyncOutbox,
      listArtifactSyncOutbox,
    } = await import('../artifactSyncOutbox.js');
    const { processArtifactSyncRetryEntry } = await import('../artifactSyncRetry.js');

    enqueueArtifactSyncRetry({
      kind: 'bookmark',
      projectId: 'project-1',
      projectName: 'Project',
      cardKey: 'links__example-com',
      filename: 'links__example-com-v1.url',
      url: 'https://example.com/page',
      title: 'Example',
      contentHash: 'hash-1',
    });

    const applied = [];
    const result = await flushArtifactSyncOutbox(async (entry) => {
      const retry = await processArtifactSyncRetryEntry(entry);
      if (retry.ok) applied.push(retry);
      return retry;
    });

    expect(result).toEqual({ flushed: 1, remaining: 0 });
    expect(listArtifactSyncOutbox()).toEqual([]);
    expect(ingestArtifacts).toHaveBeenCalledWith('project-1', {
      files: [expect.objectContaining({
        type: 'other',
        uri: 'https://example.com/page',
        metadata: expect.objectContaining({
          canvas_kind: 'bookmark',
          filename: 'links__example-com-v1.url',
        }),
      })],
      relationships: [],
    });
    expect(applied[0]).toMatchObject({
      ok: true,
      artifactRef: { id: 'artifact-1', type: 'artifact' },
      filename: 'links__example-com-v1.url',
      cardKey: 'links__example-com',
    });
  });
});
