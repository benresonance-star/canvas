import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const storage = new Map();

function installStorage() {
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
    key: (i) => [...storage.keys()][i] ?? null,
    get length() {
      return storage.size;
    },
  });
}

describe('reconcileActiveProject placement', () => {
  beforeEach(() => {
    storage.clear();
    installStorage();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not pull server dock-only over local canvas when server revision is ahead', async () => {
    const projectId = 'proj-a';
    const localDoc = {
      projectName: 'Local',
      cards: [{ id: 'c1', key: 'notes__a', x: 10, y: 20 }],
      stagedSyncCards: [],
      canvasView: { x: 0, y: 0, zoom: 1 },
      artifactPlacements: {
        'notes__a': { surface: 'canvas', placement: { x: 10, y: 20 } },
      },
    };
    storage.set(`canvas:project:${projectId}`, JSON.stringify(localDoc));
    storage.set(`canvas:project-revision:${projectId}`, '1');

    vi.doMock('../canvasProjectsApi.js', () => ({
      fetchCanvasProjectMeta: vi.fn(async () => ({
        revision: 5,
        updatedAt: new Date(2000).toISOString(),
      })),
      fetchCanvasProjectDocument: vi.fn(async () => ({
        revision: 5,
        updatedAt: new Date(2000).toISOString(),
        payload: {
          cards: [],
          stagedSyncCards: [
            { stagingId: 's1', key: 'notes__a', type: 'markdown' },
          ],
          artifactPlacements: { 'notes__a': { surface: 'dock' } },
        },
      })),
      saveCanvasProject: vi.fn(async () => ({ ok: true, revision: 6 })),
      saveCanvasIndex: vi.fn(async () => ({ ok: true })),
      deleteCanvasProject: vi.fn(),
    }));

    vi.doMock('./projectSyncState.js', () => ({
      getServerSyncEnabled: () => true,
    }));

    const { reconcileActiveProject } = await import('../sync/projectSyncDocument.js');

    const result = await reconcileActiveProject(projectId);
    expect(['pulled']).not.toContain(result.action);
    const raw = storage.get(`canvas:project:${projectId}`);
    const parsed = JSON.parse(raw);
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0].key).toBe('notes__a');
  });


});
