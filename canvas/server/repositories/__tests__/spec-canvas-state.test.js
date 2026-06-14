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
      .mockResolvedValueOnce({ rows: [{ version: '1', updated_at: 'now' }] });
    const { putSpecCanvasState } = await import('../spec-canvas-state.js');
    const result = await putSpecCanvasState(
      'p1',
      { layout: { placed: [] }, viewport: { x: 0, y: 0, zoom: 1 } },
      0,
    );
    expect(result.ok).toBe(true);
    expect(result.version).toBe(1);
  });

  it('putSpecCanvasState returns conflict when concurrent insert wins', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ version: '1' }] });

    const { putSpecCanvasState } = await import('../spec-canvas-state.js');
    const result = await putSpecCanvasState(
      'p1',
      { layout: { placed: [] }, viewport: { x: 0, y: 0, zoom: 1 } },
      0,
    );

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.version).toBe(1);
  });

  it('putSpecCanvasState updates with atomic version check', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ version: '2' }] })
      .mockResolvedValueOnce({ rows: [{ version: '3', updated_at: 'now' }] });

    const { putSpecCanvasState } = await import('../spec-canvas-state.js');
    const result = await putSpecCanvasState(
      'p1',
      { layout: { placed: [{ syncKey: 'a' }] }, viewport: { x: 0, y: 0, zoom: 1 } },
      2,
    );

    expect(result.ok).toBe(true);
    expect(result.version).toBe(3);
    expect(query.mock.calls[1][0]).toContain('version = $6');
  });

  it('putSpecCanvasState returns conflict when atomic update loses the version race', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ version: '2' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ version: '3' }] });

    const { putSpecCanvasState } = await import('../spec-canvas-state.js');
    const result = await putSpecCanvasState(
      'p1',
      { layout: { placed: [{ syncKey: 'client' }] }, viewport: { x: 0, y: 0, zoom: 1 } },
      2,
    );

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.version).toBe(3);
  });
});
