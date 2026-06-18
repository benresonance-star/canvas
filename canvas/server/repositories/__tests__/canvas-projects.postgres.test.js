import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query } from '../../db.js';
import {
  deleteCanvasProject,
  getCanvasIndex,
  putCanvasIndex,
  putCanvasProject,
} from '../canvas-projects.js';
import { listClusterEvents } from '../events-list.js';
import { listClusterPrimitives, listWorkspacePrimitives } from '../primitives-list.js';
import { listWorkspaceEvents } from '../events-list.js';

const INDEX_ID = 'default';
const TEST_PROJECT_ID = `postgres-cas-${Date.now()}`;
const CLEANUP_PREFIX = `postgres-cleanup-${Date.now()}`;
const DELETE_PROJECT_ID = `${CLEANUP_PREFIX}-delete`;
const KEEP_PROJECT_ID = `${CLEANUP_PREFIX}-keep`;
const DELETE_CLUSTER_ID = `${CLEANUP_PREFIX}-cluster-delete`;
const KEEP_CLUSTER_ID = `${CLEANUP_PREFIX}-cluster-keep`;
const SHARED_ARTIFACT_ID = `${CLEANUP_PREFIX}-artifact-shared`;
const LOCAL_ARTIFACT_ID = `${CLEANUP_PREFIX}-artifact-local`;
const SHARED_EVENT_ID = `${CLEANUP_PREFIX}-event-shared`;
const LOCAL_EVENT_ID = `${CLEANUP_PREFIX}-event-local`;
const CLUSTER_EVENT_ID = `${CLEANUP_PREFIX}-event-cluster`;

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
      await cleanupPrimitiveScopeFixtures();
      dbAvailable = true;
    } catch (e) {
      dbAvailable = false;
      console.warn('[postgres integration skipped]', e.message);
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await query('DELETE FROM canvas_project_document WHERE project_id = $1', [TEST_PROJECT_ID]);
      await cleanupPrimitiveScopeFixtures();
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

  it('deletes project primitive scope while preserving shared artifacts', async () => {
    if (!dbAvailable) return;

    await insertPrimitiveScopeFixtures();

    const beforeDeleteEvents = await listClusterEvents(DELETE_CLUSTER_ID, { limit: 20 });
    expect(beforeDeleteEvents.items.map((event) => event.id).sort()).toEqual([
      LOCAL_EVENT_ID,
      SHARED_EVENT_ID,
    ].sort());

    const beforeWorkspacePrimitives = await listWorkspacePrimitives({
      type: 'artifact',
      limit: 20,
    });
    const beforeSharedArtifacts = beforeWorkspacePrimitives.items.filter(
      (item) => item.id === SHARED_ARTIFACT_ID,
    );
    expect(beforeSharedArtifacts).toHaveLength(2);
    expect(beforeSharedArtifacts.map((item) => item.project_id).sort()).toEqual([
      DELETE_PROJECT_ID,
      KEEP_PROJECT_ID,
    ].sort());
    expect(beforeWorkspacePrimitives.items.some((item) => item.id === LOCAL_ARTIFACT_ID)).toBe(true);

    const beforeWorkspaceEvents = await listWorkspaceEvents({ limit: 20 });
    const beforeSharedEvents = beforeWorkspaceEvents.items.filter(
      (event) => event.id === SHARED_EVENT_ID,
    );
    expect(beforeSharedEvents).toHaveLength(2);
    expect(beforeSharedEvents.map((event) => event.project_id).sort()).toEqual([
      DELETE_PROJECT_ID,
      KEEP_PROJECT_ID,
    ].sort());

    await deleteCanvasProject(DELETE_PROJECT_ID);

    const deletedDoc = await query(
      'SELECT 1 FROM canvas_project_document WHERE project_id = $1',
      [DELETE_PROJECT_ID],
    );
    expect(deletedDoc.rows).toHaveLength(0);

    const deletedCluster = await query('SELECT 1 FROM cluster WHERE id = $1', [DELETE_CLUSTER_ID]);
    expect(deletedCluster.rows).toHaveLength(0);

    const localArtifact = await query('SELECT 1 FROM artifact WHERE id = $1', [LOCAL_ARTIFACT_ID]);
    expect(localArtifact.rows).toHaveLength(0);

    const localEvents = await query(
      'SELECT id FROM canvas_event WHERE id = ANY($1::text[]) ORDER BY id',
      [[LOCAL_EVENT_ID, CLUSTER_EVENT_ID]],
    );
    expect(localEvents.rows).toHaveLength(0);

    const sharedArtifact = await query('SELECT 1 FROM artifact WHERE id = $1', [SHARED_ARTIFACT_ID]);
    expect(sharedArtifact.rows).toHaveLength(1);

    const keepPrimitives = await listClusterPrimitives(KEEP_CLUSTER_ID, { limit: 20 });
    expect(keepPrimitives.items.some((item) => item.id === SHARED_ARTIFACT_ID)).toBe(true);

    const keepEvents = await listClusterEvents(KEEP_CLUSTER_ID, { limit: 20 });
    expect(keepEvents.items.some((event) => event.id === SHARED_EVENT_ID)).toBe(true);

    const afterWorkspacePrimitives = await listWorkspacePrimitives({
      type: 'artifact',
      limit: 20,
    });
    expect(afterWorkspacePrimitives.items.some((item) => item.id === LOCAL_ARTIFACT_ID)).toBe(false);
    expect(
      afterWorkspacePrimitives.items.filter((item) => item.id === SHARED_ARTIFACT_ID),
    ).toEqual([
      expect.objectContaining({ project_id: KEEP_PROJECT_ID }),
    ]);

    const afterWorkspaceEvents = await listWorkspaceEvents({ limit: 20 });
    expect(afterWorkspaceEvents.items.some((event) => event.id === LOCAL_EVENT_ID)).toBe(false);
    expect(
      afterWorkspaceEvents.items.filter((event) => event.id === SHARED_EVENT_ID),
    ).toEqual([
      expect.objectContaining({ project_id: KEEP_PROJECT_ID }),
    ]);
  });
});

async function cleanupPrimitiveScopeFixtures() {
  await query(
    'DELETE FROM canvas_event WHERE id = ANY($1::text[])',
    [[SHARED_EVENT_ID, LOCAL_EVENT_ID, CLUSTER_EVENT_ID]],
  );
  await query(
    `DELETE FROM cluster_member
     WHERE cluster_id = ANY($1::text[])
        OR primitive_id = ANY($2::text[])`,
    [[DELETE_CLUSTER_ID, KEEP_CLUSTER_ID], [SHARED_ARTIFACT_ID, LOCAL_ARTIFACT_ID]],
  );
  await query(
    'DELETE FROM project_cluster WHERE project_id = ANY($1::text[])',
    [[DELETE_PROJECT_ID, KEEP_PROJECT_ID]],
  );
  await query(
    'DELETE FROM canvas_project_document WHERE project_id = ANY($1::text[])',
    [[DELETE_PROJECT_ID, KEEP_PROJECT_ID]],
  );
  await query(
    'DELETE FROM cluster WHERE id = ANY($1::text[])',
    [[DELETE_CLUSTER_ID, KEEP_CLUSTER_ID]],
  );
  await query(
    'DELETE FROM artifact WHERE id = ANY($1::text[])',
    [[SHARED_ARTIFACT_ID, LOCAL_ARTIFACT_ID]],
  );
}

async function insertPrimitiveScopeFixtures() {
  const now = new Date().toISOString();
  await query(
    `INSERT INTO canvas_workspace_index (id, payload, updated_at, revision)
     VALUES ($1, $2::jsonb, $3, 1)
     ON CONFLICT (id) DO UPDATE
     SET payload = EXCLUDED.payload,
         updated_at = EXCLUDED.updated_at,
         revision = canvas_workspace_index.revision + 1`,
    [
      INDEX_ID,
      JSON.stringify({
        version: 1,
        activeProjectId: DELETE_PROJECT_ID,
        projects: [
          {
            id: DELETE_PROJECT_ID,
            name: 'Delete me',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            archived: false,
          },
          {
            id: KEEP_PROJECT_ID,
            name: 'Keep me',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            archived: true,
          },
        ],
      }),
      now,
    ],
  );
  await query(
    `INSERT INTO canvas_project_document (project_id, payload, updated_at, revision)
     VALUES ($1, $2::jsonb, $3, 1), ($4, $5::jsonb, $3, 1)`,
    [
      DELETE_PROJECT_ID,
      JSON.stringify({ projectName: 'Delete me', cards: [] }),
      now,
      KEEP_PROJECT_ID,
      JSON.stringify({ projectName: 'Keep me', cards: [] }),
    ],
  );
  await query(
    `INSERT INTO cluster (id, name, status, access, created_at, metadata)
     VALUES ($1, 'Delete workspace', 'active', $3::jsonb, $4, '{}'),
            ($2, 'Keep workspace', 'active', $3::jsonb, $4, '{}')`,
    [
      DELETE_CLUSTER_ID,
      KEEP_CLUSTER_ID,
      JSON.stringify({ readers: [], writers: [] }),
      now,
    ],
  );
  await query(
    `INSERT INTO project_cluster (project_id, cluster_id)
     VALUES ($1, $2), ($3, $4)`,
    [DELETE_PROJECT_ID, DELETE_CLUSTER_ID, KEEP_PROJECT_ID, KEEP_CLUSTER_ID],
  );
  await query(
    `INSERT INTO artifact (id, type, uri, content_hash, version, retrieved_at, metadata)
     VALUES ($1, 'doc', 'fixture://shared', $2, '1', $5, $6::jsonb),
            ($3, 'doc', 'fixture://local', $4, '1', $5, $7::jsonb)`,
    [
      SHARED_ARTIFACT_ID,
      `${SHARED_ARTIFACT_ID}-hash`,
      LOCAL_ARTIFACT_ID,
      `${LOCAL_ARTIFACT_ID}-hash`,
      now,
      JSON.stringify({ filename: 'shared.md' }),
      JSON.stringify({ filename: 'local.md' }),
    ],
  );
  await query(
    `INSERT INTO cluster_member (cluster_id, primitive_id, primitive_type, added_at)
     VALUES ($1, $3, 'artifact', $5),
            ($1, $4, 'artifact', $5),
            ($2, $3, 'artifact', $5)`,
    [DELETE_CLUSTER_ID, KEEP_CLUSTER_ID, SHARED_ARTIFACT_ID, LOCAL_ARTIFACT_ID, now],
  );
  await query(
    `INSERT INTO canvas_event (id, occurred_at, actor, action, target_id, target_type)
     VALUES ($1, $4, $5::jsonb, 'created', $6, 'artifact'),
            ($2, $4, $5::jsonb, 'created', $7, 'artifact'),
            ($3, $4, $5::jsonb, 'created', $8, 'cluster')`,
    [
      SHARED_EVENT_ID,
      LOCAL_EVENT_ID,
      CLUSTER_EVENT_ID,
      now,
      JSON.stringify({ kind: 'test', id: 'postgres-cleanup' }),
      SHARED_ARTIFACT_ID,
      LOCAL_ARTIFACT_ID,
      DELETE_CLUSTER_ID,
    ],
  );
}
