function rowToArtifactView(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    artifactId: row.artifact_id,
    surface: row.surface,
    viewType: row.view_type,
    x: row.x == null ? null : Number(row.x),
    y: row.y == null ? null : Number(row.y),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    zIndex: row.z_index == null ? null : Number(row.z_index),
    viewState: row.view_state ?? {},
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? null,
  };
}

export async function listArtifactViewsByProject(
  projectId,
  { surface = null } = {},
  db = { query },
) {
  const result = await db.query(
    `SELECT * FROM artifact_view
     WHERE project_id = $1 AND archived_at IS NULL
       AND ($2::text IS NULL OR surface = $2)
     ORDER BY updated_at, id`,
    [projectId, surface],
  );
  return result.rows.map(rowToArtifactView);
}

export async function upsertArtifactViews(projectId, views, db) {
  const rows = [];
  for (const view of views) {
    if (view.projectId !== projectId) throw new Error('artifact view project mismatch');
    const result = await db.query(
      `INSERT INTO artifact_view (
         id, project_id, artifact_id, surface, view_type,
         x, y, width, height, z_index, view_state, version, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,1,NOW(),NOW())
       ON CONFLICT (project_id, artifact_id, surface, view_type)
         WHERE archived_at IS NULL
       DO UPDATE SET
         x = EXCLUDED.x, y = EXCLUDED.y, width = EXCLUDED.width,
         height = EXCLUDED.height, z_index = EXCLUDED.z_index,
         view_state = EXCLUDED.view_state, version = artifact_view.version + 1,
         updated_at = NOW()
       WHERE (artifact_view.x, artifact_view.y, artifact_view.width, artifact_view.height,
              artifact_view.z_index, artifact_view.view_state)
         IS DISTINCT FROM
             (EXCLUDED.x, EXCLUDED.y, EXCLUDED.width, EXCLUDED.height,
              EXCLUDED.z_index, EXCLUDED.view_state)
       RETURNING *`,
      [
        view.id, projectId, view.artifactId, view.surface, view.viewType,
        view.x ?? null, view.y ?? null, view.width ?? null, view.height ?? null,
        view.zIndex ?? null, JSON.stringify(view.viewState ?? {}),
      ],
    );
    if (result.rows[0]) {
      rows.push(rowToArtifactView(result.rows[0]));
    } else {
      const existing = await db.query(
        `SELECT * FROM artifact_view
         WHERE project_id = $1 AND artifact_id = $2 AND surface = $3
           AND view_type = $4 AND archived_at IS NULL`,
        [projectId, view.artifactId, view.surface, view.viewType],
      );
      rows.push(rowToArtifactView(existing.rows[0]));
    }
  }
  return rows;
}

export async function archiveMissingArtifactViews(projectId, activeViewIds, db) {
  const result = await db.query(
    `UPDATE artifact_view
     SET archived_at = NOW(), updated_at = NOW(), version = version + 1
     WHERE project_id = $1 AND archived_at IS NULL
       AND view_type = 'card'
       AND NOT (id = ANY($2::text[]))
     RETURNING id`,
    [projectId, activeViewIds],
  );
  return result.rows.map((row) => row.id);
}
import { query } from '../db.js';
