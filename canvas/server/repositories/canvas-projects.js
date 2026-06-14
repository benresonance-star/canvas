import { pool, query } from '../db.js';
import { applyProjectOps, validateProjectPatchOps } from '../../src/lib/sync/projectPatchOps.js';
import { summarizePatchOps, syncTraceLog } from '../../src/lib/sync/syncTrace.js';

const INDEX_ID = 'default';

function canvasCardCount(payload) {
  return Array.isArray(payload?.cards) ? payload.cards.length : 0;
}

function projectArtifactCount(payload) {
  const dockCards = Array.isArray(payload?.stagedSyncCards)
    ? payload.stagedSyncCards.length
    : 0;
  return canvasCardCount(payload) + dockCards;
}

const LAYOUT_STRIPPED_CARD_FIELDS = [
  'content',
  'body',
  'markdown',
  'rawMarkdown',
  'html',
  'rawHtml',
  'text',
  'rawText',
  'transcript',
  'messages',
  'dataUrl',
  'previewDataUrl',
  'base64',
  'blob',
  'arrayBuffer',
  'sourceText',
  'extractedText',
  'pages',
];

function stripContentFields(record) {
  if (!record || typeof record !== 'object') return record;
  const next = { ...record };
  for (const field of LAYOUT_STRIPPED_CARD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(next, field)) {
      delete next[field];
    }
  }
  if (Array.isArray(next.versions)) {
    next.versions = next.versions.map((version) => stripContentFields(version));
  }
  if (next.currentVersion && typeof next.currentVersion === 'object') {
    next.currentVersion = stripContentFields(next.currentVersion);
  }
  return next;
}

function stripLayoutPlacementMap(artifactPlacements) {
  if (
    !artifactPlacements
    || typeof artifactPlacements !== 'object'
    || Array.isArray(artifactPlacements)
  ) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(artifactPlacements).map(([key, entry]) => [
      key,
      {
        surface: entry?.surface ?? null,
        placement: entry?.placement ?? entry?.ref ?? null,
      },
    ]),
  );
}

function emptyPayloadWouldEraseServer(payload, existingPayload, allowEmptyRemoteOverwrite) {
  return (
    !allowEmptyRemoteOverwrite
    && projectArtifactCount(payload) === 0
    && projectArtifactCount(existingPayload) > 0
  );
}

function dockOnlyPayloadWouldEraseServerCanvas(
  payload,
  existingPayload,
  allowDockOnlyRemoteOverwrite,
) {
  return (
    !allowDockOnlyRemoteOverwrite
    && canvasCardCount(payload) === 0
    && projectArtifactCount(payload) > 0
    && canvasCardCount(existingPayload) > 0
  );
}

function activeProjectIdIsValid(index, projectId) {
  return Boolean(
    projectId
    && index?.projects?.some((row) => row?.id === projectId && !row.archived),
  );
}

function fallbackActiveProjectId(index) {
  const pool = (index?.projects ?? []).filter((row) => row?.id && !row.archived);
  if (pool.length === 0) return null;
  return pool.reduce((a, b) =>
    ((a.updatedAt ?? 0) >= (b.updatedAt ?? 0) ? a : b),
  ).id;
}

function uniqueProjectIdsFromIndex(payload) {
  return [
    ...new Set(
      (payload?.projects ?? [])
        .map((row) => row?.id)
        .filter((id) => typeof id === 'string' && id.trim()),
    ),
  ];
}

export function pruneWorkspaceIndexToDocumentIds(payload, documentIds = []) {
  const docs = new Set(documentIds.filter(Boolean));
  const projects = Array.isArray(payload?.projects) ? payload.projects : [];
  const nextProjects = projects.filter((row) => row?.id && docs.has(row.id));
  const removedProjectIds = projects
    .filter((row) => row?.id && !docs.has(row.id))
    .map((row) => row.id);
  const nextPayload = {
    ...payload,
    projects: nextProjects,
  };
  if (!activeProjectIdIsValid(nextPayload, nextPayload.activeProjectId)) {
    nextPayload.activeProjectId = fallbackActiveProjectId(nextPayload);
  }
  return {
    payload: nextPayload,
    removedProjectIds,
  };
}

async function existingDocumentIdsForIndex(payload) {
  const ids = uniqueProjectIdsFromIndex(payload);
  if (ids.length === 0) return [];
  const res = await query(
    'SELECT project_id FROM canvas_project_document WHERE project_id = ANY($1::text[])',
    [ids],
  );
  return res.rows.map((row) => row.project_id).filter(Boolean);
}

async function pruneWorkspaceIndexAgainstDocuments(payload) {
  const ids = uniqueProjectIdsFromIndex(payload);
  if (ids.length === 0) {
    return { payload: { ...payload, projects: [] }, removedProjectIds: [] };
  }
  const documentIds = await existingDocumentIdsForIndex(payload);
  return pruneWorkspaceIndexToDocumentIds(payload, documentIds);
}

async function repairWorkspaceIndexAgainstDocuments(row) {
  const currentRevision = Number(row.revision) || 1;
  const pruned = await pruneWorkspaceIndexAgainstDocuments(row.payload);
  if (pruned.removedProjectIds.length === 0) {
    return {
      payload: row.payload,
      updatedAt: row.updated_at,
      revision: currentRevision,
      removedProjectIds: [],
    };
  }

  const now = new Date().toISOString();
  const update = await query(
    `UPDATE canvas_workspace_index
     SET payload = $2::jsonb, updated_at = $3, revision = revision + 1
     WHERE id = $1 AND revision = $4
     RETURNING updated_at, revision`,
    [INDEX_ID, JSON.stringify(pruned.payload), now, currentRevision],
  );
  return {
    payload: pruned.payload,
    updatedAt: update.rows[0]?.updated_at ?? now,
    revision: Number(update.rows[0]?.revision) || currentRevision + 1,
    removedProjectIds: pruned.removedProjectIds,
  };
}

function workspaceIndexForPersistence(
  nextPayload,
  existingPayload = null,
  { deletedProjectIds = [] } = {},
) {
  const deleted = new Set(deletedProjectIds.filter(Boolean));
  const next = {
    ...nextPayload,
    projects: nextPayload?.projects ?? [],
  };
  if (existingPayload?.projects?.length) {
    const byId = new Map(next.projects.map((row) => [row.id, row]));
    for (const row of existingPayload.projects) {
      if (!row?.id || byId.has(row.id) || deleted.has(row.id)) continue;
      byId.set(row.id, row);
    }
    next.projects = [...byId.values()];
  }
  const existingActive = existingPayload?.activeProjectId ?? null;
  if (activeProjectIdIsValid(next, existingActive)) {
    return { ...next, activeProjectId: existingActive };
  }
  const nextActive = next.activeProjectId ?? null;
  if (activeProjectIdIsValid(next, nextActive)) {
    return next;
  }
  return { ...next, activeProjectId: fallbackActiveProjectId(next) };
}

function timestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function removeRowsStaleAfterExplicitEmptyIndex(nextPayload, existingRow) {
  const projects = Array.isArray(nextPayload?.projects) ? nextPayload.projects : [];
  const existingProjects = existingRow?.payload?.projects;
  const resetGenerationMs = timestampMs(existingRow?.payload?.resetAt);
  const emptyIndexMs = resetGenerationMs > 0
    ? resetGenerationMs
    : timestampMs(existingRow?.updated_at);
  if (
    projects.length === 0
    || !Array.isArray(existingProjects)
    || existingProjects.length !== 0
    || emptyIndexMs <= 0
  ) {
    return { payload: nextPayload, removedProjectIds: [] };
  }

  const freshProjects = [];
  const removedProjectIds = [];
  for (const row of projects) {
    const rowMs = timestampMs(row?.updatedAt ?? row?.createdAt);
    if (row?.id && rowMs > emptyIndexMs) {
      freshProjects.push(row);
    } else if (row?.id) {
      removedProjectIds.push(row.id);
    }
  }

  if (removedProjectIds.length === 0) {
    return { payload: nextPayload, removedProjectIds };
  }

  const payload = {
    ...nextPayload,
    projects: freshProjects,
  };
  if (!activeProjectIdIsValid(payload, payload.activeProjectId)) {
    payload.activeProjectId = fallbackActiveProjectId(payload);
  }
  return { payload, removedProjectIds };
}

function keepExplicitResetGeneration(nextPayload, existingRow) {
  const existingResetAt = existingRow?.payload?.resetAt;
  if (
    typeof existingResetAt !== 'string'
    || !existingResetAt
    || nextPayload?.resetAt === existingResetAt
  ) {
    return { payload: nextPayload, removedProjectIds: [] };
  }

  return {
    payload: {
      ...existingRow.payload,
      activeProjectId: null,
      projects: [],
    },
    removedProjectIds: uniqueProjectIdsFromIndex(nextPayload),
  };
}

export async function getCanvasIndex() {
  const res = await query(
    'SELECT payload, updated_at, revision FROM canvas_workspace_index WHERE id = $1',
    [INDEX_ID],
  );
  if (!res.rows[0]) return null;
  const repaired = await repairWorkspaceIndexAgainstDocuments(res.rows[0]);
  return {
    payload: repaired.payload,
    updatedAt: repaired.updatedAt,
    revision: repaired.revision,
    removedProjectIds: repaired.removedProjectIds,
  };
}

/**
 * @param {object} payload
 * @param {number} expectedRevision — 0 for create-if-absent
 */
export async function putCanvasIndex(payload, expectedRevision = 0, options = {}) {
  const expected = Number(expectedRevision);
  if (!Number.isFinite(expected) || expected < 0) {
    throw new Error('expectedRevision must be a non-negative number');
  }

  const existing = await query(
    'SELECT revision, payload, updated_at FROM canvas_workspace_index WHERE id = $1',
    [INDEX_ID],
  );
  const now = new Date().toISOString();

  if (!existing.rows[0]) {
    if (expected > 0) {
      return {
        ok: false,
        conflict: true,
        revision: 0,
        payload: null,
        updatedAt: null,
      };
    }
    let persistedPayload = workspaceIndexForPersistence(payload, null, options);
    if (options.enforceDocumentIntegrity) {
      persistedPayload = (await pruneWorkspaceIndexAgainstDocuments(persistedPayload)).payload;
    }
    await query(
      `INSERT INTO canvas_workspace_index (id, payload, updated_at, revision)
       VALUES ($1, $2::jsonb, $3, 1)`,
      [INDEX_ID, JSON.stringify(persistedPayload), now],
    );
    return { ok: true, revision: 1, updatedAt: now };
  }

  const currentRevision = Number(existing.rows[0].revision) || 1;
  if (expected !== currentRevision) {
    return {
      ok: false,
      conflict: true,
      revision: currentRevision,
      payload: existing.rows[0].payload,
      updatedAt: existing.rows[0].updated_at,
    };
  }

  const nextRevision = currentRevision + 1;
  let persistedPayload = workspaceIndexForPersistence(
    payload,
    existing.rows[0].payload,
    options,
  );
  const resetGeneration = keepExplicitResetGeneration(
    persistedPayload,
    existing.rows[0],
  );
  persistedPayload = resetGeneration.payload;
  const staleLocalRows = removeRowsStaleAfterExplicitEmptyIndex(
    persistedPayload,
    existing.rows[0],
  );
  persistedPayload = staleLocalRows.payload;
  if (options.enforceDocumentIntegrity) {
    persistedPayload = (await pruneWorkspaceIndexAgainstDocuments(persistedPayload)).payload;
  }
  const removedProjectIds = [
    ...new Set([
      ...resetGeneration.removedProjectIds,
      ...staleLocalRows.removedProjectIds,
    ]),
  ];
  if (removedProjectIds.length > 0) {
    await query(
      'DELETE FROM canvas_project_document WHERE project_id = ANY($1::text[])',
      [removedProjectIds],
    );
  }
  const updated = await query(
    `UPDATE canvas_workspace_index
     SET payload = $2::jsonb, updated_at = $3, revision = $4
     WHERE id = $1 AND revision = $5
     RETURNING updated_at, revision`,
    [INDEX_ID, JSON.stringify(persistedPayload), now, nextRevision, currentRevision],
  );
  if (!updated.rows[0]) {
    const current = await query(
      'SELECT revision, payload, updated_at FROM canvas_workspace_index WHERE id = $1',
      [INDEX_ID],
    );
    const row = current.rows[0];
    return {
      ok: false,
      conflict: true,
      revision: Number(row?.revision) || currentRevision,
      payload: row?.payload ?? existing.rows[0].payload,
      updatedAt: row?.updated_at ?? existing.rows[0].updated_at,
    };
  }
  return {
    ok: true,
    revision: Number(updated.rows[0].revision) || nextRevision,
    updatedAt: updated.rows[0].updated_at ?? now,
  };
}

/**
 * Insert project document and ensure workspace index lists the project (single transaction).
 * @param {string} projectId
 * @param {object} projectPayload
 * @param {object} indexPayload — full workspace index JSON (must include projectId in projects)
 */
export async function createCanvasProjectWithIndex(projectId, projectPayload, indexPayload) {
  const client = await pool.connect();
  const now = new Date().toISOString();
  try {
    await client.query('BEGIN');
    const indexRow = await client.query(
      'SELECT revision FROM canvas_workspace_index WHERE id = $1 FOR UPDATE',
      [INDEX_ID],
    );
    const docExists = await client.query(
      'SELECT 1 FROM canvas_project_document WHERE project_id = $1',
      [projectId],
    );
    if (docExists.rows[0]) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'project_exists' };
    }
    await client.query(
      `INSERT INTO canvas_project_document (project_id, payload, updated_at, revision)
       VALUES ($1, $2::jsonb, $3, 1)`,
      [projectId, JSON.stringify(projectPayload), now],
    );
    if (!indexRow.rows[0]) {
      await client.query(
        `INSERT INTO canvas_workspace_index (id, payload, updated_at, revision)
         VALUES ($1, $2::jsonb, $3, 1)`,
        [INDEX_ID, JSON.stringify(indexPayload), now],
      );
    } else {
      const nextRev = Number(indexRow.rows[0].revision) + 1;
      await client.query(
        `UPDATE canvas_workspace_index
         SET payload = $2::jsonb, updated_at = $3, revision = $4
         WHERE id = $1`,
        [INDEX_ID, JSON.stringify(indexPayload), now, nextRev],
      );
    }
    await client.query('COMMIT');
    return { ok: true, revision: 1, updatedAt: now };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getCanvasProjectMeta(projectId) {
  const res = await query(
    'SELECT revision, updated_at FROM canvas_project_document WHERE project_id = $1',
    [projectId],
  );
  if (!res.rows[0]) return null;
  return {
    revision: Number(res.rows[0].revision),
    updatedAt: res.rows[0].updated_at,
  };
}

export async function getCanvasProject(projectId) {
  const res = await query(
    'SELECT payload, updated_at, revision FROM canvas_project_document WHERE project_id = $1',
    [projectId],
  );
  if (!res.rows[0]) return null;
  return {
    payload: res.rows[0].payload,
    updatedAt: res.rows[0].updated_at,
    revision: Number(res.rows[0].revision),
  };
}

export function buildCanvasProjectLayoutDocument(projectId, row) {
  const payload = row?.payload ?? {};
  const cards = Array.isArray(payload.cards) ? payload.cards.map(stripContentFields) : [];
  const stagedSyncCards = Array.isArray(payload.stagedSyncCards)
    ? payload.stagedSyncCards.map(stripContentFields)
    : [];
  const artifactPlacements = stripLayoutPlacementMap(payload.artifactPlacements);
  return {
    projectId,
    projectName: payload.projectName ?? null,
    revision: Number(row?.revision) || 0,
    updatedAt: row?.updatedAt ?? row?.updated_at ?? null,
    layout: {
      cards,
      stagedSyncCards,
      artifactPlacements,
      artifactPlacementsVersion: Number(payload.artifactPlacementsVersion) || 0,
      canvasView: payload.canvasView ?? null,
      suppressedSyncKeys: Array.isArray(payload.suppressedSyncKeys)
        ? payload.suppressedSyncKeys
        : [],
    },
    counts: {
      cards: cards.length,
      stagedSyncCards: stagedSyncCards.length,
      artifactPlacements: Object.keys(artifactPlacements).length,
      totalArtifacts: cards.length + stagedSyncCards.length,
    },
  };
}

export async function getCanvasProjectLayout(projectId) {
  const row = await getCanvasProject(projectId);
  if (!row) return null;
  return buildCanvasProjectLayoutDocument(projectId, row);
}

/**
 * Canonical project rename — workspace index only (canvas_workspace_index.payload).
 */
export async function setWorkspaceProjectName(projectId, projectName) {
  const trimmed = typeof projectName === 'string' ? projectName.trim() : '';
  if (!trimmed) return { ok: false, reason: 'empty_name' };

  const indexRow = await getCanvasIndex();
  if (!indexRow?.payload?.projects?.length) {
    return { ok: false, reason: 'no_index' };
  }

  const row = indexRow.payload.projects.find((p) => p.id === projectId);
  if (!row) return { ok: false, reason: 'no_row' };
  if (row.name === trimmed) return { ok: true, unchanged: true };

  row.name = trimmed;
  row.updatedAt = Date.now();
  const result = await putCanvasIndex(indexRow.payload, indexRow.revision);
  return result.ok
    ? { ok: true, revision: result.revision, updatedAt: result.updatedAt }
    : { ok: false, conflict: true, revision: result.revision };
}

/** @deprecated Use setWorkspaceProjectName — documents must not drive index names. */
export async function syncIndexProjectName(projectId, projectName) {
  const result = await setWorkspaceProjectName(projectId, projectName);
  return Boolean(result.ok);
}

/**
 * @param {string} projectId
 * @param {object} payload
 * @param {number} expectedRevision — client must match current row revision (use 0 for create-if-absent)
 * @returns {Promise<{ ok: true, revision: number, updatedAt: string } | { ok: false, conflict: true, revision: number, payload: object | null, updatedAt: string | null }>}
 */
export async function putCanvasProject(
  projectId,
  payload,
  expectedRevision,
  {
    allowEmptyRemoteOverwrite = false,
    allowDockOnlyRemoteOverwrite = false,
  } = {},
) {
  const expected = Number(expectedRevision);
  if (!Number.isFinite(expected) || expected < 0) {
    throw new Error('expectedRevision must be a non-negative number');
  }

  const existing = await query(
    'SELECT revision, payload, updated_at FROM canvas_project_document WHERE project_id = $1',
    [projectId],
  );
  const now = new Date().toISOString();

  if (!existing.rows[0]) {
    if (expected > 0) {
      return {
        ok: false,
        conflict: true,
        revision: 0,
        payload: null,
        updatedAt: null,
      };
    }
    const inserted = await query(
      `INSERT INTO canvas_project_document (project_id, payload, updated_at, revision)
       VALUES ($1, $2::jsonb, $3, 1)
       ON CONFLICT (project_id) DO NOTHING
       RETURNING revision, updated_at`,
      [projectId, JSON.stringify(payload), now],
    );
    if (!inserted.rows[0]) {
      const current = await query(
        'SELECT revision, payload, updated_at FROM canvas_project_document WHERE project_id = $1',
        [projectId],
      );
      const row = current.rows[0];
      return {
        ok: false,
        conflict: true,
        revision: Number(row?.revision) || 0,
        payload: row?.payload ?? null,
        updatedAt: row?.updated_at ?? null,
      };
    }
    return { ok: true, revision: 1, updatedAt: now };
  }

  const currentRevision = Number(existing.rows[0].revision);
  if (expected !== currentRevision) {
    return {
      ok: false,
      conflict: true,
      revision: currentRevision,
      payload: existing.rows[0].payload,
      updatedAt: existing.rows[0].updated_at,
    };
  }

  if (emptyPayloadWouldEraseServer(
    payload,
    existing.rows[0].payload,
    allowEmptyRemoteOverwrite,
  )) {
    return {
      ok: false,
      conflict: true,
      reason: 'empty_would_erase_server_cards',
      revision: currentRevision,
      payload: existing.rows[0].payload,
      updatedAt: existing.rows[0].updated_at,
    };
  }

  if (dockOnlyPayloadWouldEraseServerCanvas(
    payload,
    existing.rows[0].payload,
    allowDockOnlyRemoteOverwrite,
  )) {
    return {
      ok: false,
      conflict: true,
      reason: 'dock_only_would_erase_server_canvas',
      revision: currentRevision,
      payload: existing.rows[0].payload,
      updatedAt: existing.rows[0].updated_at,
    };
  }

  const nextRevision = currentRevision + 1;
  const updated = await query(
    `UPDATE canvas_project_document
     SET payload = $2::jsonb, updated_at = $3, revision = $4
     WHERE project_id = $1 AND revision = $5
     RETURNING revision, updated_at`,
    [projectId, JSON.stringify(payload), now, nextRevision, currentRevision],
  );
  if (!updated.rows[0]) {
    const current = await query(
      'SELECT revision, payload, updated_at FROM canvas_project_document WHERE project_id = $1',
      [projectId],
    );
    const row = current.rows[0];
    return {
      ok: false,
      conflict: true,
      revision: Number(row?.revision) || currentRevision,
      payload: row?.payload ?? existing.rows[0].payload,
      updatedAt: row?.updated_at ?? existing.rows[0].updated_at,
    };
  }
  return {
    ok: true,
    revision: Number(updated.rows[0].revision) || nextRevision,
    updatedAt: updated.rows[0].updated_at ?? now,
  };
}

/**
 * @param {string} projectId
 * @param {{ expectedRevision: number, ops: object[] }} patch
 * @returns {Promise<
 *   | { ok: true, revision: number, updatedAt: string, payload: object }
 *   | { ok: false, conflict: true, revision: number, payload: object | null, updatedAt: string | null, reason?: string }
 * >}
 */
export async function patchCanvasProject(
  projectId,
  {
    expectedRevision,
    ops,
    traceId = null,
    allowEmptyRemoteOverwrite = false,
    allowDockOnlyRemoteOverwrite = false,
  },
) {
  const expected = Number(expectedRevision);
  if (!Number.isFinite(expected) || expected < 0) {
    throw new Error('expectedRevision must be a non-negative number');
  }
  syncTraceLog(traceId, 'db:patch-start', {
    projectId,
    expectedRevision: expected,
    ...summarizePatchOps(ops),
  });
  const validated = validateProjectPatchOps(ops);
  if (!validated.ok) {
    syncTraceLog(traceId, 'db:patch-invalid', { projectId, reason: validated.reason });
    return {
      ok: false,
      conflict: true,
      revision: 0,
      payload: null,
      updatedAt: null,
      reason: validated.reason,
    };
  }

  const existing = await query(
    'SELECT revision, payload, updated_at FROM canvas_project_document WHERE project_id = $1',
    [projectId],
  );
  const now = new Date().toISOString();

  if (!existing.rows[0]) {
    if (expected > 0) {
      return {
        ok: false,
        conflict: true,
        revision: 0,
        payload: null,
        updatedAt: null,
      };
    }
    const created = applyProjectOps({}, ops);
    syncTraceLog(traceId, 'db:patch-insert', { projectId });
    const inserted = await query(
      `INSERT INTO canvas_project_document (project_id, payload, updated_at, revision)
       VALUES ($1, $2::jsonb, $3, 1)
       ON CONFLICT (project_id) DO NOTHING
       RETURNING revision, updated_at`,
      [projectId, JSON.stringify(created), now],
    );
    if (!inserted.rows[0]) {
      const current = await query(
        'SELECT revision, payload, updated_at FROM canvas_project_document WHERE project_id = $1',
        [projectId],
      );
      const row = current.rows[0];
      return {
        ok: false,
        conflict: true,
        revision: Number(row?.revision) || 0,
        payload: row?.payload ?? null,
        updatedAt: row?.updated_at ?? null,
      };
    }
    syncTraceLog(traceId, 'db:patch-ok', { projectId, revision: 1, cardCount: (created.cards ?? []).length });
    for (const op of ops) {
      if (op?.op === 'setProjectName' && typeof op.projectName === 'string') {
        try {
          await setWorkspaceProjectName(projectId, op.projectName);
        } catch (e) {
          console.warn(`Could not set workspace name for project ${projectId}:`, e.message);
        }
        break;
      }
    }
    return { ok: true, revision: 1, updatedAt: now, payload: created };
  }

  const currentRevision = Number(existing.rows[0].revision);
  if (expected !== currentRevision) {
    syncTraceLog(traceId, 'db:patch-conflict', {
      projectId,
      expected,
      currentRevision,
    });
    return {
      ok: false,
      conflict: true,
      revision: currentRevision,
      payload: existing.rows[0].payload,
      updatedAt: existing.rows[0].updated_at,
    };
  }

  const merged = applyProjectOps(existing.rows[0].payload, ops);
  if (emptyPayloadWouldEraseServer(
    merged,
    existing.rows[0].payload,
    allowEmptyRemoteOverwrite,
  )) {
    syncTraceLog(traceId, 'db:patch-reject-empty-overwrite', {
      projectId,
      currentRevision,
    });
    return {
      ok: false,
      conflict: true,
      revision: currentRevision,
      payload: existing.rows[0].payload,
      updatedAt: existing.rows[0].updated_at,
      reason: 'empty_would_erase_server_cards',
    };
  }

  if (dockOnlyPayloadWouldEraseServerCanvas(
    merged,
    existing.rows[0].payload,
    allowDockOnlyRemoteOverwrite,
  )) {
    syncTraceLog(traceId, 'db:patch-reject-dock-only-overwrite', {
      projectId,
      currentRevision,
    });
    return {
      ok: false,
      conflict: true,
      revision: currentRevision,
      payload: existing.rows[0].payload,
      updatedAt: existing.rows[0].updated_at,
      reason: 'dock_only_would_erase_server_canvas',
    };
  }
  const nextRevision = currentRevision + 1;
  syncTraceLog(traceId, 'db:patch-update', { projectId, nextRevision });
  try {
    const updated = await query(
      `UPDATE canvas_project_document
       SET payload = $2::jsonb, updated_at = $3, revision = $4
       WHERE project_id = $1 AND revision = $5
       RETURNING revision, updated_at`,
      [projectId, JSON.stringify(merged), now, nextRevision, currentRevision],
    );
    if (!updated.rows[0]) {
      const current = await query(
        'SELECT revision, payload, updated_at FROM canvas_project_document WHERE project_id = $1',
        [projectId],
      );
      const row = current.rows[0];
      syncTraceLog(traceId, 'db:patch-conflict', {
        projectId,
        expected,
        currentRevision: Number(row?.revision) || currentRevision,
      });
      return {
        ok: false,
        conflict: true,
        revision: Number(row?.revision) || currentRevision,
        payload: row?.payload ?? existing.rows[0].payload,
        updatedAt: row?.updated_at ?? existing.rows[0].updated_at,
      };
    }
  } catch (e) {
    syncTraceLog(traceId, 'db:patch-error', { projectId, error: e.message });
    throw e;
  }
  syncTraceLog(traceId, 'db:patch-ok', {
    projectId,
    revision: nextRevision,
    cardCount: (merged.cards ?? []).length,
  });
  for (const op of ops) {
    if (op?.op === 'setProjectName' && typeof op.projectName === 'string') {
      try {
        await setWorkspaceProjectName(projectId, op.projectName);
      } catch (e) {
        console.warn(`Could not set workspace name for project ${projectId}:`, e.message);
      }
      break;
    }
  }
  return {
    ok: true,
    revision: nextRevision,
    updatedAt: now,
    payload: merged,
  };
}

export async function deleteCanvasProject(projectId) {
  await query('DELETE FROM canvas_project_document WHERE project_id = $1', [projectId]);
}
