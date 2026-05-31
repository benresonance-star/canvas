/**
 * Pure workspace index normalization (no projectSync imports).
 */

import { strings } from '../content/strings.js';

export function normalizeProjectNameKey(name) {
  return (name?.trim() || '').toLowerCase();
}

/**
 * @param {object[]} projects
 */
export function dedupeProjectsById(projects) {
  const byId = new Map();
  for (const row of projects ?? []) {
    if (!row?.id) continue;
    const existing = byId.get(row.id);
    if (!existing || (row.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

/**
 * @param {object} a
 * @param {object} b
 * @param {string | null | undefined} activeProjectId
 */
export function pickPreferredProjectRow(a, b, activeProjectId) {
  if (activeProjectId) {
    if (a.id === activeProjectId && b.id !== activeProjectId) return a;
    if (b.id === activeProjectId && a.id !== activeProjectId) return b;
  }
  return (a.updatedAt ?? 0) >= (b.updatedAt ?? 0) ? a : b;
}

/**
 * @param {object[]} projects
 * @param {{ activeProjectId?: string | null }} [options]
 * @returns {{ projects: object[], removedIds: string[] }}
 */
export function collapseDuplicateProjectNames(projects, { activeProjectId = null } = {}) {
  const deduped = dedupeProjectsById(projects);
  const byName = new Map();
  const removedIds = [];

  for (const row of deduped) {
    const key = normalizeProjectNameKey(row.name);
    if (!key) {
      byName.set(`__id:${row.id}`, row);
      continue;
    }
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, row);
      continue;
    }
    const keep = pickPreferredProjectRow(existing, row, activeProjectId);
    const drop = keep.id === existing.id ? row : existing;
    byName.set(key, keep);
    removedIds.push(drop.id);
  }

  return { projects: [...byName.values()], removedIds };
}

function resolveActiveProjectIdFromIndex(index) {
  if (
    index?.activeProjectId
    && index.projects?.some((p) => p.id === index.activeProjectId)
  ) {
    return index.activeProjectId;
  }
  const pool = (index?.projects ?? []).filter((p) => !p.archived);
  const list = pool.length > 0 ? pool : (index?.projects ?? []);
  if (list.length === 0) return null;
  return list.reduce((a, b) =>
    ((a.updatedAt ?? 0) >= (b.updatedAt ?? 0) ? a : b),
  ).id;
}

/**
 * Safe index normalization: dedupe by project id only (never merge same display name).
 * @param {object | null | undefined} index
 * @returns {{ index: object | null, removedIds: string[] }}
 */
export function normalizeWorkspaceIndex(index) {
  if (!index?.projects?.length) {
    return { index: index ?? null, removedIds: [] };
  }

  const projects = dedupeProjectsById(index.projects);
  const resolvedActive = resolveActiveProjectIdFromIndex({
    ...index,
    projects,
  });

  return {
    index: {
      ...index,
      projects,
      activeProjectId: resolvedActive,
    },
    removedIds: [],
  };
}

/**
 * Explicit same-name merge (user-confirmed flows only). Not used on boot or create.
 * @param {object | null | undefined} index
 * @returns {{ index: object | null, removedIds: string[] }}
 */
/**
 * Non-archived projects sharing the same normalized display name.
 * @param {object[]} projects
 * @returns {{ name: string, count: number, ids: string[] }[]}
 */
export function findDuplicateDisplayNameGroups(projects) {
  const byName = new Map();
  for (const row of projects ?? []) {
    if (!row?.id || row.archived) continue;
    const key = normalizeProjectNameKey(row.name);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(row);
    byName.set(key, list);
  }
  const groups = [];
  for (const rows of byName.values()) {
    if (rows.length < 2) continue;
    groups.push({
      name: rows[0].name?.trim() || strings.defaultProjectName,
      count: rows.length,
      ids: rows.map((r) => r.id),
    });
  }
  return groups;
}

export function collapseDuplicateProjectNamesInIndex(index) {
  if (!index?.projects?.length) {
    return { index: index ?? null, removedIds: [] };
  }

  const activeProjectId = index.activeProjectId ?? null;
  const { projects, removedIds } = collapseDuplicateProjectNames(
    index.projects,
    { activeProjectId },
  );
  const resolvedActive = resolveActiveProjectIdFromIndex({
    ...index,
    projects,
  });

  return {
    index: {
      ...index,
      projects,
      activeProjectId: resolvedActive,
    },
    removedIds,
  };
}
