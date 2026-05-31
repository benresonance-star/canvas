import { describe, it, expect } from 'vitest';
import {
  normalizeBookmarkUrl,
  bookmarkContentHash,
  domainFromUrl,
  syntheticBookmarkFilename,
  bookmarkCardKeyFromUrl,
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
});

describe('bookmarkCardKeyFromUrl', () => {
  it('uses links prefix and domain slug', () => {
    expect(bookmarkCardKeyFromUrl('https://docs.google.com/x')).toBe('links__docs-google-com');
  });
});
