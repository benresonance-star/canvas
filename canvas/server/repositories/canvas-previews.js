import { query } from '../db.js';

export const PREVIEW_BLOB_MAX_BYTES = 8 * 1024 * 1024;

export async function getPreviewBlob(cacheKey) {
  const res = await query(
    'SELECT blob, content_type FROM canvas_preview_blob WHERE cache_key = $1',
    [cacheKey],
  );
  if (!res.rows[0]) return null;
  return {
    blob: res.rows[0].blob,
    contentType: res.rows[0].content_type,
  };
}

export async function putPreviewBlob(cacheKey, projectId, blob, contentType) {
  if (!Buffer.isBuffer(blob)) {
    throw new Error('blob must be a Buffer');
  }
  if (blob.length > PREVIEW_BLOB_MAX_BYTES) {
    throw new Error(`Preview exceeds ${PREVIEW_BLOB_MAX_BYTES} byte limit`);
  }
  const now = new Date().toISOString();
  await query(
    `INSERT INTO canvas_preview_blob (cache_key, project_id, content_type, blob, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (cache_key) DO UPDATE
       SET project_id = EXCLUDED.project_id,
           content_type = EXCLUDED.content_type,
           blob = EXCLUDED.blob,
           updated_at = EXCLUDED.updated_at`,
    [cacheKey, projectId, contentType ?? null, blob, now],
  );
  return { updatedAt: now };
}

export async function deletePreviewBlobsForProject(projectId) {
  await query('DELETE FROM canvas_preview_blob WHERE project_id = $1', [projectId]);
}
