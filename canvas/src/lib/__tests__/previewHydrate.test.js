import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../previewStore.js', () => ({
  getPreview: vi.fn(),
}));

import { getPreview } from '../previewStore.js';
import { hydrateCardsPreviews, cardsPreviewsChanged } from '../previewHydrate.js';

describe('hydrateCardsPreviews', () => {
  beforeEach(() => {
    vi.mocked(getPreview).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
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
});
