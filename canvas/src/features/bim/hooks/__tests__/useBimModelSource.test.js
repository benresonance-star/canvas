import { describe, expect, it } from 'vitest';
import { buildBimSourceIdentity } from '../useBimModelSource.js';

describe('useBimModelSource', () => {
  it('buildBimSourceIdentity ignores style-only version patches', () => {
    const base = {
      content_hash: 'abc123',
      filename: 'model.ifc',
      relativePath: 'models/model.ifc',
      previewCacheKey: 'preview-1',
    };
    const withStyle = {
      ...base,
      bim: {
        styleSettings: {
          renderStyle: 'clay',
          clayAoIntensity: 42,
        },
      },
    };
    expect(buildBimSourceIdentity(base)).toBe(buildBimSourceIdentity(withStyle));
  });
});
