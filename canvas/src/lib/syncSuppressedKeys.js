import { normalizeBookmarkUrl } from './bookmarkUrl.js';

const STORAGE_PREFIX = 'canvas:suppressed-sync-keys:';
const URL_STORAGE_PREFIX = 'canvas:suppressed-bookmark-urls:';

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

/**
 * @param {object | null | undefined} document
 * @returns {Set<string>}
 */
export function readSuppressedBookmarkUrlsFromDocument(document) {
  const urls = document?.suppressedBookmarkUrls;
  if (!Array.isArray(urls)) return new Set();
  const out = new Set();
  for (const raw of urls) {
    const normalized = normalizeBookmarkUrl(raw);
    if (normalized) out.add(normalized);
  }
  return out;
}

/**
 * Bookmark URLs removed from canvas; folder sync must not re-import them.
 * @param {string} projectId
 * @param {object | null | undefined} [document]
 * @returns {Set<string>}
 */
export function readSuppressedBookmarkUrls(projectId, document = null) {
  const merged = readSuppressedBookmarkUrlsFromDocument(document);
  if (!projectId) return merged;
  try {
    const raw = localStorage.getItem(`${URL_STORAGE_PREFIX}${projectId}`);
    if (!raw) return merged;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        const normalized = normalizeBookmarkUrl(entry);
        if (normalized) merged.add(normalized);
      }
    }
  } catch {
    /* ignore */
  }
  return merged;
}

/**
 * @param {Set<string>} urls
 * @returns {string[]}
 */
export function suppressedBookmarkUrlsArray(urls) {
  return [...(urls ?? new Set())].filter(Boolean).sort();
}

/**
 * @param {string} projectId
 * @param {string[]} urls
 */
function writeSuppressedBookmarkUrlsLocal(projectId, urls) {
  if (!projectId) return;
  try {
    if (!urls.length) {
      localStorage.removeItem(`${URL_STORAGE_PREFIX}${projectId}`);
      return;
    }
    localStorage.setItem(`${URL_STORAGE_PREFIX}${projectId}`, JSON.stringify(urls));
  } catch {
    /* quota — best effort */
  }
}

/**
 * @param {string} projectId
 * @param {string} url
 * @param {object | null | undefined} [document]
 */
export function addSuppressedBookmarkUrl(projectId, url, document = null) {
  const normalized = normalizeBookmarkUrl(url);
  if (!projectId || !normalized) return;
  const set = readSuppressedBookmarkUrls(projectId, document);
  if (set.has(normalized)) return;
  set.add(normalized);
  writeSuppressedBookmarkUrlsLocal(projectId, suppressedBookmarkUrlsArray(set));
}

/**
 * @param {string} projectId
 * @param {object | null | undefined} stateOrDocument
 */
export function suppressedBookmarkUrlsForSave(projectId, stateOrDocument) {
  return suppressedBookmarkUrlsArray(readSuppressedBookmarkUrls(projectId, stateOrDocument));
}
