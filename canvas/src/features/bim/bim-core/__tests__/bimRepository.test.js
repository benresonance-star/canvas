import { describe, expect, it } from 'vitest';
import { createMemoryBimRepository } from '../bimRepository.js';

describe('bimRepository view thumbnails', () => {
  it('round-trips thumbnail blobs through the memory repository', async () => {
    const repo = createMemoryBimRepository();
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    await repo.putViewThumbnail('bim-view:test', blob);
    const restored = await repo.getViewThumbnail('bim-view:test');
    expect(restored).toBeInstanceOf(Blob);
    expect(restored.type).toBe('image/jpeg');
    await repo.deleteViewThumbnail('bim-view:test');
    expect(await repo.getViewThumbnail('bim-view:test')).toBeNull();
  });
});
