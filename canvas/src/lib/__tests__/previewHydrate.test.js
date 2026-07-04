import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../previewStore.js', () => ({
  getPreview: vi.fn(),
}));

import { getPreview } from '../previewStore.js';
import { hydrateCardsPreviews, cardsPreviewsChanged, hydrateVersion } from '../previewHydrate.js';

describe('hydrateCardsPreviews', () => {
  beforeEach(() => {
    vi.mocked(getPreview).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('cardsPreviewsChanged tolerates null versions', () => {
    const before = [{ id: 'c1', versions: null }];
    const after = [{ id: 'c1', versions: [] }];
    expect(() => cardsPreviewsChanged(before, after)).not.toThrow();
    expect(cardsPreviewsChanged(before, after)).toBe(false);
  });

  it('localOnly passes localOnly to getPreview', async () => {
    vi.mocked(getPreview).mockResolvedValue(null);
    const cards = [
      {
        id: 'c1',
        versions: [{ version: 1, ext: 'png', previewCacheKey: 'p:c1:v1' }],
      },
    ];
    await hydrateCardsPreviews(cards, { localOnly: true });
    expect(getPreview).toHaveBeenCalledWith('p:c1:v1', { localOnly: true });
  });

  it('rehydrates when a stale blob URL is still attached', async () => {
    const blob = new Blob(['ifc-bytes'], { type: 'application/x-step' });
    vi.mocked(getPreview).mockResolvedValue(blob);
    const createObjectURL = vi.fn(() => 'blob:ifc-fresh');
    vi.stubGlobal('URL', { createObjectURL });

    const hydrated = await hydrateVersion({
      version: 1,
      ext: 'ifc',
      previewCacheKey: 'p:ifc:v1',
      objectUrl: 'blob:http://localhost/dead',
    });

    expect(getPreview).toHaveBeenCalledWith('p:ifc:v1', { localOnly: false });
    expect(hydrated.objectUrl).toBe('blob:ifc-fresh');
  });

  it('hydrates 3D model versions from preview blobs', async () => {
    const blob = new Blob(['glb-bytes'], { type: 'model/gltf-binary' });
    vi.mocked(getPreview).mockResolvedValue(blob);
    const createObjectURL = vi.fn(() => 'blob:model-1');
    vi.stubGlobal('URL', { createObjectURL });

    const hydrated = await hydrateVersion({
      version: 1,
      ext: 'glb',
      previewCacheKey: 'p:model:v1',
    });

    expect(hydrated.objectUrl).toBe('blob:model-1');
    expect(hydrated.inline).toBe(true);
    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });
});
