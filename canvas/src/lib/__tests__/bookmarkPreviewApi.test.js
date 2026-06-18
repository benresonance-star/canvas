import { describe, expect, it } from 'vitest';
import { bookmarkEmbedPreviewUrl, buildFallbackBookmarkPreview } from '../bookmarkPreviewApi.js';

describe('bookmarkPreviewApi', () => {
  it('builds same-origin embed preview URLs through the API proxy', () => {
    expect(bookmarkEmbedPreviewUrl('https://shop.example/products/a?x=1#section')).toBe(
      '/api/bookmarks/embed?url=https%3A%2F%2Fshop.example%2Fproducts%2Fa%3Fx%3D1',
    );
  });

  it('builds fallback previews for unreachable URLs', () => {
    expect(buildFallbackBookmarkPreview('example.com/page')).toMatchObject({
      url: 'https://example.com/page',
      domain: 'example.com',
      imageUrl: null,
    });
  });
});
