const DB_NAME = 'canvas-agent-chat';
const DB_VERSION = 1;
const STORE = 'sessions';

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = openDb().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

export function resetAgentChatDbForTests() {
  dbPromise = null;
}

export async function getAgentChatRaw(key) {
  try {
    const db = await getDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function setAgentChatRaw(key, json) {
  const db = await getDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(json, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function removeAgentChatRaw(key) {
  try {
    const db = await getDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* ignore */
  }
}

export async function migrateAgentChatFromLocalStorage() {
  if (typeof localStorage === 'undefined') return 0;
  let n = 0;
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (
      key?.startsWith('canvas:agent-chat:')
      || key?.startsWith('canvas:agent-chat-threads:')
    ) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    const val = localStorage.getItem(key);
    if (!val) continue;
    const existing = await getAgentChatRaw(key);
    if (existing) {
      localStorage.removeItem(key);
      continue;
    }
    try {
      await setAgentChatRaw(key, val);
      localStorage.removeItem(key);
      n += 1;
    } catch {
      /* keep in ls */
    }
  }
  return n;
}
