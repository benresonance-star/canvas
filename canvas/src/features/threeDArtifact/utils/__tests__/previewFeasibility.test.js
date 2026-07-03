import { describe, it, expect } from 'vitest';
import {
  PREVIEW_MAX_BYTES_3D_MODEL,
  THREE_D_HARD_MAX_BYTES,
} from '../../../../lib/constants.js';
import {
  assessThreeDPreviewFeasibility,
  canAutoLoadThreeDSource,
  canRequestFolderLoad,
} from '../previewFeasibility.js';

describe('assessThreeDPreviewFeasibility', () => {
  it('returns inline_ok when preview cache key is present', () => {
    const result = assessThreeDPreviewFeasibility(
      {
        filename: 'big.glb',
        ext: 'glb',
        size: PREVIEW_MAX_BYTES_3D_MODEL + 1,
        previewCacheKey: 'proj:card:v1',
      },
      { folderLinked: false },
    );
    expect(result.mode).toBe('inline_ok');
    expect(canAutoLoadThreeDSource(result.mode)).toBe(true);
  });

  it('returns inline_ok for small files without cached source', () => {
    const result = assessThreeDPreviewFeasibility(
      { filename: 'small.glb', ext: 'glb', size: 1024 },
      { folderLinked: false },
    );
    expect(result.mode).toBe('inline_ok');
  });

  it('returns folder_on_demand for oversized files with linked folder', () => {
    const result = assessThreeDPreviewFeasibility(
      {
        filename: 'large.glb',
        ext: 'glb',
        size: PREVIEW_MAX_BYTES_3D_MODEL + 1,
        relativePath: 'models/large.glb',
      },
      { folderLinked: true },
    );
    expect(result.mode).toBe('folder_on_demand');
    expect(canRequestFolderLoad(result.mode)).toBe(true);
    expect(canAutoLoadThreeDSource(result.mode)).toBe(false);
  });

  it('returns no_folder when oversized and folder not linked', () => {
    const result = assessThreeDPreviewFeasibility(
      {
        filename: 'large.glb',
        ext: 'glb',
        size: PREVIEW_MAX_BYTES_3D_MODEL + 1,
        relativePath: 'models/large.glb',
      },
      { folderLinked: false },
    );
    expect(result.mode).toBe('no_folder');
  });

  it('returns hard_limit above safety ceiling', () => {
    const result = assessThreeDPreviewFeasibility(
      {
        filename: 'huge.glb',
        ext: 'glb',
        size: THREE_D_HARD_MAX_BYTES + 1,
        relativePath: 'models/huge.glb',
      },
      { folderLinked: true },
    );
    expect(result.mode).toBe('hard_limit');
  });

  it('returns unsupported for obj format', () => {
    const result = assessThreeDPreviewFeasibility(
      { filename: 'model.obj', ext: 'obj', size: 1024 },
      { folderLinked: true },
    );
    expect(result.mode).toBe('unsupported');
  });

  it('warns on very_high complexity when inline_ok', () => {
    const result = assessThreeDPreviewFeasibility(
      {
        filename: 'dense.glb',
        ext: 'glb',
        size: 1024,
        objectUrl: 'blob:abc',
        threeD: { metadata: { estimatedComplexity: 'very_high' } },
      },
      { folderLinked: false },
    );
    expect(result.mode).toBe('inline_ok');
    expect(result.warnHeavy).toBe(true);
  });
});
