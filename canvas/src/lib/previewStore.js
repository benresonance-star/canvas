import {
  fetchPreviewBlob,
  uploadPreviewBlob,
  deletePreviewBlobsForProjectRemote,
  projectIdFromCacheKey,
  isPreviewApiAvailable,
} from './canvasPreviewsApi.js';

const DB_NAME = 'canvas-previews';
const DB_VERSION = 1;
const STORE_NAME = 'blobs';

/** @type {Promise<IDBDatabase> | null} */
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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

function getDb() {
  if (!dbPromise) {
    dbPromise = openDb().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** Reset singleton (tests). */
export function resetPreviewDbConnection() {
  dbPromise = null;
}

export function previewCacheKey(projectId, cardKey, version) {
  return `${projectId}:${cardKey}:v${version}`;
}

export async function deletePreviewsForProject(projectId) {
  if (!projectId) return;
  const prefix = `${projectId}:`;
  const db = await getDb();
  const keys = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
  const toDelete = keys.filter((k) => typeof k === 'string' && k.startsWith(prefix));
  await Promise.all(toDelete.map((key) => deletePreview(key)));
  if (await isPreviewApiAvailable()) {
    try {
      await deletePreviewBlobsForProjectRemote(projectId);
    } catch (e) {
      console.error('Server preview delete failed:', e);
    }
  }
}

export async function putPreview(cacheKey, blob) {
  if (!cacheKey || !blob) return;
  const db = await getDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_NAME).put(blob, cacheKey);
  });

  if (await isPreviewApiAvailable()) {
    const projectId = projectIdFromCacheKey(cacheKey);
    if (projectId) {
      uploadPreviewBlob(cacheKey, projectId, blob).catch((e) => {
        console.error('Preview sync failed:', e);
      });
    }
  }
}

export async function getPreview(cacheKey, { localOnly = false } = {}) {
  if (!cacheKey) return null;
  const db = await getDb();
  const local = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(cacheKey);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  if (local) return local;

  if (localOnly) return null;

  if (!(await isPreviewApiAvailable())) return null;

  try {
    const remote = await fetchPreviewBlob(cacheKey);
    if (!remote) return null;
    await putPreviewLocalOnly(cacheKey, remote);
    return remote;
  } catch {
    return null;
  }
}

async function putPreviewLocalOnly(cacheKey, blob) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_NAME).put(blob, cacheKey);
  });
}

export async function deletePreview(cacheKey) {
  if (!cacheKey) return;
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_NAME).delete(cacheKey);
  });
}
