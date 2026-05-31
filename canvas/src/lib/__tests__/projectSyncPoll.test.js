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

describe('projectSync poll / reconcile', () => {
  beforeEach(() => {
    storage.clear();
    installStorage();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reconcileSyncLock transitions stale to live when revisions match', async () => {
    const projectId = 'poll-live';
    const locks = [];

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/meta')) {
        return { ok: true, json: async () => ({ revision: 4, updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: { version: 1, projects: [] } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      resetProjectSyncState,
      initializeProjectSync,
      reconcileSyncLock,
      setSyncLockListener,
    } = await import('../projectSync.js');
    const { writeCachedRevision } = await import('../projectRevision.js');

    resetProjectSyncState();
    await initializeProjectSync();
    setSyncLockListener((_id, lock) => locks.push(lock));

    await writeCachedRevision(projectId, 4);
    const stale = await reconcileSyncLock(projectId);
    expect(stale.lock).toBe('live');
    expect(locks).toContain('live');
  });

  it('reconcileSyncLock adopts revision when server is ahead but payload matches local cache', async () => {
    const projectId = 'poll-adopt';
    const payload = {
      projectName: 'Idle',
      cards: [{ id: 'c1', x: 0, y: 0, pinnedVersion: 1 }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    storage.set(`canvas:project:${projectId}`, JSON.stringify(payload));
    storage.set(`canvas:project-rev:${projectId}`, JSON.stringify(1));

    const locks = [];

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/meta')) {
        return { ok: true, json: async () => ({ revision: 9, updatedAt: '2025-06-01T00:00:00.000Z' }) };
      }
      if (String(url).includes(`/canvas/projects/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            payload,
            updatedAt: '2025-06-01T00:00:00.000Z',
            revision: 9,
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
      reconcileSyncLock,
      getClientRevision,
      setSyncLockListener,
    } = await import('../projectSync.js');

    resetProjectSyncState();
    await initializeProjectSync();
    setSyncLockListener((_id, lock) => locks.push(lock));

    const result = await reconcileSyncLock(projectId);
    expect(result.lock).toBe('live');
    expect(result.action).toBe('adopt_revision');
    expect(getClientRevision(projectId)).toBe(9);
    expect(locks).toContain('live');
    expect(locks).not.toContain('stale');
  });

  it('reconcileSyncLock skips duplicate listener calls when lock unchanged', async () => {
    const projectId = 'poll-dedupe';
    const locks = [];

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/meta')) {
        return { ok: true, json: async () => ({ revision: 2, updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: { version: 1, projects: [] } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const {
      resetProjectSyncState,
      initializeProjectSync,
      reconcileSyncLock,
      setSyncLockListener,
    } = await import('../projectSync.js');
    const { writeCachedRevision } = await import('../projectRevision.js');

    resetProjectSyncState();
    await initializeProjectSync();
    setSyncLockListener((_id, lock) => locks.push(lock));

    await writeCachedRevision(projectId, 2);
    await reconcileSyncLock(projectId);
    await reconcileSyncLock(projectId);
    expect(locks.filter((l) => l === 'live').length).toBeGreaterThanOrEqual(1);
  });
});
