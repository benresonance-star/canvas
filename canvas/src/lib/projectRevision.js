import { projectStorageKey } from './constants.js';

const REVISION_KEY_PREFIX = 'canvas:project-rev:';
const LOCAL_EDIT_AT_KEY_PREFIX = 'canvas:project-local-edit-at:';

export function projectLocalEditAtStorageKey(projectId) {
  return `${LOCAL_EDIT_AT_KEY_PREFIX}${projectId}`;
}

export function projectRevisionStorageKey(projectId) {
  return `${REVISION_KEY_PREFIX}${projectId}`;
}

export async function readCachedRevision(projectId) {
  if (!projectId) return 0;
  try {
    const result = await window.storage.get(projectRevisionStorageKey(projectId));
    if (!result?.value) return 0;
    const n = Number(JSON.parse(result.value));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function writeCachedRevision(projectId, revision) {
  if (!projectId) return;
  const n = Number(revision);
  if (!Number.isFinite(n) || n < 0) return;
  try {
    await window.storage.set(
      projectRevisionStorageKey(projectId),
      JSON.stringify(n),
    );
  } catch {
    /* quota */
  }
}

export async function clearCachedRevision(projectId) {
  if (!projectId) return;
  try {
    localStorage.removeItem(projectRevisionStorageKey(projectId));
    localStorage.removeItem(projectLocalEditAtStorageKey(projectId));
  } catch {
    /* ignore */
  }
}

export async function readCachedLocalEditAt(projectId) {
  if (!projectId) return 0;
  try {
    const result = await window.storage.get(projectLocalEditAtStorageKey(projectId));
    if (!result?.value) return 0;
    const n = Number(JSON.parse(result.value));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function writeCachedLocalEditAt(projectId, editAtMs) {
  if (!projectId) return;
  const n = Number(editAtMs);
  if (!Number.isFinite(n) || n <= 0) return;
  try {
    await window.storage.set(
      projectLocalEditAtStorageKey(projectId),
      JSON.stringify(n),
    );
  } catch {
    /* quota */
  }
}

export { projectStorageKey };
