import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../db.js', () => ({
  query: (...args) => queryMock(...args),
  pool: { connect: vi.fn() },
}));

describe('patchCanvasProject', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('returns 409 shape when revision mismatches', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          revision: 3,
          payload: { projectName: 'A', cards: [], stagedSyncCards: [] },
          updated_at: '2020-01-01',
        },
      ],
    });
    const { patchCanvasProject } = await import('../canvas-projects.js');
    const result = await patchCanvasProject('p1', {
      expectedRevision: 2,
      ops: [{ op: 'setProjectName', projectName: 'B' }],
    });
    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.revision).toBe(3);
  });

  it('applies ops and bumps revision on success', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            revision: 1,
            payload: {
              projectName: 'A',
              cards: [{ id: 'c1', key: 'k', x: 0, y: 0 }],
              stagedSyncCards: [],
              canvasView: { x: 0, y: 0, zoom: 1 },
            },
            updated_at: '2020-01-01',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const { patchCanvasProject } = await import('../canvas-projects.js');
    const result = await patchCanvasProject('p1', {
      expectedRevision: 1,
      ops: [{ op: 'setCardLayout', id: 'c1', x: 50, y: 60 }],
    });
    expect(result.ok).toBe(true);
    expect(result.revision).toBe(2);
    expect(result.payload.cards[0].x).toBe(50);
    expect(queryMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects invalid ops', async () => {
    const { patchCanvasProject } = await import('../canvas-projects.js');
    const result = await patchCanvasProject('p1', {
      expectedRevision: 0,
      ops: [],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty_ops');
  });
});
