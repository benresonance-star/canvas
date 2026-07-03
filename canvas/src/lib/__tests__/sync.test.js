import { describe, expect, it } from 'vitest';
import {
  mergeDiskPreviewIntoCardVersions,
  shouldRefreshVersionFromDisk,
} from '../sync.js';

describe('shouldRefreshVersionFromDisk', () => {
  it('returns true when content_hash differs', () => {
    expect(
      shouldRefreshVersionFromDisk(
        { version: 1, content_hash: 'aaa', ext: 'md' },
        { version: 1, content_hash: 'bbb', ext: 'md' },
      ),
    ).toBe(true);
  });

  it('returns true when markdown content differs', () => {
    expect(
      shouldRefreshVersionFromDisk(
        { version: 1, content: '# old', ext: 'md' },
        { version: 1, content: '# new', ext: 'md' },
      ),
    ).toBe(true);
  });
});

describe('mergeDiskPreviewIntoCardVersions', () => {
  it('merges updated transcript content from disk', () => {
    const merged = mergeDiskPreviewIntoCardVersions(
      [{ version: 1, content: 'old', content_hash: 'h1', ext: 'md' }],
      [{ version: 1, content: 'new transcript', content_hash: 'h2', ext: 'md' }],
    );
    expect(merged[0].content).toBe('new transcript');
    expect(merged[0].content_hash).toBe('h2');
  });

  it('clears stale 3D snapshot metadata when content hash changes', () => {
    const merged = mergeDiskPreviewIntoCardVersions(
      [{
        version: 1,
        ext: 'gltf',
        content_hash: 'old-hash',
        threeDSnapshotCacheKey: 'proj:card:v1:3d-snapshot',
        threeDSnapshotContentHash: 'old-hash',
      }],
      [{ version: 1, content_hash: 'new-hash', ext: 'gltf', objectUrl: 'blob:new' }],
    );
    expect(merged[0].content_hash).toBe('new-hash');
    expect(merged[0].threeDSnapshotCacheKey).toBeNull();
    expect(merged[0].threeDSnapshotContentHash).toBeNull();
    expect(merged[0].threeDSnapshotEnvironmentPreset).toBeNull();
  });
});
