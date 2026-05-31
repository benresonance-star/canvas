import { query } from '../db.js';

/**
 * @param {string} noteId
 * @param {string} resourceId
 * @param {string} projectId — validated: resource must be linked to project
 */
export async function createSpecNoteLink(noteId, resourceId, projectId) {
  const linkRes = await query(
    `SELECT 1 FROM spec_project_resource
     WHERE project_id = $1 AND resource_id = $2`,
    [projectId, resourceId],
  );
  if (!linkRes.rows[0]) {
    const err = new Error('Resource is not referenced by this project');
    err.statusCode = 400;
    throw err;
  }

  await query(
    `INSERT INTO spec_note_link (note_id, resource_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [noteId, resourceId],
  );
  return { ok: true };
}

/**
 * @param {string} noteId
 */
export async function listSpecNoteLinksForNote(noteId) {
  const res = await query(
    'SELECT note_id, resource_id, created_at FROM spec_note_link WHERE note_id = $1',
    [noteId],
  );
  return res.rows;
}

/**
 * @param {string} noteId
 * @param {string} resourceId
 */
export async function deleteSpecNoteLink(noteId, resourceId) {
  await query(
    'DELETE FROM spec_note_link WHERE note_id = $1 AND resource_id = $2',
    [noteId, resourceId],
  );
  return { ok: true };
}
