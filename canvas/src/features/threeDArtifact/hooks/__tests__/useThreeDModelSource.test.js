import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PREVIEW_MAX_BYTES_3D_MODEL } from '../../../../lib/constants.js';

vi.mock('../../../../lib/previewStore.js', () => ({
  getPreview: vi.fn(),
}));

vi.mock('../../../../lib/folderWrite.js', () => ({
  getFileHandleAtPath: vi.fn(),
}));

import { getPreview } from '../../../../lib/previewStore.js';
import { getFileHandleAtPath } from '../../../../lib/folderWrite.js';
import {
  assessThreeDPreviewFeasibility,
  canAutoLoadThreeDSource,
  canRequestFolderLoad,
} from '../../utils/previewFeasibility.js';

async function loadResolveThreeDSourceUrl(module) {
  const { resolveThreeDSourceUrl } = module;
  return resolveThreeDSourceUrl;
}

describe('useThreeDModelSource folder loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assessThreeDPreviewFeasibility blocks auto load for oversized linked files', () => {
    const version = {
      filename: 'large.glb',
      ext: 'glb',
      size: PREVIEW_MAX_BYTES_3D_MODEL + 1,
      relativePath: 'models/large.glb',
    };
    const feasibility = assessThreeDPreviewFeasibility(version, { folderLinked: true });
    expect(feasibility.mode).toBe('folder_on_demand');
    expect(canAutoLoadThreeDSource(feasibility.mode)).toBe(false);
    expect(canRequestFolderLoad(feasibility.mode)).toBe(true);
  });

  it('resolveThreeDSourceUrl loads from folder when loadFromFolder is true', async () => {
    const fileBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
    getFileHandleAtPath.mockResolvedValue({
      getFile: async () => new File([fileBytes], 'large.glb', { type: 'model/gltf-binary' }),
    });

    const module = await import('../useThreeDModelSource.js');
    const resolveThreeDSourceUrl = await loadResolveThreeDSourceUrl(module);

    const version = {
      filename: 'large.glb',
      ext: 'glb',
      relativePath: 'models/large.glb',
    };
    const folderHandle = { name: 'project' };

    const resolved = await resolveThreeDSourceUrl({
      version,
      folderHandle,
      format: 'glb',
      loadFromFolder: true,
    });

    expect(getFileHandleAtPath).toHaveBeenCalledWith(folderHandle, 'models/large.glb');
    expect(resolved.sourceUrl).toMatch(/^blob:/);
    resolved.ephemeralUrls.forEach((url) => URL.revokeObjectURL(url));
  });

  it('resolveThreeDSourceUrl does not load from folder unless requested', async () => {
    const module = await import('../useThreeDModelSource.js');
    const resolveThreeDSourceUrl = await loadResolveThreeDSourceUrl(module);

    const version = {
      filename: 'large.glb',
      ext: 'glb',
      relativePath: 'models/large.glb',
    };
    const folderHandle = { name: 'project' };

    const resolved = await resolveThreeDSourceUrl({
      version,
      folderHandle,
      format: 'glb',
      loadFromFolder: false,
    });

    expect(getFileHandleAtPath).not.toHaveBeenCalled();
    expect(resolved.sourceUrl).toBeNull();
  });

  it('resolveThreeDSourceUrl loads from preview cache for inline models', async () => {
    const blob = new Blob(['glb'], { type: 'model/gltf-binary' });
    getPreview.mockResolvedValue(blob);

    const module = await import('../useThreeDModelSource.js');
    const resolveThreeDSourceUrl = await loadResolveThreeDSourceUrl(module);

    const resolved = await resolveThreeDSourceUrl({
      version: {
        filename: 'chair.glb',
        ext: 'glb',
        previewCacheKey: 'proj:card:v1',
      },
      folderHandle: null,
      format: 'glb',
      loadFromFolder: false,
    });

    expect(getPreview).toHaveBeenCalledWith('proj:card:v1');
    expect(resolved.sourceUrl).toMatch(/^blob:/);
    resolved.ephemeralUrls.forEach((url) => URL.revokeObjectURL(url));
  });
});
