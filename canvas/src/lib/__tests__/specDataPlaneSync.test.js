import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../specDataPlaneApi.js', () => ({
  fetchSpecCanvasState: vi.fn(),
  saveSpecCanvasState: vi.fn(),
}));

vi.mock('../primitivesApi.js', () => ({
  isApiAvailable: vi.fn(async () => true),
}));

const storage = new Map();

function installLocalStorage() {
  vi.stubGlobal('localStorage', {
    removeItem: (key) => storage.delete(key),
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  });
}

describe('reconcileSpecCanvasOnLoad', () => {
  beforeEach(() => {
    storage.clear();
    installLocalStorage();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps project JSON authoritative when spec timestamp is newer than the document', async () => {
    const { fetchSpecCanvasState } = await import('../specDataPlaneApi.js');
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
    expect(merged.specLayoutAuthoritative).toBeUndefined();
    expect(merged.cards[0].x).toBe(0);
    expect(merged.cards[0].y).toBe(0);
    expect(merged.canvasView.zoom).toBe(1);
    expect(merged.specCanvasState.version).toBe(1);
  });

  it('keeps project JSON authoritative when document meta is missing but spec row exists', async () => {
    const { fetchSpecCanvasState } = await import('../specDataPlaneApi.js');
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
    expect(merged.specLayoutAuthoritative).toBeUndefined();
    expect(merged.cards[0].x).toBe(0);
    expect(merged.specCanvasState.version).toBe(1);
  });

  it('keeps JSON authoritative when spec row is older than the document', async () => {
    const { fetchSpecCanvasState } = await import('../specDataPlaneApi.js');
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

  it('retries dual-write when spec canvas version advances concurrently', async () => {
    const { fetchSpecCanvasState, saveSpecCanvasState } = await import('../specDataPlaneApi.js');
    fetchSpecCanvasState.mockResolvedValue({
      version: 2,
      layout: { placed: [], staging: [] },
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    saveSpecCanvasState
      .mockResolvedValueOnce({ conflict: true, version: 3 })
      .mockResolvedValueOnce({ ok: true, version: 4 });

    const { syncSpecCanvasStateFromPayload } = await import('../specDataPlaneSync.js');
    const result = await syncSpecCanvasStateFromPayload('p1', {
      cards: [{ id: 'c1', key: 'k1', x: 10, y: 20, versions: [] }],
      stagedSyncCards: [],
      canvasView: { x: 1, y: 2, zoom: 0.5 },
    });

    expect(result).toEqual({ ok: true, retried: true });
    expect(saveSpecCanvasState).toHaveBeenNthCalledWith(
      1,
      'p1',
      expect.any(Object),
      2,
    );
    expect(saveSpecCanvasState).toHaveBeenNthCalledWith(
      2,
      'p1',
      expect.any(Object),
      3,
    );
  });

  it('queues dual-write retry when spec save does not succeed', async () => {
    const { fetchSpecCanvasState, saveSpecCanvasState } = await import('../specDataPlaneApi.js');
    fetchSpecCanvasState.mockResolvedValue(null);
    saveSpecCanvasState.mockResolvedValue({ conflict: true, version: 1 });

    const { syncSpecCanvasStateFromPayload } = await import('../specDataPlaneSync.js');
    const payload = {
      cards: [{ id: 'c1', key: 'k1', x: 10, y: 20, versions: [] }],
      stagedSyncCards: [],
      canvasView: { x: 1, y: 2, zoom: 0.5 },
    };
    const result = await syncSpecCanvasStateFromPayload('p1', payload);

    expect(result).toEqual({ ok: false });
    const outbox = JSON.parse(storage.get('canvas:spec-sync-outbox'));
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ projectId: 'p1', payload });
  });
});
