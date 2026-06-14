import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('createBookmarkArtifact', () => {
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

  it('writes a .url file to the connected folder and ingests the bookmark artifact', async () => {
    const ingestArtifacts = vi.fn(async () => ({
      clusterId: 'cluster-1',
      artifacts: [{
        artifactRef: { id: 'artifact-1', type: 'artifact' },
        uri: 'https://example.com/page',
      }],
    }));
    vi.doMock('../primitivesApi.js', () => ({
      isApiAvailable: vi.fn(async () => true),
      ensureClusterForProject: vi.fn(async () => ({ id: 'cluster-1' })),
      ingestArtifacts,
    }));

    const writable = {
      write: vi.fn(),
      close: vi.fn(),
    };
    const fileHandle = {
      createWritable: vi.fn(async () => writable),
    };
    const folderHandle = {
      getFileHandle: vi.fn(async () => fileHandle),
    };

    const { createBookmarkArtifact } = await import('../ingest/createBookmarkArtifact.js');
    const result = await createBookmarkArtifact({
      projectId: 'project-1',
      projectName: 'Project',
      folderHandle,
      url: 'example.com/page#section',
      preview: {
        title: 'Example',
        domain: 'example.com',
        description: 'Description',
        siteName: 'Example Site',
      },
    });

    expect(result.filename).toBe('links__example-com-v1.url');
    expect(folderHandle.getFileHandle).toHaveBeenCalledWith(
      'links__example-com-v1.url',
      { create: true },
    );
    expect(writable.write).toHaveBeenCalledWith(
      '[InternetShortcut]\r\nURL=https://example.com/page\r\n',
    );
    expect(ingestArtifacts).toHaveBeenCalledWith('project-1', {
      files: [expect.objectContaining({
        type: 'other',
        uri: 'https://example.com/page',
        metadata: expect.objectContaining({
          canvas_kind: 'bookmark',
          filename: 'links__example-com-v1.url',
          title: 'Example',
        }),
      })],
      relationships: [],
    });
    expect(result.card.versions[0]).toMatchObject({
      filename: 'links__example-com-v1.url',
      externalUrl: 'https://example.com/page',
      artifactRef: { id: 'artifact-1', type: 'artifact' },
    });
  });

  it('writes the folder shortcut and queues artifact sync when the API is down', async () => {
    vi.doMock('../primitivesApi.js', () => ({
      isApiAvailable: vi.fn(async () => false),
      ensureClusterForProject: vi.fn(),
      ingestArtifacts: vi.fn(),
    }));
    const writable = {
      write: vi.fn(),
      close: vi.fn(),
    };
    const folderHandle = {
      getFileHandle: vi.fn(async () => ({
        createWritable: vi.fn(async () => writable),
      })),
    };

    const { createBookmarkArtifact } = await import('../ingest/createBookmarkArtifact.js');
    const { listArtifactSyncOutbox } = await import('../artifactSyncOutbox.js');
    const result = await createBookmarkArtifact({
      projectId: 'project-1',
      projectName: 'Project',
      folderHandle,
      url: 'example.com/page',
      preview: {
        title: 'Example',
        domain: 'example.com',
      },
    });

    expect(result.ingest).toMatchObject({
      ok: false,
      reason: 'api_unavailable',
    });
    expect(result.card.versions[0]).toMatchObject({
      artifactRef: null,
      artifactSyncState: 'pending',
    });
    expect(writable.write).toHaveBeenCalledWith(
      '[InternetShortcut]\r\nURL=https://example.com/page\r\n',
    );
    expect(listArtifactSyncOutbox()).toMatchObject([
      {
        kind: 'bookmark',
        projectId: 'project-1',
        filename: 'links__example-com-v1.url',
        url: 'https://example.com/page',
        lastError: 'api_unavailable',
      },
    ]);
  });
});
