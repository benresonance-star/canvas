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

describe('ensureProjectIndex', () => {
  beforeEach(async () => {
    storage.clear();
    installStorage();
    vi.resetModules();
    const { resetProjectDocumentDbForTests } = await import('../projectDocumentStore.js');
    resetProjectDocumentDbForTests();
    const { resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers server index over creating Untitled when local is empty', async () => {
    const serverIndex = {
      version: 1,
      activeProjectId: 'ben-home',
      projects: [
        {
          id: 'ben-home',
          name: "BEN'S HOME PAGE",
          createdAt: 1,
          updatedAt: 2,
          archived: false,
        },
      ],
    };

    const putCalls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        putCalls.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: serverIndex }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const { ensureProjectIndex } = await import('../projects.js');
    const { resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();
    const index = await ensureProjectIndex();

    expect(index.activeProjectId).toBe('ben-home');
    expect(index.projects[0].name).toBe("BEN'S HOME PAGE");
    const createdUntitled = putCalls.some(
      (b) => b.index?.projects?.length === 1 && b.index.projects[0].name === 'Untitled Project',
    );
    expect(createdUntitled).toBe(false);
  });

  it('keeps this browser active project when server index points at another project', async () => {
    const serverIndex = {
      version: 1,
      activeProjectId: 'treefrog',
      projects: [
        {
          id: 'earthrise',
          name: 'EARTHRISE',
          createdAt: 1,
          updatedAt: 2,
          archived: false,
        },
        {
          id: 'treefrog',
          name: 'TREEFROG',
          createdAt: 3,
          updatedAt: 4,
          archived: false,
        },
      ],
    };
    storage.set('canvas:active-project-id', 'earthrise');

    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ revision: 2, updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return {
          ok: true,
          json: async () => ({
            index: serverIndex,
            revision: 1,
            updatedAt: '2026-06-05T00:00:00.000Z',
          }),
        };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({
            revision: 1,
            updatedAt: '2026-06-05T00:00:00.000Z',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const { ensureProjectIndex, loadProjectIndex } = await import('../projects.js');
    const index = await ensureProjectIndex();
    const reloaded = await loadProjectIndex();

    expect(index.activeProjectId).toBe('earthrise');
    expect(reloaded.activeProjectId).toBe('earthrise');
  });

  it('leaves workspace empty when local and server have no projects', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      return { ok: true, json: async () => ({ updatedAt: 'now' }) };
    }));

    const { ensureProjectIndex } = await import('../projects.js');
    const { resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();
    const index = await ensureProjectIndex();

    expect(index.projects).toHaveLength(0);
    expect(index.activeProjectId).toBeNull();
  });

  it('recovers non-deleted orphan canvas:project keys into the index', async () => {
    const untitledId = 'untitled-only';
    const benId = 'ben-orphan';
    storage.set(
      'canvas:project-index',
      JSON.stringify({
        version: 1,
        activeProjectId: untitledId,
        projects: [
          {
            id: untitledId,
            name: 'Untitled Project',
            createdAt: 1,
            updatedAt: 1,
            archived: false,
          },
        ],
      }),
    );
    storage.set(
      `canvas:project:${benId}`,
      JSON.stringify({
        projectName: "BEN'S HOME PAGE",
        cards: [],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      return { ok: true, json: async () => ({ updatedAt: 'now' }) };
    }));

    const { ensureProjectIndex } = await import('../projects.js');
    const { resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();
    const index = await ensureProjectIndex();

    expect(index.projects).toHaveLength(2);
    expect(index.projects.map((p) => p.id)).toEqual([untitledId, benId]);
    expect(index.projects.find((p) => p.id === benId)?.name).toBe("BEN'S HOME PAGE");
    expect(storage.has(`canvas:project:${benId}`)).toBe(true);
  });
});

describe('resolveBootActiveProjectId', () => {
  beforeEach(async () => {
    storage.clear();
    installStorage();
    vi.resetModules();
    const { resetProjectDocumentDbForTests } = await import('../projectDocumentStore.js');
    resetProjectDocumentDbForTests();
    const { resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps persisted active when it has local canvas', async () => {
    const index = {
      version: 1,
      activeProjectId: 'frog',
      projects: [
        { id: 'frog', name: 'FROG', createdAt: 1, updatedAt: 100, archived: false },
        { id: 'tree', name: 'TREE', createdAt: 1, updatedAt: 50, archived: false },
      ],
    };
    const frogPayload = {
      projectName: 'FROG',
      cards: [{ id: 'c1', type: 'note', x: 0, y: 0 }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    storage.set('canvas:project:frog', JSON.stringify(frogPayload));

    const { resolveBootActiveProjectId } = await import('../projects.js');
    await expect(resolveBootActiveProjectId(index)).resolves.toBe('frog');
  });

  it('opens richer local project when persisted active has no local body', async () => {
    const index = {
      version: 1,
      activeProjectId: 'empty',
      projects: [
        { id: 'empty', name: 'Untitled Project', createdAt: 1, updatedAt: 200, archived: false },
        { id: 'frog', name: 'FROG', createdAt: 1, updatedAt: 100, archived: false },
      ],
    };
    const frogPayload = {
      projectName: 'FROG',
      cards: [{ id: 'c1', type: 'note', x: 0, y: 0 }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    storage.set('canvas:project:frog', JSON.stringify(frogPayload));

    const { resolveBootActiveProjectId } = await import('../projects.js');
    await expect(resolveBootActiveProjectId(index)).resolves.toBe('frog');
  });
});

describe('archiveProject', () => {
  beforeEach(async () => {
    storage.clear();
    installStorage();
    vi.resetModules();
    const { resetProjectDocumentDbForTests } = await import('../projectDocumentStore.js');
    resetProjectDocumentDbForTests();
    const { resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not auto-create when archiving the only active project', async () => {
    const onlyId = 'only-project';
    storage.set(
      'canvas:project-index',
      JSON.stringify({
        version: 1,
        activeProjectId: onlyId,
        projects: [
          {
            id: onlyId,
            name: 'Solo',
            createdAt: 1,
            updatedAt: 1,
            archived: false,
          },
        ],
      }),
    );

    const { archiveProject } = await import('../projects.js');
    const result = await archiveProject(onlyId);

    expect(result.needsCreate).toBe(true);
    expect(result.needsSwitch).toBe(false);
    expect(result.index.projects).toHaveLength(1);
    expect(result.index.projects[0].archived).toBe(true);
  });
});

describe('createProject', () => {
  beforeEach(async () => {
    storage.clear();
    installStorage();
    vi.resetModules();
    const { resetProjectDocumentDbForTests } = await import('../projectDocumentStore.js');
    resetProjectDocumentDbForTests();
    const { resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('assigns a disambiguated name when Untitled Project already exists', async () => {
    const firstId = 'first-untitled';
    storage.set(
      'canvas:project-index',
      JSON.stringify({
        version: 1,
        activeProjectId: firstId,
        projects: [
          {
            id: firstId,
            name: 'Untitled Project',
            createdAt: 1,
            updatedAt: 1,
            archived: false,
          },
        ],
      }),
    );
    storage.set(
      `canvas:project:${firstId}`,
      JSON.stringify({
        projectName: 'Untitled Project',
        cards: [{ id: 'card-a' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      return { ok: true, json: async () => ({ updatedAt: 'now' }) };
    }));

    const { createProject, loadProjectIndex } = await import('../projects.js');
    const { resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();

    const { index, projectId } = await createProject();
    expect(index.projects).toHaveLength(2);
    const newRow = index.projects.find((p) => p.id === projectId);
    expect(newRow.name).toBe('Untitled Project (2)');

    const reloaded = await loadProjectIndex();
    expect(reloaded.projects).toHaveLength(2);
    expect(storage.get(`canvas:project:${firstId}`)).toContain('card-a');
  });

  it('pushes new project document to server when sync is enabled', async () => {
    const firstId = 'existing-project';
    storage.set(
      'canvas:project-index',
      JSON.stringify({
        version: 1,
        activeProjectId: firstId,
        projects: [
          {
            id: firstId,
            name: 'Existing',
            createdAt: 1,
            updatedAt: 1,
            archived: false,
          },
        ],
      }),
    );
    storage.set(
      `canvas:project:${firstId}`,
      JSON.stringify({
        projectName: 'Existing',
        cards: [],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );

    const putCalls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      const u = String(url);
      if (u.endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (u.endsWith('/canvas/index')) {
        if (options?.method === 'PUT') {
          return { ok: true, json: async () => ({ updatedAt: 'now' }) };
        }
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (u.includes('/canvas/projects/') && options?.method === 'PUT') {
        putCalls.push({ url: u, body: JSON.parse(options.body) });
        return { ok: true, json: async () => ({ updatedAt: 'now', revision: 1 }) };
      }
      if (u.includes('/meta')) {
        return { ok: true, json: async () => ({ revision: 1, updatedAt: 'now' }) };
      }
      return { ok: true, json: async () => ({}) };
    }));

    const { createProject } = await import('../projects.js');
    const { resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();

    const { projectId } = await createProject('Brand New');
    const putForNew = putCalls.find((c) => c.url.includes(projectId));
    expect(putForNew).toBeTruthy();
    expect(putForNew.body.payload.projectName).toBe('Brand New');
    expect(putForNew.body.payload.cards).toEqual([]);
  });

  it('serializes concurrent createProject and only adds one row', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (u.endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (u.includes('/canvas/projects/')) {
        return { ok: true, json: async () => ({ updatedAt: 'now', revision: 1 }) };
      }
      if (u.includes('/meta')) {
        return { ok: true, json: async () => ({ revision: 1, updatedAt: 'now' }) };
      }
      return { ok: true, json: async () => ({}) };
    }));

    const { createProject, loadProjectIndex } = await import('../projects.js');
    const { resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();

    const [first, second] = await Promise.all([
      createProject('Race Test'),
      createProject('Race Test'),
    ]);
    expect(first.projectId).toBe(second.projectId);
    const reloaded = await loadProjectIndex();
    expect(reloaded.projects).toHaveLength(1);
    expect(reloaded.projects[0].name).toBe('Race Test');
  });
});

describe('setProjectDisplayName', () => {
  beforeEach(async () => {
    storage.clear();
    installStorage();
    vi.resetModules();
    const { resetProjectDocumentDbForTests } = await import('../projectDocumentStore.js');
    resetProjectDocumentDbForTests();
    const { resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pushes rename to workspace index only (not project document)', async () => {
    const projectId = 'rename-me';
    storage.set(
      'canvas:project-index',
      JSON.stringify({
        version: 1,
        activeProjectId: projectId,
        projects: [
          {
            id: projectId,
            name: 'Old Name',
            createdAt: 1,
            updatedAt: 1,
            archived: false,
          },
        ],
      }),
    );

    const indexPuts = [];
    const projectPuts = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      const u = String(url);
      if (u.endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (u.endsWith('/canvas/index') && options?.method === 'PUT') {
        indexPuts.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ updatedAt: 'now', revision: 2 }) };
      }
      if (u.endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (u.includes('/canvas/projects/') && options?.method === 'PUT') {
        projectPuts.push({ url: u, body: JSON.parse(options.body) });
        return { ok: true, json: async () => ({ updatedAt: 'now', revision: 2 }) };
      }
      if (u.includes('/meta')) {
        return { ok: true, json: async () => ({ revision: 1, updatedAt: 'now' }) };
      }
      return { ok: true, json: async () => ({}) };
    }));

    const { setProjectDisplayName } = await import('../projects.js');
    const { resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();

    await setProjectDisplayName(projectId, 'New Name');
    expect(projectPuts.length).toBe(0);
    expect(indexPuts.length).toBeGreaterThan(0);
    const row = indexPuts.at(-1).index.projects.find((p) => p.id === projectId);
    expect(row.name).toBe('New Name');
    const stored = JSON.parse(storage.get('canvas:project-index'));
    expect(stored.projects[0].name).toBe('New Name');
  });

  it('does not coerce empty rename to Untitled Project', async () => {
    const projectId = 'keep-name';
    storage.set(
      'canvas:project-index',
      JSON.stringify({
        version: 1,
        activeProjectId: projectId,
        projects: [
          {
            id: projectId,
            name: 'FROG',
            createdAt: 1,
            updatedAt: 1,
            archived: false,
          },
        ],
      }),
    );

    const { setProjectDisplayName } = await import('../projects.js');
    await setProjectDisplayName(projectId, '   ');
    const stored = JSON.parse(storage.get('canvas:project-index'));
    expect(stored.projects[0].name).toBe('FROG');
  });
});

describe('deleteProject', () => {
  beforeEach(async () => {
    storage.clear();
    installStorage();
    vi.resetModules();
    const { resetProjectDocumentDbForTests } = await import('../projectDocumentStore.js');
    resetProjectDocumentDbForTests();
    const { resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allows deleting the last project and clears activeProjectId', async () => {
    const onlyId = 'only-one';
    storage.set(
      'canvas:project-index',
      JSON.stringify({
        version: 1,
        activeProjectId: onlyId,
        projects: [
          {
            id: onlyId,
            name: 'Solo',
            createdAt: 1,
            updatedAt: 1,
            archived: false,
          },
        ],
      }),
    );

    const { deleteProject, loadProjectIndex } = await import('../projects.js');
    const result = await deleteProject(onlyId);
    expect(result.ok).toBe(true);
    expect(result.switchToId).toBe(null);
    const stored = await loadProjectIndex();
    expect(stored.projects).toHaveLength(0);
    expect(stored.activeProjectId).toBe(null);
  });

  it('does not resurrect deleted project from orphan localStorage key', async () => {
    const keepId = 'keep-proj';
    const dropId = 'drop-proj';
    storage.set(
      'canvas:project-index',
      JSON.stringify({
        version: 1,
        activeProjectId: keepId,
        projects: [
          {
            id: keepId,
            name: 'Keep',
            createdAt: 1,
            updatedAt: 1,
            archived: false,
          },
          {
            id: dropId,
            name: 'Untitled Project',
            createdAt: 2,
            updatedAt: 2,
            archived: false,
          },
        ],
      }),
    );
    storage.set(
      `canvas:project:${dropId}`,
      JSON.stringify({
        projectName: 'Untitled Project',
        cards: [{ id: 'c1' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );

    const { deleteProject, loadProjectIndex } = await import('../projects.js');
    const result = await deleteProject(dropId);
    expect(result.ok).toBe(true);
    const stored = await loadProjectIndex();
    expect(stored.projects.map((p) => p.id)).toEqual([keepId]);
    expect(storage.has(`canvas:project:${dropId}`)).toBe(false);
  });

  it('pushes index removal before deleting the remote project body', async () => {
    const keepId = 'keep-remote';
    const dropId = 'drop-remote';
    storage.set(
      'canvas:project-index',
      JSON.stringify({
        version: 1,
        activeProjectId: dropId,
        projects: [
          {
            id: keepId,
            name: 'Keep',
            createdAt: 1,
            updatedAt: 1,
            archived: false,
          },
          {
            id: dropId,
            name: 'Drop',
            createdAt: 2,
            updatedAt: 2,
            archived: false,
          },
        ],
      }),
    );
    storage.set(
      `canvas:project:${keepId}`,
      JSON.stringify({
        projectName: 'Keep',
        cards: [],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );
    storage.set(
      `canvas:project:${dropId}`,
      JSON.stringify({
        projectName: 'Drop',
        cards: [{ id: 'delete-me' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );

    const order = [];
    const indexBodies = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      const u = String(url);
      if (u.endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (u.endsWith('/canvas/index') && options?.method === 'PUT') {
        order.push('index-put');
        indexBodies.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ updatedAt: 'now', revision: 2 }) };
      }
      if (u.endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null, revision: 0 }) };
      }
      if (u.includes(`/canvas/projects/${keepId}/meta`)) {
        return { ok: true, json: async () => ({ revision: 1, updatedAt: 'now' }) };
      }
      if (u.includes(`/canvas/projects/${dropId}`) && options?.method === 'DELETE') {
        order.push('doc-delete');
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, json: async () => ({}) };
    }));

    const { deleteProject } = await import('../projects.js');
    const { resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();

    await deleteProject(dropId);
    expect(order).toEqual(['index-put', 'doc-delete']);
    expect(indexBodies[0].deletedProjectIds).toEqual([dropId]);
  });
});

describe('uniqueProjectNameForIndex', () => {
  it('returns suffix when name is taken', async () => {
    const { uniqueProjectNameForIndex } = await import('../projects.js');
    const index = {
      projects: [{ id: 'a', name: 'Untitled Project' }],
    };
    expect(uniqueProjectNameForIndex(index, 'Untitled Project')).toBe(
      'Untitled Project (2)',
    );
  });
});
