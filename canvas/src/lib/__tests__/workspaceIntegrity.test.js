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

describe('workspaceIntegrity', () => {
  beforeEach(async () => {
    storage.clear();
    installStorage();
    vi.resetModules();
    const { resetProjectDocumentDbForTests } = await import('../projectDocumentStore.js');
    resetProjectDocumentDbForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('listOrphanProjectIds finds bodies not in index', async () => {
    const { listOrphanProjectIds } = await import('../workspaceIntegrity.js');
    storage.set('canvas:project:orphan-1', '{}');
    const ids = listOrphanProjectIds({
      projects: [{ id: 'indexed', name: 'A' }],
    });
    expect(ids).toEqual(['orphan-1']);
  });

  it('auditWorkspaceIndex purges orphan project bodies not in index', async () => {
    const { auditWorkspaceIndex } = await import('../workspaceIntegrity.js');
    storage.set(
      'canvas:project:orphan-1',
      JSON.stringify({
        projectName: 'Orphan',
        cards: [{ id: 'c1' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );
    const { repairedIndex, orphanPurged } = await auditWorkspaceIndex({
      version: 1,
      activeProjectId: null,
      projects: [],
    });
    expect(orphanPurged).toBe(1);
    expect(repairedIndex.projects).toHaveLength(0);
    expect(storage.has('canvas:project:orphan-1')).toBe(false);
  });

  it('auditWorkspaceIndex marks ghost rows missing without deleting storage', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/meta')) {
        return { status: 404, json: async () => ({}) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const { auditWorkspaceIndex } = await import('../workspaceIntegrity.js');
    const { repairedIndex, ghostsMarked } = await auditWorkspaceIndex(
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
      { checkServerGhosts: true, serverSyncEnabled: true },
    );
    expect(ghostsMarked).toBe(1);
    expect(repairedIndex.projects[0].syncState).toBe('missing');
    expect(storage.has('canvas:project:ghost')).toBe(false);
  });

  it('preserveMergedLocalRowsWithCards re-adds dropped local rows', async () => {
    const { preserveMergedLocalRowsWithCards } = await import('../projectSync.js');
    const localIndex = {
      projects: [
        { id: 'local-rich', name: 'Rich', updatedAt: 100, archived: false },
      ],
    };
    const merged = {
      version: 1,
      activeProjectId: 'other',
      projects: [{ id: 'other', name: 'Other', updatedAt: 200, archived: false }],
    };
    const out = preserveMergedLocalRowsWithCards(merged, localIndex, ['local-rich']);
    expect(out.projects).toHaveLength(2);
    expect(out.projects.some((p) => p.id === 'local-rich')).toBe(true);
  });
});
