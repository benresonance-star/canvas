import { PROJECT_INDEX_KEY, projectStorageKey } from './constants.js';
import {
  deleteProjectDocumentSerialised,
  listCachedProjectIds,
} from './projectDocumentStore.js';
import { deletePreviewsForProject } from './previewStore.js';

const PROJECT_KEY_PREFIX = 'canvas:project:';
const AGENT_CHAT_PREFIX = 'canvas:agent-chat:';
const AGENT_THREADS_PREFIX = 'canvas:agent-chat-threads:';
const REVISION_PREFIX = 'canvas:project-rev:';
const SUPPRESSED_PREFIX = 'canvas:suppressed:';

/** @type {Map<string, number>} projectId -> last touch ms */
const projectTouchAt = new Map();

export function touchProjectCache(projectId) {
  if (projectId) projectTouchAt.set(projectId, Date.now());
}

/**
 * @returns {{ totalBytes: number, projectsBytes: number, agentChatBytes: number, otherBytes: number, projectCount: number }}
 */
export function estimateLocalStorageUsage() {
  let totalBytes = 0;
  let projectsBytes = 0;
  let agentChatBytes = 0;
  let otherBytes = 0;
  let projectCount = 0;

  if (typeof localStorage === 'undefined') {
    return { totalBytes: 0, projectsBytes: 0, agentChatBytes: 0, otherBytes: 0, projectCount: 0 };
  }

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    const val = localStorage.getItem(key) ?? '';
    const len = key.length + val.length;
    totalBytes += len;
    if (key.startsWith(PROJECT_KEY_PREFIX)) {
      projectsBytes += len;
      projectCount += 1;
    } else if (key.startsWith(AGENT_CHAT_PREFIX) || key.startsWith(AGENT_THREADS_PREFIX)) {
      agentChatBytes += len;
    } else {
      otherBytes += len;
    }
  }

  return { totalBytes, projectsBytes, agentChatBytes, otherBytes, projectCount };
}

/**
 * @param {string} activeProjectId
 * @param {string[]} indexProjectIds
 * @param {{ maxEvict?: number }} [opts]
 * @returns {string[]} evicted project ids
 */
export function evictInactiveProjectCaches(activeProjectId, indexProjectIds = [], opts = {}) {
  const maxEvict = opts.maxEvict ?? 3;
  const keep = new Set([activeProjectId, ...indexProjectIds].filter(Boolean));
  const candidates = [];

  if (typeof localStorage === 'undefined') return [];

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(PROJECT_KEY_PREFIX)) continue;
    const id = key.slice(PROJECT_KEY_PREFIX.length);
    if (keep.has(id)) continue;
    const touched = projectTouchAt.get(id) ?? 0;
    const size = (localStorage.getItem(key) ?? '').length;
    candidates.push({ id, key, touched, size });
  }

  candidates.sort((a, b) => a.touched - b.touched || b.size - a.size);
  const evicted = [];
  for (const c of candidates.slice(0, maxEvict)) {
    try {
      localStorage.removeItem(c.key);
      localStorage.removeItem(`${REVISION_PREFIX}${c.id}`);
      localStorage.removeItem(`${SUPPRESSED_PREFIX}${c.id}`);
      projectTouchAt.delete(c.id);
      evicted.push(c.id);
    } catch {
      /* ignore */
    }
  }
  return evicted;
}

/**
 * Evict inactive project bodies from IndexedDB (and related previews).
 * @param {string} activeProjectId
 * @param {string[]} indexProjectIds
 * @param {{ maxEvict?: number }} [opts]
 * @returns {Promise<string[]>}
 */
export async function evictInactiveProjectIdbCaches(
  activeProjectId,
  indexProjectIds = [],
  opts = {},
) {
  const maxEvict = opts.maxEvict ?? 3;
  const keep = new Set([activeProjectId, ...indexProjectIds].filter(Boolean));
  let cached = [];
  try {
    cached = await listCachedProjectIds();
  } catch {
    return [];
  }

  const candidates = cached
    .filter((id) => id && !keep.has(id))
    .map((id) => ({
      id,
      touched: projectTouchAt.get(id) ?? 0,
    }))
    .sort((a, b) => a.touched - b.touched);

  const evicted = [];
  for (const c of candidates.slice(0, maxEvict)) {
    try {
      await deleteProjectDocumentSerialised(c.id);
      await deletePreviewsForProject(c.id);
      projectTouchAt.delete(c.id);
      evicted.push(c.id);
    } catch {
      /* ignore */
    }
  }
  return evicted;
}

/**
 * Clear local project caches; keeps index row metadata in memory for caller to re-save.
 * @param {{ activeProjectId?: string | null, keepActive?: boolean }} [opts]
 */
export function clearLocalProjectCaches(opts = {}) {
  const { activeProjectId = null, keepActive = true } = opts;
  if (typeof localStorage === 'undefined') return { cleared: 0 };

  let cleared = 0;
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(PROJECT_KEY_PREFIX)) {
      const id = key.slice(PROJECT_KEY_PREFIX.length);
      if (keepActive && id === activeProjectId) continue;
      keysToRemove.push(key);
      keysToRemove.push(`${REVISION_PREFIX}${id}`);
      keysToRemove.push(`${SUPPRESSED_PREFIX}${id}`);
    }
  }
  for (const key of keysToRemove) {
    try {
      localStorage.removeItem(key);
      cleared += 1;
    } catch {
      /* ignore */
    }
  }
  return { cleared };
}

export function clearAgentChatLocalCaches(projectId = null) {
  if (typeof localStorage === 'undefined') return 0;
  let cleared = 0;
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (!key.startsWith(AGENT_CHAT_PREFIX) && !key.startsWith(AGENT_THREADS_PREFIX)) {
      continue;
    }
    if (projectId && !key.includes(`:${projectId}:`)) continue;
    keys.push(key);
  }
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
      cleared += 1;
    } catch {
      /* ignore */
    }
  }
  return cleared;
}

/** @returns {boolean} */
export function isQuotaError(e) {
  const name = e?.name ?? '';
  const msg = String(e?.message ?? e);
  return name === 'QuotaExceededError' || /quota/i.test(msg);
}

export { PROJECT_INDEX_KEY };
