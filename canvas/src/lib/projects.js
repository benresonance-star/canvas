import { LEGACY_PROJECT_KEY, projectStorageKey } from './constants.js';
import { strings } from '../content/strings.js';
import { loadProjectById, saveProjectById, loadProjectStructure } from './persistence.js';
import { clearAgentChatSessionsForProject } from './agentChatPersistence.js';
import { deletePreviewsForProject } from './previewStore.js';
import { removeFolderHandle } from './folderStore.js';
import { fetchCanvasIndex, fetchCanvasIndexDocument } from './canvasProjectsApi.js';
import {
  reconcileWorkspaceIndex,
  sortProjectListForMenu,
  adoptDocumentNameToIndex,
  projectsForMenuFromIndex,
  canonicalProjectNameFromIndex,
} from './projectReconcile.js';
import {
  normalizeProjectNameKey,
  normalizeWorkspaceIndex,
  collapseDuplicateProjectNamesInIndex,
} from './projectIndexNormalize.js';
import {
  listOrphanProjectIds,
  auditWorkspaceIndex,
  purgeOrphanProjectBodies,
  hasLocalProjectBody,
  readLocalProjectPayload,
} from './workspaceIntegrity.js';
import { projectCardCount } from './sync/projectSyncMerge.js';
import {
  getDeletedProjectIds,
  recordDeletedProjectId,
} from './projectDeletionTombstones.js';
import { flowTrace } from './sync/syncTrace.js';
import {
  initializeProjectSync,
  loadSyncedProjectIndex,
  saveSyncedProjectIndex,
  flushProjectSync,
  deleteSyncedProjectDocument,
  isServerSyncEnabled,
  hasLocalProjectDocument,
  prefetchProjectDocumentFromServer,
  consumeProjectSyncRecoveryNotice,
  shouldShowOpenInCursorToSync,
  shouldShowDatabaseUnavailable,
  pullAndMergeProjectIndex,
  pullProjectDocumentIfServerNewer,
  pushProjectDocumentIfLocalNewer,
  reconcileProjectDocumentOnSwitch,
  recordGoodLocalCardCount,
  seedClientRevisionFromMeta,
  applyWorkspaceIntegrityRepair as applyWorkspaceIntegrityRepairCore,
} from './projectSync.js';
import { writeLocalActiveProjectId } from './sync/projectSyncLocal.js';

export {
  flushProjectSync,
  getProjectSyncMode,
  initializeProjectSync,
  runProjectSyncBackground,
  isServerSyncEnabled,
  hasLocalProjectDocument,
  prefetchProjectDocumentFromServer,
  resetProjectSyncState,
  consumeProjectSyncRecoveryNotice,
  shouldShowOpenInCursorToSync,
  shouldShowDatabaseUnavailable,
  pullAndMergeProjectIndex,
  pullProjectDocumentIfServerNewer,
  pushProjectDocumentIfLocalNewer,
  reconcileProjectDocumentOnSwitch,
  recordGoodLocalCardCount,
  seedClientRevisionFromMeta,
  peekServerProjectRevision,
  checkServerRevisionAhead,
  getClientRevision,
  setSyncLockListener,
  parseServerUpdatedAt,
  adoptSyncLockForProject,
  reconcileSyncLock,
  reconcileActiveProject,
  hasPendingProjectSave,
  cancelPendingProjectSave,
  flushOutgoingProjectDocument,
  persistProjectDocumentLocally,
  setCacheEvictionContext,
  getProjectConflict,
  clearProjectConflict,
  startProjectSyncStream,
  stopProjectSyncStream,
  startWorkspaceIndexSyncStream,
  stopWorkspaceIndexSyncStream,
  applyRemoteProjectPatch,
  flushPendingRemoteProjectPatch,
  setRemotePatchAppliedListener,
  getProjectSyncClientId,
  isProjectPatchSyncEnabled,
} from './projectSync.js';

export {
  estimateLocalStorageUsage,
  clearLocalProjectCaches,
  clearAgentChatLocalCaches,
} from './storageBudget.js';

export { loadProjectStructure, loadProjectDocument, applyProjectLoadFence } from './persistence.js';

export { subscribeProjectCacheChanges } from './projectDocumentStore.js';

export {
  registerActionSyncHandlers,
  unregisterActionSyncHandlers,
  requestActionSync,
  notifyStructuralPushFailed,
} from './actionSync.js';

export {
  beginCanvasInteraction,
  endCanvasInteraction,
  isCanvasInteractionActive,
  setCanvasInteractionIdleListener,
} from './canvasInteraction.js';

export {
  registerOptimisticCard,
  clearOptimisticCard,
  mergeOptimisticCardsIntoDoc,
} from './optimisticCards.js';

export {
  reconcileWorkspaceIndex,
  sortProjectListForMenu,
  adoptDocumentNameToIndex,
  projectsForMenuFromIndex,
  canonicalProjectNameFromIndex,
  resolveProjectDisplayName,
  normalizeWorkspaceIndex,
} from './projectReconcile.js';

const INDEX_VERSION = 1;

let lastOrphanPurgeCount = 0;
let lastServerProjectsSyncedCount = 0;
let lastDuplicateMergeCount = 0;
let lastIntegrityGhostCount = 0;
/** @type {Promise<{ index: object, projectId: string }> | null} */
let createProjectInFlight = null;

/** Purge canvas:project:* cache bodies not listed in the workspace index. */
export async function purgeOrphansFromLocalStorage(index) {
  const { purgedCount } = await purgeOrphanProjectBodies(index);
  if (purgedCount > 0) {
    lastOrphanPurgeCount += purgedCount;
  }
  return { index, purgedCount };
}

/** Orphan cache purge count this session; cleared after read. */
export function consumeOrphanPurgeNotice() {
  const count = lastOrphanPurgeCount;
  lastOrphanPurgeCount = 0;
  return count;
}

/** @deprecated Use consumeOrphanPurgeNotice */
export function consumeOrphanRecoveryNotice() {
  return consumeOrphanPurgeNotice();
}

/** Server-only projects merged into index; cleared after read. */
export function consumeServerProjectsSyncedNotice() {
  const count = lastServerProjectsSyncedCount;
  lastServerProjectsSyncedCount = 0;
  return count;
}

export function recordServerProjectsSynced(count) {
  if (count > 0) lastServerProjectsSyncedCount += count;
}

/** Duplicate same-name projects collapsed; cleared after read. */
export function consumeDuplicateMergeNotice() {
  const count = lastDuplicateMergeCount;
  lastDuplicateMergeCount = 0;
  return count;
}

export function recordDuplicateMergeCount(count) {
  if (count > 0) lastDuplicateMergeCount += count;
}

/**
 * Collapse same-display-name rows; keep active id. Purge dropped project bodies.
 * @param {object} index
 * @param {string | null} activeProjectId
 */
export async function healDuplicateProjectNames(index, activeProjectId = null) {
  if (!index?.projects?.length) return { index, removedIds: [] };
  const { index: collapsed, removedIds } = collapseDuplicateProjectNamesInIndex({
    ...index,
    activeProjectId: activeProjectId ?? index.activeProjectId,
  });
  if (removedIds.length === 0) {
    return { index: collapsed, removedIds: [] };
  }
  for (const removedId of removedIds) {
    await deleteSyncedProjectDocument(removedId);
    await clearAgentChatSessionsForProject(removedId);
    await removeFolderHandle(removedId);
  }
  await saveProjectIndex(collapsed, { immediate: isServerSyncEnabled() });
  recordDuplicateMergeCount(removedIds.length);
  return { index: collapsed, removedIds };
}

/** Projects flagged missing body on server/local; cleared after read. */
export function consumeIntegrityGhostNotice() {
  const count = lastIntegrityGhostCount;
  lastIntegrityGhostCount = 0;
  return count;
}

function recordIntegrityRepair({
  orphanPurged = 0,
  orphanRecovered = 0,
  ghostsMarked = 0,
} = {}) {
  const purged = orphanPurged || orphanRecovered;
  if (purged > 0) {
    lastOrphanPurgeCount += purged;
  }
  if (ghostsMarked > 0) {
    lastIntegrityGhostCount += ghostsMarked;
  }
}

export { listOrphanProjectIds } from './workspaceIntegrity.js';

/** Audit index, persist repairs, queue user notices. */
export async function repairWorkspaceIndex(index, options = {}) {
  const integrity = await applyWorkspaceIntegrityRepairCore(index, options);
  recordIntegrityRepair(integrity);
  return integrity;
}

export function createEmptyProjectState(name = strings.defaultProjectName) {
  return {
    projectName: name,
    cards: [],
    canvasView: { x: 0, y: 0, zoom: 1 },
    stagedSyncCards: [],
    suppressedSyncKeys: [],
  };
}

function defaultIndex(activeId, name) {
  const now = Date.now();
  return {
    version: INDEX_VERSION,
    activeProjectId: activeId,
    projects: [
      {
        id: activeId,
        name,
        createdAt: now,
        updatedAt: now,
        archived: false,
      },
    ],
  };
}

/** Pick active project from index; prefers stored id, else most recently updated */
export function resolveActiveProjectId(index) {
  if (!index?.projects?.length) return null;
  if (
    index.activeProjectId
    && index.projects.some((p) => p.id === index.activeProjectId)
  ) {
    return index.activeProjectId;
  }
  const pool = index.projects.filter((p) => !p.archived);
  const list = pool.length > 0 ? pool : index.projects;
  if (list.length === 0) return null;
  return list.reduce((a, b) => (a.updatedAt >= b.updatedAt ? a : b)).id;
}

/**
 * Project id with the richest local canvas cache (for refresh / stale active id).
 * @param {object | null | undefined} index
 * @returns {Promise<string | null>}
 */
export async function findBestProjectIdWithLocalCanvas(index) {
  let bestId = null;
  let bestScore = -1;
  for (const row of index?.projects ?? []) {
    if (!row?.id || row.archived) continue;
    const payload = await readLocalProjectPayload(row.id);
    if (!payload) continue;
    const canvasCount = projectCardCount(payload);
    const stagedCount = Array.isArray(payload.stagedSyncCards)
      ? payload.stagedSyncCards.length
      : 0;
    if (canvasCount === 0 && stagedCount === 0) continue;
    const score = canvasCount * 1e12 + stagedCount * 1e9 + (row.updatedAt ?? 0);
    if (score > bestScore) {
      bestScore = score;
      bestId = row.id;
    }
  }
  return bestId;
}

/**
 * Prefer a project that still has canvas cards in local cache (avoids stale empty active id).
 * @param {object | null | undefined} index
 * @returns {Promise<string | null>}
 */
export async function resolveActiveProjectIdPreferringLocalBody(index) {
  const withCanvas = await findBestProjectIdWithLocalCanvas(index);
  if (withCanvas) return withCanvas;
  return resolveActiveProjectId(index);
}

/**
 * Active project for boot: honor persisted index.activeProjectId, but if that row
 * has no local canvas while another project does, open the richer local body.
 * @param {object | null | undefined} index
 * @returns {Promise<string | null>}
 */
export async function resolveBootActiveProjectId(index) {
  const activeId = resolveActiveProjectId(index);
  if (!activeId) return null;
  const richerId = await findBestProjectIdWithLocalCanvas(index);
  if (!richerId || richerId === activeId) return activeId;
  const activePayload = await readLocalProjectPayload(activeId);
  const activeStagedCount = Array.isArray(activePayload?.stagedSyncCards)
    ? activePayload.stagedSyncCards.length
    : 0;
  if (projectCardCount(activePayload) === 0 && activeStagedCount === 0) {
    return richerId;
  }
  return activeId;
}

export async function loadProjectIndex() {
  try {
    return await loadSyncedProjectIndex();
  } catch {
    return null;
  }
}

export async function saveProjectIndex(
  index,
  { immediate = false, deletedProjectIds = [], localOnly = false } = {},
) {
  await saveSyncedProjectIndex(index, { immediate, deletedProjectIds, localOnly });
}

export async function migrateLegacyProjectIfNeeded() {
  const existing = await loadProjectIndex();
  if (existing?.projects?.length) return existing;

  let legacyPayload = null;
  try {
    const legacy = await window.storage.get(LEGACY_PROJECT_KEY);
    legacyPayload = legacy ? JSON.parse(legacy.value) : null;
  } catch {
    legacyPayload = null;
  }

  if (!legacyPayload) return existing;

  const id = crypto.randomUUID();
  const name =
    legacyPayload?.projectName?.trim() || strings.defaultProjectName;

  await saveProjectById(id, legacyPayload, [], { pushRemote: true });

  const index = defaultIndex(id, name);
  await saveProjectIndex(index, { immediate: isServerSyncEnabled() });
  return index;
}

async function tryLoadServerProjectIndex() {
  if (!isServerSyncEnabled()) return null;
  try {
    const { index: serverIndex } = await fetchCanvasIndexDocument();
    if (serverIndex?.projects?.length) {
      await saveSyncedProjectIndex(serverIndex);
      return serverIndex;
    }
  } catch (e) {
    console.warn('Could not load project index from server:', e.message);
  }
  return null;
}

/**
 * Update display name in index and mirror into project document atomically.
 * @param {string} projectId
 * @param {string} name
 * @param {object} [state] - current canvas state (optional)
 * @param {object[]} [stagedSyncCards]
 */
/**
 * Rename a project — writes only to the workspace index (canonical DB store).
 * Canvas document payloads may mirror the name on the next layout save but never
 * define the display title.
 */
export async function setProjectDisplayName(projectId, name) {
  const trimmed = name?.trim();
  if (!trimmed) {
    return loadProjectIndex();
  }
  const index = await loadProjectIndex();
  if (!index) return ensureProjectIndex();

  const row = index.projects.find((p) => p.id === projectId);
  if (!row) return index;

  if (row.name === trimmed) {
    return index;
  }

  row.name = trimmed;
  row.updatedAt = Date.now();
  await saveProjectIndex(index, { immediate: true });
  return index;
}

/** Pull index, reconcile, return sorted project rows for the menu. */
export async function refreshReconciledProjectList(options = {}) {
  const {
    reconcileScope = 'active',
    activeProjectId = null,
    ...rest
  } = options;
  let index = await loadProjectIndex();
  if (isServerSyncEnabled()) {
    index =
      (await pullAndMergeProjectIndex({
        reconcileScope,
        activeProjectId,
        ...rest,
      })) ?? index;
  } else if (reconcileScope !== 'none') {
    index =
      (await reconcileWorkspaceIndex(index, {
        activeProjectId,
        scope: reconcileScope,
        ...rest,
      })) ?? index;
  }
  return projectsForMenuFromIndex(index);
}

function indexProjectIdsSignature(index) {
  return (index?.projects ?? [])
    .map((p) => p.id)
    .sort()
    .join('\n');
}

async function repairNormalizedIndex(index) {
  const { index: normalized } = normalizeWorkspaceIndex(index);
  const changed =
    indexProjectIdsSignature(index) !== indexProjectIdsSignature(normalized)
    || index.activeProjectId !== normalized.activeProjectId;
  if (changed) {
    await saveProjectIndex(normalized, { immediate: true });
    return normalized;
  }
  return index;
}

/** Unique display name when index already has the same normalized name. */
export function uniqueProjectNameForIndex(index, requestedName) {
  const trimmed = requestedName?.trim() || strings.defaultProjectName;
  const key = normalizeProjectNameKey(trimmed);
  const taken = new Set(
    (index?.projects ?? []).map((p) => normalizeProjectNameKey(p.name)),
  );
  if (!taken.has(key)) return trimmed;

  let n = 2;
  while (n < 1000) {
    const candidate = `${trimmed} (${n})`;
    if (!taken.has(normalizeProjectNameKey(candidate))) return candidate;
    n += 1;
  }
  return `${trimmed} (${crypto.randomUUID().slice(0, 8)})`;
}

async function preserveServerResetGeneration(index) {
  if (!isServerSyncEnabled() || typeof index?.resetAt === 'string') return index;
  try {
    const { index: serverIndex } = await fetchCanvasIndexDocument();
    if (typeof serverIndex?.resetAt === 'string' && serverIndex.resetAt) {
      index.resetAt = serverIndex.resetAt;
      if (!serverIndex.projects?.length) {
        index.activeProjectId = null;
        index.projects = [];
      }
    }
  } catch {
    /* keep create local-first when the index endpoint is unavailable */
  }
  return index;
}

/**
 * Ensure workspace index exists; does not create projects without user action.
 * @param {{ serverPull?: boolean }} [options] — set serverPull false during create to avoid index races
 */
export async function ensureProjectIndex(options = {}) {
  const { serverPull = true } = options;
  await initializeProjectSync();
  let index = await loadProjectIndex();
  if (serverPull && isServerSyncEnabled()) {
    index = (await pullAndMergeProjectIndex({ reconcileScope: 'none' })) ?? index;
  }
  if (!index?.projects?.length) {
    index = await migrateLegacyProjectIfNeeded();
  }
  if (!index?.projects?.length) {
    index = await tryLoadServerProjectIndex();
  }
  if (!index) {
    index = {
      version: INDEX_VERSION,
      activeProjectId: null,
      projects: [],
    };
  }
  const currentActiveValid =
    index.activeProjectId
    && index.projects.some((p) => p.id === index.activeProjectId);
  if (!currentActiveValid) {
    const resolved = await resolveActiveProjectIdPreferringLocalBody(index);
    if (resolved && index.activeProjectId !== resolved) {
      index.activeProjectId = resolved;
      await saveProjectIndex(index);
    } else if (!resolved && index.activeProjectId) {
      index.activeProjectId = null;
      await saveProjectIndex(index);
    }
  }
  index = await repairNormalizedIndex(index);
  const integrity = await repairWorkspaceIndex(index, {
    checkServerGhosts: isServerSyncEnabled(),
  });
  return integrity.repairedIndex ?? index;
}

/** Persist which project is active (called on autosave, not only on switch) */
export async function touchActiveProjectInIndex(projectId) {
  if (!projectId) return null;
  await writeLocalActiveProjectId(projectId);
  const index = await loadProjectIndex();
  if (!index?.projects?.length) return null;
  const row = index.projects.find((p) => p.id === projectId);
  if (!row) return index;

  if (index.activeProjectId !== projectId) {
    index.activeProjectId = projectId;
    await saveProjectIndex(index);
  }
  return index;
}

export async function updateProjectMeta(projectId, name) {
  const index = await loadProjectIndex();
  if (!index) return ensureProjectIndex();
  const row = index.projects.find((p) => p.id === projectId);
  if (!row) return index;
  row.name = name?.trim() || strings.defaultProjectName;
  row.updatedAt = Date.now();
  await saveProjectIndex(index, { immediate: true });
  return index;
}

export async function setConnectedFolder(projectId, folderName) {
  const index = await loadProjectIndex();
  if (!index) return ensureProjectIndex();
  const row = index.projects.find((p) => p.id === projectId);
  if (!row) return index;
  row.connectedFolderName = folderName ?? null;
  row.updatedAt = Date.now();
  await saveProjectIndex(index);
  return index;
}

export async function setActiveProjectId(projectId) {
  await writeLocalActiveProjectId(projectId);
  const index = await ensureProjectIndex();
  index.activeProjectId = projectId;
  await saveProjectIndex(index);
  return index;
}

export async function createProject(name = strings.defaultProjectName) {
  if (createProjectInFlight) {
    return createProjectInFlight;
  }
  createProjectInFlight = createProjectBody(name).finally(() => {
    createProjectInFlight = null;
  });
  return createProjectInFlight;
}

async function createProjectBody(name = strings.defaultProjectName) {
  const index = await preserveServerResetGeneration(
    await ensureProjectIndex({ serverPull: false }),
  );
  const id = crypto.randomUUID();
  flowTrace('project:create-start', { projectId: id, name });
  const now = Date.now();
  const trimmed = uniqueProjectNameForIndex(index, name);
  index.projects.push({
    id,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
    archived: false,
    createdBy: 'user',
  });
  index.activeProjectId = id;
  await writeLocalActiveProjectId(id);
  await saveProjectIndex(index, { localOnly: true });
  const emptyState = createEmptyProjectState(trimmed);
  const saveResult = await saveProjectById(id, emptyState, [], {
    pushRemote: true,
  });
  let documentPushOk = !isServerSyncEnabled() || saveResult?.pushOk === true;
  if (isServerSyncEnabled() && !documentPushOk && !saveResult?.error) {
    const { flushOutgoingProjectDocument } = await import('./projectSync.js');
    const retry = await flushOutgoingProjectDocument(id, emptyState, {
      reason: 'createProject',
    });
    documentPushOk = retry?.ok === true;
    if (!documentPushOk) {
      const { notifyStructuralPushFailed } = await import('./actionSync.js');
      notifyStructuralPushFailed(id, retry);
    }
  }
  if (isServerSyncEnabled() && documentPushOk && !saveResult?.error) {
    await seedClientRevisionFromMeta(id);
  }
  let repaired = await repairNormalizedIndex(index);
  if (repaired === index) {
    const pushIndexToServer =
      !isServerSyncEnabled() || documentPushOk;
    await saveProjectIndex(index, { immediate: pushIndexToServer });
  }
  const integrity = await repairWorkspaceIndex(repaired, {
    checkServerGhosts: isServerSyncEnabled(),
    skipOrphanRecovery: true,
  });
  repaired = integrity.repairedIndex ?? repaired;
  const healed = await healDuplicateProjectNames(repaired, id);
  flowTrace('project:create-done', {
    projectId: id,
    documentPushOk,
    projectCount: healed.index.projects.length,
  });
  return { index: healed.index, projectId: id };
}

function pickFallbackActiveId(index, excludeId) {
  const candidate =
    index.projects.find((p) => !p.archived && p.id !== excludeId)
    || index.projects.find((p) => p.id !== excludeId);
  return candidate?.id ?? null;
}

export async function archiveProject(projectId) {
  const index = await ensureProjectIndex();
  const row = index.projects.find((p) => p.id === projectId);
  if (!row) return { index, needsSwitch: false, switchToId: null };
  row.archived = true;
  row.updatedAt = Date.now();
  let switchToId = null;
  let needsCreate = false;
  if (index.activeProjectId === projectId) {
    switchToId = pickFallbackActiveId(index, projectId);
    if (!switchToId) {
      needsCreate = true;
      index.activeProjectId = projectId;
    } else {
      index.activeProjectId = switchToId;
    }
  }
  await saveProjectIndex(index, { immediate: true });
  return {
    index,
    needsSwitch: Boolean(switchToId),
    switchToId,
    needsCreate,
  };
}

export async function unarchiveProject(projectId) {
  const index = await ensureProjectIndex();
  const row = index.projects.find((p) => p.id === projectId);
  if (!row) return index;
  row.archived = false;
  row.updatedAt = Date.now();
  await saveProjectIndex(index);
  return index;
}

export async function deleteProject(projectId) {
  flowTrace('project:delete-start', { projectId });
  const index = await ensureProjectIndex();
  const remaining = index.projects.filter((p) => p.id !== projectId);

  recordDeletedProjectId(projectId);
  try {
    await deletePreviewsForProject(projectId);
  } catch {
    /* preview store may be unavailable in some environments */
  }
  try {
    await removeFolderHandle(projectId);
  } catch {
    /* folder store may be unavailable in some environments */
  }
  try {
    clearAgentChatSessionsForProject(projectId);
  } catch {
    /* ignore */
  }

  index.projects = remaining;
  let switchToId = null;
  if (index.activeProjectId === projectId) {
    if (remaining.length === 0) {
      index.activeProjectId = null;
      switchToId = null;
    } else {
      switchToId = pickFallbackActiveId(index, projectId) || remaining[0].id;
      index.activeProjectId = switchToId;
    }
  }

  await purgeOrphanProjectBodies(index, {
    protectProjectIds: remaining.map((p) => p.id),
  });

  let repaired = index;
  const integrity = await repairWorkspaceIndex(index, {
    checkServerGhosts: isServerSyncEnabled(),
    skipOrphanRecovery: true,
    recentlyDeletedIds: [projectId],
  });
  repaired = integrity.repairedIndex ?? index;

  if (import.meta.env?.DEV) {
    const actions = integrity.actions ?? integrity.issues?.map((i) => i.type) ?? [];
    console.debug('[canvas] deleteProject', {
      projectId,
      remaining: remaining.length,
      orphanRecovered: integrity.orphanRecovered ?? 0,
      actions,
    });
  }

  await saveProjectIndex(repaired, {
    immediate: true,
    deletedProjectIds: getDeletedProjectIds(),
  });
  await deleteSyncedProjectDocument(projectId);
  flowTrace('project:delete-done', {
    projectId,
    switchToId,
    remaining: remaining.length,
  });
  return {
    ok: true,
    index: repaired,
    switchToId,
  };
}
