import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map();

function installLocalStorage() {
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

function asyncRequest(work, shouldFail = false) {
  const req = {};
  queueMicrotask(() => {
    try {
      if (shouldFail) throw new Error('idb failure');
      req.result = work();
      req.onsuccess?.();
    } catch (e) {
      req.error = e;
      req.onerror?.();
    }
  });
  return req;
}

function createFakeIndexedDB({ failPut = false } = {}) {
  const stores = {};
  const indexedDB = {
    open() {
      const req = {};
      queueMicrotask(() => {
        const db = {
          objectStoreNames: {
            contains: (name) => Boolean(stores[name]),
          },
          createObjectStore(name) {
            stores[name] = new Map();
          },
          transaction(storeName) {
            return {
              objectStore() {
                return {
                  get(key) {
                    return asyncRequest(() => stores[storeName]?.get(key));
                  },
                  put(value, key) {
                    return asyncRequest(() => {
                      stores[storeName].set(key, value);
                    }, failPut);
                  },
                  delete(key) {
                    return asyncRequest(() => {
                      stores[storeName]?.delete(key);
                    });
                  },
                  getAllKeys() {
                    return asyncRequest(() => [...(stores[storeName]?.keys() ?? [])]);
                  },
                };
              },
            };
          },
          close() {},
        };
        req.result = db;
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
  return { indexedDB, stores };
}

describe('projectDocumentStore', () => {
  beforeEach(() => {
    storage.clear();
    installLocalStorage();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists documents, workspace index, and key listing through IndexedDB', async () => {
    const { indexedDB } = createFakeIndexedDB();
    vi.stubGlobal('indexedDB', indexedDB);
    const {
      deleteProjectDocumentSerialised,
      getProjectDocumentSerialised,
      getWorkspaceIndexSerialised,
      listCachedProjectIds,
      putProjectDocumentSerialised,
      putWorkspaceIndexSerialised,
      resetProjectDocumentDbForTests,
    } = await import('../projectDocumentStore.js');
    resetProjectDocumentDbForTests();

    await putProjectDocumentSerialised('p1', '{"cards":[]}');
    await putWorkspaceIndexSerialised('{"projects":[{"id":"p1"}]}');

    expect(await getProjectDocumentSerialised('p1')).toBe('{"cards":[]}');
    expect(await getWorkspaceIndexSerialised()).toBe('{"projects":[{"id":"p1"}]}');
    expect(await listCachedProjectIds()).toEqual(['p1']);

    await deleteProjectDocumentSerialised('p1');

    expect(await getProjectDocumentSerialised('p1')).toBeNull();
    expect(await listCachedProjectIds()).toEqual([]);
  });

  it('migrates legacy localStorage project bodies into IndexedDB and removes them locally', async () => {
    const { indexedDB } = createFakeIndexedDB();
    vi.stubGlobal('indexedDB', indexedDB);
    storage.set('canvas:project:migrate-me', '{"projectName":"Migrated"}');
    storage.set('canvas:project-index', '{"version":1,"projects":[]}');

    const {
      getProjectDocumentSerialised,
      getWorkspaceIndexSerialised,
      migrateLocalStorageProjectsToIdb,
      resetProjectDocumentDbForTests,
    } = await import('../projectDocumentStore.js');
    resetProjectDocumentDbForTests();

    const result = await migrateLocalStorageProjectsToIdb();

    expect(result.migrated).toBe(1);
    expect(await getProjectDocumentSerialised('migrate-me')).toBe('{"projectName":"Migrated"}');
    expect(await getWorkspaceIndexSerialised()).toBe('{"version":1,"projects":[]}');
    expect(storage.has('canvas:project:migrate-me')).toBe(false);
  });

  it('falls back to memory when IndexedDB writes fail', async () => {
    const { indexedDB } = createFakeIndexedDB({ failPut: true });
    vi.stubGlobal('indexedDB', indexedDB);
    const {
      getProjectDocumentSerialised,
      getWorkspaceIndexSerialised,
      putProjectDocumentSerialised,
      putWorkspaceIndexSerialised,
      resetProjectDocumentDbForTests,
    } = await import('../projectDocumentStore.js');
    resetProjectDocumentDbForTests();

    await putProjectDocumentSerialised('p-fallback', '{"cards":[{"id":"c1"}]}');
    await putWorkspaceIndexSerialised('{"version":1,"projects":[]}');

    expect(await getProjectDocumentSerialised('p-fallback')).toBe('{"cards":[{"id":"c1"}]}');
    expect(await getWorkspaceIndexSerialised()).toBe('{"version":1,"projects":[]}');
  });
});
