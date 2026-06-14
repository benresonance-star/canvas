import { canonicalKeyForEntry } from '../artifactPlacement.js';
import { strings } from '../../content/strings.js';
import { isDefaultProjectDisplayName } from '../projectReconcile.js';
import { isDeletedProjectId } from '../projectDeletionTombstones.js';
import { normalizeWorkspaceIndex } from '../projectIndexNormalize.js';

export const RECONCILE_SCOPE_RANK = { none: 0, active: 1, all: 2 };

export function mergeIndexPullOptions(prev, next) {
  if (!prev) return { ...next };
  const prevRank = RECONCILE_SCOPE_RANK[prev.reconcileScope ?? 'active'] ?? 1;
  const nextRank = RECONCILE_SCOPE_RANK[next.reconcileScope ?? 'active'] ?? 1;
  const reconcileScope =
    nextRank > prevRank ? (next.reconcileScope ?? 'active') : (prev.reconcileScope ?? 'active');
  const skipA = prev.skipProjectIds instanceof Set ? prev.skipProjectIds : new Set();
  const skipB = next.skipProjectIds instanceof Set ? next.skipProjectIds : new Set();
  return {
    ...prev,
    ...next,
    reconcileScope,
    skipProjectIds: new Set([...skipA, ...skipB]),
    activeProjectId: next.activeProjectId ?? prev.activeProjectId,
    adoptDocumentNameFor: next.adoptDocumentNameFor ?? prev.adoptDocumentNameFor,
  };
}

/** @param {string | null | undefined} updatedAt */
export function parseServerUpdatedAt(updatedAt) {
  if (!updatedAt) return 0;
  const ms = Date.parse(updatedAt);
  return Number.isFinite(ms) ? ms : 0;
}

/** @param {object | null | undefined} doc */
export function projectCardCount(doc) {
  return Array.isArray(doc?.cards) ? doc.cards.length : 0;
}

/**
 * Lightweight structural fingerprint for project JSON (canvas layout, not blob content).
 * @param {object | null | undefined} doc
 */
function placementKeysFromDoc(doc) {
  const canvasKeys = (doc?.cards ?? [])
    .map((c) => canonicalKeyForEntry(c))
    .filter(Boolean)
    .sort();
  const dockKeys = (doc?.stagedSyncCards ?? [])
    .map((s) => canonicalKeyForEntry(s))
    .filter(Boolean)
    .sort();
  return { canvasKeys, dockKeys };
}

export function projectPayloadFingerprint(doc) {
  if (!doc) return '';
  const cards = (doc.cards ?? [])
    .map((c) => {
      const x = Math.round((c.x ?? 0) * 10) / 10;
      const y = Math.round((c.y ?? 0) * 10) / 10;
      return `${c.id}:${x},${y},${c.pinnedVersion ?? 1}`;
    })
    .sort();
  const view = doc.canvasView ?? {};
  const { canvasKeys, dockKeys } = placementKeysFromDoc(doc);
  return JSON.stringify({
    cards,
    view: [
      Math.round((view.x ?? 0) * 10) / 10,
      Math.round((view.y ?? 0) * 10) / 10,
      Math.round((view.zoom ?? 1) * 1000) / 1000,
    ],
    staged: (doc.stagedSyncCards ?? []).length,
    placementCanvas: canvasKeys,
    placementDock: dockKeys,
    name: doc.projectName ?? '',
  });
}

/** @param {object | null | undefined} a @param {object | null | undefined} b */
export function payloadsEquivalent(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return projectPayloadFingerprint(a) === projectPayloadFingerprint(b);
}

function pickMergedMetaField(field, local, server) {
  const localVal = local[field];
  const serverVal = server[field];
  if (localVal === serverVal) return localVal;
  const localAt = local.updatedAt ?? 0;
  const serverAt = server.updatedAt ?? 0;
  if (localAt > serverAt) return localVal;
  if (serverAt > localAt) return serverVal;
  return serverVal;
}

function pickMergedProjectDisplayName(local, server) {
  const defaultName = strings.defaultProjectName;
  const localName = local.name?.trim() ?? '';
  const serverName = server.name?.trim() ?? '';
  const localDefault = isDefaultProjectDisplayName(localName, defaultName);
  const serverDefault = isDefaultProjectDisplayName(serverName, defaultName);
  if (!localDefault && serverDefault) return localName;
  if (localDefault && !serverDefault) return serverName;
  return pickMergedMetaField('name', local, server);
}

/** Merge two index rows for the same project id (field-level metadata). */
export function mergeProjectRow(local, server) {
  const localAt = local.updatedAt ?? 0;
  const serverAt = server.updatedAt ?? 0;
  const localDocRev = local.documentRevision ?? 0;
  const serverDocRev = server.documentRevision ?? 0;
  const merged = {
    id: local.id,
    name: pickMergedProjectDisplayName(local, server),
    archived: pickMergedMetaField('archived', local, server),
    connectedFolderName: pickMergedMetaField('connectedFolderName', local, server),
    createdAt: Math.min(
      local.createdAt ?? localAt,
      server.createdAt ?? serverAt,
    ),
    updatedAt: Math.max(localAt, serverAt),
  };
  if (serverDocRev > localDocRev) {
    merged.documentRevision = server.documentRevision;
    merged.documentUpdatedAt = server.documentUpdatedAt;
  } else if (localDocRev > serverDocRev) {
    merged.documentRevision = local.documentRevision;
    merged.documentUpdatedAt = local.documentUpdatedAt;
  } else if (server.documentUpdatedAt || local.documentUpdatedAt) {
    const localMs = parseServerUpdatedAt(local.documentUpdatedAt);
    const serverMs = parseServerUpdatedAt(server.documentUpdatedAt);
    merged.documentUpdatedAt =
      serverMs >= localMs ? server.documentUpdatedAt : local.documentUpdatedAt;
  }
  return merged;
}

/**
 * Re-insert local index rows that have card content but were dropped from merge.
 * @param {object} mergedIndex
 * @param {object | null | undefined} localIndex
 * @param {string[]} preserveIds
 */
export function preserveMergedLocalRowsWithCards(mergedIndex, localIndex, preserveIds) {
  if (!preserveIds.length || !mergedIndex?.projects) return mergedIndex;
  const byId = new Map(mergedIndex.projects.map((p) => [p.id, p]));
  let changed = false;
  for (const id of preserveIds) {
    if (isDeletedProjectId(id)) continue;
    if (byId.has(id)) continue;
    const localRow = localIndex?.projects?.find((p) => p.id === id);
    if (!localRow) continue;
    byId.set(id, { ...localRow });
    changed = true;
  }
  if (!changed) return mergedIndex;
  return {
    ...mergedIndex,
    projects: [...byId.values()],
  };
}

/**
 * Union local and server project indices; prefer newer row per id.
 * @param {object} localIndex
 * @param {object} serverIndex
 * @param {{ preferServerActive?: boolean }} [options]
 */
export function mergeProjectIndices(localIndex, serverIndex, options = {}) {
  const { preferServerActive = false } = options;
  const localProjects = localIndex?.projects ?? [];
  const serverProjects = serverIndex?.projects ?? [];
  const localIds = new Set(localProjects.map((p) => p.id));
  const serverIds = new Set(serverProjects.map((p) => p.id));
  const localById = new Map(localProjects.map((p) => [p.id, p]));
  const serverById = new Map(serverProjects.map((p) => [p.id, p]));
  const byId = new Map();

  for (const id of new Set([...localIds, ...serverIds])) {
    if (isDeletedProjectId(id)) continue;
    const local = localById.get(id);
    const server = serverById.get(id);
    if (local && server) {
      byId.set(id, mergeProjectRow(local, server));
    } else {
      byId.set(id, { ...(local ?? server) });
    }
  }

  const projects = [...byId.values()];
  const localOnlyIds = localProjects.filter((p) => !serverIds.has(p.id)).map((p) => p.id);
  const serverOnlyIds = serverProjects.filter((p) => !localIds.has(p.id)).map((p) => p.id);

  const version = localIndex?.version ?? serverIndex?.version ?? 1;
  const resetAt = typeof serverIndex?.resetAt === 'string'
    ? serverIndex.resetAt
    : localIndex?.resetAt;
  let activeProjectId = null;
  const localActive = localIndex?.activeProjectId;
  const serverActive = serverIndex?.activeProjectId;
  // Local tab selection wins over server index.activeProjectId (stale cross-tab).
  if (localActive && byId.has(localActive)) {
    activeProjectId = localActive;
  } else if (preferServerActive && serverActive && byId.has(serverActive)) {
    activeProjectId = serverActive;
  } else if (serverActive && byId.has(serverActive)) {
    activeProjectId = serverActive;
  } else if (projects.length > 0) {
    const pool = projects.filter((p) => !p.archived);
    const list = pool.length > 0 ? pool : projects;
    activeProjectId = list.reduce((a, b) =>
      (a.updatedAt ?? 0) >= (b.updatedAt ?? 0) ? a : b,
    ).id;
  }

  const merged =
    localProjects.length > 0
    && serverProjects.length > 0
    && (localOnlyIds.length > 0 || serverOnlyIds.length > 0 || projects.length > Math.max(
      localProjects.length,
      serverProjects.length,
    ));

  const normalizedIndex = normalizeWorkspaceIndex({
    version,
    activeProjectId,
    projects,
    ...(typeof resetAt === 'string' && resetAt ? { resetAt } : {}),
  }).index;

  return {
    index: normalizedIndex,
    merged,
    localOnlyIds,
    serverOnlyIds,
  };
}

export function projectIndexSignature(index) {
  if (!index?.projects) return '';
  return index.projects
    .map((p) => `${p.id}\t${p.name}\t${p.updatedAt ?? 0}\t${p.archived ? 1 : 0}`)
    .sort()
    .join('\n');
}

export function indexProjectIdSignature(index) {
  return (index?.projects ?? [])
    .map((p) => p.id)
    .sort()
    .join('\n');
}
