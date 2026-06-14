import { query } from '../db.js';

/** Default layout when no spec_canvas_state row exists yet. */
export function emptySpecCanvasState() {
  return {
    layout: { placed: [], staging: [], artifactPlacements: null },
    viewport: { x: 0, y: 0, zoom: 1 },
    version: 0,
    updatedAt: null,
  };
}

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
    const inserted = await query(
      `INSERT INTO spec_canvas_state (project_id, layout, viewport, updated_at, version)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, 1)
       ON CONFLICT (project_id) DO NOTHING
       RETURNING version, updated_at`,
      [
        projectId,
        JSON.stringify(body.layout ?? { placed: [], staging: [] }),
        JSON.stringify(body.viewport ?? { x: 0, y: 0, zoom: 1 }),
        now,
      ],
    );
    if (!inserted.rows[0]) {
      const current = await query(
        'SELECT version FROM spec_canvas_state WHERE project_id = $1',
        [projectId],
      );
      return {
        ok: false,
        conflict: true,
        version: Number(current.rows[0]?.version) || 0,
      };
    }
    return {
      ok: true,
      version: Number(inserted.rows[0].version) || 1,
      updatedAt: inserted.rows[0].updated_at ?? now,
    };
  }

  const current = Number(existing.rows[0].version);
  if (expected !== current) {
    return { ok: false, conflict: true, version: current };
  }

  const next = current + 1;
  const updated = await query(
    `UPDATE spec_canvas_state
     SET layout = $2::jsonb, viewport = $3::jsonb, updated_at = $4, version = $5
     WHERE project_id = $1 AND version = $6
     RETURNING version, updated_at`,
    [
      projectId,
      JSON.stringify(body.layout ?? { placed: [], staging: [] }),
      JSON.stringify(body.viewport ?? { x: 0, y: 0, zoom: 1 }),
      now,
      next,
      current,
    ],
  );
  if (!updated.rows[0]) {
    const latest = await query(
      'SELECT version FROM spec_canvas_state WHERE project_id = $1',
      [projectId],
    );
    return {
      ok: false,
      conflict: true,
      version: Number(latest.rows[0]?.version) || current,
    };
  }
  return {
    ok: true,
    version: Number(updated.rows[0].version) || next,
    updatedAt: updated.rows[0].updated_at ?? now,
  };
}
