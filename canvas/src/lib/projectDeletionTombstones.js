const STORAGE_KEY = 'canvas:deleted-project-ids';

/** @returns {Set<string>} */
function readSet() {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function writeSet(set) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* quota */
  }
}

/** @param {string} projectId */
export function recordDeletedProjectId(projectId) {
  if (!projectId) return;
  const set = readSet();
  set.add(projectId);
  writeSet(set);
}

/** @param {string} projectId */
export function isDeletedProjectId(projectId) {
  if (!projectId) return false;
  return readSet().has(projectId);
}

/** @param {string[]} projectIds */
export function filterOutDeletedProjectIds(projectIds) {
  const set = readSet();
  return projectIds.filter((id) => id && !set.has(id));
}

export function clearDeletedProjectTombstonesForTests() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}
