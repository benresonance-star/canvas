import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('createUserTaskArtifact', () => {
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

  it('creates a user_task card with status and queued sync when ingest fails', async () => {
    vi.doMock('../folderWrite.js', () => ({
      writeUserTaskFile: vi.fn(async () => 'tasks__todo-v1.md'),
    }));
    vi.doMock('../readFile.js', () => ({
      readFileEntry: vi.fn(async () => ({
        filename: 'tasks__todo-v1.md',
        content: '---\ntaskStatus: important\n---\n\nShip it',
        content_hash: 'hash-task',
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
    const { createUserTaskArtifact } = await import('../ingest/createUserTask.js');
    const { listArtifactSyncOutbox } = await import('../artifactSyncOutbox.js');

    const result = await createUserTaskArtifact({
      projectId: 'project-1',
      projectName: 'Project',
      folderHandle,
      prefix: 'tasks',
      name: 'todo',
      body: 'Ship it',
      taskStatus: 'important',
    });

    expect(result.card).toMatchObject({
      type: 'user_task',
      taskStatus: 'important',
      key: 'tasks__todo',
      name: 'todo',
    });
    expect(result.card.versions[0]).toMatchObject({
      artifactRef: null,
      artifactSyncState: 'pending',
      content_hash: 'hash-task',
    });
    expect(listArtifactSyncOutbox()).toMatchObject([
      {
        kind: 'user_task',
        projectId: 'project-1',
        filename: 'tasks__todo-v1.md',
        contentHash: 'hash-task',
        lastError: 'api_unavailable',
      },
    ]);
  });
});
