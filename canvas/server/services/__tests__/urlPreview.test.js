import { describe, it, expect } from 'vitest';
import {
  normalizePreviewUrl,
  isBlockedPreviewHost,
  parseOpenGraphFromHtml,
  resolvePreviewImageUrl,
} from '../urlPreview.js';

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
