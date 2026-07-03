import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query } from '../../db.js';
import { newUlid } from '../../../src/primitives/shared/ulid.js';
import {
  archiveStudio,
  createStudio,
  getStudioOverview,
  invokeChildStudio,
  restoreStudio,
} from '../studios.js';

const TEST_PROJECT_ID = `postgres-studio-${Date.now()}`;

async function cleanupProject(projectId) {
  await query('DELETE FROM flow_edge WHERE flow_id IN (SELECT id FROM flow_document WHERE project_id = $1)', [projectId]);
  await query('DELETE FROM flow_node WHERE flow_id IN (SELECT id FROM flow_document WHERE project_id = $1)', [projectId]);
  await query('DELETE FROM flow_document WHERE project_id = $1', [projectId]);
  await query('DELETE FROM studio_surface WHERE project_id = $1', [projectId]);
  await query('DELETE FROM studio_step WHERE project_id = $1', [projectId]);
  await query('DELETE FROM studio_context_packet WHERE project_id = $1', [projectId]);
  await query('DELETE FROM studio WHERE project_id = $1', [projectId]);
  await query('DELETE FROM artifact_event WHERE project_id = $1', [projectId]);
  await query('DELETE FROM artifact WHERE project_id = $1', [projectId]);
}

describe('studios repository postgres integration', () => {
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      await query('SELECT 1');
      await cleanupProject(TEST_PROJECT_ID);
      dbAvailable = true;
    } catch (error) {
      dbAvailable = false;
      console.warn('[postgres integration skipped]', error.message);
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await cleanupProject(TEST_PROJECT_ID);
    }
  });

  it('archives a child studio, removes its parent flow node, and restores it in overview', async () => {
    if (!dbAvailable) return;

    const parentOverview = await createStudio({
      projectId: TEST_PROJECT_ID,
      title: 'Parent Studio',
    });
    const parentId = parentOverview.studio.id;
    const parentFlowId = parentOverview.surfaces.find((surface) => surface.isPrimary)?.artifactId;
    expect(parentFlowId).toBeTruthy();

    const invokeResult = await invokeChildStudio(parentId, { title: 'Archived Child' });
    const childId = invokeResult.childStudio.id;
    const nodeId = newUlid();

    await query(
      `INSERT INTO flow_node
       (id, flow_id, kind, artifact_id, title, position_x, position_y, presentation)
       VALUES ($1, $2, 'artifact', $3, $4, 120, 80, $5::jsonb)`,
      [nodeId, parentFlowId, childId, 'Archived Child', JSON.stringify({ artifactType: 'studio' })],
    );

    const beforeArchive = await query(
      'SELECT id FROM flow_node WHERE flow_id = $1 AND artifact_id = $2',
      [parentFlowId, childId],
    );
    expect(beforeArchive.rows).toHaveLength(1);

    await archiveStudio(childId, { reason: 'Integration archive test' });

    const afterArchiveNodes = await query(
      'SELECT id FROM flow_node WHERE flow_id = $1 AND artifact_id = $2',
      [parentFlowId, childId],
    );
    expect(afterArchiveNodes.rows).toHaveLength(0);

    const archivedOverview = await getStudioOverview(parentId);
    expect(archivedOverview.childStudios.some((child) => child.id === childId)).toBe(false);
    expect(archivedOverview.archivedChildStudios.some((child) => child.id === childId)).toBe(true);

    const archivedArtifact = await query(
      'SELECT archived_at FROM artifact WHERE id = $1',
      [childId],
    );
    expect(archivedArtifact.rows[0]?.archived_at).toBeTruthy();

    await restoreStudio(childId, { reason: 'Integration restore test' });

    const restoredOverview = await getStudioOverview(parentId);
    expect(restoredOverview.childStudios.some((child) => child.id === childId)).toBe(true);
    expect(restoredOverview.archivedChildStudios.some((child) => child.id === childId)).toBe(false);

    const restoredArtifact = await query(
      'SELECT archived_at, metadata FROM artifact WHERE id = $1',
      [childId],
    );
    expect(restoredArtifact.rows[0]?.archived_at).toBeNull();
    expect(restoredArtifact.rows[0]?.metadata?.studio_state).toBe('seeded');

    const restoredNodes = await query(
      'SELECT id FROM flow_node WHERE flow_id = $1 AND artifact_id = $2',
      [parentFlowId, childId],
    );
    expect(restoredNodes.rows).toHaveLength(1);
  });
});
