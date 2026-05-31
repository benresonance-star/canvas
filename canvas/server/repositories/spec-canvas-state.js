import { query } from '../db.js';

/**
 * @param {string} projectId
 */
export async function getSpecCanvasState(projectId) {
  const res = await query(
    'SELECT layout, viewport, version, updated_at FROM spec_canvas_state WHERE project_id = $1',
    [projectId],
  );
  if (!res.rows[0]) return null;
  return {
    layout: res.rows[0].layout,
    viewport: res.rows[0].viewport,
    version: Number(res.rows[0].version),
    updatedAt: res.rows[0].updated_at,
  };
}

/**
 * @param {string} projectId
 * @param {{ layout: object, viewport: object }} body
 * @param {number} expectedVersion
 */
export async function putSpecCanvasState(projectId, body, expectedVersion) {
  const expected = Number(expectedVersion);
  if (!Number.isFinite(expected) || expected < 0) {
    throw new Error('expectedVersion must be a non-negative number');
  }

  const existing = await query(
    'SELECT version FROM spec_canvas_state WHERE project_id = $1',
    [projectId],
  );
  const now = new Date().toISOString();

  if (!existing.rows[0]) {
    if (expected > 0) {
      return { ok: false, conflict: true, version: 0 };
    }
    await query(
      `INSERT INTO spec_canvas_state (project_id, layout, viewport, updated_at, version)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, 1)`,
      [
        projectId,
        JSON.stringify(body.layout ?? { placed: [], staging: [] }),
        JSON.stringify(body.viewport ?? { x: 0, y: 0, zoom: 1 }),
        now,
      ],
    );
    return { ok: true, version: 1, updatedAt: now };
  }

  const current = Number(existing.rows[0].version);
  if (expected !== current) {
    return { ok: false, conflict: true, version: current };
  }

  const next = current + 1;
  await query(
    `UPDATE spec_canvas_state
     SET layout = $2::jsonb, viewport = $3::jsonb, updated_at = $4, version = $5
     WHERE project_id = $1`,
    [
      projectId,
      JSON.stringify(body.layout ?? { placed: [], staging: [] }),
      JSON.stringify(body.viewport ?? { x: 0, y: 0, zoom: 1 }),
      now,
      next,
    ],
  );
  return { ok: true, version: next, updatedAt: now };
}
