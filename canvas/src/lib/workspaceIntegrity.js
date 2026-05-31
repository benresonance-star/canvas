import { projectStorageKey } from './constants.js';
import { strings } from '../content/strings.js';
import { fetchCanvasProjectMeta } from './canvasProjectsApi.js';
import { deletePreviewsForProject } from './previewStore.js';
import {
  deleteProjectDocumentSerialised,
  listCachedProjectIds,
} from './projectDocumentStore.js';
import { projectRevisionStorageKey } from './projectRevision.js';
import { readLocalProjectSerialised } from './sync/projectSyncLocal.js';

const SUPPRESSED_PREFIX = 'canvas:suppressed:';

export const PROJECT_KEY_PREFIX = 'canvas:project:';

/** @param {object | null | undefined} doc */
export function projectCardCountFromDoc(doc) {
  return Array.isArray(doc?.cards) ? doc.cards.length : 0;
}

/**
 * @param {object | null | undefined} index
 * @returns {string[]}
 */
export function listOrphanProjectIds(index) {
  const indexedIds = new Set((index?.projects ?? []).map((p) => p.id));
  const orphanIds = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PROJECT_KEY_PREFIX)) continue;
      const id = key.slice(PROJECT_KEY_PREFIX.length);
      if (id && !indexedIds.has(id)) orphanIds.push(id);
    }
  } catch {
    return [];
  }
  return orphanIds;
}

/**
 * Orphan ids in localStorage and IndexedDB not listed in the workspace index.
 * @param {object | null | undefined} index
 * @returns {Promise<string[]>}
 */
export async function listAllOrphanProjectIds(index) {
  const ids = new Set(listOrphanProjectIds(index));
  try {
    const cached = await listCachedProjectIds();
    const indexed = new Set((index?.projects ?? []).map((p) => p.id));
    for (const id of cached) {
      if (id && !indexed.has(id)) ids.add(id);
    }
  } catch {
    /* ignore */
  }
  return [...ids];
}

/**
 * Remove cached project bodies not in the workspace index (index is source of truth).
 * @param {object | null | undefined} index
 * @returns {Promise<{ purgedCount: number, purgedIds: string[] }>}
 */
export async function purgeOrphanProjectBodies(index) {
  const orphanIds = await listAllOrphanProjectIds(index);
  if (orphanIds.length === 0) {
    return { purgedCount: 0, purgedIds: [] };
  }

  const purgedIds = [];
  for (const id of orphanIds) {
    try {
      await deleteProjectDocumentSerialised(id);
    } catch (e) {
      console.warn(`[canvas] failed to purge orphan IDB cache ${id}:`, e);
    }
    try {
      await deletePreviewsForProject(id);
    } catch {
      /* previews optional; IDB may be unavailable in tests */
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(projectStorageKey(id));
        localStorage.removeItem(projectRevisionStorageKey(id));
        localStorage.removeItem(`${SUPPRESSED_PREFIX}${id}`);
      } catch {
        /* ignore */
      }
    }
    const stillIndexed = await readLocalProjectPayload(id);
    if (!stillIndexed) {
      purgedIds.push(id);
    }
  }

  if (purgedIds.length > 0) {
    console.warn(
      `[canvas] purged ${purgedIds.length} orphan project cache(s) not in workspace index`,
    );
  }

  return { purgedCount: purgedIds.length, purgedIds };
}

/**
 * @param {string} projectId
 * @returns {Promise<boolean>}
 */
export async function hasLocalProjectBody(projectId) {
  if (!projectId) return false;
  try {
    const raw = await readLocalProjectSerialised(projectId);
    return Boolean(raw);
  } catch {
    return false;
  }
}

/**
 * @param {string} projectId
 * @returns {Promise<object | null>}
 */
export async function readLocalProjectPayload(projectId) {
  if (!projectId) return null;
  try {
    const raw = await readLocalProjectSerialised(projectId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Index rows with no local body (optional server meta check).
 * @param {object} index
 * @param {{ checkServer?: boolean, serverSyncEnabled?: boolean }} [options]
 * @returns {Promise<string[]>}
 */
export async function listGhostProjectIds(
  index,
  { checkServer = false, serverSyncEnabled = false } = {},
) {
  const ghosts = [];
  for (const row of index?.projects ?? []) {
    if (!row?.id) continue;
    if (await hasLocalProjectBody(row.id)) continue;
    if (checkServer && serverSyncEnabled) {
      try {
        const meta = await fetchCanvasProjectMeta(row.id);
        if (meta) continue;
      } catch {
        continue;
      }
    }
    ghosts.push(row.id);
  }
  return ghosts;
}

/**
 * @param {object} index
 * @param {string} resolvedActiveId
 */
export function resolveActiveProjectIdForIndex(index, resolvedActiveId) {
  if (
    resolvedActiveId
    && index.projects?.some((p) => p.id === resolvedActiveId)
  ) {
    return resolvedActiveId;
  }
  const pool = (index?.projects ?? []).filter((p) => !p.archived);
  const list = pool.length > 0 ? pool : (index?.projects ?? []);
  if (list.length === 0) return null;
  return list.reduce((a, b) =>
    ((a.updatedAt ?? 0) >= (b.updatedAt ?? 0) ? a : b),
  ).id;
}

/**
 * Re-add index rows for orphan local bodies.
 * @param {object} index
 * @returns {Promise<{ index: object, recoveredCount: number }>}
 */
export async function recoverOrphanProjectsIntoIndex(index) {
  const orphanIds = await listAllOrphanProjectIds(index);
  if (orphanIds.length === 0) {
    return { index, recoveredCount: 0 };
  }

  const base =
    index?.projects?.length
      ? { ...index, projects: [...index.projects] }
      : {
        version: 1,
        activeProjectId: null,
        projects: [],
      };

  let recoveredCount = 0;
  for (const id of orphanIds) {
    const payload = await readLocalProjectPayload(id);
    if (!payload) continue;
    if (base.projects.some((p) => p.id === id)) continue;

    const now = Date.now();
    const name = payload.projectName?.trim() || strings.defaultProjectName;
    base.projects.push({
      id,
      name,
      createdAt: now,
      updatedAt: now,
      archived: false,
    });
    recoveredCount += 1;
  }

  if (recoveredCount === 0) return { index, recoveredCount: 0 };

  base.activeProjectId = resolveActiveProjectIdForIndex(
    base,
    base.activeProjectId,
  );
  return { index: base, recoveredCount };
}

/**
 * @param {object} row
 * @param {object | null} payload
 */
function patchRowNameFromDocument(row, payload) {
  if (!row || !payload) return false;
  const docName = payload.projectName?.trim();
  if (!docName || docName === row.name?.trim()) return false;
  row.name = docName;
  row.updatedAt = Date.now();
  return true;
}

/**
 * Audit workspace index; repair orphans, active id, ghost flags, names from documents.
 * @param {object | null | undefined} index
 * @param {{
 *   checkServerGhosts?: boolean,
 *   serverSyncEnabled?: boolean,
 * }} [options]
 * @returns {Promise<{
 *   issues: { type: string, projectId?: string }[],
 *   repairedIndex: object | null,
 *   actions: string[],
 *   orphanRecovered: number,
 *   ghostsMarked: number,
 * }>}
 */
export async function auditWorkspaceIndex(index, options = {}) {
  const { checkServerGhosts = false, serverSyncEnabled = false } = options;
  const issues = [];
  const actions = [];

  let repaired = index?.projects?.length
    ? { ...index, projects: index.projects.map((p) => ({ ...p })) }
    : (index ?? null);
  let orphanPurged = 0;
  let ghostsMarked = 0;

  const { purgedCount } = await purgeOrphanProjectBodies(repaired ?? { projects: [] });
  if (purgedCount > 0) {
    orphanPurged = purgedCount;
    actions.push(`purged_orphans:${purgedCount}`);
    issues.push({ type: 'orphan_purged', count: purgedCount });
  }

  let orphanRecovered = 0;
  if (repaired?.projects) {
    const recovery = await recoverOrphanProjectsIntoIndex(repaired);
    if (recovery.recoveredCount > 0) {
      repaired = recovery.index;
      orphanRecovered = recovery.recoveredCount;
      actions.push(`recovered_orphans:${orphanRecovered}`);
      issues.push({ type: 'orphan_recovered', count: orphanRecovered });
    }
  }

  if (!repaired?.projects?.length) {
    return {
      issues,
      repairedIndex: repaired,
      actions,
      orphanPurged,
      orphanRecovered,
      ghostsMarked: 0,
    };
  }

  const ghostIds = await listGhostProjectIds(repaired, {
    checkServer: checkServerGhosts,
    serverSyncEnabled,
  });
  for (const projectId of ghostIds) {
    const row = repaired.projects.find((p) => p.id === projectId);
    if (!row) continue;
    issues.push({ type: 'ghost_index_row', projectId });
    if (row.syncState !== 'missing') {
      row.syncState = 'missing';
      row.updatedAt = Date.now();
      ghostsMarked += 1;
      actions.push(`marked_missing:${projectId}`);
    }
  }

  for (const row of repaired.projects) {
    if (!row?.id) continue;
    const payload = await readLocalProjectPayload(row.id);
    if (payload) {
      if (row.syncState === 'missing') {
        delete row.syncState;
        actions.push(`cleared_missing:${row.id}`);
      }
      patchRowNameFromDocument(row, payload);
    }
  }

  const resolvedActive = resolveActiveProjectIdForIndex(
    repaired,
    repaired.activeProjectId,
  );
  if (resolvedActive && repaired.activeProjectId !== resolvedActive) {
    repaired.activeProjectId = resolvedActive;
    actions.push('fixed_active_project_id');
    issues.push({ type: 'invalid_active_project_id' });
  }

  return {
    issues,
    repairedIndex: repaired,
    actions,
    orphanPurged,
    orphanRecovered,
    ghostsMarked,
  };
}
