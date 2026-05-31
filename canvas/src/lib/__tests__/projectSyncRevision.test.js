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

describe('projectSync revision', () => {
  beforeEach(() => {
    storage.clear();
    installStorage();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('save with matching revision updates client revision', async () => {
    const projectId = 'rev-test';
    let serverRevision = 0;

    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: serverRevision, updatedAt: 'now' }),
        };
      }
      if (String(url).includes('/canvas/projects/') && options?.method === 'PUT') {
        const body = JSON.parse(options.body);
        if (body.expectedRevision !== serverRevision) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: 'conflict',
              revision: serverRevision,
              payload: { cards: [] },
            }),
          };
        }
        serverRevision += 1;
        return {
          ok: true,
          json: async () => ({ revision: serverRevision, updatedAt: 'now' }),
        };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: { version: 1, projects: [] } }) };
      }
      if (String(url).includes('/canvas/projects/')) {
        return {
          ok: true,
          json: async () => ({
            payload: { cards: [], canvasView: { x: 0, y: 0, zoom: 1 } },
            revision: serverRevision,
            updatedAt: 'now',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      resetProjectSyncState,
      initializeProjectSync,
      saveSyncedProjectDocument,
      flushProjectSync,
      getClientRevision,
      checkServerRevisionAhead,
      setSyncLockListener,
    } = await import('../projectSync.js');

    const locks = [];

    resetProjectSyncState();
    await initializeProjectSync();
    setSyncLockListener((_id, lock) => locks.push(lock));

    const doc = {
      projectName: 'Test',
      cards: [{ id: 'c1', key: 'k', type: 'note', versions: [] }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    await saveSyncedProjectDocument(projectId, doc, JSON.stringify(doc));
    await flushProjectSync();
    expect(getClientRevision(projectId)).toBe(1);
    expect(locks).toContain('live');

    serverRevision = 2;
    const ahead = await checkServerRevisionAhead(projectId);
    expect(ahead?.ahead).toBe(true);
  });

  it('adoptSyncLockForProject returns live when revisions match', async () => {
    const projectId = 'lock-live';
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/meta')) {
        return { ok: true, json: async () => ({ revision: 3, updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: { version: 1, projects: [] } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      resetProjectSyncState,
      initializeProjectSync,
      adoptSyncLockForProject,
      getClientRevision,
    } = await import('../projectSync.js');

    resetProjectSyncState();
    await initializeProjectSync();
    const { writeCachedRevision } = await import('../projectRevision.js');
    await writeCachedRevision(projectId, 3);

    const result = await adoptSyncLockForProject(projectId);
    expect(result.lock).toBe('live');
    expect(result.serverRevision).toBe(3);
    expect(getClientRevision(projectId)).toBe(3);
  });

  it('adoptSyncLockForProject adopts revision when server is ahead with no local payload', async () => {
    const projectId = 'lock-stale';
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/meta')) {
        return { ok: true, json: async () => ({ revision: 5, updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: { version: 1, projects: [] } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const { resetProjectSyncState, initializeProjectSync, adoptSyncLockForProject } =
      await import('../projectSync.js');

    resetProjectSyncState();
    await initializeProjectSync();

    const result = await adoptSyncLockForProject(projectId);
    expect(result.lock).toBe('live');
    expect(result.serverRevision).toBe(5);
  });

  it('reconcileSyncLock goes live after 409 when client revision catches up', async () => {
    const projectId = 'reconcile-409';
    let metaRevision = 0;
    const locks = [];

    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/meta')) {
        return {
          ok: true,
          json: async () => ({ revision: metaRevision, updatedAt: 'now' }),
        };
      }
      if (String(url).includes('/canvas/projects/') && options?.method === 'PUT') {
        metaRevision = 1;
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error: 'conflict',
            revision: 1,
            payload: { cards: [], canvasView: { x: 0, y: 0, zoom: 1 } },
            updatedAt: 'now',
          }),
        };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: { version: 1, projects: [] } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      resetProjectSyncState,
      initializeProjectSync,
      saveSyncedProjectDocument,
      flushProjectSync,
      setSyncLockListener,
      getClientRevision,
    } = await import('../projectSync.js');

    resetProjectSyncState();
    await initializeProjectSync();
    setSyncLockListener((_id, lock) => locks.push(lock));

    const doc = {
      projectName: 'Conflict',
      cards: [],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    await saveSyncedProjectDocument(projectId, doc, JSON.stringify(doc));
    await flushProjectSync();

    expect(getClientRevision(projectId)).toBe(1);
    expect(locks.some((l) => l === 'live' || l === 'stale')).toBe(true);
  });

  it('reconcileSyncLock adopts revision when meta is ahead and payloads are empty', async () => {
    const projectId = 'reconcile-still-ahead';
    const locks = [];

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/meta')) {
        return { ok: true, json: async () => ({ revision: 10, updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: { version: 1, projects: [] } }) };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload: {
              projectName: 'Empty',
              cards: [],
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: 'now',
            revision: 10,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      resetProjectSyncState,
      initializeProjectSync,
      reconcileSyncLock,
      getClientRevision,
      setSyncLockListener,
    } = await import('../projectSync.js');

    resetProjectSyncState();
    await initializeProjectSync();
    setSyncLockListener((_id, lock) => locks.push(lock));

    const result = await reconcileSyncLock(projectId);
    expect(result.lock).toBe('live');
    expect(['adopt_revision', 'pulled']).toContain(result.action);
    expect(getClientRevision(projectId)).toBe(10);
    expect(locks).toContain('live');
    expect(locks).not.toContain('stale');
  });

  it('persistProjectDocumentLocally writes cache without server PUT', async () => {
    const projectId = 'local-only';
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: { version: 1, projects: [] } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      resetProjectSyncState,
      initializeProjectSync,
      persistProjectDocumentLocally,
    } = await import('../projectSync.js');
    const { projectStorageKey } = await import('../constants.js');

    resetProjectSyncState();
    await initializeProjectSync();

    const doc = JSON.stringify({
      projectName: 'Cached',
      cards: [{ id: 'c1' }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    });
    await persistProjectDocumentLocally(projectId, doc);
    expect(storage.get(projectStorageKey(projectId))).toBe(doc);
  });
});
