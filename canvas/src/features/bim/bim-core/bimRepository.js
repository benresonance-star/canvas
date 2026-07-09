import { normalizeBimWorkspaceState } from './types.js';

const DB_NAME = 'canvas-bim-cache';
const DB_VERSION = 3;
const PREPARED_STORE = 'preparedModels';
const WORKSPACE_STORE = 'workspaceStates';
const VIEW_THUMBNAIL_STORE = 'viewThumbnails';
const MODEL_SOURCE_STORE = 'modelSources';

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
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PREPARED_STORE)) db.createObjectStore(PREPARED_STORE);
      if (!db.objectStoreNames.contains(WORKSPACE_STORE)) db.createObjectStore(WORKSPACE_STORE);
      if (!db.objectStoreNames.contains(VIEW_THUMBNAIL_STORE)) db.createObjectStore(VIEW_THUMBNAIL_STORE);
      if (!db.objectStoreNames.contains(MODEL_SOURCE_STORE)) db.createObjectStore(MODEL_SOURCE_STORE);
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

function txDelete(storeName, key) {
  return getDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(storeName).delete(key);
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
    async deletePreparedModel(fingerprint) {
      const db = await getDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(PREPARED_STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(PREPARED_STORE).delete(fingerprint);
      });
    },
    async getModelSource(key) {
      return txGet(MODEL_SOURCE_STORE, key);
    },
    async putModelSource(key, source) {
      await txPut(MODEL_SOURCE_STORE, key, {
        ...source,
        metadata: {
          ...(source?.metadata ?? {}),
          cachedAt: source?.metadata?.cachedAt ?? new Date().toISOString(),
        },
      });
    },
    async deleteModelSource(key) {
      await txDelete(MODEL_SOURCE_STORE, key);
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
    async getViewThumbnail(key) {
      return txGet(VIEW_THUMBNAIL_STORE, key);
    },
    async putViewThumbnail(key, blob) {
      await txPut(VIEW_THUMBNAIL_STORE, key, blob);
    },
    async deleteViewThumbnail(key) {
      await txDelete(VIEW_THUMBNAIL_STORE, key);
    },
  };
}

export function createMemoryBimRepository(seed = {}) {
  const prepared = new Map(Object.entries(seed.prepared ?? {}));
  const workspace = new Map(Object.entries(seed.workspace ?? {}));
  const viewThumbnails = new Map(Object.entries(seed.viewThumbnails ?? {}));
  const modelSources = new Map(Object.entries(seed.modelSources ?? {}));
  return {
    async getPreparedModel(fingerprint) {
      return prepared.get(fingerprint) ?? null;
    },
    async putPreparedModel(fingerprint, preparedModel) {
      prepared.set(fingerprint, preparedModel);
    },
    async deletePreparedModel(fingerprint) {
      prepared.delete(fingerprint);
    },
    async getModelSource(key) {
      return modelSources.get(key) ?? null;
    },
    async putModelSource(key, source) {
      modelSources.set(key, source);
    },
    async deleteModelSource(key) {
      modelSources.delete(key);
    },
    async getWorkspaceState(fingerprint) {
      const state = workspace.get(fingerprint);
      return state ? normalizeBimWorkspaceState(state) : null;
    },
    async putWorkspaceState(fingerprint, state) {
      workspace.set(fingerprint, normalizeBimWorkspaceState(state));
    },
    async getViewThumbnail(key) {
      return viewThumbnails.get(key) ?? null;
    },
    async putViewThumbnail(key, blob) {
      viewThumbnails.set(key, blob);
    },
    async deleteViewThumbnail(key) {
      viewThumbnails.delete(key);
    },
    _prepared: prepared,
    _workspace: workspace,
    _viewThumbnails: viewThumbnails,
    _modelSources: modelSources,
  };
}
