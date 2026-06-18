import { Buffer } from 'node:buffer';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  fetchBookmarkPreview,
  buildEmbeddablePreviewHtml,
  normalizePreviewUrl,
  isBlockedPreviewHost,
  isAmazonPreviewHost,
  isGenericAmazonPreviewImage,
  parseOpenGraphFromHtml,
  resolvePreviewImageUrl,
  shouldUsePageScreenshotPreview,
  youtubeThumbnailUrlFromPreviewUrl,
  youtubeVideoIdFromUrl,
} from '../urlPreview.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizePreviewUrl', () => {
  it('accepts https urls', () => {
    const u = normalizePreviewUrl('https://example.com/a');
    expect(u?.hostname).toBe('example.com');
  });

  it('rejects file urls', () => {
    expect(normalizePreviewUrl('file:///etc/passwd')).toBeNull();
  });
});

describe('isBlockedPreviewHost', () => {
  it('blocks localhost', () => {
    expect(isBlockedPreviewHost('localhost')).toBe(true);
    expect(isBlockedPreviewHost('127.0.0.1')).toBe(true);
  });
});

describe('parseOpenGraphFromHtml', () => {
  it('reads og tags', () => {
    const html = `
      <html><head>
        <meta property="og:title" content="My Page" />
        <meta property="og:description" content="Summary here" />
        <meta property="og:image" content="https://cdn.example.com/img.png" />
      </head></html>`;
    const og = parseOpenGraphFromHtml(html);
    expect(og.title).toBe('My Page');
    expect(og.description).toBe('Summary here');
    expect(og.imageUrl).toBe('https://cdn.example.com/img.png');
  });
});

describe('resolvePreviewImageUrl', () => {
  it('resolves relative image paths', () => {
    expect(
      resolvePreviewImageUrl('https://example.com/page', '/img.png'),
    ).toBe('https://example.com/img.png');
  });
});

describe('YouTube preview fallback', () => {
  it('extracts ids from short and watch URLs', () => {
    expect(youtubeVideoIdFromUrl(new URL('https://youtu.be/dRPCxunlcjY?si=abc'))).toBe(
      'dRPCxunlcjY',
    );
    expect(youtubeVideoIdFromUrl(new URL('https://www.youtube.com/watch?v=dRPCxunlcjY'))).toBe(
      'dRPCxunlcjY',
    );
    expect(youtubeVideoIdFromUrl(new URL('https://youtube.com/shorts/dRPCxunlcjY'))).toBe(
      'dRPCxunlcjY',
    );
  });

  it('builds a stable thumbnail URL for YouTube links', () => {
    expect(
      youtubeThumbnailUrlFromPreviewUrl(new URL('https://youtu.be/dRPCxunlcjY?si=abc')),
    ).toBe('https://i.ytimg.com/vi/dRPCxunlcjY/hqdefault.jpg');
  });

  it('uses a thumbnail fallback when YouTube does not return HTML metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      headers: {
        get: () => 'text/plain',
      },
      arrayBuffer: vi.fn(),
    })));

    const preview = await fetchBookmarkPreview('https://youtu.be/dRPCxunlcjY?si=abc');

    expect(preview).toMatchObject({
      ok: true,
      domain: 'youtu.be',
      imageUrl: 'https://i.ytimg.com/vi/dRPCxunlcjY/hqdefault.jpg',
    });
  });
});

describe('Amazon webpage preview fallback', () => {
  it('detects Amazon hosts and generic Amazon logo images', () => {
    expect(isAmazonPreviewHost('www.amazon.com.au')).toBe(true);
    expect(isAmazonPreviewHost('example.com')).toBe(false);
    expect(
      isGenericAmazonPreviewImage(
        'https://images-na.ssl-images-amazon.com/images/G/01/social/api-share/amazon_logo.png',
      ),
    ).toBe(true);
    expect(
      shouldUsePageScreenshotPreview(
        new URL('https://www.amazon.com.au/dp/B000000'),
        'https://images-na.ssl-images-amazon.com/images/G/01/social/api-share/amazon_logo.png',
      ),
    ).toBe(true);
  });

  it('uses a page screenshot when Amazon metadata only provides a generic logo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      headers: {
        get: () => 'text/html',
      },
      arrayBuffer: async () => Buffer.from(`
        <html><head>
          <meta property="og:title" content="Coffee Bean Dosing Cup" />
          <meta property="og:image" content="https://images-na.ssl-images-amazon.com/images/G/01/social/api-share/amazon_logo.png" />
        </head></html>
      `),
    })));
    const captureScreenshot = vi.fn(async () => 'data:image/jpeg;base64,page');

    const preview = await fetchBookmarkPreview('https://www.amazon.com.au/dp/B000000', {
      captureScreenshot,
    });

    expect(preview).toMatchObject({
      ok: true,
      title: 'Coffee Bean Dosing Cup',
      imageUrl: 'data:image/jpeg;base64,page',
    });
    expect(captureScreenshot).toHaveBeenCalledWith('https://www.amazon.com.au/dp/B000000');
  });

  it('keeps normal Open Graph images for non-Amazon pages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      headers: {
        get: () => 'text/html',
      },
      arrayBuffer: async () => Buffer.from(`
        <html><head>
          <meta property="og:title" content="Example Product" />
          <meta property="og:image" content="https://cdn.example.com/product.jpg" />
        </head></html>
      `),
    })));
    const captureScreenshot = vi.fn(async () => 'data:image/jpeg;base64,page');

    const preview = await fetchBookmarkPreview('https://example.com/product', {
      captureScreenshot,
    });

    expect(preview.imageUrl).toBe('https://cdn.example.com/product.jpg');
    expect(captureScreenshot).not.toHaveBeenCalled();
  });

  it('drops the generic Amazon logo when screenshot capture fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      headers: {
        get: () => 'text/html',
      },
      arrayBuffer: async () => Buffer.from(`
        <html><head>
          <meta property="og:title" content="Coffee Bean Dosing Cup" />
          <meta property="og:image" content="https://images-na.ssl-images-amazon.com/images/G/01/social/api-share/amazon_logo.png" />
        </head></html>
      `),
    })));
    const captureScreenshot = vi.fn(async () => {
      throw new Error('playwright unavailable');
    });

    const preview = await fetchBookmarkPreview('https://www.amazon.com.au/dp/B000000', {
      captureScreenshot,
    });

    expect(preview.imageUrl).toBeNull();
  });
});

describe('bookmark embed html', () => {
  it('injects a base tag so relative page assets resolve against the source URL', () => {
    const html = buildEmbeddablePreviewHtml(
      '<html><head><title>Product</title></head><body><img src="/hero.png"></body></html>',
      'https://shop.example/products/a',
    );

    expect(html).toContain('<base href="https://shop.example/products/a">');
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    expect(html).toContain('<img src="/hero.png">');
  });
});
