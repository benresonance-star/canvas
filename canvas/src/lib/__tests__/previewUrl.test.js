import { describe, expect, it } from 'vitest';
import {
  isBlobUrl,
  previewNeedsRehydrate,
  stripEphemeralPreviewUrls,
} from '../previewUrl.js';

describe('previewUrl', () => {
  it('detects blob preview URLs', () => {
    expect(isBlobUrl('blob:http://localhost/abc')).toBe(true);
    expect(isBlobUrl('data:text/plain,hi')).toBe(false);
  });

  it('strips dead session blob URLs when a cache key exists', () => {
    const stripped = stripEphemeralPreviewUrls({
      version: 1,
      previewCacheKey: 'p:1',
      objectUrl: 'blob:http://localhost/abc',
      inline: true,
    });
    expect(stripped.objectUrl).toBeUndefined();
    expect(stripped.previewStripped).toBe(true);
    expect(stripped.inline).toBe(false);
  });

  it('marks blob-backed previews for rehydration', () => {
    expect(previewNeedsRehydrate({
      previewCacheKey: 'p:1',
      objectUrl: 'blob:http://localhost/abc',
    })).toBe(true);
    expect(previewNeedsRehydrate({
      previewCacheKey: 'p:1',
      objectUrl: 'https://example.com/file.pdf',
    })).toBe(false);
  });
});
