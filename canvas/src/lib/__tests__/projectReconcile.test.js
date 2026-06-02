import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sortProjectListForMenu } from '../projectReconcile.js';
import { mergeProjectIndices } from '../projectSync.js';

describe('projectReconcile', () => {
  it('sortProjectListForMenu puts non-archived first by updatedAt', () => {
    const sorted = sortProjectListForMenu([
      { id: 'a', name: 'A', updatedAt: 10, archived: true },
      { id: 'b', name: 'B', updatedAt: 5, archived: false },
      { id: 'c', name: 'C', updatedAt: 20, archived: false },
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });

  it('mergeProjectIndices keeps local active tab over stale server active', () => {
    const { index } = mergeProjectIndices(
      {
        version: 1,
        activeProjectId: 'local',
        projects: [
          { id: 'local', name: 'L', updatedAt: 100, createdAt: 1, archived: false },
          { id: 'shared', name: 'S', updatedAt: 50, createdAt: 1, archived: false },
        ],
      },
      {
        version: 1,
        activeProjectId: 'shared',
        projects: [
          { id: 'shared', name: 'S', updatedAt: 200, createdAt: 1, archived: false },
        ],
      },
      { preferServerActive: true },
    );
    expect(index.activeProjectId).toBe('local');
  });
});

describe('projectReconcile reconcileProject', () => {
  const storage = new Map();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('window', {
      storage: {
        async get(key) {
          const value = storage.get(key);
          return value != null ? { value } : null;
        },
        async set(key, value) {
          storage.set(key, value);
        },
      },
    });
    vi.stubGlobal('localStorage', {
      removeItem: (key) => storage.delete(key),
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      key: () => null,
      length: 0,
    });
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reconcile does not rewrite index name from document projectName', async () => {
    const projectId = 'p1';
    storage.set(
      'canvas:project-index',
      JSON.stringify({
        version: 1,
        activeProjectId: projectId,
        projects: [
          {
            id: projectId,
            name: 'Index Name',
            createdAt: 1,
            updatedAt: 100,
            archived: false,
          },
        ],
      }),
    );
    storage.set(
      `canvas:project:${projectId}`,
      JSON.stringify({
        projectName: 'Stale Doc Name',
        cards: [],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return {
          ok: true,
          json: async () => ({
            index: JSON.parse(storage.get('canvas:project-index')),
            updatedAt: '2025-01-01T00:00:00.000Z',
          }),
        };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 1, updatedAt: '2025-01-02T00:00:00.000Z' }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: JSON.parse(storage.get(`canvas:project:${projectId}`)),
            updatedAt: '2025-01-02T00:00:00.000Z',
            revision: 1,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const { reconcileProject } = await import('../projectReconcile.js');
    const { initializeProjectSync, resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();

    const index = JSON.parse(storage.get('canvas:project-index'));
    const { row } = await reconcileProject(projectId, { index, row: index.projects[0] });

    expect(row.name).toBe('Index Name');
    const doc = JSON.parse(storage.get(`canvas:project:${projectId}`));
    expect(doc.projectName).toBe('Stale Doc Name');
  });
});
