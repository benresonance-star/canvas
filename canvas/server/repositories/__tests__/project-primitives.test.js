import { describe, expect, it, vi } from 'vitest';
import { deleteProjectArtifactRef } from '../project-primitives.js';

function createClient({ orphaned = false } = {}) {
  const calls = [];
  const client = {
    query: vi.fn(async (sql, params = []) => {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes('WITH RECURSIVE cluster_tree')) {
        return { rows: [{ id: 'cluster-root' }, { id: 'cluster-child' }] };
      }
      if (String(sql).includes('DELETE FROM cluster_member')) {
        return { rowCount: 1, rows: [] };
      }
      if (String(sql).includes('WITH candidates')) {
        return {
          rows: orphaned
            ? [{ primitive_id: 'artifact-1', primitive_type: 'artifact' }]
            : [],
        };
      }
      if (String(sql).includes('DELETE FROM canvas_event')) {
        return { rowCount: 1, rows: [] };
      }
      if (String(sql).includes('DELETE FROM artifact')) {
        return { rowCount: 1, rows: [] };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
  return { client, calls };
}

describe('project primitive cleanup', () => {
  it('removes project cluster membership but preserves shared artifact rows', async () => {
    const { client, calls } = createClient({ orphaned: false });

    const result = await deleteProjectArtifactRef('project-1', 'artifact-1', client);

    expect(result).toMatchObject({
      clusterCount: 2,
      membershipCount: 1,
      eventCount: 1,
      deletedArtifactCount: 0,
    });
    expect(calls.some((call) => call.sql.includes('DELETE FROM artifact'))).toBe(false);
    const eventDelete = calls.find((call) => call.sql.includes('DELETE FROM canvas_event'));
    expect(eventDelete.sql).toContain('e.project_id = $1');
    expect(eventDelete.params).toEqual(['project-1', 'artifact-1']);
  });

  it('deletes an artifact row when the project removal makes it orphaned', async () => {
    const { client, calls } = createClient({ orphaned: true });

    const result = await deleteProjectArtifactRef('project-1', 'artifact-1', client);

    expect(result.deletedArtifactCount).toBe(1);
    expect(calls.some((call) => call.sql.includes('DELETE FROM artifact'))).toBe(true);
    const eventDelete = calls.find((call) => call.sql.includes('DELETE FROM canvas_event'));
    expect(eventDelete.sql).toContain('e.target_id = $1');
    expect(eventDelete.params).toEqual(['artifact-1']);
  });
});
