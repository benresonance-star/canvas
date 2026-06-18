import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db.js', () => ({
  query: vi.fn(),
}));

const { query } = await import('../../db.js');
const { listWorkspacePrimitives } = await import('../primitives-list.js');

describe('primitives-list repository', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  it('aggregates all-project artifact scope through workspace-index project clusters with dedupe', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{
        project_id: 'project-1',
        project_name: 'Project One',
        project_archived: false,
        project_order: '1',
        id: 'artifact-shared',
        type: 'doc',
        uri: 'fixture://shared',
        content_hash: 'hash-shared',
        created_at: '2026-06-18T00:00:00.000Z',
        metadata: { filename: 'shared.md' },
      }],
    });

    const result = await listWorkspacePrimitives({ type: 'artifact', limit: 50 });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM project_cluster pc'),
      [50],
    );
    expect(query.mock.calls[0][0]).toContain('FROM canvas_workspace_index cwi');
    expect(query.mock.calls[0][0]).toContain('INNER JOIN workspace_projects wp');
    expect(query.mock.calls[0][0]).toContain('DISTINCT ON (cs.project_id, a.id)');
    expect(result.items).toEqual([{
      type: 'artifact',
      id: 'artifact-shared',
      summary: 'doc: shared.md',
      status: 'doc',
      created_at: '2026-06-18T00:00:00.000Z',
      project_id: 'project-1',
      project_name: 'Project One',
      project_archived: false,
      project_order: 1,
    }]);
  });
});
