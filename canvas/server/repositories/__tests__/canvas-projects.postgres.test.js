import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query } from '../../db.js';
import {
  getCanvasIndex,
  putCanvasIndex,
  putCanvasProject,
} from '../canvas-projects.js';

const INDEX_ID = 'default';
const TEST_PROJECT_ID = `postgres-cas-${Date.now()}`;

async function restoreWorkspaceIndex(row) {
  if (row) {
    await query(
      `INSERT INTO canvas_workspace_index (id, payload, updated_at, revision)
       VALUES ($1, $2::jsonb, $3, $4)
       ON CONFLICT (id) DO UPDATE
       SET payload = EXCLUDED.payload,
           updated_at = EXCLUDED.updated_at,
           revision = EXCLUDED.revision`,
      [INDEX_ID, JSON.stringify(row.payload), row.updated_at, row.revision],
    );
  } else {
    await query('DELETE FROM canvas_workspace_index WHERE id = $1', [INDEX_ID]);
  }
}

describe('canvas-projects repository postgres integration', () => {
  let dbAvailable = false;
  let originalIndexRow = null;

  beforeAll(async () => {
    try {
      await query('SELECT 1');
      const existing = await query(
        'SELECT payload, updated_at, revision FROM canvas_workspace_index WHERE id = $1',
        [INDEX_ID],
      );
      originalIndexRow = existing.rows[0] ?? null;
      await query('DELETE FROM canvas_project_document WHERE project_id = $1', [TEST_PROJECT_ID]);
      dbAvailable = true;
    } catch (e) {
      dbAvailable = false;
      console.warn('[postgres integration skipped]', e.message);
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await query('DELETE FROM canvas_project_document WHERE project_id = $1', [TEST_PROJECT_ID]);
      await restoreWorkspaceIndex(originalIndexRow);
    }
  });

  it('enforces document and workspace-index CAS against real Postgres rows', async () => {
    if (!dbAvailable) return;

    const created = await putCanvasProject(TEST_PROJECT_ID, {
      projectName: 'Postgres CAS',
      cards: [],
      canvasView: { x: 0, y: 0, zoom: 1 },
    }, 0);
    expect(created).toMatchObject({ ok: true, revision: 1 });

    const updated = await putCanvasProject(TEST_PROJECT_ID, {
      projectName: 'Postgres CAS',
      cards: [{ id: 'server-winner' }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    }, 1);
    expect(updated).toMatchObject({ ok: true, revision: 2 });

    const staleProjectWrite = await putCanvasProject(TEST_PROJECT_ID, {
      projectName: 'Postgres CAS',
      cards: [{ id: 'stale-client' }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    }, 1);
    expect(staleProjectWrite.ok).toBe(false);
    expect(staleProjectWrite.conflict).toBe(true);
    expect(staleProjectWrite.revision).toBe(2);
    expect(staleProjectWrite.payload.cards[0].id).toBe('server-winner');

    const currentIndex = await getCanvasIndex();
    const expectedIndexRevision = currentIndex?.revision ?? 0;
    const resetAt = currentIndex?.payload?.resetAt;
    const indexPayload = {
      version: 1,
      activeProjectId: TEST_PROJECT_ID,
      projects: [{
        id: TEST_PROJECT_ID,
        name: 'Postgres CAS',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        archived: false,
      }],
      ...(typeof resetAt === 'string' ? { resetAt } : {}),
    };

    const indexUpdate = await putCanvasIndex(indexPayload, expectedIndexRevision);
    expect(indexUpdate.ok).toBe(true);

    const staleIndexWrite = await putCanvasIndex({
      ...indexPayload,
      activeProjectId: null,
    }, expectedIndexRevision);
    expect(staleIndexWrite.ok).toBe(false);
    expect(staleIndexWrite.conflict).toBe(true);
    expect(staleIndexWrite.revision).toBe(indexUpdate.revision);
  });
});
