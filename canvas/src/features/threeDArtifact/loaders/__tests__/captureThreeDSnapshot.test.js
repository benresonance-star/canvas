import { describe, expect, it } from 'vitest';
import { captureThreeDSnapshotBlob } from '../captureThreeDSnapshot.js';

describe('captureThreeDSnapshotBlob', () => {
  it('rejects unsupported formats', async () => {
    await expect(captureThreeDSnapshotBlob({
      sourceUrl: 'blob:model',
      format: 'obj',
    })).rejects.toThrow('Unsupported 3D format for snapshot');
  });

  it('rejects missing source URLs', async () => {
    await expect(captureThreeDSnapshotBlob({
      sourceUrl: '',
      format: 'glb',
    })).rejects.toThrow('Unsupported 3D format for snapshot');
  });
});
