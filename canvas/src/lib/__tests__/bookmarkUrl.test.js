import { describe, it, expect } from 'vitest';
import {
  normalizeBookmarkUrl,
  bookmarkContentHash,
  domainFromUrl,
  syntheticBookmarkFilename,
  bookmarkCardKeyFromUrl,
  bookmarkLinkIdFromCardId,
  isAmazonBookmarkUrl,
  isGenericAmazonBookmarkImage,
} from '../bookmarkUrl.js';

describe('normalizeBookmarkUrl', () => {
  it('adds https when scheme missing', () => {
    expect(normalizeBookmarkUrl('example.com/page')).toBe('https://example.com/page');
  });

  it('strips hash fragment', () => {
    expect(normalizeBookmarkUrl('https://example.com/a#section')).toBe('https://example.com/a');
  });

  it('rejects non-http schemes', () => {
    expect(normalizeBookmarkUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('bookmarkContentHash', () => {
  it('is stable for the same normalized url', async () => {
    const url = 'https://example.com/x';
    const a = await bookmarkContentHash(url);
    const b = await bookmarkContentHash(url);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});

describe('domainFromUrl', () => {
  it('strips www prefix', () => {
    expect(domainFromUrl('https://www.notion.so/page')).toBe('notion.so');
  });
});

describe('syntheticBookmarkFilename', () => {
  it('builds links prefix filename', () => {
    expect(syntheticBookmarkFilename('example.com')).toBe('links__example-com-v1.url');
  });

  it('adds a stable link id when provided', () => {
    expect(syntheticBookmarkFilename('example.com', 1, 'abc12345-extra')).toBe(
      'links__example-com-abc12345-v1.url',
    );
  });
});

describe('bookmarkCardKeyFromUrl', () => {
  it('uses links prefix and domain slug', () => {
    expect(bookmarkCardKeyFromUrl('https://docs.google.com/x')).toBe('links__docs-google-com');
  });

  it('adds a stable link id when provided', () => {
    expect(bookmarkCardKeyFromUrl('https://docs.google.com/x', 'abc12345-extra')).toBe(
      'links__docs-google-com-abc12345',
    );
  });
});

describe('bookmarkLinkIdFromCardId', () => {
  it('builds a short filesystem-safe id', () => {
    expect(bookmarkLinkIdFromCardId('ABC12345-card-id')).toBe('abc12345');
  });
});

describe('Amazon bookmark preview helpers', () => {
  it('detects Amazon bookmark URLs', () => {
    expect(isAmazonBookmarkUrl('https://www.amazon.com.au/dp/B000000')).toBe(true);
    expect(isAmazonBookmarkUrl('https://example.com/product')).toBe(false);
  });

  it('detects generic Amazon logo images', () => {
    expect(
      isGenericAmazonBookmarkImage(
        'https://images-na.ssl-images-amazon.com/images/G/01/social/api-share/amazon_logo.png',
      ),
    ).toBe(true);
    expect(isGenericAmazonBookmarkImage('data:image/jpeg;base64,page')).toBe(false);
  });
});
