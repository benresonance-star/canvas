import { describe, it, expect } from 'vitest';
import {
  parseGltfCompanionPaths,
  collapseGltfPackageFiles,
  buildGltfPackageDescriptors,
  isGltfPackageCompanionPath,
  gltfPackageCardKey,
} from '../gltfPackageScan.js';

const VINO_GLTF = {
  buffers: [{ uri: 'scene.bin' }],
  images: [{ uri: 'textures/albedo.png' }, { uri: 'textures/normal.png' }],
};

function scanRow(relativePath, extra = {}) {
  const filename = relativePath.split('/').pop();
  const parsed = {
    prefix: 'general',
    name: filename.replace(/\.[^.]+$/, ''),
    version: 1,
    ext: filename.split('.').pop(),
  };
  return {
    filename,
    relativePath,
    cardKey: relativePath.replace(/\.[^.]+$/, ''),
    ...parsed,
    ...extra,
  };
}

describe('parseGltfCompanionPaths', () => {
  it('resolves buffer and image URIs relative to the gltf file', () => {
    const paths = parseGltfCompanionPaths(VINO_GLTF, 'vino/scene.gltf');
    expect(paths).toEqual([
      'vino/scene.bin',
      'vino/textures/albedo.png',
      'vino/textures/normal.png',
    ]);
  });

  it('ignores data and absolute URIs', () => {
    const paths = parseGltfCompanionPaths(
      {
        buffers: [{ uri: 'data:application/octet-stream;base64,abc' }],
        images: [{ uri: 'https://example.com/t.png' }],
      },
      'vino/scene.gltf',
    );
    expect(paths).toEqual([]);
  });
});

describe('collapseGltfPackageFiles', () => {
  it('collapses vino package companions and names card from folder', () => {
    const found = [
      scanRow('vino/scene.gltf', { gltfJsonText: JSON.stringify(VINO_GLTF) }),
      scanRow('vino/scene.bin'),
      scanRow('vino/textures/albedo.png'),
      scanRow('vino/license.txt'),
      scanRow('notes__other-v1.md', { ext: 'md' }),
    ];

    const collapsed = collapseGltfPackageFiles(found);

    expect(collapsed.map((row) => row.relativePath)).toEqual([
      'vino/scene.gltf',
      'notes__other-v1.md',
    ]);
    expect(collapsed[0].name).toBe('vino');
    expect(collapsed[0].cardKey).toBe('vino/general__vino');
    expect(collapsed[0].threeDIsPackage).toBe(true);
    expect(collapsed[0].threeDPackageRoot).toBe('vino');
    expect(collapsed[0].gltfJsonText).toBeUndefined();
  });

  it('leaves standalone glb files unchanged', () => {
    const found = [scanRow('models/chair.glb', { ext: 'glb' })];
    const collapsed = collapseGltfPackageFiles(found);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].threeDIsPackage).toBeUndefined();
  });

  it('excludes license.txt only for single-gltf folders', () => {
    const found = [
      scanRow('pack/a.gltf', {
        gltfJsonText: JSON.stringify({ buffers: [{ uri: 'a.bin' }] }),
      }),
      scanRow('pack/b.gltf', {
        gltfJsonText: JSON.stringify({ buffers: [{ uri: 'b.bin' }] }),
      }),
      scanRow('pack/license.txt', { ext: 'txt' }),
    ];

    const collapsed = collapseGltfPackageFiles(found);
    expect(collapsed.map((row) => row.relativePath)).toEqual([
      'pack/a.gltf',
      'pack/b.gltf',
      'pack/license.txt',
    ]);
  });

  it('excludes any bin file in the same directory as a gltf package', () => {
    const found = [
      scanRow('vino/scene.gltf'),
      scanRow('vino/other.bin'),
    ];
    const collapsed = collapseGltfPackageFiles(found);
    expect(collapsed.map((row) => row.relativePath)).toEqual(['vino/scene.gltf']);
  });

  it('uses folder-based card keys to avoid scene name collisions', () => {
    expect(gltfPackageCardKey('3D gltf/vino', 'vino')).toBe('3D gltf/vino/general__vino');
    expect(gltfPackageCardKey('models/scene', 'scene')).toBe('models/scene/general__scene');
  });

  it('assigns companions per gltf when multiple gltf share a directory', () => {
    const found = [
      scanRow('pack/a.gltf', {
        gltfJsonText: JSON.stringify({
          buffers: [{ uri: 'a.bin' }],
          images: [{ uri: 'textures/a.png' }],
        }),
      }),
      scanRow('pack/b.gltf', {
        gltfJsonText: JSON.stringify({
          buffers: [{ uri: 'b.bin' }],
          images: [{ uri: 'textures/b.png' }],
        }),
      }),
      scanRow('pack/a.bin'),
      scanRow('pack/b.bin'),
      scanRow('pack/textures/a.png'),
      scanRow('pack/textures/b.png'),
    ];

    const collapsed = collapseGltfPackageFiles(found);
    expect(collapsed.map((row) => row.relativePath).sort()).toEqual([
      'pack/a.gltf',
      'pack/b.gltf',
    ]);
  });
});

describe('buildGltfPackageDescriptors', () => {
  it('marks companion paths for nested model folders', () => {
    const packages = buildGltfPackageDescriptors([
      scanRow('3D gltf/vino/scene.gltf', { gltfJsonText: JSON.stringify(VINO_GLTF) }),
      scanRow('3D gltf/vino/scene.bin'),
    ]);

    expect(packages).toHaveLength(1);
    expect(packages[0].displayName).toBe('vino');
    expect(isGltfPackageCompanionPath('3D gltf/vino/scene.bin', packages)).toBe(true);
    expect(isGltfPackageCompanionPath('3D gltf/vino/scene.gltf', packages)).toBe(false);
  });

  it('builds independent packages for sibling model folders', () => {
    const micJson = {
      buffers: [{ uri: 'scene.bin' }],
      images: [{ uri: 'textures/baseColor.png' }],
    };
    const found = [
      scanRow('3D gltf/vino/scene.gltf', { gltfJsonText: JSON.stringify(VINO_GLTF) }),
      scanRow('3D gltf/vino/scene.bin'),
      scanRow('3D gltf/vino/textures/albedo.png'),
      scanRow('3D gltf/microphone_gxl_066_bafhcteks/scene.gltf', { gltfJsonText: JSON.stringify(micJson) }),
      scanRow('3D gltf/microphone_gxl_066_bafhcteks/scene.bin'),
      scanRow('3D gltf/microphone_gxl_066_bafhcteks/textures/baseColor.png'),
    ];

    const collapsed = collapseGltfPackageFiles(found);

    expect(collapsed.map((row) => row.relativePath).sort()).toEqual([
      '3D gltf/microphone_gxl_066_bafhcteks/scene.gltf',
      '3D gltf/vino/scene.gltf',
    ]);
    const mic = collapsed.find((row) => row.name === 'microphone_gxl_066_bafhcteks');
    expect(mic).toMatchObject({
      name: 'microphone_gxl_066_bafhcteks',
      cardKey: '3D gltf/microphone_gxl_066_bafhcteks/general__microphone_gxl_066_bafhcteks',
      threeDIsPackage: true,
    });
  });

  it('collapses glb folders with texture companions', () => {
    const found = [
      scanRow('3D gltf/chair/model.glb', { ext: 'glb' }),
      scanRow('3D gltf/chair/textures/wood.png'),
    ];
    const collapsed = collapseGltfPackageFiles(found);
    expect(collapsed.map((row) => row.relativePath)).toEqual(['3D gltf/chair/model.glb']);
    expect(collapsed[0].name).toBe('chair');
  });
});
