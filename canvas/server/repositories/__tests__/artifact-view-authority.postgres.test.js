import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query } from '../../db.js';

const suffix = `${Date.now()}`;
const PROJECT_ID = `artifact-view-authority-${suffix}`;
const ARTIFACT_ID = `artifact-view-authority-note-${suffix}`;

function payload(x = 10) {
  return {
    projectName: 'Authority test',
    cards: [{
      id: 'card-1', type: 'user_note', x, y: 20, width: 300, height: 180,
      versions: [{ version: 1, artifactRef: { id: ARTIFACT_ID } }],
    }],
    stagedSyncCards: [],
  };
}

describe('artifact-view write authority postgres integration', () => {
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      await query('DELETE FROM canvas_project_document WHERE project_id = $1', [PROJECT_ID]);
      await query('DELETE FROM artifact WHERE id = $1', [ARTIFACT_ID]);
      await query(
        `INSERT INTO artifact (
           id, type, uri, content_hash, retrieved_at, metadata,
           project_id, title, created_at, updated_at
         ) VALUES ($1, 'user_note', $2, $3, NOW(), '{}'::jsonb,
                   $4, 'Authority note', NOW(), NOW())`,
        [ARTIFACT_ID, `canvas://test/${ARTIFACT_ID}`, `hash-${ARTIFACT_ID}`, PROJECT_ID],
      );
      dbAvailable = true;
    } catch (error) {
      dbAvailable = false;
      console.warn('[postgres integration skipped]', error.message);
    }
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await query('DELETE FROM canvas_project_document WHERE project_id = $1', [PROJECT_ID]);
    await query('DELETE FROM artifact WHERE id = $1', [ARTIFACT_ID]);
  });

  it('bootstraps new notes but rejects generic geometry mutation', async () => {
    if (!dbAvailable) return;
    await query(
      `INSERT INTO canvas_project_document (project_id, payload, revision)
       VALUES ($1, prepare_user_note_artifact_view_document($1, $2::jsonb), 1)`,
      [PROJECT_ID, JSON.stringify(payload())],
    );
    const view = await query(
      `SELECT x, version FROM artifact_view
       WHERE project_id = $1 AND artifact_id = $2 AND surface = 'canvas'
         AND archived_at IS NULL`,
      [PROJECT_ID, ARTIFACT_ID],
    );
    expect(Number(view.rows[0].x)).toBe(10);

    await expect(query(
      `UPDATE canvas_project_document
       SET payload = prepare_user_note_artifact_view_document($1, $2::jsonb)
       WHERE project_id = $1`,
      [PROJECT_ID, JSON.stringify(payload(11))],
    )).rejects.toMatchObject({ code: '23514' });

    const unchanged = await query(
      `SELECT payload->'cards'->0 ? 'x' AS has_x FROM canvas_project_document
       WHERE project_id = $1`,
      [PROJECT_ID],
    );
    expect(unchanged.rows[0].has_x).toBe(false);
  });

  it('archives canonical views when lifecycle documents remove a note', async () => {
    if (!dbAvailable) return;
    await query(
      `UPDATE canvas_project_document
       SET payload = prepare_user_note_artifact_view_document($1, $2::jsonb)
       WHERE project_id = $1`,
      [PROJECT_ID, JSON.stringify({ ...payload(), cards: [] })],
    );
    const view = await query(
      `SELECT archived_at FROM artifact_view
       WHERE project_id = $1 AND artifact_id = $2 AND surface = 'canvas'`,
      [PROJECT_ID, ARTIFACT_ID],
    );
    expect(view.rows[0].archived_at).toBeTruthy();
  });
});
