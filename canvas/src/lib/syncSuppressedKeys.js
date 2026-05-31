const STORAGE_PREFIX = 'canvas:suppressed-sync-keys:';

/**
 * @param {object | null | undefined} document
 * @returns {Set<string>}
 */
export function readSuppressedSyncKeysFromDocument(document) {
  const keys = document?.suppressedSyncKeys;
  if (!Array.isArray(keys)) return new Set();
  return new Set(keys.filter((k) => typeof k === 'string' && k));
}

/**
 * Keys the user removed from the canvas; folder sync must not re-stage them.
 * @param {string} projectId
 * @param {object | null | undefined} [document]
 * @returns {Set<string>}
 */
export function readSuppressedSyncKeys(projectId, document = null) {
  const merged = readSuppressedSyncKeysFromDocument(document);
  if (!projectId) return merged;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
    if (!raw) return merged;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const k of parsed) {
        if (typeof k === 'string' && k) merged.add(k);
      }
    }
  } catch {
    /* ignore */
  }
  return merged;
}

/**
 * @param {Set<string>} keys
 * @returns {string[]}
 */
export function suppressedKeysArray(keys) {
  return [...(keys ?? new Set())].filter(Boolean).sort();
}

/**
 * @param {string} projectId
 * @param {string[]} keys
 */
function writeSuppressedSyncKeysLocal(projectId, keys) {
  if (!projectId) return;
  try {
    if (!keys.length) {
      localStorage.removeItem(`${STORAGE_PREFIX}${projectId}`);
      return;
    }
    localStorage.setItem(`${STORAGE_PREFIX}${projectId}`, JSON.stringify(keys));
  } catch {
    /* quota — best effort */
  }
}

/**
 * @param {string} projectId
 * @param {string} key
 * @param {object | null | undefined} [document]
 */
export function addSuppressedSyncKey(projectId, key, document = null) {
  if (!projectId || !key) return;
  const set = readSuppressedSyncKeys(projectId, document);
  if (set.has(key)) return;
  set.add(key);
  writeSuppressedSyncKeysLocal(projectId, suppressedKeysArray(set));
}

/**
 * @param {string} projectId
 */
export function clearSuppressedSyncKeys(projectId) {
  if (!projectId) return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${projectId}`);
  } catch {
    /* ignore */
  }
}

/**
 * Merge local + document keys for persistence on the project JSON.
 * @param {string} projectId
 * @param {object | null | undefined} stateOrDocument
 */
export function suppressedKeysForSave(projectId, stateOrDocument) {
  return suppressedKeysArray(readSuppressedSyncKeys(projectId, stateOrDocument));
}
