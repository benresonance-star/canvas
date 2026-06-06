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

describe('project sync index integrity repair', () => {
  beforeEach(() => {
    storage.clear();
    installStorage();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pushes pruned ghost project ids as deleted ids to the server index', async () => {
    const indexPuts = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      const u = String(url);
      if (u.includes('/canvas/projects/ghost/meta')) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (u.endsWith('/canvas/index') && options?.method === 'PUT') {
        indexPuts.push(JSON.parse(options.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({ revision: 4, updatedAt: '2026-06-05T00:00:00.000Z' }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const { resetProjectSyncState, setServerSyncEnabled } =
      await import('../sync/projectSyncState.js');
    const { applyWorkspaceIntegrityRepair } = await import('../projectSync.js');
    resetProjectSyncState();
    setServerSyncEnabled(true);

    const result = await applyWorkspaceIntegrityRepair(
      {
        version: 1,
        activeProjectId: 'ghost',
        projects: [
          {
            id: 'ghost',
            name: 'Ghost',
            createdAt: 1,
            updatedAt: 1,
            archived: false,
          },
        ],
      },
      { checkServerGhosts: true },
    );

    expect(result.ghostPrunedIds).toEqual(['ghost']);
    expect(indexPuts).toHaveLength(1);
    expect(indexPuts[0].deletedProjectIds).toEqual(['ghost']);
    expect(indexPuts[0].index.projects).toEqual([]);
    expect(indexPuts[0].index.activeProjectId).toBeNull();
  });

  it('recreates a missing server document with revision 0 despite a stale cached revision', async () => {
    const projectPuts = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      const u = String(url);
      if (u.includes('/canvas/projects/folly/meta')) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (u.includes('/canvas/projects/folly') && options?.method === 'PUT') {
        projectPuts.push(JSON.parse(options.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({ revision: 1, updatedAt: '2026-06-05T00:00:00.000Z' }),
        };
      }
      if (u.endsWith('/canvas/index') && options?.method === 'PUT') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ revision: 5, updatedAt: '2026-06-05T00:00:01.000Z' }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const { resetProjectSyncState, setServerSyncEnabled } =
      await import('../sync/projectSyncState.js');
    const { writeCachedRevision } = await import('../projectRevision.js');
    const { pushProjectDocumentIfLocalNewer } = await import('../projectSync.js');
    resetProjectSyncState();
    setServerSyncEnabled(true);
    await writeCachedRevision('folly', 2);

    const payload = {
      projectName: 'FOLLY',
      cards: [{ id: 'earth', key: 'd3a93f70.jpg', type: 'image' }],
      stagedSyncCards: [],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    const result = await pushProjectDocumentIfLocalNewer('folly', payload);

    expect(result.ok).toBe(true);
    expect(projectPuts).toHaveLength(1);
    expect(projectPuts[0].expectedRevision).toBe(0);
    expect(projectPuts[0].payload.projectName).toBe('FOLLY');
  });

  it('loads the server document over stale local canvas extras when server is current', async () => {
    const projectId = 'tester';
    storage.set(
      `canvas:project:${projectId}`,
      JSON.stringify({
        projectName: 'TESTER',
        cards: [
          { id: 'server-card', key: 'aps-playbook', type: 'html' },
          { id: 'stale-local-excel', key: 'test-excel', type: 'spreadsheet' },
        ],
        stagedSyncCards: [],
        artifactPlacements: {
          'aps-playbook': { surface: 'canvas' },
          'test-excel': { surface: 'canvas' },
        },
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(1));

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/health')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (u.endsWith('/canvas/index')) {
        return { ok: true, status: 200, json: async () => ({ index: null, revision: 0 }) };
      }
      if (u.includes(`/canvas/projects/${projectId}/meta`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ revision: 2, updatedAt: '2026-06-06T00:00:00.000Z' }),
        };
      }
      if (u.includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            revision: 2,
            updatedAt: '2026-06-06T00:00:00.000Z',
            payload: {
              projectName: 'TESTER',
              cards: [{ id: 'server-card', key: 'aps-playbook', type: 'html' }],
              stagedSyncCards: [],
              artifactPlacements: {
                'aps-playbook': { surface: 'canvas' },
              },
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const { resetProjectSyncState } = await import('../sync/projectSyncState.js');
    const { loadSyncedProjectDocument } = await import('../projectSync.js');
    resetProjectSyncState();

    const loaded = await loadSyncedProjectDocument(projectId);
    expect(loaded.cards).toHaveLength(1);
    expect(loaded.cards[0].id).toBe('server-card');
    expect(loaded.cards.some((card) => card.type === 'spreadsheet')).toBe(false);
    const cached = JSON.parse(storage.get(`canvas:project:${projectId}`));
    expect(cached.cards).toHaveLength(1);
  });
});
