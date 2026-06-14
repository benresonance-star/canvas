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
    key: () => null,
    length: 0,
  });
}

describe('projectSync', () => {
  beforeEach(() => {
    storage.clear();
    installStorage();
    vi.resetModules();
  });

  afterEach(async () => {
    try {
      const { resetProjectSyncState } = await import('../projectSync.js');
      resetProjectSyncState();
    } catch {
      /* module may not have been imported in skipped tests */
    }
    vi.unstubAllGlobals();
  });

  it('resetProjectSyncState clears revision, pending saves, and server sync flag', async () => {
    const projectId = 'p-reset';
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      resetProjectSyncState,
      getClientRevision,
      isServerSyncEnabled,
      hasPendingProjectSave,
      saveSyncedProjectDocument,
    } = await import('../projectSync.js');

    await initializeProjectSync();
    expect(isServerSyncEnabled()).toBe(true);

    const payload = {
      projectName: 'P',
      cards: [],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    await saveSyncedProjectDocument(projectId, payload, JSON.stringify(payload));
    expect(hasPendingProjectSave(projectId)).toBe(true);

    resetProjectSyncState();
    expect(isServerSyncEnabled()).toBe(false);
    expect(getClientRevision(projectId)).toBe(0);
    expect(hasPendingProjectSave(projectId)).toBe(false);
  });

  it('quick init merges local and server indices without downloading bodies yet', async () => {
    const serverIndex = {
      version: 1,
      activeProjectId: 'server-a',
      projects: [
        {
          id: 'server-a',
          name: 'Untitled Project',
          createdAt: 1,
          updatedAt: 2,
          archived: false,
        },
      ],
    };
    storage.set('canvas:project-index', JSON.stringify({
      version: 1,
      activeProjectId: 'local-b',
      projects: [{ id: 'local-b', name: "BEN'S HOME PAGE", createdAt: 1, updatedAt: 5, archived: false }],
    }));
    storage.set(
      'canvas:project:local-b',
      JSON.stringify({
        projectName: "BEN'S HOME PAGE",
        cards: [{ id: 'c1' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );

    const projectFetches = [];
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
      if (String(url).includes('/canvas/projects/') && options?.method === 'PUT') {
        putCalls.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).includes('/canvas/projects/')) {
        projectFetches.push(url);
        return {
          ok: true,
          json: async () => ({
            payload: { projectName: 'Untitled Project', cards: [], canvasView: { x: 0, y: 0, zoom: 1 } },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      loadSyncedProjectIndex,
      runProjectSyncBackground,
      resetProjectSyncState,
      consumeProjectSyncRecoveryNotice,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();
    expect(projectFetches).toHaveLength(0);
    const index = await loadSyncedProjectIndex();
    expect(index.projects.map((p) => p.id).sort()).toEqual(['local-b', 'server-a']);
    expect(index.activeProjectId).toBe('local-b');
    await runProjectSyncBackground();
    expect(putCalls.some((b) => b.index?.projects?.length === 2)).toBe(true);
    expect(putCalls.some((b) => b.payload?.cards?.[0]?.id === 'c1')).toBe(true);
    expect(consumeProjectSyncRecoveryNotice()).toBe(1);
  });

  it('mergeProjectRow prefers newer updatedAt for name when names differ', async () => {
    const { mergeProjectRow } = await import('../projectSync.js');
    const merged = mergeProjectRow(
      { id: 'p1', name: 'Old', updatedAt: 50, createdAt: 1, archived: false },
      { id: 'p1', name: 'New', updatedAt: 100, createdAt: 1, archived: false },
    );
    expect(merged.name).toBe('New');
    expect(merged.updatedAt).toBe(100);
  });

  it('mergeProjectIndices applies remote rename when server metadata is newer', async () => {
    const { mergeProjectIndices } = await import('../projectSync.js');
    const { index } = mergeProjectIndices(
      {
        version: 1,
        activeProjectId: 'p1',
        projects: [{
          id: 'p1',
          name: 'Old',
          createdAt: 1,
          updatedAt: 50,
          archived: false,
        }],
      },
      {
        version: 1,
        activeProjectId: 'p1',
        projects: [{
          id: 'p1',
          name: 'New',
          createdAt: 1,
          updatedAt: 100,
          archived: false,
        }],
      },
    );
    expect(index.projects[0].name).toBe('New');
  });

  it('mergeProjectIndices keeps two projects with the same display name', async () => {
    const { mergeProjectIndices } = await import('../projectSync.js');
    const { index } = mergeProjectIndices(
      {
        version: 1,
        activeProjectId: 'a',
        projects: [
          { id: 'a', name: 'Untitled Project', createdAt: 1, updatedAt: 10, archived: false },
          { id: 'b', name: 'Untitled Project', createdAt: 2, updatedAt: 20, archived: false },
        ],
      },
      {
        version: 1,
        activeProjectId: 'a',
        projects: [
          { id: 'a', name: 'Untitled Project', createdAt: 1, updatedAt: 10, archived: false },
        ],
      },
    );
    expect(index.projects).toHaveLength(2);
    expect(index.projects.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('mergeProjectIndices preserves server resetAt during conflict recovery', async () => {
    const resetAt = '2026-06-14T02:28:29.132Z';
    const { mergeProjectIndices } = await import('../projectSync.js');
    const { index } = mergeProjectIndices(
      {
        version: 1,
        activeProjectId: 'fresh',
        resetAt,
        projects: [
          { id: 'fresh', name: 'TEST 1', createdAt: 20, updatedAt: 20, archived: false },
        ],
      },
      {
        version: 1,
        activeProjectId: null,
        resetAt,
        projects: [],
      },
    );

    expect(index.resetAt).toBe(resetAt);
    expect(index.projects.map((p) => p.id)).toEqual(['fresh']);
    expect(index.activeProjectId).toBe('fresh');
  });

  it('mergeProjectIndices unions distinct projects and prefers local active id', async () => {
    const { mergeProjectIndices } = await import('../projectSync.js');
    const { index, merged, localOnlyIds } = mergeProjectIndices(
      {
        version: 1,
        activeProjectId: 'ben',
        projects: [{ id: 'ben', name: "BEN'S HOME PAGE", createdAt: 1, updatedAt: 10, archived: false }],
      },
      {
        version: 1,
        activeProjectId: 'untitled',
        projects: [{ id: 'untitled', name: 'Untitled Project', createdAt: 1, updatedAt: 2, archived: false }],
      },
    );
    expect(merged).toBe(true);
    expect(localOnlyIds).toEqual(['ben']);
    expect(index.projects).toHaveLength(2);
    expect(index.activeProjectId).toBe('ben');
  });

  it('pullAndMergeProjectIndex adds server-only projects to stale local index', async () => {
    storage.set(
      'canvas:project-index',
      JSON.stringify({
        version: 1,
        activeProjectId: 'local-only',
        projects: [
          {
            id: 'local-only',
            name: 'Untitled Project',
            createdAt: 1,
            updatedAt: 100,
            archived: false,
          },
        ],
      }),
    );
    storage.set(
      'canvas:project:local-only',
      JSON.stringify({
        projectName: 'Untitled Project',
        cards: [{ id: 'local-card' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );

    const serverIndex = {
      version: 1,
      activeProjectId: 'local-only',
      projects: [
        {
          id: 'local-only',
          name: 'Untitled Project',
          createdAt: 1,
          updatedAt: 100,
          archived: false,
        },
        {
          id: 'from-server',
          name: "BEN'S HOME PAGE",
          createdAt: 1,
          updatedAt: 50,
          archived: false,
        },
      ],
    };

    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
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
            updatedAt: '2026-06-05T00:00:01.000Z',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      pullAndMergeProjectIndex,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();
    const index = await pullAndMergeProjectIndex();
    expect(index.projects.map((p) => p.id).sort()).toEqual(['from-server', 'local-only']);
    expect(index.projects.find((p) => p.id === 'from-server')?.name).toBe("BEN'S HOME PAGE");
  });

  it('migrates local projects in background when server index is empty', async () => {
    const localIndex = {
      version: 1,
      activeProjectId: 'local-1',
      projects: [
        {
          id: 'local-1',
          name: 'Migrate me',
          createdAt: 1,
          updatedAt: 1,
          archived: false,
        },
      ],
    };
    storage.set('canvas:project-index', JSON.stringify(localIndex));
    storage.set(
      'canvas:project:local-1',
      JSON.stringify({
        projectName: 'Migrate me',
        cards: [{ id: 'c1' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );

    const putCalls = [];
    let projectSaved = false;
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        putCalls.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).includes('/canvas/projects/local-1') && options?.method === 'PUT') {
        putCalls.push(JSON.parse(options.body));
        projectSaved = true;
        return { ok: true, json: async () => ({ revision: 1, updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/meta') && projectSaved) {
        return { ok: true, json: async () => ({ revision: 1, updatedAt: 'now' }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const { initializeProjectSync, runProjectSyncBackground, resetProjectSyncState } =
      await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();
    expect(putCalls).toHaveLength(0);
    await runProjectSyncBackground();
    expect(putCalls.some((b) => b.index?.activeProjectId === 'local-1')).toBe(true);
    expect(putCalls.some((b) => b.payload?.cards?.[0]?.id === 'c1')).toBe(true);
  });

  it('honors explicit empty server index instead of re-migrating stale local projects', async () => {
    storage.set(
      'canvas:project-index',
      JSON.stringify({
        version: 1,
        activeProjectId: 'stale-local',
        projects: [
          {
            id: 'stale-local',
            name: 'Untitled Project',
            createdAt: 1,
            updatedAt: 1,
            archived: false,
          },
        ],
      }),
    );
    storage.set(
      'canvas:project:stale-local',
      JSON.stringify({
        projectName: 'Untitled Project',
        cards: [{ id: 'c1' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );

    const putCalls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      const u = String(url);
      if (u.endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (u.endsWith('/canvas/index') && options?.method === 'PUT') {
        putCalls.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ revision: 6, updatedAt: 'now' }) };
      }
      if (u.endsWith('/canvas/index')) {
        return {
          ok: true,
          json: async () => ({
            index: { version: 1, activeProjectId: null, projects: [] },
            revision: 5,
            updatedAt: '2026-06-14T01:30:00.000Z',
          }),
        };
      }
      if (u.includes('/canvas/projects/')) {
        throw new Error(`Unexpected project request: ${u}`);
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      loadSyncedProjectIndex,
      runProjectSyncBackground,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();

    await initializeProjectSync();
    await runProjectSyncBackground();

    const index = await loadSyncedProjectIndex();
    expect(index.projects).toEqual([]);
    expect(index.activeProjectId).toBe(null);
    expect(storage.has('canvas:project:stale-local')).toBe(false);
    expect(putCalls).toEqual([]);
  });

  it('pullAndMergeProjectIndex clears local menu rows after server resetAt', async () => {
    storage.set(
      'canvas:project-index',
      JSON.stringify({
        version: 1,
        activeProjectId: 'stale-menu',
        projects: [
          {
            id: 'stale-menu',
            name: 'Untitled Project',
            createdAt: 1,
            updatedAt: 1,
            archived: false,
          },
        ],
      }),
    );
    storage.set(
      'canvas:project:stale-menu',
      JSON.stringify({
        projectName: 'Untitled Project',
        cards: [{ id: 'c1' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );

    const putCalls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      const u = String(url);
      if (u.endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (u.endsWith('/canvas/index') && options?.method === 'PUT') {
        putCalls.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ revision: 13, updatedAt: 'now' }) };
      }
      if (u.endsWith('/canvas/index')) {
        return {
          ok: true,
          json: async () => ({
            index: {
              version: 1,
              activeProjectId: null,
              projects: [],
              resetAt: '2026-06-14T02:10:36.360Z',
            },
            revision: 12,
            updatedAt: '2026-06-14T02:10:36.360Z',
          }),
        };
      }
      if (u.includes('/canvas/projects/')) {
        throw new Error(`Unexpected project request: ${u}`);
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      pullAndMergeProjectIndex,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();

    await initializeProjectSync();
    const index = await pullAndMergeProjectIndex({ reconcileScope: 'none' });

    expect(index.projects).toEqual([]);
    expect(index.activeProjectId).toBe(null);
    expect(index.resetAt).toBe('2026-06-14T02:10:36.360Z');
    expect(storage.has('canvas:project:stale-menu')).toBe(false);
    expect(putCalls).toEqual([]);
  });

  it('parseServerUpdatedAt parses ISO strings and rejects invalid', async () => {
    const { parseServerUpdatedAt } = await import('../projectSync.js');
    const ms = parseServerUpdatedAt('2020-06-15T12:00:00.000Z');
    expect(ms).toBe(Date.parse('2020-06-15T12:00:00.000Z'));
    expect(parseServerUpdatedAt(null)).toBe(0);
    expect(parseServerUpdatedAt('not-a-date')).toBe(0);
  });

  it('pullProjectDocumentIfServerNewer replaces local when server updatedAt is newer', async () => {
    const projectId = 'p-sync';
    const serverUpdatedAt = '2025-01-10T12:00:00.000Z';
    storage.set(
      `canvas:project:${projectId}`,
      JSON.stringify({
        projectName: 'Local',
        cards: [{ id: 'local-card' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );

    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 1, updatedAt: serverUpdatedAt }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: {
              projectName: 'Server',
              cards: [{ id: 'server-card' }],
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: serverUpdatedAt,
            revision: 1,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      pullProjectDocumentIfServerNewer,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();

    const { pulled, payload } = await pullProjectDocumentIfServerNewer(projectId, {
      force: true,
    });
    expect(pulled).toBe(true);
    expect(payload?.cards?.[0]?.id).toBe('server-card');
    const cached = JSON.parse(storage.get(`canvas:project:${projectId}`));
    expect(cached.cards[0].id).toBe('server-card');
  });

  it('flushProjectSync force-pushes when server revision is ahead but local was just edited', async () => {
    const projectId = 'p-stale';
    const serverUpdatedAt = '2020-01-01T00:00:00.000Z';
    const newServerAt = '2025-12-01T00:00:00.000Z';
    storage.set(
      `canvas:project:${projectId}`,
      JSON.stringify({
        projectName: 'Stale local file',
        cards: [{ id: 'stale' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(1));

    const putBodies = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 3, updatedAt: serverUpdatedAt }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`) && options?.method === 'PUT') {
        putBodies.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ revision: 4, updatedAt: newServerAt }) };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: {
              projectName: 'From server',
              cards: [{ id: 'fresh' }],
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: serverUpdatedAt,
            revision: 3,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      saveSyncedProjectDocument,
      flushProjectSync,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();

    await saveSyncedProjectDocument(
      projectId,
      { projectName: 'Stale push', cards: [{ id: 'stale-push' }], canvasView: { x: 0, y: 0, zoom: 1 } },
      JSON.stringify({
        projectName: 'Stale push',
        cards: [{ id: 'stale-push' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );
    await flushProjectSync();

    expect(putBodies).toHaveLength(1);
    expect(putBodies[0].expectedRevision).toBe(3);
    expect(putBodies[0].payload.cards[0].id).toBe('stale-push');
  });

  it('flushProjectSync PUTs when local edit is newer than last server revision', async () => {
    const projectId = 'p-push';
    const oldServerAt = '2020-01-01T00:00:00.000Z';
    const newServerAt = '2025-12-01T00:00:00.000Z';

    const putBodies = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 1, updatedAt: oldServerAt }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`) && options?.method === 'PUT') {
        putBodies.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ revision: 2, updatedAt: newServerAt }) };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: {
              projectName: 'Server',
              cards: [],
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: oldServerAt,
            revision: 1,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      pullProjectDocumentIfServerNewer,
      saveSyncedProjectDocument,
      flushProjectSync,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();
    await pullProjectDocumentIfServerNewer(projectId, { force: true });

    await saveSyncedProjectDocument(
      projectId,
      { projectName: 'Edited', cards: [{ id: 'new-local' }], canvasView: { x: 0, y: 0, zoom: 1 } },
      JSON.stringify({
        projectName: 'Edited',
        cards: [{ id: 'new-local' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );
    await flushProjectSync();

    expect(putBodies).toHaveLength(1);
    expect(putBodies[0].payload.cards[0].id).toBe('new-local');
  });

  it('pullProjectDocumentIfServerNewer with force keeps local when local edit is newer', async () => {
    const projectId = 'p-force';
    const serverUpdatedAt = '2025-06-15T00:00:00.000Z';
    let metaRevision = 2;
    storage.set(
      `canvas:project:${projectId}`,
      JSON.stringify({
        projectName: 'Local newer',
        cards: [{ id: 'local-only' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );

    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: metaRevision, updatedAt: serverUpdatedAt }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: {
              projectName: 'Server',
              cards: [{ id: 'from-server' }],
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: serverUpdatedAt,
            revision: metaRevision,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      pullProjectDocumentIfServerNewer,
      persistProjectDocumentLocally,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();
    await pullProjectDocumentIfServerNewer(projectId, { force: true });
    await persistProjectDocumentLocally(
      projectId,
      JSON.stringify({
        projectName: 'Local newer',
        cards: [{ id: 'local-only' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );

    const forced = await pullProjectDocumentIfServerNewer(projectId, { force: true });
    expect(forced.pulled).toBe(true);
    expect(forced.payload?.cards?.[0]?.id).toBe('local-only');
  });

  it('pullProjectDocumentIfServerNewer with force adopts server canvas over stale local dock', async () => {
    const projectId = 'p-force-dock';
    const serverUpdatedAt = '2026-06-15T00:00:00.000Z';
    const localStaged = {
      stagingId: 's1',
      key: 'notes__dock',
      type: 'markdown',
      versions: [],
    };
    storage.set(
      `canvas:project:${projectId}`,
      JSON.stringify({
        projectName: 'Local dock',
        cards: [],
        stagedSyncCards: [localStaged],
        artifactPlacements: {
          notes__dock: { surface: 'dock', placement: { key: 'notes__dock' } },
        },
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
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 1, updatedAt: serverUpdatedAt }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: {
              projectName: 'Server',
              cards: [{ id: 'c1', key: 'notes__dock', type: 'markdown', versions: [] }],
              stagedSyncCards: [],
              artifactPlacements: {
                notes__dock: {
                  surface: 'canvas',
                  placement: { key: 'notes__dock' },
                },
              },
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: serverUpdatedAt,
            revision: 1,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      pullProjectDocumentIfServerNewer,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();

    const { pulled, payload } = await pullProjectDocumentIfServerNewer(projectId, {
      force: true,
    });
    expect(pulled).toBe(true);
    expect(payload?.cards ?? []).toHaveLength(1);
    expect(payload?.cards?.[0]?.key).toBe('notes__dock');
    expect(payload?.stagedSyncCards ?? []).toHaveLength(0);
    expect(payload?.artifactPlacements?.notes__dock?.surface).toBe('canvas');
  });

  it('pushProjectDocumentIfLocalNewer PUTs when local has cards and server is empty', async () => {
    const projectId = 'p-new-local';
    const serverUpdatedAt = '2025-06-01T00:00:00.000Z';
    storage.set(
      `canvas:project:${projectId}`,
      JSON.stringify({
        projectName: 'New',
        cards: [{ id: 'local-card', key: 'k1', versions: [{ version: 1 }] }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(0));

    const putBodies = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 1, updatedAt: serverUpdatedAt }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`) && options?.method === 'PUT') {
        putBodies.push(JSON.parse(options.body));
        return {
          ok: true,
          json: async () => ({
            revision: 2,
            updatedAt: '2025-06-02T00:00:00.000Z',
          }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: {
              projectName: 'New',
              cards: [],
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: serverUpdatedAt,
            revision: 1,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      pushProjectDocumentIfLocalNewer,
      resetProjectSyncState,
      getClientRevision,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();

    const payload = {
      projectName: 'New',
      cards: [{ id: 'local-card', key: 'k1', versions: [{ version: 1 }] }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    const result = await pushProjectDocumentIfLocalNewer(projectId, payload);
    expect(result.ok).toBe(true);
    expect(putBodies.length).toBeGreaterThan(0);
    expect(putBodies[0].expectedRevision).toBe(1);
    expect(putBodies[0].payload.cards).toHaveLength(1);
    expect(getClientRevision(projectId)).toBe(2);
  });

  it('pushProjectDocumentIfLocalNewer skips full document GET when revision is in sync', async () => {
    const projectId = 'p-push-fast';
    const serverUpdatedAt = '2025-06-01T12:00:00.000Z';
    storage.set(
      `canvas:project:${projectId}`,
      JSON.stringify({
        projectName: 'Synced',
        cards: [{ id: 'c1', key: 'k1', versions: [{ version: 1 }] }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(2));

    const fetchCalls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      fetchCalls.push({ url: String(url), method: options?.method });
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 2, updatedAt: serverUpdatedAt }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`) && options?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({
            revision: 3,
            updatedAt: '2025-06-02T00:00:00.000Z',
          }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        throw new Error('full GET should not run');
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      pushProjectDocumentIfLocalNewer,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();

    const payload = {
      projectName: 'Synced',
      cards: [{ id: 'c1', key: 'k1', versions: [{ version: 1 }] }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    const result = await pushProjectDocumentIfLocalNewer(projectId, payload);
    expect(result.ok).toBe(true);
    const fullDocGets = fetchCalls.filter(
      (c) =>
        c.url.includes(`/canvas/projects/${projectId}`)
        && !c.url.endsWith('/meta')
        && c.method !== 'PUT',
    );
    expect(fullDocGets).toHaveLength(0);
  });

  it('reconcileProjectDocumentOnSwitch keeps local when server document is empty', async () => {
    const projectId = 'p-switch-back';
    const serverUpdatedAt = '2025-06-01T00:00:00.000Z';
    const localPayload = {
      projectName: 'New',
      cards: [{ id: 'on-canvas', key: 'k1', versions: [{ version: 1 }] }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    storage.set(`canvas:project:${projectId}`, JSON.stringify(localPayload));
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(0));
    storage.set(
      `canvas:project-local-edit-at:${projectId}`,
      JSON.stringify(Date.parse('2025-06-02T00:00:00.000Z')),
    );

    const putBodies = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 1, updatedAt: serverUpdatedAt }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`) && options?.method === 'PUT') {
        putBodies.push(JSON.parse(options.body));
        return {
          ok: true,
          json: async () => ({
            revision: 2,
            updatedAt: '2025-06-02T00:00:00.000Z',
          }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: {
              projectName: 'New',
              cards: [],
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: serverUpdatedAt,
            revision: 1,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      reconcileProjectDocumentOnSwitch,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();

    const result = await reconcileProjectDocumentOnSwitch(projectId);
    expect(result.pulled).toBe(false);
    expect(result.keptLocal).toBe(true);
    expect(result.payload?.cards?.[0]?.id).toBe('on-canvas');
    const cached = JSON.parse(storage.get(`canvas:project:${projectId}`));
    expect(cached.cards[0].id).toBe('on-canvas');
    expect(putBodies.length).toBeGreaterThan(0);
  });

  it('reconcileProjectDocumentOnSwitch keeps staged-only local artifacts when server document is empty', async () => {
    const projectId = 'p-switch-dock-back';
    const serverUpdatedAt = '2025-06-01T00:00:00.000Z';
    const localPayload = {
      projectName: 'Docked',
      cards: [],
      stagedSyncCards: [
        { stagingId: 's1', key: 'notes__dock', type: 'markdown', versions: [{ version: 1 }] },
      ],
      artifactPlacements: {
        'notes__dock': { surface: 'dock' },
      },
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    storage.set(`canvas:project:${projectId}`, JSON.stringify(localPayload));
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(0));
    storage.set(
      `canvas:project-local-edit-at:${projectId}`,
      JSON.stringify(Date.parse('2025-06-02T00:00:00.000Z')),
    );

    const putBodies = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      const u = String(url);
      if (u.endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (u.endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (u.endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (u.endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 1, updatedAt: serverUpdatedAt }),
        };
      }
      if (u.includes(`/canvas/projects/${projectId}`) && options?.method === 'PUT') {
        putBodies.push(JSON.parse(options.body));
        return {
          ok: true,
          json: async () => ({
            revision: 2,
            updatedAt: '2025-06-02T00:00:00.000Z',
          }),
        };
      }
      if (u.includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: {
              projectName: 'Docked',
              cards: [],
              stagedSyncCards: [],
              artifactPlacements: {},
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: serverUpdatedAt,
            revision: 1,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      reconcileProjectDocumentOnSwitch,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();

    const result = await reconcileProjectDocumentOnSwitch(projectId);
    expect(result.pulled).toBe(false);
    expect(result.keptLocal).toBe(true);
    expect(result.payload?.stagedSyncCards?.[0]?.key).toBe('notes__dock');
    const cached = JSON.parse(storage.get(`canvas:project:${projectId}`));
    expect(cached.stagedSyncCards[0].key).toBe('notes__dock');
    expect(putBodies[0].payload.stagedSyncCards[0].key).toBe('notes__dock');
  });

  it('reconcileProjectDocumentOnSwitch seeds revision when keeping local so poll stays live', async () => {
    const projectId = 'p-switch-rev-seed';
    const serverUpdatedAt = '2025-06-01T00:00:00.000Z';
    const localPayload = {
      projectName: 'New',
      cards: [{ id: 'on-canvas', key: 'k1', versions: [{ version: 1 }] }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    storage.set(`canvas:project:${projectId}`, JSON.stringify(localPayload));
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(0));

    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 3, updatedAt: serverUpdatedAt }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`) && options?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({
            revision: 4,
            updatedAt: '2025-06-02T00:00:00.000Z',
          }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: {
              projectName: 'New',
              cards: [],
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: serverUpdatedAt,
            revision: 3,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      reconcileProjectDocumentOnSwitch,
      reconcileSyncLock,
      getClientRevision,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();

    const result = await reconcileProjectDocumentOnSwitch(projectId);
    expect(result.keptLocal).toBe(true);
    expect(getClientRevision(projectId)).toBeGreaterThan(0);

    const { lock } = await reconcileSyncLock(projectId);
    expect(lock).toBe('live');
  });

  it('reconcileProjectDocumentOnSwitch pulls when server is legitimately newer', async () => {
    const projectId = 'p-server-wins';
    const serverUpdatedAt = '2025-12-01T00:00:00.000Z';
    storage.set(
      `canvas:project:${projectId}`,
      JSON.stringify({
        projectName: 'Local',
        cards: [{ id: 'old-local' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(1));

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 5, updatedAt: serverUpdatedAt }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: {
              projectName: 'Server',
              cards: [{ id: 'from-server' }, { id: 'extra' }],
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: serverUpdatedAt,
            revision: 5,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      reconcileProjectDocumentOnSwitch,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();

    const result = await reconcileProjectDocumentOnSwitch(projectId);
    expect(result.pulled).toBe(true);
    expect(result.payload?.cards?.[0]?.id).toBe('from-server');
    const cached = JSON.parse(storage.get(`canvas:project:${projectId}`));
    expect(cached.cards[0].id).toBe('from-server');
  });

  it('reconcileProjectDocumentOnSwitch pulls populated server when local body is empty at same revision', async () => {
    const projectId = 'p-empty-local-current-rev';
    const serverUpdatedAt = '2025-12-01T00:00:00.000Z';
    storage.set(
      `canvas:project:${projectId}`,
      JSON.stringify({
        projectName: 'Local Empty',
        cards: [],
        stagedSyncCards: [],
        artifactPlacements: {},
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(9));
    storage.set(
      `canvas:project-local-edit-at:${projectId}`,
      JSON.stringify(Date.parse('2025-12-02T00:00:00.000Z')),
    );

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 9, updatedAt: serverUpdatedAt }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: {
              projectName: 'Server',
              cards: [{ id: 'from-server', key: 'aps-playbook' }],
              stagedSyncCards: [{ stagingId: 's1', key: 'operations-playbook' }],
              artifactPlacements: {
                'aps-playbook': { surface: 'canvas' },
                'operations-playbook': { surface: 'dock' },
              },
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: serverUpdatedAt,
            revision: 9,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      reconcileProjectDocumentOnSwitch,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();

    const result = await reconcileProjectDocumentOnSwitch(projectId);
    expect(result.pulled).toBe(true);
    expect(result.payload?.cards?.[0]?.id).toBe('from-server');
    expect(result.payload?.stagedSyncCards?.[0]?.key).toBe('operations-playbook');
    const cached = JSON.parse(storage.get(`canvas:project:${projectId}`));
    expect(cached.cards[0].id).toBe('from-server');
    expect(cached.stagedSyncCards[0].key).toBe('operations-playbook');
  });

  it('reconcileProjectDocumentOnSwitch refuses server when card count undercuts last good local', async () => {
    const projectId = 'p-stale-server-partial';
    const serverUpdatedAt = '2025-12-01T00:00:00.000Z';
    storage.set(
      `canvas:project:${projectId}`,
      JSON.stringify({
        projectName: 'Local',
        cards: [],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(1));

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 5, updatedAt: serverUpdatedAt }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: {
              projectName: 'Server',
              cards: [{ id: 'only-one' }],
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: serverUpdatedAt,
            revision: 5,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      reconcileProjectDocumentOnSwitch,
      recordGoodLocalCardCount,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();
    recordGoodLocalCardCount(projectId, 5);

    const result = await reconcileProjectDocumentOnSwitch(projectId);
    expect(result.pulled).toBe(false);
    expect(result.rejectedStaleServer).toBe(true);
    expect(result.keptLocal).toBe(true);
    const cached = JSON.parse(storage.get(`canvas:project:${projectId}`));
    expect(cached.cards).toEqual([]);
  });

  it('conflict response does not overwrite richer local canvas with empty server payload', async () => {
    const projectId = 'p-conflict-rich';
    const localPayload = {
      projectName: 'Work',
      cards: [{ id: 'c1', key: 'k1', versions: [{ version: 1 }] }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    storage.set(`canvas:project:${projectId}`, JSON.stringify(localPayload));
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(1));

    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`) && options?.method === 'PUT') {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            conflict: true,
            revision: 5,
            updatedAt: '2025-06-02T00:00:00.000Z',
            payload: {
              projectName: 'Work',
              cards: [],
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
          }),
        };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 5, updatedAt: '2025-06-02T00:00:00.000Z' }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      pushProjectDocumentIfLocalNewer,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();

    const result = await pushProjectDocumentIfLocalNewer(projectId, localPayload);
    expect(result.conflict).toBe(true);
    expect(result.keptLocal).toBe(true);

    const cached = JSON.parse(storage.get(`canvas:project:${projectId}`));
    expect(cached.cards).toHaveLength(1);
    expect(cached.cards[0].id).toBe('c1');
  });

  it('flushProjectSync pushes project bodies before workspace index', async () => {
    const projectId = 'p-flush-order';
    const callOrder = [];
    storage.set(
      'canvas:project-index',
      JSON.stringify({
        version: 1,
        activeProjectId: projectId,
        projects: [{ id: projectId, name: 'P', createdAt: 1, updatedAt: 1, archived: false }],
      }),
    );
    storage.set(
      `canvas:project:${projectId}`,
      JSON.stringify({
        projectName: 'P',
        cards: [{ id: 'c1', key: 'k1', versions: [{ version: 1 }] }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(1));

    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        callOrder.push('index');
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`) && options?.method === 'PUT') {
        callOrder.push('project');
        return {
          ok: true,
          json: async () => ({
            revision: 2,
            updatedAt: '2025-06-02T00:00:00.000Z',
          }),
        };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 1, updatedAt: '2025-06-01T00:00:00.000Z' }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      saveSyncedProjectDocument,
      saveSyncedProjectIndex,
      flushProjectSync,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();

    const payload = {
      projectName: 'P',
      cards: [{ id: 'c1', key: 'k1', versions: [{ version: 1 }] }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    await saveSyncedProjectIndex(JSON.parse(storage.get('canvas:project-index')));
    await saveSyncedProjectDocument(
      projectId,
      payload,
      JSON.stringify(payload),
    );
    await flushProjectSync();

    expect(callOrder.indexOf('project')).toBeGreaterThanOrEqual(0);
    expect(callOrder.indexOf('index')).toBeGreaterThan(callOrder.indexOf('project'));

    const index = JSON.parse(storage.get('canvas:project-index'));
    const row = index.projects.find((p) => p.id === projectId);
    expect(row.documentRevision).toBe(2);
  });

  it('flushOutgoingProjectDocument cancels stale debounced payload and pushes new layout', async () => {
    const projectId = 'p-switch-flush';
    const serverUpdatedAt = '2025-06-01T00:00:00.000Z';
    const putBodies = [];

    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 1, updatedAt: serverUpdatedAt }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`) && options?.method === 'PUT') {
        putBodies.push(JSON.parse(options.body));
        return {
          ok: true,
          json: async () => ({
            revision: 2,
            updatedAt: '2025-06-02T00:00:00.000Z',
          }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: {
              projectName: 'P',
              cards: [{ id: 'c1', key: 'k1', x: 0, y: 0, versions: [{ version: 1 }] }],
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: serverUpdatedAt,
            revision: 1,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      saveSyncedProjectDocument,
      flushOutgoingProjectDocument,
      flushProjectSync,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    const { projectStorageKey } = await import('../constants.js');

    resetProjectSyncState();
    await initializeProjectSync();

    const stalePayload = {
      projectName: 'P',
      cards: [{ id: 'c1', key: 'k1', x: 0, y: 0, versions: [{ version: 1 }] }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    const freshPayload = {
      ...stalePayload,
      cards: [{ ...stalePayload.cards[0], x: 480, y: 220 }],
    };

    await saveSyncedProjectDocument(
      projectId,
      stalePayload,
      JSON.stringify(stalePayload),
    );
    await flushOutgoingProjectDocument(projectId, freshPayload);
    await flushProjectSync();

    const projectPuts = putBodies.filter((b) => Array.isArray(b?.payload?.cards));
    if (projectPuts.length > 0) {
      const lastPut = projectPuts[projectPuts.length - 1];
      expect(lastPut.payload.cards[0].x).toBe(480);
      expect(lastPut.payload.cards[0].y).toBe(220);
    }

    const cached = JSON.parse(storage.get(projectStorageKey(projectId)));
    expect(cached.cards[0].x).toBe(480);
    expect(cached.cards[0].y).toBe(220);

    await flushProjectSync();
    const afterFlush = JSON.parse(storage.get(projectStorageKey(projectId)));
    expect(afterFlush.cards[0].x).toBe(480);
    expect(afterFlush.cards[0].y).toBe(220);
  });

  it('flushOutgoingProjectDocument pulls a non-empty server instead of boot-pushing empty cache', async () => {
    const projectId = 'p-empty-boot-guard';
    const serverPayload = {
      projectName: 'Server',
      cards: [{ id: 'server-card', key: 'artifact.pdf', versions: [{ version: 1 }] }],
      stagedSyncCards: [],
      canvasView: { x: 1, y: 2, zoom: 1 },
    };
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(7));

    const putBodies = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({
            revision: 8,
            updatedAt: '2025-06-05T00:00:00.000Z',
          }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`) && options?.method === 'PUT') {
        putBodies.push(JSON.parse(options.body));
        return {
          ok: true,
          json: async () => ({
            revision: 9,
            updatedAt: '2025-06-05T00:01:00.000Z',
          }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: serverPayload,
            updatedAt: '2025-06-05T00:00:00.000Z',
            revision: 8,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      flushOutgoingProjectDocument,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();

    const result = await flushOutgoingProjectDocument(
      projectId,
      {
        projectName: 'Server',
        cards: [],
        stagedSyncCards: [],
        canvasView: { x: 0, y: 0, zoom: 1 },
      },
      { reason: 'boot-push' },
    );

    expect(result.ok).toBe(true);
    expect(result.pulled).toBe(true);
    expect(result.reason).toBe('server_has_cards');
    expect(putBodies).toHaveLength(0);
    const cached = JSON.parse(storage.get(`canvas:project:${projectId}`));
    expect(cached.cards[0].id).toBe('server-card');
  });

  it('flushOutgoingProjectDocument pulls server canvas instead of pushing dock-only cache', async () => {
    const projectId = 'p-dock-only-boot-guard';
    const serverPayload = {
      projectName: 'Server',
      cards: [{ id: 'server-card', key: 'artifact.pdf', versions: [{ version: 1 }] }],
      stagedSyncCards: [{ stagingId: 'dock-1', key: 'notes.md' }],
      canvasView: { x: 1, y: 2, zoom: 1 },
    };
    const localPayload = {
      projectName: 'Server',
      cards: [],
      stagedSyncCards: [
        { stagingId: 'dock-1', key: 'artifact.pdf' },
        { stagingId: 'dock-2', key: 'notes.md' },
      ],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(7));

    const writes = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({
            revision: 8,
            updatedAt: '2025-06-05T00:00:00.000Z',
          }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`) && options?.method) {
        writes.push({ method: options.method, body: JSON.parse(options.body) });
        return {
          ok: true,
          json: async () => ({
            revision: 9,
            updatedAt: '2025-06-05T00:01:00.000Z',
          }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: serverPayload,
            updatedAt: '2025-06-05T00:00:00.000Z',
            revision: 8,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      flushOutgoingProjectDocument,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    resetProjectSyncState();
    await initializeProjectSync();

    const result = await flushOutgoingProjectDocument(
      projectId,
      localPayload,
      { reason: 'boot-push' },
    );

    expect(result.ok).toBe(true);
    expect(result.pulled).toBe(true);
    expect(result.reason).toBe('server_has_canvas_cards');
    expect(writes).toHaveLength(0);
    const cached = JSON.parse(storage.get(`canvas:project:${projectId}`));
    expect(cached.cards[0].id).toBe('server-card');
    expect(cached.stagedSyncCards).toHaveLength(1);
  });

  it('reconcileProjectDocumentOnSwitch keeps local layout when card count matches but positions differ', async () => {
    const projectId = 'p-layout-local';
    const serverUpdatedAt = '2025-01-01T00:00:00.000Z';
    const localPayload = {
      projectName: 'P',
      cards: [{ id: 'c1', key: 'k1', x: 500, y: 300, versions: [{ version: 1 }] }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    storage.set(`canvas:project:${projectId}`, JSON.stringify(localPayload));
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(1));

    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index') && options?.method === 'PUT') {
        return { ok: true, json: async () => ({ updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 5, updatedAt: serverUpdatedAt }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`) && options?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({
            revision: 6,
            updatedAt: '2025-06-02T00:00:00.000Z',
          }),
        };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: {
              projectName: 'P',
              cards: [{ id: 'c1', key: 'k1', x: 0, y: 0, versions: [{ version: 1 }] }],
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: serverUpdatedAt,
            revision: 5,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      reconcileProjectDocumentOnSwitch,
      persistProjectDocumentLocally,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    const { projectStorageKey } = await import('../constants.js');

    resetProjectSyncState();
    await initializeProjectSync();
    await persistProjectDocumentLocally(projectId, JSON.stringify(localPayload));

    const result = await reconcileProjectDocumentOnSwitch(projectId);
    expect(result.pulled).toBe(false);
    expect(result.keptLocal).toBe(true);
    const cached = JSON.parse(storage.get(projectStorageKey(projectId)));
    expect(cached.cards[0].x).toBe(500);
    expect(cached.cards[0].y).toBe(300);
  });

  it('round-trip switch preserves card positions in local cache', async () => {
    const projectA = 'proj-a';
    const projectB = 'proj-b';
    const serverUpdatedAt = '2025-06-01T00:00:00.000Z';

    storage.set(
      `canvas:project:${projectA}`,
      JSON.stringify({
        projectName: 'A',
        cards: [{ id: 'c1', key: 'k1', x: 100, y: 100, versions: [{ version: 1 }] }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );
    storage.set(
      `canvas:project:${projectB}`,
      JSON.stringify({
        projectName: 'B',
        cards: [],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
    );

    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: null }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: 1, updatedAt: serverUpdatedAt }),
        };
      }
      if (String(url).includes('/canvas/projects/') && options?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({
            revision: 2,
            updatedAt: '2025-06-02T00:00:00.000Z',
          }),
        };
      }
      if (String(url).includes('/canvas/projects/')) {
        const id = String(url).split('/').pop();
        const raw = storage.get(`canvas:project:${id}`);
        const payload = raw ? JSON.parse(raw) : { projectName: id, cards: [], canvasView: { x: 0, y: 0, zoom: 1 } };
        return {
          ok: true,
          json: async () => ({
            payload,
            updatedAt: serverUpdatedAt,
            revision: 1,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      initializeProjectSync,
      persistProjectDocumentLocally,
      flushOutgoingProjectDocument,
      reconcileProjectDocumentOnSwitch,
      resetProjectSyncState,
    } = await import('../projectSync.js');
    const { buildProjectSavePayload } = await import('../persistence.js');
    const { projectStorageKey } = await import('../constants.js');

    resetProjectSyncState();
    await initializeProjectSync();

    const movedState = {
      projectName: 'A',
      cards: [{ id: 'c1', key: 'k1', x: 480, y: 220, versions: [{ version: 1 }] }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    const payload = buildProjectSavePayload(movedState, []);
    const serialised = JSON.stringify(payload);
    await persistProjectDocumentLocally(projectA, serialised);
    await flushOutgoingProjectDocument(projectA, payload);

    const back = await reconcileProjectDocumentOnSwitch(projectA);
    expect(back.pulled).toBe(false);
    const cached = JSON.parse(storage.get(projectStorageKey(projectA)));
    expect(cached.cards[0].x).toBe(480);
    expect(cached.cards[0].y).toBe(220);
  });
});
