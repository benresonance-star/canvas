import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('createUserNoteArtifact', () => {
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
    vi.doUnmock('../folderWrite.js');
    vi.doUnmock('../readFile.js');
    vi.doUnmock('../ingest/syncIngest.js');
  });

  it('keeps the folder note and queues artifact sync when ingest is unavailable', async () => {
    vi.doMock('../folderWrite.js', () => ({
      writeUserNoteFile: vi.fn(async () => 'notes__meeting-v1.md'),
    }));
    vi.doMock('../readFile.js', () => ({
      readFileEntry: vi.fn(async () => ({
        filename: 'notes__meeting-v1.md',
        content: '# Meeting',
        content_hash: 'hash-note',
        lastModified: 123,
      })),
    }));
    vi.doMock('../ingest/syncIngest.js', () => ({
      ingestFoundFiles: vi.fn(async () => ({
        ok: false,
        reason: 'api_unavailable',
        byFilename: {},
      })),
    }));

    const folderHandle = {
      getFileHandle: vi.fn(async () => ({})),
    };
    const { createUserNoteArtifact } = await import('../ingest/createUserNote.js');
    const { listArtifactSyncOutbox } = await import('../artifactSyncOutbox.js');

    const result = await createUserNoteArtifact({
      projectId: 'project-1',
      projectName: 'Project',
      folderHandle,
      prefix: 'notes',
      name: 'meeting',
      body: '# Meeting',
    });

    expect(result.ingest).toMatchObject({
      ok: false,
      reason: 'api_unavailable',
    });
    expect(result.card.versions[0]).toMatchObject({
      artifactRef: null,
      artifactSyncState: 'pending',
      content_hash: 'hash-note',
    });
    expect(listArtifactSyncOutbox()).toMatchObject([
      {
        kind: 'user_note',
        projectId: 'project-1',
        filename: 'notes__meeting-v1.md',
        contentHash: 'hash-note',
        lastError: 'api_unavailable',
      },
    ]);
  });
});
