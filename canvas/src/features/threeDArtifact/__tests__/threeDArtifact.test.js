import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectThreeDFormat,
  isSupportedThreeDFormat,
} from '../utils/fileFormat.js';
import { computeModelStats } from '../loaders/computeModelStats.js';
import {
  rewriteGltfDependencies,
  getGltfRewriteCacheKey,
  clearThreeDGltfRewriteCache,
} from '../hooks/useThreeDModelSource.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('3D artifact format detection', () => {
  it('detects supported GLB and GLTF formats', () => {
    expect(detectThreeDFormat('models__chair-v1.glb')).toBe('glb');
    expect(detectThreeDFormat('models__chair-v1.gltf')).toBe('gltf');
    expect(isSupportedThreeDFormat('glb')).toBe(true);
    expect(isSupportedThreeDFormat('gltf')).toBe(true);
  });

  it('detects known future formats as unsupported', () => {
    expect(detectThreeDFormat('mesh.obj')).toBe('obj');
    expect(isSupportedThreeDFormat('obj')).toBe(false);
    expect(detectThreeDFormat('notes.md')).toBeNull();
  });
});

describe('computeModelStats', () => {
  it('computes bounds and mesh counts for a simple mesh', () => {
    const geometry = new THREE.BoxGeometry(2, 4, 6);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    const group = new THREE.Group();
    group.add(mesh);

    const stats = computeModelStats(group);

    expect(stats.meshCount).toBe(1);
    expect(stats.vertexCount).toBeGreaterThan(0);
    expect(stats.triangleCount).toBeGreaterThan(0);
    expect(stats.materialCount).toBe(1);
    expect(stats.bounds.size).toEqual([2, 4, 6]);
    expect(stats.estimatedComplexity).toBe('low');
  });
});

describe('rewriteGltfDependencies', () => {
  it('loads GLTF buffers and images relative to the model file', async () => {
    const requested = [];
    const folderHandle = {
      async getDirectoryHandle(name) {
        requested.push(`dir:${name}`);
        return this;
      },
      async getFileHandle(name) {
        requested.push(`file:${name}`);
        return {
          async getFile() {
            return new File(['asset'], name, { type: 'application/octet-stream' });
          },
        };
      },
    };
    const createObjectURL = vi.fn((blob) =>
      blob.type === 'model/gltf+json' ? 'blob:rewritten-gltf' : `blob:asset-${createObjectURL.mock.calls.length}`,
    );
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      async text() {
        return JSON.stringify({
          asset: { version: '2.0' },
          buffers: [{ uri: 'scene.bin' }],
          images: [{ uri: 'textures/base color.jpg' }],
        });
      },
    })));

    const result = await rewriteGltfDependencies({
      sourceUrl: 'blob:scene',
      folderHandle,
      relativePath: 'models/scene.gltf',
    });

    expect(result.sourceUrl).toBe('blob:rewritten-gltf');
    expect(requested).toContain('dir:models');
    expect(requested).toContain('dir:textures');
    expect(requested).toContain('file:scene.bin');
    expect(requested).toContain('file:base color.jpg');
    expect(result.objectUrls).toContain('blob:rewritten-gltf');
  });
});

describe('getGltfRewriteCacheKey', () => {
  afterEach(() => {
    clearThreeDGltfRewriteCache();
  });

  it('builds a stable key from relative path and content hash', () => {
    expect(getGltfRewriteCacheKey({
      relativePath: 'models/chair.gltf',
      content_hash: 'abc123',
    })).toBe('models/chair.gltf|abc123');
  });
});
