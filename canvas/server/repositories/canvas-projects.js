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

export async function getCanvasIndex() {
  const res = await query(
    'SELECT payload, updated_at, revision FROM canvas_workspace_index WHERE id = $1',
    [INDEX_ID],
  );
  if (!res.rows[0]) return null;
  return {
    payload: res.rows[0].payload,
    updatedAt: res.rows[0].updated_at,
    revision: Number(res.rows[0].revision) || 1,
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
    const persistedPayload = workspaceIndexForPersistence(payload, null, options);
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
  const persistedPayload = workspaceIndexForPersistence(
    payload,
    existing.rows[0].payload,
    options,
  );
  await query(
    `UPDATE canvas_workspace_index
     SET payload = $2::jsonb, updated_at = $3, revision = $4
     WHERE id = $1`,
    [INDEX_ID, JSON.stringify(persistedPayload), now, nextRevision],
  );
  return { ok: true, revision: nextRevision, updatedAt: now };
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
  await query(
    `UPDATE canvas_project_document
     SET payload = $2::jsonb, updated_at = $3, revision = $4
     WHERE project_id = $1`,
    [projectId, JSON.stringify(payload), now, nextRevision],
  );
  return { ok: true, revision: nextRevision, updatedAt: now };
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
    await query(
      `UPDATE canvas_project_document
       SET payload = $2::jsonb, updated_at = $3, revision = $4
       WHERE project_id = $1`,
      [projectId, JSON.stringify(merged), now, nextRevision],
    );
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
