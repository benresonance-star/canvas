import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../db.js', () => ({
  query: vi.fn(),
}));

const { query } = await import('../../db.js');
const { listClusterEvents, listWorkspaceEvents } = await import('../events-list.js');

describe('events-list repository', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  it('scopes events through cluster membership', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{
        id: 'event-1',
        action: 'created',
        target_id: 'artifact-1',
        target_type: 'artifact',
        occurred_at: '2026-06-18T00:00:00.000Z',
      }],
    });

    const result = await listClusterEvents('cluster-1', { limit: 200 });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INNER JOIN cluster_member cm'),
      ['cluster-1', 200],
    );
    expect(result.items).toEqual([{
      id: 'event-1',
      action: 'created',
      target_id: 'artifact-1',
      target_type: 'artifact',
      occurred_at: '2026-06-18T00:00:00.000Z',
    }]);
  });

  it('aggregates all-project events through workspace-index project scope targets', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{
        project_id: 'project-1',
        project_name: 'Project One',
        project_archived: false,
        project_order: '1',
        id: 'event-shared',
        action: 'updated',
        target_id: 'artifact-shared',
        target_type: 'artifact',
        occurred_at: '2026-06-18T00:00:00.000Z',
      }],
    });

    const result = await listWorkspaceEvents({ limit: 50 });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM project_cluster pc'),
      [50],
    );
    expect(query.mock.calls[0][0]).toContain('FROM canvas_workspace_index cwi');
    expect(query.mock.calls[0][0]).toContain('INNER JOIN workspace_projects wp');
    expect(query.mock.calls[0][0]).toContain('DISTINCT ON (vt.project_id, e.id)');
    expect(result.items).toEqual([{
      id: 'event-shared',
      action: 'updated',
      target_id: 'artifact-shared',
      target_type: 'artifact',
      occurred_at: '2026-06-18T00:00:00.000Z',
      project_id: 'project-1',
      project_name: 'Project One',
      project_archived: false,
      project_order: 1,
    }]);
  });
});
