import { PROJECT_INDEX_KEY, projectStorageKey } from './constants.js';
import { projectRevisionStorageKey } from './projectRevision.js';

const DB_NAME = 'canvas-projects';
const DB_VERSION = 1;
const STORE_DOCUMENTS = 'documents';
const STORE_META = 'meta';

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

const BROADCAST_CHANNEL = 'canvas-project-sync';

/** In-memory fallback when IndexedDB is unavailable (tests, private mode). */
const memoryDocuments = new Map();
const memoryMeta = new Map();

export function isProjectDocumentIdbAvailable() {
  return typeof indexedDB !== 'undefined';
}

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
      if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
        db.createObjectStore(STORE_DOCUMENTS);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
  });
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = openDb().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export function resetProjectDocumentDbForTests() {
  dbPromise = null;
  memoryDocuments.clear();
  memoryMeta.clear();
}

function idbGet(storeName, key) {
  return getDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbPut(storeName, key, value) {
  return getDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbDelete(storeName, key) {
  return getDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbListKeys(storeName) {
  return getDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAllKeys();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => reject(req.error);
      }),
  );
}

/**
 * @param {string} projectId
 * @param {string} serialised
 */
export async function putProjectDocumentSerialised(projectId, serialised) {
  if (!isProjectDocumentIdbAvailable()) {
    memoryDocuments.set(projectId, serialised);
    notifyProjectCacheChanged(projectId);
    return;
  }
  try {
    await idbPut(STORE_DOCUMENTS, projectId, serialised);
  } catch {
    memoryDocuments.set(projectId, serialised);
  }
  notifyProjectCacheChanged(projectId);
}

/**
 * @param {string} projectId
 * @returns {Promise<string | null>}
 */
export async function getProjectDocumentSerialised(projectId) {
  if (!isProjectDocumentIdbAvailable()) {
    return memoryDocuments.get(projectId) ?? null;
  }
  try {
    const value = await idbGet(STORE_DOCUMENTS, projectId);
    return value ?? memoryDocuments.get(projectId) ?? null;
  } catch {
    return memoryDocuments.get(projectId) ?? null;
  }
}

export async function deleteProjectDocumentSerialised(projectId) {
  try {
    await idbDelete(STORE_DOCUMENTS, projectId);
    await idbDelete(STORE_META, projectRevisionStorageKey(projectId));
  } catch {
    /* ignore */
  }
}

export async function putWorkspaceIndexSerialised(serialised) {
  if (!isProjectDocumentIdbAvailable()) {
    memoryMeta.set(PROJECT_INDEX_KEY, serialised);
    return;
  }
  try {
    await idbPut(STORE_META, PROJECT_INDEX_KEY, serialised);
  } catch {
    memoryMeta.set(PROJECT_INDEX_KEY, serialised);
  }
}

export async function getWorkspaceIndexSerialised() {
  if (!isProjectDocumentIdbAvailable()) {
    return memoryMeta.get(PROJECT_INDEX_KEY) ?? null;
  }
  try {
    const value = await idbGet(STORE_META, PROJECT_INDEX_KEY);
    return value ?? memoryMeta.get(PROJECT_INDEX_KEY) ?? null;
  } catch {
    return memoryMeta.get(PROJECT_INDEX_KEY) ?? null;
  }
}

export async function listCachedProjectIds() {
  try {
    const keys = await idbListKeys(STORE_DOCUMENTS);
    return keys.filter((k) => typeof k === 'string');
  } catch {
    return [];
  }
}

/**
 * One-time: copy localStorage project blobs into IDB.
 */
export async function migrateLocalStorageProjectsToIdb() {
  if (!isProjectDocumentIdbAvailable()) return { migrated: 0 };
  if (typeof localStorage === 'undefined') return { migrated: 0 };
  let migrated = 0;
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith('canvas:project:')) keys.push(key);
  }
  for (const key of keys) {
    const id = key.slice('canvas:project:'.length);
    const existing = await getProjectDocumentSerialised(id);
    if (existing) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      continue;
    }
    const val = localStorage.getItem(key);
    if (!val) continue;
    try {
      await putProjectDocumentSerialised(id, val);
      localStorage.removeItem(key);
      migrated += 1;
    } catch (e) {
      console.warn(`IDB migrate failed for ${id}:`, e);
    }
  }
  const indexRaw = localStorage.getItem(PROJECT_INDEX_KEY);
  if (indexRaw && !(await getWorkspaceIndexSerialised())) {
    try {
      await putWorkspaceIndexSerialised(indexRaw);
    } catch {
      /* ignore */
    }
  }
  return { migrated };
}

/**
 * @param {string} projectId
 */
export function notifyProjectCacheChanged(projectId) {
  try {
    const ch = new BroadcastChannel(BROADCAST_CHANNEL);
    ch.postMessage({ type: 'project-updated', projectId, at: Date.now() });
    ch.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
  try {
    localStorage.setItem(`canvas:cache-tick:${projectId}`, String(Date.now()));
    localStorage.removeItem(`canvas:cache-tick:${projectId}`);
  } catch {
    /* quota */
  }
}

/**
 * @param {(projectId: string) => void} handler
 * @returns {() => void}
 */
export function subscribeProjectCacheChanges(handler) {
  /** @type {BroadcastChannel | null} */
  let channel = null;
  try {
    channel = new BroadcastChannel(BROADCAST_CHANNEL);
    channel.onmessage = (ev) => {
      const id = ev.data?.projectId;
      if (id) handler(id);
    };
  } catch {
    /* ignore */
  }

  const onStorage = (e) => {
    if (!e.key?.startsWith('canvas:cache-tick:')) return;
    const id = e.key.slice('canvas:cache-tick:'.length);
    if (id) handler(id);
  };
  window.addEventListener('storage', onStorage);

  return () => {
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}

export { projectStorageKey };
