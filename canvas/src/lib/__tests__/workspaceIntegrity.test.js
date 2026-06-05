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

  it('auditWorkspaceIndex recovers orphan bodies into index before purge', async () => {
    const { auditWorkspaceIndex } = await import('../workspaceIntegrity.js');
    storage.set(
      'canvas:project:orphan-1',
      JSON.stringify({
        projectName: 'Orphan',
        cards: [{ id: 'c1' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );
    const { repairedIndex, orphanRecovered, orphanPurged } = await auditWorkspaceIndex({
      version: 1,
      activeProjectId: null,
      projects: [],
    });
    expect(orphanRecovered).toBe(1);
    expect(orphanPurged).toBe(0);
    expect(repairedIndex.projects).toHaveLength(1);
    expect(repairedIndex.projects[0].id).toBe('orphan-1');
    expect(storage.has('canvas:project:orphan-1')).toBe(true);
  });

  it('auditWorkspaceIndex purges orphan cache when body is not parseable', async () => {
    const { auditWorkspaceIndex } = await import('../workspaceIntegrity.js');
    storage.set('canvas:project:orphan-bad', 'not-json');
    const { repairedIndex, orphanPurged } = await auditWorkspaceIndex({
      version: 1,
      activeProjectId: null,
      projects: [],
    });
    expect(orphanPurged).toBe(1);
    expect(repairedIndex.projects).toHaveLength(0);
    expect(storage.has('canvas:project:orphan-bad')).toBe(false);
  });

  it('auditWorkspaceIndex never purges active project id even when missing from index rows', async () => {
    const { auditWorkspaceIndex } = await import('../workspaceIntegrity.js');
    storage.set(
      'canvas:project:active-only',
      JSON.stringify({
        projectName: 'Active',
        cards: [{ id: 'c1', key: 'notes__a' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );
    const { repairedIndex, orphanPurged } = await auditWorkspaceIndex({
      version: 1,
      activeProjectId: 'active-only',
      projects: [],
    });
    expect(orphanPurged).toBe(0);
    expect(repairedIndex.projects.some((p) => p.id === 'active-only')).toBe(true);
    expect(storage.has('canvas:project:active-only')).toBe(true);
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

  it('skipOrphanRecovery does not re-add orphan index rows', async () => {
    const { auditWorkspaceIndex } = await import('../workspaceIntegrity.js');
    const index = {
      version: 1,
      activeProjectId: 'keep',
      projects: [
        {
          id: 'keep',
          name: 'Keep',
          createdAt: 1,
          updatedAt: 1,
          archived: false,
        },
      ],
    };
    const result = await auditWorkspaceIndex(index, {
      skipOrphanRecovery: true,
      recentlyDeletedIds: ['just-deleted'],
    });
    expect(result.orphanRecovered).toBe(0);
    expect(result.repairedIndex.projects).toHaveLength(1);
    expect(result.repairedIndex.projects[0].id).toBe('keep');
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

  it('preserveMergedLocalRowsWithCards skips tombstoned ids', async () => {
    const { preserveMergedLocalRowsWithCards } = await import('../projectSync.js');
    const { recordDeletedProjectId } = await import('../projectDeletionTombstones.js');
    recordDeletedProjectId('tomb-gone');
    const localIndex = {
      projects: [
        { id: 'tomb-gone', name: 'Gone', updatedAt: 100, archived: false },
        { id: 'local-rich', name: 'Rich', updatedAt: 100, archived: false },
      ],
    };
    const merged = {
      version: 1,
      activeProjectId: 'other',
      projects: [{ id: 'other', name: 'Other', updatedAt: 200, archived: false }],
    };
    const out = preserveMergedLocalRowsWithCards(merged, localIndex, [
      'local-rich',
      'tomb-gone',
    ]);
    expect(out.projects.some((p) => p.id === 'local-rich')).toBe(true);
    expect(out.projects.some((p) => p.id === 'tomb-gone')).toBe(false);
  });
});
