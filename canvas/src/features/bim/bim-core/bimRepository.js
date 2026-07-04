import { normalizeBimWorkspaceState } from './types.js';

const DB_NAME = 'canvas-bim-cache';
const DB_VERSION = 1;
const PREPARED_STORE = 'preparedModels';
const WORKSPACE_STORE = 'workspaceStates';

let dbPromise = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PREPARED_STORE)) db.createObjectStore(PREPARED_STORE);
      if (!db.objectStoreNames.contains(WORKSPACE_STORE)) db.createObjectStore(WORKSPACE_STORE);
    };
  });
}

function getDb() {
  if (!dbPromise) {
    dbPromise = openDb().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

function txPut(storeName, key, value) {
  return getDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(storeName).put(value, key);
  }));
}

function txGet(storeName, key) {
  return getDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  }));
}

export function resetBimRepositoryConnection() {
  dbPromise = null;
}

export function createIndexedDbBimRepository() {
  return {
    async getPreparedModel(fingerprint) {
      return txGet(PREPARED_STORE, fingerprint);
    },
    async putPreparedModel(fingerprint, preparedModel) {
      await txPut(PREPARED_STORE, fingerprint, {
        ...preparedModel,
        metadata: {
          ...(preparedModel.metadata ?? {}),
          cachedAt: preparedModel.metadata?.cachedAt ?? new Date().toISOString(),
        },
      });
    },
    async getWorkspaceState(fingerprint) {
      const state = await txGet(WORKSPACE_STORE, fingerprint);
      return state ? normalizeBimWorkspaceState(state) : null;
    },
    async putWorkspaceState(fingerprint, state) {
      await txPut(WORKSPACE_STORE, fingerprint, normalizeBimWorkspaceState({
        ...state,
        updatedAt: new Date().toISOString(),
      }));
    },
  };
}

export function createMemoryBimRepository(seed = {}) {
  const prepared = new Map(Object.entries(seed.prepared ?? {}));
  const workspace = new Map(Object.entries(seed.workspace ?? {}));
  return {
    async getPreparedModel(fingerprint) {
      return prepared.get(fingerprint) ?? null;
    },
    async putPreparedModel(fingerprint, preparedModel) {
      prepared.set(fingerprint, preparedModel);
    },
    async getWorkspaceState(fingerprint) {
      const state = workspace.get(fingerprint);
      return state ? normalizeBimWorkspaceState(state) : null;
    },
    async putWorkspaceState(fingerprint, state) {
      workspace.set(fingerprint, normalizeBimWorkspaceState(state));
    },
    _prepared: prepared,
    _workspace: workspace,
  };
}
