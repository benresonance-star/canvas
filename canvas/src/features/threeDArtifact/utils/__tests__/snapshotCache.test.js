import { describe, expect, it } from 'vitest';
import {
  threeDSnapshotCacheKey,
  threeDSnapshotIsCurrent,
  threeDSnapshotNeedsCapture,
} from '../snapshotCache.js';

describe('threeDSnapshotCache', () => {
  it('builds a stable cache key per project card version and environment preset', () => {
    expect(threeDSnapshotCacheKey('proj-1', '3D gltf/vino/general__vino', 1)).toBe(
      'proj-1:3D gltf/vino/general__vino:v1:3d-snapshot:studio',
    );
    expect(threeDSnapshotCacheKey('proj-1', '3D gltf/vino/general__vino', 1, 'city')).toBe(
      'proj-1:3D gltf/vino/general__vino:v1:3d-snapshot:city',
    );
  });

  it('detects when a snapshot is missing or stale', () => {
    const version = { version: 1, content_hash: 'abc' };
    expect(threeDSnapshotNeedsCapture(version)).toBe(true);

    expect(threeDSnapshotNeedsCapture({
      ...version,
      threeDSnapshotCacheKey: 'proj:card:v1:3d-snapshot:studio',
      threeDSnapshotContentHash: 'abc',
      threeDSnapshotEnvironmentPreset: 'studio',
    })).toBe(false);

    expect(threeDSnapshotNeedsCapture({
      ...version,
      threeDSnapshotCacheKey: 'proj:card:v1:3d-snapshot:studio',
      threeDSnapshotContentHash: 'old',
      threeDSnapshotEnvironmentPreset: 'studio',
    })).toBe(true);

    expect(threeDSnapshotNeedsCapture({
      ...version,
      threeDSnapshotCacheKey: 'proj:card:v1:3d-snapshot:studio',
      threeDSnapshotContentHash: 'abc',
      threeDSnapshotEnvironmentPreset: 'studio',
    }, 'city')).toBe(true);
  });

  it('reports current snapshots only when hash and preset match', () => {
    expect(threeDSnapshotIsCurrent({
      content_hash: 'abc',
      threeDSnapshotCacheKey: 'key',
      threeDSnapshotContentHash: 'abc',
      threeDSnapshotEnvironmentPreset: 'studio',
    })).toBe(true);
    expect(threeDSnapshotIsCurrent({
      content_hash: 'abc',
      threeDSnapshotCacheKey: 'key',
      threeDSnapshotContentHash: 'old',
      threeDSnapshotEnvironmentPreset: 'studio',
    })).toBe(false);
    expect(threeDSnapshotIsCurrent({
      content_hash: 'abc',
      threeDSnapshotCacheKey: 'key',
      threeDSnapshotContentHash: 'abc',
      threeDSnapshotEnvironmentPreset: 'studio',
    }, 'city')).toBe(false);
  });
});
