import { describe, expect, it, vi } from 'vitest';
import {
  ORPHAN_PURGE_CONFIRM_TOKEN,
  collectOrphanWorkspacePurgePlan,
  projectIdsFromWorkspaceIndexPayload,
  runOrphanWorkspacePurge,
} from '../orphan-workspace-purge.js';

function createCollectClient() {
  const query = vi.fn(async (sql) => {
    if (sql.includes('FROM canvas_workspace_index')) {
      return {
        rows: [{
          payload: {
            projects: [
              { id: 'active-project', archived: false },
              { id: 'archived-project', archived: true },
            ],
          },
        }],
      };
    }
    if (sql.includes('WITH RECURSIVE keep_clusters')) {
      return {
        rows: [
          { id: 'active-root', parent_cluster_id: null, depth: 0 },
          { id: 'archived-root', parent_cluster_id: null, depth: 0 },
          { id: 'active-child', parent_cluster_id: 'active-root', depth: 1 },
        ],
      };
    }
    if (sql.includes('WITH RECURSIVE all_clusters')) {
      return {
        rows: [
          { id: 'orphan-child', parent_cluster_id: 'orphan-root', depth: 1 },
          { id: 'orphan-root', parent_cluster_id: null, depth: 0 },
        ],
      };
    }
    if (sql.includes('FROM project_cluster') && sql.includes('WHERE NOT')) {
      return { rows: [{ project_id: 'ghost-project', cluster_id: 'orphan-root' }] };
    }
    if (sql.includes('FROM cluster_member') && sql.includes('WHERE cluster_id = ANY')) {
      return {
        rows: [
          { cluster_id: 'orphan-root', primitive_id: 'orphan-artifact', primitive_type: 'artifact' },
        ],
      };
    }
    if (sql.includes('candidate_relationship')) {
      return {
        rows: [
          { primitive_id: 'orphan-relationship', primitive_type: 'relationship' },
          { primitive_id: 'orphan-artifact', primitive_type: 'artifact' },
        ],
      };
    }
    if (sql.includes('FROM canvas_event e')) {
      return {
        rows: [
          {
            id: 'orphan-event',
            target_id: 'orphan-artifact',
            target_type: 'artifact',
            action: 'created',
          },
        ],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  return { query };
}

describe('orphan workspace purge', () => {
  it('keeps active and archived projects from the workspace index', () => {
    expect(projectIdsFromWorkspaceIndexPayload({
      projects: [
        { id: 'active-project', archived: false },
        { id: 'archived-project', archived: true },
        { id: 'active-project', archived: false },
      ],
    })).toEqual(['active-project', 'archived-project']);
  });

  it('collects purge candidates outside active and archived project cluster trees', async () => {
    const client = createCollectClient();

    const plan = await collectOrphanWorkspacePurgePlan(client, { sampleLimit: 5 });

    expect(plan.keep.projectIds).toEqual(['active-project', 'archived-project']);
    expect(plan.keep.clusterIds).toEqual(['active-root', 'archived-root', 'active-child']);
    expect(plan.purge.projectClusterCount).toBe(1);
    expect(plan.purge.clusterCount).toBe(2);
    expect(plan.purge.primitiveCounts).toEqual({ relationship: 1, artifact: 1 });
    expect(plan.purge.eventCount).toBe(1);
  });

  it('refuses apply mode without the confirmation token', async () => {
    await expect(runOrphanWorkspacePurge({
      apply: true,
      confirm: 'wrong',
      client: createCollectClient(),
    })).rejects.toThrow(ORPHAN_PURGE_CONFIRM_TOKEN);
  });

  it('applies purge candidates in a transaction when confirmed', async () => {
    const client = createCollectClient();
    client.query.mockImplementation(async (sql) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [], rowCount: 0 };
      try {
        return await createCollectClient().query(sql);
      } catch {
        // Mutation statements are validated by the assertions below.
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await runOrphanWorkspacePurge({
      apply: true,
      confirm: ORPHAN_PURGE_CONFIRM_TOKEN,
      client,
    });

    const sqlCalls = client.query.mock.calls.map((call) => call[0]);
    expect(sqlCalls[0]).toBe('BEGIN');
    expect(sqlCalls).toContain('COMMIT');
    expect(sqlCalls.some((sql) => sql.includes('DELETE FROM canvas_event'))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes('DELETE FROM cluster_member'))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes('DELETE FROM project_cluster'))).toBe(true);
    expect(result.dryRun).toBe(false);
  });
});
