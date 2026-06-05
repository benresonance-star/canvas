import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../specDataPlaneApi.js', () => ({
  fetchSpecCanvasState: vi.fn(),
  saveSpecCanvasState: vi.fn(),
}));

vi.mock('../canvasProjectsApi.js', () => ({
  fetchCanvasProjectMeta: vi.fn(),
}));

vi.mock('../primitivesApi.js', () => ({
  isApiAvailable: vi.fn(async () => true),
}));

describe('reconcileSpecCanvasOnLoad', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies spec layout when spec timestamp is at least as fresh as the document', async () => {
    const { fetchSpecCanvasState } = await import('../specDataPlaneApi.js');
    const { fetchCanvasProjectMeta } = await import('../canvasProjectsApi.js');
    fetchCanvasProjectMeta.mockResolvedValue({
      revision: 3,
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
    fetchSpecCanvasState.mockResolvedValue({
      version: 1,
      updatedAt: '2026-06-05T00:00:01.000Z',
      layout: {
        placed: [{ syncKey: 'k1', x: 99, y: 88, w: null, h: null }],
        staging: [],
        artifactPlacements: { k1: { surface: 'canvas' } },
      },
      viewport: { x: 5, y: 6, zoom: 2 },
    });

    const payload = {
      cards: [{ id: 'c1', key: 'k1', type: 'user_note', x: 0, y: 0, versions: [] }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };

    const { reconcileSpecCanvasOnLoad } = await import('../specDataPlaneSync.js');
    const merged = await reconcileSpecCanvasOnLoad('p1', payload);
    expect(merged.specLayoutAuthoritative).toBe(true);
    expect(merged.cards[0].x).toBe(99);
    expect(merged.cards[0].y).toBe(88);
    expect(merged.canvasView.zoom).toBe(2);
    expect(merged.artifactPlacements.k1.surface).toBe('canvas');
  });

  it('applies spec when document meta is missing but spec row exists', async () => {
    const { fetchSpecCanvasState } = await import('../specDataPlaneApi.js');
    const { fetchCanvasProjectMeta } = await import('../canvasProjectsApi.js');
    fetchCanvasProjectMeta.mockResolvedValue(null);
    fetchSpecCanvasState.mockResolvedValue({
      version: 1,
      updatedAt: '2026-06-05T00:00:01.000Z',
      layout: {
        placed: [{ syncKey: 'k1', x: 50, y: 60, w: null, h: null }],
        staging: [],
        artifactPlacements: null,
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    const payload = {
      cards: [{ id: 'c1', key: 'k1', type: 'user_note', x: 0, y: 0, versions: [] }],
    };

    const { reconcileSpecCanvasOnLoad } = await import('../specDataPlaneSync.js');
    const merged = await reconcileSpecCanvasOnLoad('p1', payload);
    expect(merged.specLayoutAuthoritative).toBe(true);
    expect(merged.cards[0].x).toBe(50);
  });

  it('keeps JSON authoritative when spec row is older than the document', async () => {
    const { fetchSpecCanvasState } = await import('../specDataPlaneApi.js');
    const { fetchCanvasProjectMeta } = await import('../canvasProjectsApi.js');
    fetchCanvasProjectMeta.mockResolvedValue({
      revision: 2,
      updatedAt: '2026-06-05T00:00:02.000Z',
    });
    fetchSpecCanvasState.mockResolvedValue({
      version: 99,
      updatedAt: '2026-06-05T00:00:01.000Z',
      layout: { placed: [], staging: [] },
    });

    const payload = {
      cards: [{ id: 'c1', key: 'k1', type: 'user_note', x: 0, y: 0, versions: [] }],
    };

    const { reconcileSpecCanvasOnLoad } = await import('../specDataPlaneSync.js');
    const merged = await reconcileSpecCanvasOnLoad('p1', payload);
    expect(merged.specLayoutAuthoritative).toBeUndefined();
    expect(merged.cards[0].x).toBe(0);
  });
});
