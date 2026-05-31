import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();

vi.mock('../../db.js', () => ({
  query: (...args) => query(...args),
}));

describe('spec-canvas-state repository', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('getSpecCanvasState returns null when missing', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const { getSpecCanvasState } = await import('../spec-canvas-state.js');
    expect(await getSpecCanvasState('p1')).toBeNull();
  });

  it('putSpecCanvasState inserts on first write', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const { putSpecCanvasState } = await import('../spec-canvas-state.js');
    const result = await putSpecCanvasState(
      'p1',
      { layout: { placed: [] }, viewport: { x: 0, y: 0, zoom: 1 } },
      0,
    );
    expect(result.ok).toBe(true);
    expect(result.version).toBe(1);
  });
});
