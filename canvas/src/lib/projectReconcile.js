import { strings } from '../content/strings.js';
import { projectStorageKey } from './constants.js';
import { fetchCanvasProjectDocument } from './canvasProjectsApi.js';
import {
  isServerSyncEnabled,
  hasLocalProjectDocument,
  loadSyncedProjectIndex,
  saveSyncedProjectIndex,
} from './projectSync.js';
import { loadProjectById, saveProjectById } from './persistence.js';
import {
  dedupeProjectsById,
  collapseDuplicateProjectNames,
  collapseDuplicateProjectNamesInIndex,
  normalizeWorkspaceIndex,
  pickPreferredProjectRow,
} from './projectIndexNormalize.js';

export {
  dedupeProjectsById,
  collapseDuplicateProjectNames,
  collapseDuplicateProjectNamesInIndex,
  normalizeWorkspaceIndex,
  pickPreferredProjectRow,
} from './projectIndexNormalize.js';

let reconcileInFlight = false;

/** Sorted menu rows from a workspace index (normalized). */
export function projectsForMenuFromIndex(index) {
  if (!index?.projects?.length) return [];
  const { index: normalized } = normalizeWorkspaceIndex(index);
  return sortProjectListForMenu(normalized?.projects ?? []);
}

/** Menu order: active non-archived first by updatedAt desc. */
export function sortProjectListForMenu(projects) {
  return [...(projects ?? [])].sort((a, b) => {
    if (Boolean(a.archived) !== Boolean(b.archived)) {
      return a.archived ? 1 : -1;
    }
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
}

/**
 * Align document.projectName with index row name (index canonical).
 * @returns {Promise<boolean>} whether document was patched
 */
async function patchDocumentNameFromIndex(projectId, indexName) {
  let doc = null;
  try {
    const cached = await window.storage.get(projectStorageKey(projectId));
    if (cached?.value) {
      doc = JSON.parse(cached.value);
    }
  } catch {
    /* use server load below */
  }
  if (!doc) {
    doc = await loadProjectById(projectId);
  }
  if (!doc) return false;
  const canonical = indexName?.trim() || strings.defaultProjectName;
  if (doc.projectName === canonical) return false;
  const nextDoc = { ...doc, projectName: canonical };
  try {
    await window.storage.set(
      projectStorageKey(projectId),
      JSON.stringify(nextDoc),
    );
  } catch {
    /* quota */
  }
  await saveProjectById(projectId, nextDoc, nextDoc.stagedSyncCards ?? [], {
    pushRemote: true,
  });
  return true;
}

/**
 * @param {string} projectId
 * @param {object} options
 * @param {object} options.index - full workspace index
 * @param {object} [options.row] - index row for projectId
 * @param {boolean} [options.skipNameReconcile]
 * @param {boolean} [options.adoptDocumentName] - after newer document pull
 * @param {object} [options.pulledPayload]
 */
export async function reconcileProject(projectId, {
  index,
  row: rowIn,
  skipNameReconcile = false,
  adoptDocumentName = false,
  pulledPayload = null,
  /** When true, skip server GET (use local document only). */
  localOnly = false,
} = {}) {
  if (!projectId || !index) return { row: rowIn ?? null, index };

  const row = rowIn ?? index.projects?.find((p) => p.id === projectId);
  if (!row) return { row: null, index };

  const nextRow = { ...row };
  let indexChanged = false;

  if (isServerSyncEnabled() && !localOnly) {
    try {
      const remote = await fetchCanvasProjectDocument(projectId);
      if (!remote?.payload) {
        if (nextRow.syncState !== 'missing') {
          nextRow.syncState = 'missing';
          indexChanged = true;
        }
      } else if (nextRow.syncState) {
        delete nextRow.syncState;
        indexChanged = true;
      }

      const doc = pulledPayload ?? remote.payload;
      const docName = doc?.projectName?.trim() || strings.defaultProjectName;
      const indexName = nextRow.name?.trim() || strings.defaultProjectName;

      if (!skipNameReconcile && docName !== indexName) {
        if (adoptDocumentName) {
          nextRow.name = docName;
          nextRow.updatedAt = Date.now();
          indexChanged = true;
        } else {
          await patchDocumentNameFromIndex(projectId, indexName);
        }
      }
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (/too large|413/i.test(msg)) {
        nextRow.syncState = 'error';
        indexChanged = true;
      } else if (!await hasLocalProjectDocument(projectId)) {
        nextRow.syncState = 'missing';
        indexChanged = true;
      }
    }
  } else if (isServerSyncEnabled() && localOnly) {
    const doc = pulledPayload ?? (await loadProjectById(projectId));
    const docName = doc?.projectName?.trim() || strings.defaultProjectName;
    const indexName = nextRow.name?.trim() || strings.defaultProjectName;
    if (!skipNameReconcile && docName !== indexName && !adoptDocumentName) {
      await patchDocumentNameFromIndex(projectId, indexName);
    }
    if (!await hasLocalProjectDocument(projectId) && nextRow.syncState !== 'missing') {
      nextRow.syncState = 'missing';
      indexChanged = true;
    }
  } else if (!await hasLocalProjectDocument(projectId)) {
    if (nextRow.syncState !== 'missing') {
      nextRow.syncState = 'missing';
      indexChanged = true;
    }
  } else if (nextRow.syncState === 'missing') {
    delete nextRow.syncState;
    indexChanged = true;
  }

  if (indexChanged) {
    const projects = index.projects.map((p) => (p.id === projectId ? nextRow : p));
    const nextIndex = { ...index, projects };
    await saveSyncedProjectIndex(nextIndex);
    return { row: nextRow, index: nextIndex };
  }

  return { row: nextRow, index };
}

/**
 * Reconcile all projects in the workspace index.
 * @param {object} index
 * @param {{ activeProjectId?: string, skipProjectIds?: Set<string>, adoptDocumentNameFor?: string }} options
 */
/**
 * @param {'none' | 'active' | 'all'} [scope]
 *   - none: return index unchanged (index merge only)
 *   - active: reconcile activeProjectId only (local name patch, no server GET)
 *   - all: check every project against server (slow; use in background)
 */
export async function reconcileWorkspaceIndex(index, {
  activeProjectId = null,
  skipProjectIds = new Set(),
  adoptDocumentNameFor = null,
  scope = 'all',
} = {}) {
  if (!index?.projects?.length || scope === 'none') return index;
  if (scope === 'all' && reconcileInFlight) return index;

  const lockAll = scope === 'all';
  if (lockAll) reconcileInFlight = true;
  try {
    let current = index;
    let ordered;
    if (scope === 'active' && activeProjectId) {
      ordered = [activeProjectId];
    } else if (scope === 'active') {
      return index;
    } else {
      const ids = current.projects.map((p) => p.id);
      const eager = activeProjectId ? [activeProjectId] : [];
      const rest = ids.filter((id) => id !== activeProjectId);
      ordered = [...eager, ...rest];
    }

    for (let i = 0; i < ordered.length; i += 1) {
      const projectId = ordered[i];
      if (skipProjectIds.has(projectId)) continue;

      const row = current.projects.find((p) => p.id === projectId);
      const { index: nextIndex } = await reconcileProject(projectId, {
        index: current,
        row,
        skipNameReconcile: skipProjectIds.has(projectId),
        adoptDocumentName: projectId === adoptDocumentNameFor,
        localOnly: scope === 'active',
      });
      current = nextIndex;

      if (i > 0 && i % 3 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    return current;
  } finally {
    if (lockAll) reconcileInFlight = false;
  }
}

/** After document pull with newer server revision, adopt name into index when allowed. */
export async function adoptDocumentNameToIndex(projectId, payload) {
  const name = payload?.projectName?.trim();
  if (!name || !projectId) return null;
  const index = await loadSyncedProjectIndex();
  if (!index?.projects?.length) return null;
  const row = index.projects.find((p) => p.id === projectId);
  if (!row || row.name === name) return index;
  row.name = name;
  row.updatedAt = Date.now();
  await saveSyncedProjectIndex(index, { immediate: true });
  return index;
}

export function markProjectUploadError(index, projectId) {
  if (!index?.projects) return index;
  const projects = index.projects.map((p) =>
    p.id === projectId ? { ...p, syncState: 'error', updatedAt: Date.now() } : p,
  );
  return { ...index, projects };
}
