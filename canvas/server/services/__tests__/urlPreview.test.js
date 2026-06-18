import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  fetchBookmarkPreview,
  normalizePreviewUrl,
  isBlockedPreviewHost,
  parseOpenGraphFromHtml,
  resolvePreviewImageUrl,
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
