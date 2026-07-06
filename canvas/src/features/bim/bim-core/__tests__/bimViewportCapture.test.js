import { describe, expect, it } from 'vitest';
import {
  captureBimViewportThumbnail,
  resolveThumbnailSize,
} from '../bimViewportCapture.js';

describe('bimViewportCapture', () => {
  it('resolves downscaled thumbnail dimensions', () => {
    expect(resolveThumbnailSize(1920, 1080, 320, 180)).toEqual({
      width: 320,
      height: 180,
    });
    expect(resolveThumbnailSize(160, 90, 320, 180)).toEqual({
      width: 160,
      height: 90,
    });
  });

  it('rejects capture when canvas has no size', async () => {
    await expect(captureBimViewportThumbnail({
      domElement: { width: 0, height: 0 },
    })).rejects.toThrow(/no drawable size/i);
  });

  it('rejects capture when renderer is missing', async () => {
    await expect(captureBimViewportThumbnail(null)).rejects.toThrow(/not ready/i);
  });
});
