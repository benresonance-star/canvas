import { query } from '../db.js';

/**
 * @param {string} resourceId
 */
export async function getSpecResource(resourceId) {
  const res = await query(
    `SELECT id, kind, file_path, content_hash, version, created_at, updated_at, deleted_at
     FROM spec_resource WHERE id = $1 AND deleted_at IS NULL`,
    [resourceId],
  );
  if (!res.rows[0]) return null;

  const countRes = await query(
    'SELECT COUNT(*)::int AS n FROM spec_project_resource WHERE resource_id = $1',
    [resourceId],
  );

  return {
    ...res.rows[0],
    referenceCount: countRes.rows[0]?.n ?? 0,
  };
}

/**
 * @param {string} projectId
 * @param {string} resourceId
 */
export async function linkSpecResourceToProject(projectId, resourceId, kind = 'file') {
  await query(
    `INSERT INTO spec_resource (id, kind, file_path, content_hash)
     VALUES ($1, $2, '', '')
     ON CONFLICT (id) DO NOTHING`,
    [resourceId, kind],
  );
  await query(
    `INSERT INTO spec_project_resource (project_id, resource_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [projectId, resourceId],
  );
}

/**
 * Detach: repoint project reference to a new resource id (bytes copy is client/fs responsibility).
 * @param {string} projectId
 * @param {string} oldResourceId
 * @param {{ newResourceId: string, filePath: string, contentHash: string, kind?: string }} copy
 */
export async function detachSpecResourceForProject(projectId, oldResourceId, copy) {
  await query(
    `INSERT INTO spec_resource (id, kind, file_path, content_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE
       SET file_path = EXCLUDED.file_path,
           content_hash = EXCLUDED.content_hash,
           updated_at = NOW()`,
    [copy.newResourceId, copy.kind ?? 'file', copy.filePath, copy.contentHash],
  );
  await query(
    'DELETE FROM spec_project_resource WHERE project_id = $1 AND resource_id = $2',
    [projectId, oldResourceId],
  );
  await query(
    `INSERT INTO spec_project_resource (project_id, resource_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [projectId, copy.newResourceId],
  );
  return { ok: true, newResourceId: copy.newResourceId };
}
