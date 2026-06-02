import { pool, query } from '../db.js';
import { applyProjectOps, validateProjectPatchOps } from '../../src/lib/sync/projectPatchOps.js';
import { summarizePatchOps, syncTraceLog } from '../../src/lib/sync/syncTrace.js';

const INDEX_ID = 'default';

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
export async function putCanvasIndex(payload, expectedRevision = 0) {
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
    await query(
      `INSERT INTO canvas_workspace_index (id, payload, updated_at, revision)
       VALUES ($1, $2::jsonb, $3, 1)`,
      [INDEX_ID, JSON.stringify(payload), now],
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
  await query(
    `UPDATE canvas_workspace_index
     SET payload = $2::jsonb, updated_at = $3, revision = $4
     WHERE id = $1`,
    [INDEX_ID, JSON.stringify(payload), now, nextRevision],
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
export async function putCanvasProject(projectId, payload, expectedRevision) {
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
    await query(
      `INSERT INTO canvas_project_document (project_id, payload, updated_at, revision)
       VALUES ($1, $2::jsonb, $3, 1)`,
      [projectId, JSON.stringify(payload), now],
    );
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
export async function patchCanvasProject(projectId, { expectedRevision, ops, traceId = null }) {
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
    await query(
      `INSERT INTO canvas_project_document (project_id, payload, updated_at, revision)
       VALUES ($1, $2::jsonb, $3, 1)`,
      [projectId, JSON.stringify(created), now],
    );
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
