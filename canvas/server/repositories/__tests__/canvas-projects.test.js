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
      .mockResolvedValueOnce({ rows: [] });
    const result = await putCanvasProject('p1', { projectName: 'New', cards: [] }, 0);
    expect(result.ok).toBe(true);
    expect(result.revision).toBe(1);
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
