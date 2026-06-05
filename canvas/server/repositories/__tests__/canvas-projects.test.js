import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../db.js';
import {
  getCanvasIndex,
  putCanvasIndex,
  getCanvasProject,
  getCanvasProjectMeta,
  putCanvasProject,
  patchCanvasProject,
  deleteCanvasProject,
} from '../canvas-projects.js';

describe('canvas-projects repository', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  it('getCanvasIndex returns null when missing', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [] });
    expect(await getCanvasIndex()).toBeNull();
  });

  it('putCanvasIndex upserts default row', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [] });
    const result = await putCanvasIndex({ version: 1, projects: [] });
    expect(result.updatedAt).toBeTruthy();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('canvas_workspace_index'),
      expect.arrayContaining(['default']),
    );
  });

  it('getCanvasProject returns payload and revision', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{ payload: { cards: [] }, updated_at: '2020-01-01', revision: '3' }],
    });
    const row = await getCanvasProject('abc');
    expect(row.payload).toEqual({ cards: [] });
    expect(row.revision).toBe(3);
  });

  it('getCanvasProjectMeta returns revision only', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{ revision: '5', updated_at: '2020-01-01' }],
    });
    const meta = await getCanvasProjectMeta('abc');
    expect(meta.revision).toBe(5);
  });

  it('putCanvasProject inserts when missing and expectedRevision is 0', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ revision: 1, updated_at: '2020-01-01' }] });
    const result = await putCanvasProject('p1', { projectName: 'New', cards: [] }, 0);
    expect(result.ok).toBe(true);
    expect(result.revision).toBe(1);
  });

  it('putCanvasProject returns conflict when concurrent create wins insert', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          revision: '1',
          payload: { projectName: 'Winner', cards: [] },
          updated_at: '2020-01-01',
        }],
      });
    const result = await putCanvasProject('p1', { projectName: 'Loser', cards: [] }, 0);
    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.revision).toBe(1);
    expect(result.payload.projectName).toBe('Winner');
  });

  it('putCanvasProject returns conflict when revision mismatches', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{
        revision: '2',
        payload: { cards: [{ id: 'server' }] },
        updated_at: '2020-01-01',
      }],
    });
    const result = await putCanvasProject('p1', { cards: [] }, 1);
    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.revision).toBe(2);
  });

  it('putCanvasProject increments revision on match', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{ revision: '2', payload: {}, updated_at: '2020-01-01' }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const result = await putCanvasProject('p1', { cards: [{ id: 'a' }] }, 2);
    expect(result.ok).toBe(true);
    expect(result.revision).toBe(3);
  });

  it('putCanvasIndex preserves existing active project across stale client writes', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{
          revision: '7',
          payload: {
            version: 1,
            activeProjectId: 'earthrise',
            projects: [
              { id: 'earthrise', name: 'EARTHRISE', updatedAt: 10, archived: false },
              { id: 'treefrog', name: 'TREEFROG', updatedAt: 20, archived: false },
            ],
          },
          updated_at: '2026-06-05',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await putCanvasIndex({
      version: 1,
      activeProjectId: 'treefrog',
      projects: [
        { id: 'earthrise', name: 'EARTHRISE', updatedAt: 10, archived: false },
        { id: 'treefrog', name: 'TREEFROG', updatedAt: 20, archived: false },
      ],
    }, 7);

    expect(result.ok).toBe(true);
    const savedPayload = JSON.parse(query.mock.calls[1][1][1]);
    expect(savedPayload.activeProjectId).toBe('earthrise');
  });

  it('putCanvasIndex preserves omitted existing project rows from stale clients', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{
          revision: '7',
          payload: {
            version: 1,
            activeProjectId: 'earthrise',
            projects: [
              { id: 'earthrise', name: 'EARTHRISE', updatedAt: 10, archived: false },
              { id: 'treefrog', name: 'TREEFROG', updatedAt: 20, archived: false },
            ],
          },
          updated_at: '2026-06-05',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await putCanvasIndex({
      version: 1,
      activeProjectId: 'treefrog',
      projects: [
        { id: 'treefrog', name: 'TREEFROG', updatedAt: 20, archived: false },
      ],
    }, 7);

    expect(result.ok).toBe(true);
    const savedPayload = JSON.parse(query.mock.calls[1][1][1]);
    expect(savedPayload.projects.map((p) => p.id)).toEqual(['treefrog', 'earthrise']);
    expect(savedPayload.activeProjectId).toBe('earthrise');
  });

  it('putCanvasIndex falls back when the existing active project was explicitly deleted', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{
          revision: '7',
          payload: {
            version: 1,
            activeProjectId: 'earthrise',
            projects: [
              { id: 'earthrise', name: 'EARTHRISE', updatedAt: 10, archived: false },
              { id: 'treefrog', name: 'TREEFROG', updatedAt: 20, archived: false },
            ],
          },
          updated_at: '2026-06-05',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await putCanvasIndex({
      version: 1,
      activeProjectId: 'treefrog',
      projects: [
        { id: 'treefrog', name: 'TREEFROG', updatedAt: 20, archived: false },
      ],
    }, 7, { deletedProjectIds: ['earthrise'] });

    expect(result.ok).toBe(true);
    const savedPayload = JSON.parse(query.mock.calls[1][1][1]);
    expect(savedPayload.projects.map((p) => p.id)).toEqual(['treefrog']);
    expect(savedPayload.activeProjectId).toBe('treefrog');
  });

  it('putCanvasProject rejects empty overwrite of non-empty server document', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{
        revision: '4',
        payload: {
          projectName: 'Server',
          cards: [{ id: 'server-card' }],
          stagedSyncCards: [],
        },
        updated_at: '2020-01-01',
      }],
    });

    const result = await putCanvasProject('p1', { projectName: 'Server', cards: [] }, 4);

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.reason).toBe('empty_would_erase_server_cards');
    expect(result.payload.cards[0].id).toBe('server-card');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('putCanvasProject rejects empty overwrite of staged-only server document', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{
        revision: '4',
        payload: {
          projectName: 'Server',
          cards: [],
          stagedSyncCards: [{ stagingId: 's1', key: 'notes__dock' }],
        },
        updated_at: '2020-01-01',
      }],
    });

    const result = await putCanvasProject(
      'p1',
      { projectName: 'Server', cards: [], stagedSyncCards: [] },
      4,
    );

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.reason).toBe('empty_would_erase_server_cards');
    expect(result.payload.stagedSyncCards[0].key).toBe('notes__dock');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('putCanvasProject allows explicit empty overwrite', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{
          revision: '4',
          payload: {
            projectName: 'Server',
            cards: [{ id: 'server-card' }],
            stagedSyncCards: [],
          },
          updated_at: '2020-01-01',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await putCanvasProject(
      'p1',
      { projectName: 'Server', cards: [] },
      4,
      { allowEmptyRemoteOverwrite: true },
    );

    expect(result.ok).toBe(true);
    expect(result.revision).toBe(5);
  });

  it('putCanvasProject rejects dock-only overwrite of server canvas', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{
        revision: '4',
        payload: {
          projectName: 'Server',
          cards: [{ id: 'server-card', key: 'artifact.pdf' }],
          stagedSyncCards: [],
        },
        updated_at: '2020-01-01',
      }],
    });

    const result = await putCanvasProject(
      'p1',
      {
        projectName: 'Server',
        cards: [],
        stagedSyncCards: [{ stagingId: 'dock-1', key: 'artifact.pdf' }],
      },
      4,
    );

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.reason).toBe('dock_only_would_erase_server_canvas');
    expect(result.payload.cards[0].id).toBe('server-card');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('putCanvasProject allows explicit dock-only overwrite', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{
          revision: '4',
          payload: {
            projectName: 'Server',
            cards: [{ id: 'server-card', key: 'artifact.pdf' }],
            stagedSyncCards: [],
          },
          updated_at: '2020-01-01',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await putCanvasProject(
      'p1',
      {
        projectName: 'Server',
        cards: [],
        stagedSyncCards: [{ stagingId: 'dock-1', key: 'artifact.pdf' }],
      },
      4,
      { allowDockOnlyRemoteOverwrite: true },
    );

    expect(result.ok).toBe(true);
    expect(result.revision).toBe(5);
  });

  it('patchCanvasProject rejects patch that empties a non-empty server document', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{
        revision: '4',
        payload: {
          projectName: 'Server',
          cards: [{ id: 'server-card' }],
          stagedSyncCards: [],
        },
        updated_at: '2020-01-01',
      }],
    });

    const result = await patchCanvasProject('p1', {
      expectedRevision: 4,
      ops: [{ op: 'replaceDocument', payload: { projectName: 'Server', cards: [] } }],
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty_would_erase_server_cards');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('patchCanvasProject rejects patch that makes server canvas dock-only', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{
        revision: '4',
        payload: {
          projectName: 'Server',
          cards: [{ id: 'server-card', key: 'artifact.pdf' }],
          stagedSyncCards: [],
        },
        updated_at: '2020-01-01',
      }],
    });

    const result = await patchCanvasProject('p1', {
      expectedRevision: 4,
      ops: [{
        op: 'replaceDocument',
        payload: {
          projectName: 'Server',
          cards: [],
          stagedSyncCards: [{ stagingId: 'dock-1', key: 'artifact.pdf' }],
        },
      }],
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('dock_only_would_erase_server_canvas');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('putCanvasProject syncs index name and deletes project', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{ revision: '1', payload: {}, updated_at: '2020-01-01' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          payload: {
            version: 1,
            projects: [{
              id: 'p1',
              name: 'Old',
              updatedAt: 1,
              createdAt: 1,
              archived: false,
            }],
          },
          updated_at: '2020-01-01',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await putCanvasProject('p1', { projectName: 'New Name', cards: [] }, 1);
    await deleteCanvasProject('p1');
    expect(query.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
