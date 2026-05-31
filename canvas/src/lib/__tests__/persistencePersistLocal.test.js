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

describe('saveProjectById persistLocal', () => {
  beforeEach(() => {
    storage.clear();
    installStorage();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes local cache when persistLocal is true even if server PUT is skipped', async () => {
    const projectId = 'persist-switch';

    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/meta')) {
        return { ok: true, json: async () => ({ revision: 2, updatedAt: 'now' }) };
      }
      if (String(url).includes('/canvas/projects/') && options?.method === 'PUT') {
        return { ok: false, status: 409, json: async () => ({ error: 'conflict', revision: 2 }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: { version: 1, projects: [] } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const { saveProjectById } = await import('../persistence.js');
    const { resetProjectSyncState, initializeProjectSync, flushProjectSync } =
      await import('../projectSync.js');
    const { projectStorageKey } = await import('../constants.js');

    resetProjectSyncState();
    await initializeProjectSync();

    const state = {
      projectName: 'Switch away',
      cards: [{ id: 'edited', key: 'k', type: 'note', versions: [] }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    await saveProjectById(projectId, state, [], { persistLocal: true });
    await flushProjectSync();

    const cached = storage.get(projectStorageKey(projectId));
    expect(cached).toBeTruthy();
    const parsed = JSON.parse(cached);
    expect(parsed.cards[0].id).toBe('edited');
    expect(parsed.projectName).toBe('Switch away');
  });

  it('writes local cache on every save even without persistLocal flag', async () => {
    const projectId = 'persist-every-save';

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (String(url).endsWith('/meta')) {
        return { ok: true, json: async () => ({ revision: 0, updatedAt: 'now' }) };
      }
      if (String(url).endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: { version: 1, projects: [] } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const { saveProjectById } = await import('../persistence.js');
    const { resetProjectSyncState, initializeProjectSync } = await import('../projectSync.js');
    const { projectStorageKey } = await import('../constants.js');

    resetProjectSyncState();
    await initializeProjectSync();

    const state = {
      projectName: 'Moved',
      cards: [{ id: 'c1', key: 'k', x: 420, y: 180, type: 'note', versions: [] }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    await saveProjectById(projectId, state, []);

    const cached = storage.get(projectStorageKey(projectId));
    expect(cached).toBeTruthy();
    const parsed = JSON.parse(cached);
    expect(parsed.cards[0].x).toBe(420);
    expect(parsed.cards[0].y).toBe(180);
  });

  it('pushes to server when pushRemote is true even if local cache write fails', async () => {
    const projectId = 'push-remote-quota';
    const putCalls = [];

    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      const u = String(url);
      if (u.endsWith('/health')) {
        return { ok: true, json: async () => ({ ok: true, dbReady: true }) };
      }
      if (u.endsWith('/canvas/index')) {
        return { ok: true, json: async () => ({ index: { version: 1, projects: [] } }) };
      }
      if (u.includes('/canvas/projects/') && options?.method === 'PUT') {
        putCalls.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ updatedAt: 'now', revision: 1 }) };
      }
      if (u.includes('/meta')) {
        return { ok: true, json: async () => ({ revision: 0, updatedAt: 'now' }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const projectSync = await import('../projectSync.js');
    projectSync.resetProjectSyncState();
    await projectSync.initializeProjectSync();
    vi.spyOn(projectSync, 'persistProjectDocumentLocally').mockResolvedValue(false);

    const { saveProjectById } = await import('../persistence.js');

    const state = {
      projectName: 'Server only',
      cards: [{ id: 'c1', key: 'k', type: 'note', versions: [] }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    const result = await saveProjectById(projectId, state, [], { pushRemote: true });

    expect(result.localCacheWritten).toBe(false);
    expect(result.pushOk).toBe(true);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].payload.projectName).toBe('Server only');
  });
});
