import { pool, query } from '../db.js';

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

/** Keep workspace index row name aligned when document carries projectName. */
export async function syncIndexProjectName(projectId, projectName) {
  const trimmed = typeof projectName === 'string' ? projectName.trim() : '';
  if (!trimmed) return false;

  const indexRow = await getCanvasIndex();
  if (!indexRow?.payload?.projects?.length) return false;

  const projects = indexRow.payload.projects;
  const row = projects.find((p) => p.id === projectId);
  if (!row || row.name === trimmed) return false;

  row.name = trimmed;
  row.updatedAt = Date.now();
  await putCanvasIndex(indexRow.payload);
  return true;
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
    if (payload?.projectName) {
      try {
        await syncIndexProjectName(projectId, payload.projectName);
      } catch (e) {
        console.warn(`Could not sync index name for project ${projectId}:`, e.message);
      }
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

  const nextRevision = currentRevision + 1;
  await query(
    `UPDATE canvas_project_document
     SET payload = $2::jsonb, updated_at = $3, revision = $4
     WHERE project_id = $1`,
    [projectId, JSON.stringify(payload), now, nextRevision],
  );
  if (payload?.projectName) {
    try {
      await syncIndexProjectName(projectId, payload.projectName);
    } catch (e) {
      console.warn(`Could not sync index name for project ${projectId}:`, e.message);
    }
  }
  return { ok: true, revision: nextRevision, updatedAt: now };
}

export async function deleteCanvasProject(projectId) {
  await query('DELETE FROM canvas_project_document WHERE project_id = $1', [projectId]);
}
